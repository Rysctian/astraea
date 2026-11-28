import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  applicationApprovals,
  correctionApplicationDetails,
  correctionApplications,
  type Database,
  employeeAttendanceLogs,
  employeeLogs,
  employeeSchedules,
  employees,
  schedules,
  users,
} from "@starter/db";
import type {
  ApprovalStatus,
  CorrectionApplicationDetailRecord,
  CorrectionApplicationRecord,
  CorrectionFilingContext,
  CorrectionLogPreviewResponse,
  CreateCorrectionApplicationDto,
  FourSlotPunches,
  ListCorrectionApplicationsQuery,
  PaginatedResponse,
  PreviewCorrectionLogsQuery,
  User,
} from "@starter/shared";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  ApprovalEngineService,
  type ApprovalTx,
  computeStepActionability,
} from "../approvals/approval-engine.service.js";
import { localDateTimeToUtcDate } from "../attendance/dtr-evaluator.js";
import { DB } from "../database/database.module.js";
import { RbacService } from "../rbac/rbac.service.js";
import {
  computeCorrectionLogDiff,
  formatUtcDateToLocalTime,
  pairPunchesToFourSlots,
} from "./correction-pairing.js";

const DEFAULT_TZ = "Asia/Manila";

function formatName(e: { firstName: string; middleName: string | null; lastName: string }): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

function correctionDeviceId(applicationId: number): string {
  return `CORRECTION-APP-${applicationId}`;
}

