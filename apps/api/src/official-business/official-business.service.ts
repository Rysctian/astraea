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
  employees,
  officialBusinessApplicationDetails,
  officialBusinessApplications,
  users,
} from "@starter/db";
import type {
  ApprovalStatus,
  CreateOfficialBusinessApplicationDto,
  CreateOfficialBusinessBatchResult,
  ListOfficialBusinessApplicationsQuery,
  ObType,
  OfficialBusinessApplicationRecord,
  OfficialBusinessDetailRecord,
  OfficialBusinessFilingContext,
  PaginatedResponse,
  User,
} from "@starter/shared";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  ApprovalEngineService,
  computeStepActionability,
} from "../approvals/approval-engine.service.js";
import { DB } from "../database/database.module.js";
import { RbacService } from "../rbac/rbac.service.js";
import { checkOfficialBusinessOverlaps } from "./official-business-validator.js";

function formatName(e: { firstName: string; middleName: string | null; lastName: string }): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

interface ResolvedObActor {
  userId: string;
  employeeId: string | null;
  isAdmin: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

@Injectable()
export class OfficialBusinessService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ApprovalEngineService) private readonly approvalEngine: ApprovalEngineService,
    @Inject(RbacService) private readonly rbacService: RbacService,
  ) {}

  private async resolveActor(user: User): Promise<ResolvedObActor> {
    const authority = await this.rbacService.getActorAuthority(user.id);
    const grant = authority.permissions.official_business_applications;
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

  async getFilingContext(user: User): Promise<OfficialBusinessFilingContext> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view Official Business requests");
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

  async listApplications(
    query: ListOfficialBusinessApplicationsQuery,
    user: User,
  ): Promise<PaginatedResponse<OfficialBusinessApplicationRecord>> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view Official Business requests");
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
          .select({ id: officialBusinessApplications.id })
          .from(officialBusinessApplications)
          .where(eq(officialBusinessApplications.employeeId, actor.employeeId)),
        this.db
          .select({ applicationId: applicationApprovals.applicationId })
          .from(applicationApprovals)
          .where(
            and(
              eq(applicationApprovals.applicationType, "official_business"),
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
      conditions.push(inArray(officialBusinessApplications.id, allowedIds));
    }

    if (query.obTypes && query.obTypes !== "all") {
      const types = query.obTypes
        .split(",")
        .map((t) => t.trim())
        .filter((t): t is ObType => t === "ob" || t === "wfh");
      if (types.length > 0) {
        conditions.push(inArray(officialBusinessApplications.obType, types));
      }
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
        conditions.push(inArray(officialBusinessApplications.status, statuses));
      }
    }

    if (query.submittedFrom) {
      conditions.push(
        gte(
          officialBusinessApplications.submittedAt,
          new Date(`${query.submittedFrom}T00:00:00.000Z`),
        ),
      );
    }
    if (query.submittedTo) {
      conditions.push(
        lte(
          officialBusinessApplications.submittedAt,
          new Date(`${query.submittedTo}T23:59:59.999Z`),
        ),
      );
    }

    const rawApps = await this.db
      .select()
      .from(officialBusinessApplications)
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
          (app.destination ?? "").toLowerCase().includes(term) ||
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
        case "obType":
          return a.obType.localeCompare(b.obType) * dir;
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

  async getApplicationById(id: number, user: User): Promise<OfficialBusinessApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view Official Business requests");
    }

    const [row] = await this.db
      .select()
      .from(officialBusinessApplications)
      .where(eq(officialBusinessApplications.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Official Business application #${id} not found`);
    }

    const [hydrated] = await this.hydrateApplications([row], actor);
    if (!hydrated) {
      throw new NotFoundException(`Official Business application #${id} not found`);
    }

    if (!actor.isAdmin) {
      const isApplicant = actor.employeeId !== null && hydrated.employeeId === actor.employeeId;
      const isApprover =
        actor.employeeId !== null &&
        hydrated.approvals.some((s) => s.approverId === actor.employeeId);
      if (!isApplicant && !isApprover) {
        throw new NotFoundException(`Official Business application #${id} not found`);
      }
    }

    return hydrated;
  }

  async createApplications(
    dto: CreateOfficialBusinessApplicationDto,
    user: User,
  ): Promise<CreateOfficialBusinessBatchResult> {
    const actor = await this.resolveActor(user);
    if (!actor.canCreate) {
      throw new ForbiddenException(
        "You do not have permission to submit Official Business requests",
      );
    }

    // Rebuild Note #1: Enforce administrator-only auto-approval at the domain layer
    if (dto.autoApprove && !actor.isAdmin) {
      throw new ForbiddenException(
        "Only administrators may submit auto-approved Official Business / WFH requests",
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
          "Your user account must be linked to an employee record to file OB/WFH",
        );
      }
      if (
        dto.employeeIds &&
        (dto.employeeIds.length !== 1 || dto.employeeIds[0] !== actor.employeeId)
      ) {
        throw new ForbiddenException("Employees may only submit OB/WFH requests for themselves");
      }
      targetEmployeeIds = [actor.employeeId];
    }

    const normalizedDestination =
      dto.destination && dto.destination.trim().length > 0 ? dto.destination.trim() : null;

    if (dto.obType === "ob" && !normalizedDestination) {
      throw new BadRequestException("Destination is required for Official Business (OB) requests");
    }

    const uniqueDates = Array.from(new Set(dto.details.map((d) => d.date)));

    const createdIds = await this.db.transaction(async (tx) => {
      // Lock target employee rows in deterministic sorted order
      const lockedEmployees = await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(inArray(employees.employeeId, targetEmployeeIds))
        .orderBy(asc(employees.employeeId))
        .for("update");

      const foundIds = new Set(lockedEmployees.map((e) => e.employeeId));
      const missingIds = targetEmployeeIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new BadRequestException(
          `Unknown employee ID(s): ${missingIds.slice(0, 5).join(", ")}`,
        );
      }

      // Load active pending/approved OB/WFH details for target employees & dates
      const existingActiveRows = await tx
        .select({
          employeeId: officialBusinessApplications.employeeId,
          applicationId: officialBusinessApplications.id,
          status: officialBusinessApplications.status,
          date: officialBusinessApplicationDetails.date,
          startTime: officialBusinessApplicationDetails.startTime,
          endTime: officialBusinessApplicationDetails.endTime,
        })
        .from(officialBusinessApplicationDetails)
        .innerJoin(
          officialBusinessApplications,
          eq(
            officialBusinessApplicationDetails.officialBusinessApplicationId,
            officialBusinessApplications.id,
          ),
        )
        .where(
          and(
            inArray(officialBusinessApplications.employeeId, targetEmployeeIds),
            inArray(officialBusinessApplications.status, ["pending", "approved"]),
            inArray(officialBusinessApplicationDetails.date, uniqueDates),
          ),
        );

      const existingByEmp = new Map<string, typeof existingActiveRows>();
      for (const row of existingActiveRows) {
        const list = existingByEmp.get(row.employeeId) ?? [];
        list.push(row);
        existingByEmp.set(row.employeeId, list);
      }

      const insertedIds: number[] = [];
      const now = new Date();
      const sortedDetails = [...dto.details].sort((a, b) =>
        a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
      );

      for (const empId of targetEmployeeIds) {
        const conflict = checkOfficialBusinessOverlaps({
          employeeId: empId,
          requested: sortedDetails,
          existingActive: existingByEmp.get(empId) ?? [],
        });
        if (conflict) {
          throw new BadRequestException(conflict);
        }

        const initialStatus: ApprovalStatus = dto.autoApprove ? "approved" : "pending";
        const [createdApp] = await tx
          .insert(officialBusinessApplications)
          .values({
            employeeId: empId,
            filedByUserId: actor.userId,
            obType: dto.obType,
            destination: normalizedDestination,
            reason: dto.reason,
            status: initialStatus,
            autoApproved: dto.autoApprove,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (!createdApp) {
          throw new Error("Failed to insert Official Business application");
        }

        await tx.insert(officialBusinessApplicationDetails).values(
          sortedDetails.map((slot) => ({
            officialBusinessApplicationId: createdApp.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            createdAt: now,
            updatedAt: now,
          })),
        );

        if (!dto.autoApprove) {
          await this.approvalEngine.snapshotChain(tx, {
            employeeId: empId,
            applicationType: "official_business",
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
      .from(officialBusinessApplications)
      .where(inArray(officialBusinessApplications.id, createdIds))
      .orderBy(asc(officialBusinessApplications.id));

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
  ): Promise<OfficialBusinessApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have Official Business update permission to approve requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(officialBusinessApplications)
        .where(eq(officialBusinessApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Official Business application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.approveStep(tx, {
        applicationType: "official_business",
        applicationId: app.id,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(officialBusinessApplications)
        .set({ status: nextParentStatus, updatedAt: new Date() })
        .where(eq(officialBusinessApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  async disapproveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<OfficialBusinessApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have Official Business update permission to disapprove requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(officialBusinessApplications)
        .where(eq(officialBusinessApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Official Business application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.disapproveStep(tx, {
        applicationType: "official_business",
        applicationId: app.id,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        isAdmin: actor.isAdmin,
        remarks,
      });

      await tx
        .update(officialBusinessApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(officialBusinessApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  async cancelApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<OfficialBusinessApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException(
        "You do not have permission to access Official Business applications",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(officialBusinessApplications)
        .where(eq(officialBusinessApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Official Business application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.cancelApplication(tx, {
        applicationType: "official_business",
        applicationId: app.id,
        applicantEmployeeId: app.employeeId,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(officialBusinessApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(officialBusinessApplications.id, app.id));
    });

    return this.getApplicationById(id, user);
  }

  private async hydrateApplications(
    apps: Array<typeof officialBusinessApplications.$inferSelect>,
    actor: ResolvedObActor,
  ): Promise<OfficialBusinessApplicationRecord[]> {
    if (apps.length === 0) return [];

    const appIds = apps.map((a) => a.id);
    const empIds = Array.from(new Set(apps.map((a) => a.employeeId)));
    const filerIds = Array.from(
      new Set(apps.map((a) => a.filedByUserId).filter((id): id is string => id !== null)),
    );

    const [detailRows, empRows, filerRows, approvalsMap] = await Promise.all([
      this.db
        .select()
        .from(officialBusinessApplicationDetails)
        .where(inArray(officialBusinessApplicationDetails.officialBusinessApplicationId, appIds))
        .orderBy(
          asc(officialBusinessApplicationDetails.officialBusinessApplicationId),
          asc(officialBusinessApplicationDetails.date),
          asc(officialBusinessApplicationDetails.startTime),
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
      this.approvalEngine.loadApprovalStepsMap(this.db, "official_business", appIds),
    ]);

    const empMap = new Map(empRows.map((e) => [e.employeeId, e]));
    const filerMap = new Map(filerRows.map((u) => [u.id, u.name]));
    const detailsMap = new Map<number, OfficialBusinessDetailRecord[]>();

    for (const d of detailRows) {
      const list = detailsMap.get(d.officialBusinessApplicationId) ?? [];
      list.push({
        id: d.id,
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
      });
      detailsMap.set(d.officialBusinessApplicationId, list);
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
        obType: app.obType as ObType,
        destination: app.destination,
        reason: app.reason,
        status: app.status as ApprovalStatus,
        autoApproved: app.autoApproved,
        decisionRemarks: app.decisionRemarks,
        submittedAt: app.submittedAt.toISOString(),
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
