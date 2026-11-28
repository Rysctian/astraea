import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  applicationApprovals,
  type Database,
  employeeSchedules,
  employees,
  overtimeApplicationDetails,
  overtimeApplications,
  scheduleDetails,
  schedules,
  users,
} from "@starter/db";
import {
  type ApprovalStatus,
  type CreateOvertimeApplicationDto,
  type CreateOvertimeBatchResult,
  type ListOvertimeApplicationsQuery,
  type OvertimeApplicationRecord,
  type OvertimeDetailRecord,
  type PaginatedResponse,
  parseTimeToSeconds,
  type User,
} from "@starter/shared";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  ApprovalEngineService,
  computeStepActionability,
} from "../approvals/approval-engine.service.js";
import { DB } from "../database/database.module.js";
import { RbacService } from "../rbac/rbac.service.js";
import {
  addDaysIso,
  buildBlockedShiftIntervals,
  type TimeInterval,
  validateOvertimeSlotWindow,
} from "./overtime-validator.js";

function formatName(e: { firstName: string; middleName: string | null; lastName: string }): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

interface ResolvedActor {
  userId: string;
  employeeId: string | null;
  isAdmin: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

@Injectable()
export class OvertimeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ApprovalEngineService) private readonly approvalEngine: ApprovalEngineService,
    @Inject(RbacService) private readonly rbacService: RbacService,
  ) {}

  private async resolveActor(user: User): Promise<ResolvedActor> {
    const authority = await this.rbacService.getActorAuthority(user.id);
    const grant = authority.permissions.overtime_applications;
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

  async listApplications(
    query: ListOvertimeApplicationsQuery,
    user: User,
  ): Promise<PaginatedResponse<OvertimeApplicationRecord>> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view overtime applications");
    }

    // Visibility scoping for non-administrators (Rule 8)
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
          .select({ id: overtimeApplications.id })
          .from(overtimeApplications)
          .where(eq(overtimeApplications.employeeId, actor.employeeId)),
        this.db
          .select({ applicationId: applicationApprovals.applicationId })
          .from(applicationApprovals)
          .where(
            and(
              eq(applicationApprovals.applicationType, "overtime"),
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
      conditions.push(inArray(overtimeApplications.id, allowedIds));
    }
    if (query.status !== "all") {
      conditions.push(eq(overtimeApplications.status, query.status));
    }
    if (query.submittedFrom) {
      conditions.push(
        gte(overtimeApplications.submittedAt, new Date(`${query.submittedFrom}T00:00:00.000Z`)),
      );
    }
    if (query.submittedTo) {
      conditions.push(
        lte(overtimeApplications.submittedAt, new Date(`${query.submittedTo}T23:59:59.999Z`)),
      );
    }

    const rawApps = await this.db
      .select()
      .from(overtimeApplications)
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
        case "totalRequestedSeconds":
          return (a.totalRequestedSeconds - b.totalRequestedSeconds) * dir;
        default:
          return a.submittedAt.localeCompare(b.submittedAt) * dir;
      }
    });

    const total = hydrated.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;

    return {
      data: hydrated.slice(offset, offset + query.pageSize),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages,
      },
    };
  }

  async getApplicationById(id: number, user: User): Promise<OvertimeApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view overtime applications");
    }

    const [row] = await this.db
      .select()
      .from(overtimeApplications)
      .where(eq(overtimeApplications.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Overtime application #${id} not found`);
    }

    const [hydrated] = await this.hydrateApplications([row], actor);
    if (!hydrated) {
      throw new NotFoundException(`Overtime application #${id} not found`);
    }

    // Rule 8: Hidden records behave as Not Found for non-administrators
    if (!actor.isAdmin) {
      const isApplicant = actor.employeeId !== null && hydrated.employeeId === actor.employeeId;
      const isApprover =
        actor.employeeId !== null &&
        hydrated.approvals.some((s) => s.approverId === actor.employeeId);
      if (!isApplicant && !isApprover) {
        throw new NotFoundException(`Overtime application #${id} not found`);
      }
    }

    return hydrated;
  }

  /**
   * Atomically creates overtime applications for 1..500 target employees.
   * Any validation or approver-snapshot failure rolls back the entire batch.
   */
  async createApplications(
    dto: CreateOvertimeApplicationDto,
    user: User,
  ): Promise<CreateOvertimeBatchResult> {
    const actor = await this.resolveActor(user);
    if (!actor.canCreate) {
      throw new ForbiddenException("You do not have permission to submit overtime applications");
    }

    // Rebuild Note #1: Strictly restrict auto-approve to administrators
    if (dto.autoApprove && !actor.isAdmin) {
      throw new ForbiddenException(
        "Only administrators may submit auto-approved overtime requests",
      );
    }

    let targetEmployeeIds: string[];
    if (actor.isAdmin) {
      if (dto.employeeIds && dto.employeeIds.length > 0) {
        targetEmployeeIds = [...dto.employeeIds].sort();
      } else if (actor.employeeId) {
        targetEmployeeIds = [actor.employeeId];
      } else {
        throw new BadRequestException("Select at least one target employee");
      }
    } else {
      if (!actor.employeeId) {
        throw new ForbiddenException(
          "Your user account must be linked to an employee record to file overtime",
        );
      }
      if (
        dto.employeeIds &&
        (dto.employeeIds.length !== 1 || dto.employeeIds[0] !== actor.employeeId)
      ) {
        throw new ForbiddenException("Employees may only file overtime for themselves");
      }
      targetEmployeeIds = [actor.employeeId];
    }

    const dates = dto.details.map((d) => d.date).sort();
    const minDate = dates[0] ?? "2026-01-01";
    const maxDate = dates[dates.length - 1] ?? minDate;
    const minDateMinusOne = addDaysIso(minDate, -1);

    const createdIds = await this.db.transaction(async (tx) => {
      // Step 1: Identify candidate schedules covering [minDate - 1, maxDate] and lock schedules FIRST
      const candidateAssignments = await tx
        .select({
          id: employeeSchedules.id,
          scheduleId: employeeSchedules.scheduleId,
        })
        .from(employeeSchedules)
        .where(
          and(
            inArray(employeeSchedules.employeeId, targetEmployeeIds),
            lte(employeeSchedules.effectiveFrom, maxDate),
            or(
              isNull(employeeSchedules.effectiveTo),
              gte(employeeSchedules.effectiveTo, minDateMinusOne),
            ),
          ),
        );

      const scheduleIds = Array.from(new Set(candidateAssignments.map((a) => a.scheduleId))).sort(
        (a, b) => a - b,
      );

      if (scheduleIds.length > 0) {
        await tx
          .select({ id: schedules.id })
          .from(schedules)
          .where(inArray(schedules.id, scheduleIds))
          .orderBy(asc(schedules.id))
          .for("update");
      }

      // Step 2: Lock target employees in deterministic order
      const lockedEmployees = await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(inArray(employees.employeeId, targetEmployeeIds))
        .orderBy(asc(employees.employeeId))
        .for("update");

      const foundEmpIds = new Set(lockedEmployees.map((e) => e.employeeId));
      const missingEmpIds = targetEmployeeIds.filter((id) => !foundEmpIds.has(id));
      if (missingEmpIds.length > 0) {
        throw new BadRequestException(
          `Unknown employee ID(s): ${missingEmpIds.slice(0, 5).join(", ")}`,
        );
      }

      // Step 3: Lock employee_schedules rows covering the date span
      const lockedAssignments = await tx
        .select()
        .from(employeeSchedules)
        .where(
          and(
            inArray(employeeSchedules.employeeId, targetEmployeeIds),
            lte(employeeSchedules.effectiveFrom, maxDate),
            or(
              isNull(employeeSchedules.effectiveTo),
              gte(employeeSchedules.effectiveTo, minDateMinusOne),
            ),
          ),
        )
        .orderBy(asc(employeeSchedules.id))
        .for("update");

      const allScheduleIds = Array.from(new Set(lockedAssignments.map((a) => a.scheduleId)));
      const [activeSchedules, allDetails] =
        allScheduleIds.length > 0
          ? await Promise.all([
              tx
                .select({ id: schedules.id, isActive: schedules.isActive })
                .from(schedules)
                .where(inArray(schedules.id, allScheduleIds)),
              tx
                .select()
                .from(scheduleDetails)
                .where(inArray(scheduleDetails.scheduleId, allScheduleIds)),
            ])
          : [[], []];

      const activeScheduleIds = new Set(activeSchedules.filter((s) => s.isActive).map((s) => s.id));
      const detailsByScheduleId = new Map<number, typeof allDetails>();
      for (const detail of allDetails) {
        const list = detailsByScheduleId.get(detail.scheduleId) ?? [];
        list.push(detail);
        detailsByScheduleId.set(detail.scheduleId, list);
      }

      // Cross-application non-overlap check (Rebuild Note #2): load pending/approved OT slots for target employees & dates
      const uniqueDates = Array.from(new Set(dates));
      const existingOtRows = await tx
        .select({
          employeeId: overtimeApplications.employeeId,
          applicationId: overtimeApplications.id,
          status: overtimeApplications.status,
          date: overtimeApplicationDetails.date,
          startTime: overtimeApplicationDetails.startTime,
          endTime: overtimeApplicationDetails.endTime,
        })
        .from(overtimeApplicationDetails)
        .innerJoin(
          overtimeApplications,
          eq(overtimeApplicationDetails.overtimeApplicationId, overtimeApplications.id),
        )
        .where(
          and(
            inArray(overtimeApplications.employeeId, targetEmployeeIds),
            inArray(overtimeApplications.status, ["pending", "approved"]),
            inArray(overtimeApplicationDetails.date, uniqueDates),
          ),
        );

      const existingOtByEmpDate = new Map<string, TimeInterval[]>();
      for (const row of existingOtRows) {
        const key = `${row.employeeId}::${row.date}`;
        const arr = existingOtByEmpDate.get(key) ?? [];
        arr.push({
          startSec: parseTimeToSeconds(row.startTime),
          endSec: parseTimeToSeconds(row.endTime),
          label: `existing ${row.status} overtime application #${row.applicationId} (${row.startTime.slice(0, 5)}–${row.endTime.slice(0, 5)})`,
        });
        existingOtByEmpDate.set(key, arr);
      }

      const assignmentsByEmp = new Map<string, typeof lockedAssignments>();
      for (const a of lockedAssignments) {
        const list = assignmentsByEmp.get(a.employeeId) ?? [];
        list.push(a);
        assignmentsByEmp.set(a.employeeId, list);
      }

      const resolveActiveScheduleIdForDate = (empId: string, dateStr: string): number | null => {
        const list = assignmentsByEmp.get(empId) ?? [];
        const match = list
          .filter(
            (a) =>
              a.effectiveFrom <= dateStr &&
              (a.effectiveTo === null || a.effectiveTo >= dateStr) &&
              activeScheduleIds.has(a.scheduleId),
          )
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
        return match ? match.scheduleId : null;
      };

      const insertedIds: number[] = [];
      const now = new Date();

      for (const empId of targetEmployeeIds) {
        const computedDetails: Array<{
          date: string;
          startTime: string;
          endTime: string;
          breakSeconds: number;
          requestedSeconds: number;
        }> = [];

        for (const slot of dto.details) {
          const sameDayScheduleId = resolveActiveScheduleIdForDate(empId, slot.date);
          if (sameDayScheduleId === null) {
            throw new BadRequestException(
              `Employee ${empId} has no active assigned schedule covering ${slot.date}`,
            );
          }

          const prevDate = addDaysIso(slot.date, -1);
          const prevDayScheduleId = resolveActiveScheduleIdForDate(empId, prevDate);

          const sameDayDetails = detailsByScheduleId.get(sameDayScheduleId) ?? [];
          const prevDayDetails =
            prevDayScheduleId !== null ? (detailsByScheduleId.get(prevDayScheduleId) ?? []) : [];

          const { hasDayDefinition, blocked } = buildBlockedShiftIntervals({
            targetDate: slot.date,
            sameDayDetails,
            prevDayDetails,
          });

          if (!hasDayDefinition) {
            throw new BadRequestException(
              `Employee ${empId}'s active schedule has no day-of-week configuration for ${slot.date}`,
            );
          }

          const existingOt = existingOtByEmpDate.get(`${empId}::${slot.date}`) ?? [];
          const validation = validateOvertimeSlotWindow({
            employeeId: empId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            breakSeconds: slot.breakSeconds,
            blockedShifts: blocked,
            existingOtIntervals: existingOt,
          });

          if ("error" in validation) {
            throw new BadRequestException(validation.error);
          }

          computedDetails.push({
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            breakSeconds: slot.breakSeconds,
            requestedSeconds: validation.requestedSeconds,
          });
        }

        const initialStatus: ApprovalStatus = dto.autoApprove ? "approved" : "pending";
        const [createdApp] = await tx
          .insert(overtimeApplications)
          .values({
            employeeId: empId,
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
          throw new Error("Failed to insert overtime application");
        }

        await tx.insert(overtimeApplicationDetails).values(
          computedDetails.map((d) => ({
            overtimeApplicationId: createdApp.id,
            date: d.date,
            startTime: d.startTime,
            endTime: d.endTime,
            breakSeconds: d.breakSeconds,
            requestedSeconds: d.requestedSeconds,
            createdAt: now,
            updatedAt: now,
          })),
        );

        if (!dto.autoApprove) {
          await this.approvalEngine.snapshotChain(tx, {
            employeeId: empId,
            applicationType: "overtime",
            applicationId: createdApp.id,
            currentParentStatus: "pending",
          });
        }

        insertedIds.push(createdApp.id);
      }

      return insertedIds;
    });

    const createdRows = await this.db
      .select()
      .from(overtimeApplications)
      .where(inArray(overtimeApplications.id, createdIds))
      .orderBy(asc(overtimeApplications.id));

    const hydrated = await this.hydrateApplications(createdRows, actor);

    return {
      createdCount: hydrated.length,
      applications: hydrated,
    };
  }

  async approveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<OvertimeApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have overtime update permission to approve requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(overtimeApplications)
        .where(eq(overtimeApplications.id, id))
        .for("update");

      if (!app) {
        throw new NotFoundException(`Overtime application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.approveStep(tx, {
        applicationType: "overtime",
        applicationId: app.id,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(overtimeApplications)
        .set({ status: nextParentStatus, updatedAt: new Date() })
        .where(eq(overtimeApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  async disapproveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<OvertimeApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have overtime update permission to disapprove requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(overtimeApplications)
        .where(eq(overtimeApplications.id, id))
        .for("update");

      if (!app) {
        throw new NotFoundException(`Overtime application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.disapproveStep(tx, {
        applicationType: "overtime",
        applicationId: app.id,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        isAdmin: actor.isAdmin,
        remarks,
      });

      await tx
        .update(overtimeApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(overtimeApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  async cancelApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<OvertimeApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to access overtime applications");
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(overtimeApplications)
        .where(eq(overtimeApplications.id, id))
        .for("update");

      if (!app) {
        throw new NotFoundException(`Overtime application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.cancelApplication(tx, {
        applicationType: "overtime",
        applicationId: app.id,
        applicantEmployeeId: app.employeeId,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(overtimeApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(overtimeApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  private async hydrateApplications(
    apps: Array<typeof overtimeApplications.$inferSelect>,
    actor: ResolvedActor,
  ): Promise<OvertimeApplicationRecord[]> {
    if (apps.length === 0) return [];

    const appIds = apps.map((a) => a.id);
    const empIds = Array.from(new Set(apps.map((a) => a.employeeId)));
    const filerIds = Array.from(
      new Set(apps.map((a) => a.filedByUserId).filter((id): id is string => id !== null)),
    );

    const [detailRows, empRows, filerRows, approvalsMap] = await Promise.all([
      this.db
        .select()
        .from(overtimeApplicationDetails)
        .where(inArray(overtimeApplicationDetails.overtimeApplicationId, appIds))
        .orderBy(
          asc(overtimeApplicationDetails.overtimeApplicationId),
          asc(overtimeApplicationDetails.date),
          asc(overtimeApplicationDetails.startTime),
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
      this.approvalEngine.loadApprovalStepsMap(this.db, "overtime", appIds),
    ]);

    const empMap = new Map(empRows.map((e) => [e.employeeId, e]));
    const filerMap = new Map(filerRows.map((u) => [u.id, u.name]));
    const detailsMap = new Map<number, OvertimeDetailRecord[]>();

    for (const d of detailRows) {
      const list = detailsMap.get(d.overtimeApplicationId) ?? [];
      list.push({
        id: d.id,
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
        breakSeconds: d.breakSeconds,
        requestedSeconds: d.requestedSeconds,
      });
      detailsMap.set(d.overtimeApplicationId, list);
    }

    return apps.map((app) => {
      const emp = empMap.get(app.employeeId);
      const details = detailsMap.get(app.id) ?? [];
      const approvals = approvalsMap.get(app.id) ?? [];
      const totalRequestedSeconds = details.reduce((sum, d) => sum + d.requestedSeconds, 0);
      const totalBreakSeconds = details.reduce((sum, d) => sum + d.breakSeconds, 0);

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
        totalRequestedSeconds,
        totalBreakSeconds,
        slotCount: details.length,
        details,
        approvals,
        ...actionability,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      };
    });
  }
}