interface ResolvedCorrectionActor {
  userId: string;
  employeeId: string | null;
  isAdmin: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

@Injectable()
export class CorrectionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ApprovalEngineService) private readonly approvalEngine: ApprovalEngineService,
    @Inject(RbacService) private readonly rbacService: RbacService,
  ) {}

  private async resolveActor(user: User): Promise<ResolvedCorrectionActor> {
    const authority = await this.rbacService.getActorAuthority(user.id);
    const grant = authority.permissions.correction_applications;
    const isSystemAdmin = authority.roleCode === "admin";

    return {
      userId: user.id,
      employeeId: user.employeeId,
      isAdmin: authority.isAdmin,
      canView: isSystemAdmin || Boolean(grant?.canView),
      canCreate: isSystemAdmin || Boolean(grant?.canCreate),
      canUpdate: isSystemAdmin || Boolean(grant?.canUpdate),
    };
  }

  private async resolveEmployeeTimezoneForDate(
    tx: Pick<Database, "select">,
    employeeId: string,
    date: string,
  ): Promise<string> {
    const rows = await tx
      .select({
        effectiveFrom: employeeSchedules.effectiveFrom,
        timezone: schedules.timezone,
      })
      .from(employeeSchedules)
      .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
      .where(
        and(
          eq(employeeSchedules.employeeId, employeeId),
          eq(schedules.isActive, true),
          lte(employeeSchedules.effectiveFrom, date),
          or(isNull(employeeSchedules.effectiveTo), gte(employeeSchedules.effectiveTo, date)),
        ),
      );

    const matched = rows.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    return matched?.timezone || DEFAULT_TZ;
  }

  private async loadDateLogsAndPairing(
    tx: Pick<Database, "select">,
    employeeId: string,
    date: string,
  ): Promise<{
    timezone: string;
    logs: Array<{
      id: number;
      loggedAt: Date;
      timeLocal: string;
      source: string;
      deviceId: string | null;
    }>;
    paired: FourSlotPunches;
  }> {
    const timezone = await this.resolveEmployeeTimezoneForDate(tx, employeeId, date);
    const startUtc = localDateTimeToUtcDate(date, "00:00:00", timezone);
    const endUtc = new Date(localDateTimeToUtcDate(date, "23:59:59", timezone).getTime() + 999);

    const rawLogs = await tx
      .select({
        id: employeeLogs.id,
        loggedAt: employeeLogs.loggedAt,
        source: employeeLogs.source,
        deviceId: employeeLogs.deviceId,
      })
      .from(employeeLogs)
      .where(
        and(
          eq(employeeLogs.employeeId, employeeId),
          gte(employeeLogs.loggedAt, startUtc),
          lte(employeeLogs.loggedAt, endUtc),
        ),
      )
      .orderBy(asc(employeeLogs.loggedAt), asc(employeeLogs.id));

    const formatted = rawLogs.map((l) => ({
      id: l.id,
      loggedAt: l.loggedAt,
      timeLocal: formatUtcDateToLocalTime(l.loggedAt, timezone),
      source: l.source,
      deviceId: l.deviceId,
    }));

    const paired = pairPunchesToFourSlots(formatted.map((l) => l.timeLocal));

    return { timezone, logs: formatted, paired };
  }

  async getFilingContext(user: User): Promise<CorrectionFilingContext> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view attendance corrections");
    }

    if (!actor.employeeId) {
      return { currentEmployee: null };
    }

    const [emp] = await this.db
      .select({
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
        department: employees.department,
        position: employees.position,
      })
      .from(employees)
      .where(eq(employees.employeeId, actor.employeeId))
      .limit(1);

    return {
      currentEmployee: emp
        ? {
            employeeId: emp.employeeId,
            fullName: formatName(emp),
            department: emp.department,
            position: emp.position,
          }
        : null,
    };
  }

  async previewDateLogs(
    query: PreviewCorrectionLogsQuery,
    user: User,
  ): Promise<CorrectionLogPreviewResponse> {
    const actor = await this.resolveActor(user);
    if (!actor.canView && !actor.canCreate) {
      throw new ForbiddenException("You do not have permission to preview attendance logs");
    }

    let targetEmployeeId: string;
    if (actor.isAdmin) {
      targetEmployeeId = query.employeeId ?? actor.employeeId ?? "";
      if (!targetEmployeeId) {
        throw new BadRequestException("Specify an employee ID to preview logs");
      }
    } else {
      // Rule 2: Ownership on Preview & Filing
      if (!actor.employeeId) {
        throw new ForbiddenException("Your account is not linked to an employee record");
      }
      if (query.employeeId && query.employeeId !== actor.employeeId) {
        throw new ForbiddenException("Employees may only preview their own attendance logs");
      }
      targetEmployeeId = actor.employeeId;
    }

    const { timezone, logs, paired } = await this.loadDateLogsAndPairing(
      this.db,
      targetEmployeeId,
      query.date,
    );

    return {
      employeeId: targetEmployeeId,
      date: query.date,
      timezone,
      logs: logs.map((l) => ({
        id: l.id,
        loggedAt: l.loggedAt.toISOString(),
        timeLocal: l.timeLocal,
        source: l.source,
        deviceId: l.deviceId,
      })),
      paired,
    };
  }

  async listApplications(
    query: ListCorrectionApplicationsQuery,
    user: User,
  ): Promise<PaginatedResponse<CorrectionApplicationRecord>> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view attendance corrections");
    }

    let allowedIds: number[] | null = null;
    if (!actor.isAdmin) {
      if (!actor.employeeId) {
        return {
          data: [],
          meta: { total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 },
        };
      }
      const [ownApps, approverApps] = await Promise.all([
        this.db
          .select({ id: correctionApplications.id })
          .from(correctionApplications)
          .where(eq(correctionApplications.employeeId, actor.employeeId)),
        this.db
          .select({ applicationId: applicationApprovals.applicationId })
          .from(applicationApprovals)
          .where(
            and(
              eq(applicationApprovals.applicationType, "correction"),
              eq(applicationApprovals.approverId, actor.employeeId),
            ),
          ),
      ]);
      allowedIds = Array.from(
        new Set([...ownApps.map((a) => a.id), ...approverApps.map((a) => a.applicationId)]),
      );
      if (allowedIds.length === 0) {
        return {
          data: [],
          meta: { total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 },
        };
      }
    }

    const conditions = [];
    if (allowedIds !== null) {
      conditions.push(inArray(correctionApplications.id, allowedIds));
    }

    if (query.statuses && query.statuses !== "all") {
      const statuses = query.statuses
        .split(",")
        .map((s) => s.trim())
        .filter(
          (s): s is ApprovalStatus =>
            s === "pending" || s === "approved" || s === "disapproved" || s === "cancelled",
        );
      if (statuses.length > 0) {
        conditions.push(inArray(correctionApplications.status, statuses));
      }
    }

    if (query.submittedFrom) {
      conditions.push(
        gte(correctionApplications.submittedAt, new Date(`${query.submittedFrom}T00:00:00.000Z`)),
      );
    }
    if (query.submittedTo) {
      conditions.push(
        lte(correctionApplications.submittedAt, new Date(`${query.submittedTo}T23:59:59.999Z`)),
      );
    }

    const rawApps = await this.db
      .select()
      .from(correctionApplications)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    if (rawApps.length === 0) {
      return {
        data: [],
        meta: { total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 },
      };
    }

    let hydrated = await this.hydrateApplications(rawApps, actor);

    if (query.search) {
      const term = query.search.toLowerCase();
      hydrated = hydrated.filter(
        (app) =>
          app.reason.toLowerCase().includes(term) ||
          app.employeeId.toLowerCase().includes(term) ||
          app.employeeName.toLowerCase().includes(term) ||
          app.details.some((d) => d.date.toLowerCase().includes(term)) ||
          app.approvals.some(
            (s) =>
              s.approverId.toLowerCase().includes(term) ||
              s.approverName.toLowerCase().includes(term),
          ),
      );
    }

    const dir = query.sortDir === "asc" ? 1 : -1;
    hydrated.sort((a, b) => {
      switch (query.sortBy) {
        case "employeeName":
          return a.employeeName.localeCompare(b.employeeName) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        default:
          return a.submittedAt.localeCompare(b.submittedAt) * dir;
      }
    });

    const total = hydrated.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;

    return {
      data: hydrated.slice(offset, offset + query.pageSize),
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages },
    };
  }

  async getApplicationById(id: number, user: User): Promise<CorrectionApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view attendance corrections");
    }

    const [row] = await this.db
      .select()
      .from(correctionApplications)
      .where(eq(correctionApplications.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Attendance correction #${id} not found`);
    }

    const [hydrated] = await this.hydrateApplications([row], actor);
    if (!hydrated) {
      throw new NotFoundException(`Attendance correction #${id} not found`);
    }

    if (!actor.isAdmin) {
      const isApplicant = actor.employeeId !== null && hydrated.employeeId === actor.employeeId;
      const isApprover =
        actor.employeeId !== null &&
        hydrated.approvals.some((s) => s.approverId === actor.employeeId);
      if (!isApplicant && !isApprover) {
        throw new NotFoundException(`Attendance correction #${id} not found`);
      }
    }

    return hydrated;
  }

  async createApplication(
    dto: CreateCorrectionApplicationDto,
    user: User,
  ): Promise<CorrectionApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canCreate) {
      throw new ForbiddenException("You do not have permission to submit attendance corrections");
    }

    // Rebuild Note #1: Strictly restrict auto-approval to administrators
    if (dto.autoApprove && !actor.isAdmin) {
      throw new ForbiddenException(
        "Only administrators may submit auto-approved attendance corrections",
      );
    }

    // Rule 1 & 2: Single-employee only + ownership enforcement
    let targetEmployeeId: string;
    if (actor.isAdmin) {
      targetEmployeeId = dto.employeeId ?? actor.employeeId ?? "";
      if (!targetEmployeeId) {
        throw new BadRequestException("Select a target employee for this correction request");
      }
    } else {
      if (!actor.employeeId) {
        throw new ForbiddenException(
          "Your user account must be linked to an employee record to file corrections",
        );
      }
      if (dto.employeeId && dto.employeeId !== actor.employeeId) {
        throw new ForbiddenException(
          "Employees may only submit attendance corrections for themselves",
        );
      }
      targetEmployeeId = actor.employeeId;
    }

    const sortedDetails = [...dto.details].sort((a, b) => a.date.localeCompare(b.date));
    const requestedDates = sortedDetails.map((d) => d.date);

    const createdId = await this.db.transaction(async (tx) => {
      // Lock target employee row first
      const [emp] = await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(eq(employees.employeeId, targetEmployeeId))
        .for("update");
      if (!emp) {
        throw new BadRequestException(`Employee "${targetEmployeeId}" does not exist`);
      }

      // Rule 4: One active (pending or approved) correction per employee-date
      const conflictingDates = await tx
        .select({
          applicationId: correctionApplications.id,
          status: correctionApplications.status,
          date: correctionApplicationDetails.date,
        })
        .from(correctionApplicationDetails)
        .innerJoin(
          correctionApplications,
          eq(correctionApplicationDetails.correctionApplicationId, correctionApplications.id),
        )
        .where(
          and(
            eq(correctionApplications.employeeId, targetEmployeeId),
            inArray(correctionApplications.status, ["pending", "approved"]),
            inArray(correctionApplicationDetails.date, requestedDates),
          ),
        );

      if (conflictingDates.length > 0) {
        const first = conflictingDates[0];
        throw new BadRequestException(
          `Date ${first?.date} already has an active (${first?.status}) correction application #${first?.applicationId}`,
        );
      }

      // Rule 7: Capture immutable pre-change 4-slot snapshots at submission time
      const detailRowsToInsert = [];
      for (const row of sortedDetails) {
        const { paired } = await this.loadDateLogsAndPairing(tx, targetEmployeeId, row.date);
        detailRowsToInsert.push({
          date: row.date,
          oldAmIn: paired.amIn,
          oldAmOut: paired.amOut,
          oldPmIn: paired.pmIn,
          oldPmOut: paired.pmOut,
          amIn: row.amIn,
          amOut: row.amOut,
          pmIn: row.pmIn,
          pmOut: row.pmOut,
        });
      }

      const now = new Date();
      const initialStatus: ApprovalStatus = dto.autoApprove ? "approved" : "pending";

      const [createdApp] = await tx
        .insert(correctionApplications)
        .values({
          employeeId: targetEmployeeId,
          filedByUserId: actor.userId,
          reason: dto.reason,
          status: initialStatus,
          autoApproved: dto.autoApprove,
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!createdApp) {
        throw new Error("Failed to insert correction application");
      }

      const insertedDetails = await tx
        .insert(correctionApplicationDetails)
        .values(
          detailRowsToInsert.map((d) => ({
            correctionApplicationId: createdApp.id,
            ...d,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .returning();

      if (dto.autoApprove) {
        // Admin auto-approve: sync raw attendance logs immediately in the same transaction
        await this.syncCorrectionLogs(tx, createdApp, insertedDetails, actor.userId);
      } else {
        // Deferred sync (Rule 8): snapshot approval chain without modifying raw attendance logs
        await this.approvalEngine.snapshotChain(tx, {
          employeeId: targetEmployeeId,
          applicationType: "correction",
          applicationId: createdApp.id,
          currentParentStatus: "pending",
        });
      }

      return createdApp.id;
    });

    return this.getApplicationById(createdId, user);
  }

  async approveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<CorrectionApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have Attendance Correction update permission to approve requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(correctionApplications)
        .where(eq(correctionApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Attendance correction #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.approveStep(tx, {
        applicationType: "correction",
        applicationId: app.id,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(correctionApplications)
        .set({ status: nextParentStatus, updatedAt: new Date() })
        .where(eq(correctionApplications.id, app.id));

      if (nextParentStatus === "approved") {
        const details = await tx
          .select()
          .from(correctionApplicationDetails)
          .where(eq(correctionApplicationDetails.correctionApplicationId, app.id))
          .orderBy(asc(correctionApplicationDetails.date));
        await this.syncCorrectionLogs(tx, app, details, actor.userId);
      }
    });

    return this.getApplicationById(id, user);
  }

  async disapproveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<CorrectionApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have Attendance Correction update permission to disapprove requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(correctionApplications)
        .where(eq(correctionApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Attendance correction #${id} not found`);
      }

      const { nextParentStatus, wasPreviouslyApproved } = await this.approvalEngine.disapproveStep(
        tx,
        {
          applicationType: "correction",
          applicationId: app.id,
          currentParentStatus: app.status as ApprovalStatus,
          actorEmployeeId: actor.employeeId,
          actorUserId: actor.userId,
          isAdmin: actor.isAdmin,
          remarks,
        },
      );

      await tx
        .update(correctionApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(correctionApplications.id, app.id));

      // Admin override disapproval on an approved correction removes synced logs (Rule 9 protected)
      if (wasPreviouslyApproved) {
        await this.rollbackSyncedLogs(tx, app);
      }
    });

    return this.getApplicationById(id, user);
  }

  async cancelApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<CorrectionApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to access attendance corrections");
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(correctionApplications)
        .where(eq(correctionApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Attendance correction #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.cancelApplication(tx, {
        applicationType: "correction",
        applicationId: app.id,
        applicantEmployeeId: app.employeeId,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(correctionApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(correctionApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  /**
   * Synchronizes approved correction punches into `employee_logs` inside the caller's transaction:
   * - Deletes unlinked replaced `old` timestamps not present in the `new` set (Rule 9 protects attendance-linked logs)
   * - Inserts missing `new` timestamps tagged with `source = "correction"` and `deviceId = "CORRECTION-APP-<id>"`
   */
  private async syncCorrectionLogs(
    tx: ApprovalTx,
    app: typeof correctionApplications.$inferSelect,
    details: Array<typeof correctionApplicationDetails.$inferSelect>,
    actorUserId: string,
  ): Promise<void> {
    const devId = correctionDeviceId(app.id);

    for (const detail of details) {
      const timezone = await this.resolveEmployeeTimezoneForDate(tx, app.employeeId, detail.date);
      const { replacedTimes, requestedTimes } = computeCorrectionLogDiff(
        {
          amIn: detail.oldAmIn,
          amOut: detail.oldAmOut,
          pmIn: detail.oldPmIn,
          pmOut: detail.oldPmOut,
        },
        {
          amIn: detail.amIn,
          amOut: detail.amOut,
          pmIn: detail.pmIn,
          pmOut: detail.pmOut,
        },
      );

      // 1. Delete replaced timestamps unless linked to finalized employee_attendance_logs (Rule 9)
      if (replacedTimes.length > 0) {
        const replacedDates = replacedTimes.map((t) =>
          localDateTimeToUtcDate(detail.date, t, timezone),
        );
        const matchingLogs = await tx
          .select({ id: employeeLogs.id })
          .from(employeeLogs)
          .where(
            and(
              eq(employeeLogs.employeeId, app.employeeId),
              inArray(employeeLogs.loggedAt, replacedDates),
            ),
          );

        if (matchingLogs.length > 0) {
          const candidateIds = matchingLogs.map((l) => l.id);
          const linked = await tx
            .select({ employeeLogId: employeeAttendanceLogs.employeeLogId })
            .from(employeeAttendanceLogs)
            .where(inArray(employeeAttendanceLogs.employeeLogId, candidateIds));
          const linkedSet = new Set(linked.map((l) => l.employeeLogId));
          const deletableIds = candidateIds.filter((id) => !linkedSet.has(id));

          if (deletableIds.length > 0) {
            await tx.delete(employeeLogs).where(inArray(employeeLogs.id, deletableIds));
          }
        }
      }

      // 2. Insert each requested new timestamp if not already present for this employee
      if (requestedTimes.length > 0) {
        const requestedDates = requestedTimes.map((t) =>
          localDateTimeToUtcDate(detail.date, t, timezone),
        );
        const alreadyPresent = await tx
          .select({ loggedAt: employeeLogs.loggedAt })
          .from(employeeLogs)
          .where(
            and(
              eq(employeeLogs.employeeId, app.employeeId),
              inArray(employeeLogs.loggedAt, requestedDates),
            ),
          );

        const existingEpochMs = new Set(alreadyPresent.map((l) => l.loggedAt.getTime()));
        const toInsert = requestedDates.filter((dt) => !existingEpochMs.has(dt.getTime()));

        if (toInsert.length > 0) {
          const now = new Date();
          await tx.insert(employeeLogs).values(
            toInsert.map((loggedAt) => ({
              employeeId: app.employeeId,
              loggedAt,
              deviceId: devId,
              source: "correction",
              createdBy: actorUserId,
              createdAt: now,
              updatedAt: now,
            })),
          );
        }
      }
    }
  }

  /**
   * Removes synced correction logs (`source = correction`, `deviceId = CORRECTION-APP-<id>`)
   * that are not linked to finalized attendance records (Rule 9).
   */
  private async rollbackSyncedLogs(
    tx: ApprovalTx,
    app: typeof correctionApplications.$inferSelect,
  ): Promise<void> {
    const devId = correctionDeviceId(app.id);
    const synced = await tx
      .select({ id: employeeLogs.id })
      .from(employeeLogs)
      .where(
        and(
          eq(employeeLogs.employeeId, app.employeeId),
          eq(employeeLogs.source, "correction"),
          eq(employeeLogs.deviceId, devId),
        ),
      );

    if (synced.length === 0) return;

    const candidateIds = synced.map((l) => l.id);
    const linked = await tx
      .select({ employeeLogId: employeeAttendanceLogs.employeeLogId })
      .from(employeeAttendanceLogs)
      .where(inArray(employeeAttendanceLogs.employeeLogId, candidateIds));
    const linkedSet = new Set(linked.map((l) => l.employeeLogId));
    const deletableIds = candidateIds.filter((id) => !linkedSet.has(id));

    if (deletableIds.length > 0) {
      await tx.delete(employeeLogs).where(inArray(employeeLogs.id, deletableIds));
    }
  }

  private async hydrateApplications(
    apps: Array<typeof correctionApplications.$inferSelect>,
    actor: ResolvedCorrectionActor,
  ): Promise<CorrectionApplicationRecord[]> {
    if (apps.length === 0) return [];

    const appIds = apps.map((a) => a.id);
    const empIds = Array.from(new Set(apps.map((a) => a.employeeId)));
    const filerIds = Array.from(
      new Set(apps.map((a) => a.filedByUserId).filter((id): id is string => id !== null)),
    );

    const [detailRows, empRows, filerRows, approvalsMap] = await Promise.all([
      this.db
        .select()
        .from(correctionApplicationDetails)
        .where(inArray(correctionApplicationDetails.correctionApplicationId, appIds))
        .orderBy(
          asc(correctionApplicationDetails.correctionApplicationId),
          asc(correctionApplicationDetails.date),
        ),
      this.db
        .select({
          employeeId: employees.employeeId,
          firstName: employees.firstName,
          middleName: employees.middleName,
          lastName: employees.lastName,
          department: employees.department,
          position: employees.position,
        })
        .from(employees)
        .where(inArray(employees.employeeId, empIds)),
      filerIds.length > 0
        ? this.db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, filerIds))
        : Promise.resolve([]),
      this.approvalEngine.loadApprovalStepsMap(this.db, "correction", appIds),
    ]);

    const empMap = new Map(empRows.map((e) => [e.employeeId, e]));
    const filerMap = new Map(filerRows.map((u) => [u.id, u.name]));
    const detailsMap = new Map<number, CorrectionApplicationDetailRecord[]>();

    for (const d of detailRows) {
      const list = detailsMap.get(d.correctionApplicationId) ?? [];
      list.push({
        id: d.id,
        date: d.date,
        oldAmIn: d.oldAmIn,
        oldAmOut: d.oldAmOut,
        oldPmIn: d.oldPmIn,
        oldPmOut: d.oldPmOut,
        amIn: d.amIn,
        amOut: d.amOut,
        pmIn: d.pmIn,
        pmOut: d.pmOut,
      });
      detailsMap.set(d.correctionApplicationId, list);
    }

    return apps.map((app) => {
      const emp = empMap.get(app.employeeId);
      const details = detailsMap.get(app.id) ?? [];
      const approvals = approvalsMap.get(app.id) ?? [];

      const actionability = computeStepActionability({
        parentStatus: app.status as ApprovalStatus,
        applicantEmployeeId: app.employeeId,
        actorEmployeeId: actor.employeeId,
        isAdmin: actor.isAdmin,
        canUpdateModule: actor.canUpdate,
        steps: approvals,
      });

      return {
        id: app.id,
        employeeId: app.employeeId,
        employeeName: emp ? formatName(emp) : app.employeeId,
        employeeDepartment: emp?.department ?? null,
        employeePosition: emp?.position ?? null,
        filedByUserId: app.filedByUserId,
        filedByName: app.filedByUserId ? (filerMap.get(app.filedByUserId) ?? null) : null,
        reason: app.reason,
        status: app.status as ApprovalStatus,
        autoApproved: app.autoApproved,
        decisionRemarks: app.decisionRemarks,
        submittedAt: app.submittedAt.toISOString(),
        dateCount: details.length,
        details,
        approvals,
        ...actionability,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      };
    });
  }
}
