import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  applicationApprovals,
  type Database,
  employeeLeaveCreditLogs,
  employeeLeaveCredits,
  employeeSchedules,
  employees,
  leaveApplicationDetails,
  leaveApplications,
  leavePolicies,
  leaveTypes,
  scheduleDetails,
  schedules,
  users,
} from "@starter/db";
import {
  type ApprovalStatus,
  type BulkAllocateCreditsResult,
  type BulkAllocateLeaveCreditsDto,
  type CreateLeaveApplicationDto,
  type CreateLeavePolicyDto,
  type CreateLeaveTypeDto,
  durationTypeToDayValue,
  type EmployeeLeaveCreditRecord,
  formatCreditDecimal,
  type LeaveAccrualMode,
  type LeaveApplicationDetailRecord,
  type LeaveApplicationRecord,
  type LeaveCreditChangeType,
  type LeaveCreditLogRecord,
  type LeaveDurationType,
  type LeaveFilingOptionsResponse,
  type LeavePolicyRecord,
  type LeaveTypeRecord,
  type ListLeaveApplicationsQuery,
  type ListLeaveCreditsQuery,
  type ListLeavePoliciesQuery,
  type ListLeaveTypesQuery,
  type PaginatedResponse,
  roundCreditValue,
  type UpdateLeavePolicyDto,
  type UpdateLeaveTypeDto,
  type UpsertLeaveCreditDto,
  type User,
} from "@starter/shared";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import {
  ApprovalEngineService,
  type ApprovalTx,
  computeStepActionability,
} from "../approvals/approval-engine.service.js";
import { DB } from "../database/database.module.js";
import { getIsoWeekday } from "../overtime/overtime-validator.js";
import { RbacService } from "../rbac/rbac.service.js";
import { LeaveStorageService, type UploadedAttachmentInput } from "./leave-storage.js";
import {
  checkLeaveDateConflicts,
  groupRequestedDaysByYear,
  validateLeaveDatesAgainstPolicy,
} from "./leave-validator.js";

function formatName(e: { firstName: string; middleName: string | null; lastName: string }): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

function getTodayIsoLocal(timeZone = "Asia/Manila"): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "2026";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

interface ResolvedLeaveActor {
  userId: string;
  employeeId: string | null;
  isAdmin: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

@Injectable()
export class LeaveService {
  private seedPromise: Promise<void> | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ApprovalEngineService) private readonly approvalEngine: ApprovalEngineService,
    @Inject(RbacService) private readonly rbacService: RbacService,
    @Inject(LeaveStorageService) private readonly storage: LeaveStorageService,
  ) {}

  private async ensureBaselineSeed(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = this.runBaselineSeed().catch((err) => {
        this.seedPromise = null;
        throw err;
      });
    }
    return this.seedPromise;
  }

  private async runBaselineSeed(): Promise<void> {
    const [existingPolicy] = await this.db
      .select({ id: leavePolicies.id })
      .from(leavePolicies)
      .limit(1);

    let defaultPolicyId = existingPolicy?.id ?? null;

    if (!existingPolicy) {
      const [created] = await this.db
        .insert(leavePolicies)
        .values({
          name: "Standard Leave Policy",
          description: "Default organizational leave policy with half-day and attachment support.",
          minNoticeDays: 0,
          allowBackdatedFiling: true,
          maxBackdatedDays: 30,
          maxConsecutiveDays: 30,
          allowHalfDay: true,
          accrualMode: "upfront_annual",
          allowNegativeBalance: false,
          carryOverEnabled: false,
          carryOverMaxDays: "0.00",
          countRestDays: false,
          allowAttachments: true,
          requireAttachment: false,
          isDefault: true,
          isActive: true,
        })
        .onConflictDoNothing({ target: leavePolicies.name })
        .returning({ id: leavePolicies.id });
      defaultPolicyId = created?.id ?? null;
    }

    const [existingType] = await this.db.select({ id: leaveTypes.id }).from(leaveTypes).limit(1);
    if (!existingType) {
      await this.db
        .insert(leaveTypes)
        .values([
          {
            code: "VL",
            name: "Vacation Leave",
            description: "Paid annual vacation entitlement",
            leavePolicyId: defaultPolicyId,
            isPaid: true,
            requiresCredits: true,
            defaultCredits: "15.00",
            isActive: true,
          },
          {
            code: "SL",
            name: "Sick Leave",
            description: "Paid sick and medical recovery leave",
            leavePolicyId: defaultPolicyId,
            isPaid: true,
            requiresCredits: true,
            defaultCredits: "15.00",
            isActive: true,
          },
          {
            code: "EL",
            name: "Emergency Leave",
            description: "Urgent personal or family emergency leave",
            leavePolicyId: defaultPolicyId,
            isPaid: true,
            requiresCredits: true,
            defaultCredits: "5.00",
            isActive: true,
          },
          {
            code: "LWOP",
            name: "Leave Without Pay",
            description: "Unpaid approved absence without credit deduction",
            leavePolicyId: defaultPolicyId,
            isPaid: false,
            requiresCredits: false,
            defaultCredits: "0.00",
            isActive: true,
          },
        ])
        .onConflictDoNothing({ target: leaveTypes.code });
    }
  }

  private async resolveActor(user: User): Promise<ResolvedLeaveActor> {
    await this.ensureBaselineSeed();
    const authority = await this.rbacService.getActorAuthority(user.id);
    const grant = authority.permissions.leave_applications;
    const isSystemAdmin = authority.roleCode === "admin";
    // Per Spec Section 1: admin authority also includes leave delete permission
    const isAdmin = authority.isAdmin || Boolean(grant?.canDelete);

    return {
      userId: user.id,
      employeeId: user.employeeId,
      isAdmin,
      canView: isSystemAdmin || Boolean(grant?.canView),
      canCreate: isSystemAdmin || Boolean(grant?.canCreate),
      canUpdate: isSystemAdmin || Boolean(grant?.canUpdate),
    };
  }

  private assertAdmin(actor: ResolvedLeaveActor): void {
    if (!actor.isAdmin) {
      throw new ForbiddenException("Administrator permission is required for Leave configuration");
    }
  }

  // =========================================================================
  // LEAVE POLICIES CRUD
  // =========================================================================

  async listPolicies(
    query: ListLeavePoliciesQuery,
    user: User,
  ): Promise<PaginatedResponse<LeavePolicyRecord>> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    const rows = await this.db.select().from(leavePolicies);
    const typeCounts = await this.db
      .select({ leavePolicyId: leaveTypes.leavePolicyId, total: count() })
      .from(leaveTypes)
      .groupBy(leaveTypes.leavePolicyId);

    const countMap = new Map<number, number>();
    for (const c of typeCounts) {
      if (c.leavePolicyId !== null) {
        countMap.set(c.leavePolicyId, Number(c.total));
      }
    }

    let records: LeavePolicyRecord[] = rows.map((r) => {
      const assigned = countMap.get(r.id) ?? 0;
      const deleteBlockedReason = r.isDefault
        ? "Default leave policy cannot be deleted"
        : assigned > 0
          ? `Assigned to ${assigned} leave type${assigned === 1 ? "" : "s"}`
          : null;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        minNoticeDays: r.minNoticeDays,
        allowBackdatedFiling: r.allowBackdatedFiling,
        maxBackdatedDays: r.maxBackdatedDays,
        maxConsecutiveDays: r.maxConsecutiveDays,
        allowHalfDay: r.allowHalfDay,
        accrualMode: r.accrualMode as LeaveAccrualMode,
        allowNegativeBalance: r.allowNegativeBalance,
        carryOverEnabled: r.carryOverEnabled,
        carryOverMaxDays: Number(r.carryOverMaxDays),
        countRestDays: r.countRestDays,
        allowAttachments: r.allowAttachments,
        requireAttachment: r.requireAttachment,
        isDefault: r.isDefault,
        isActive: r.isActive,
        assignedLeaveTypeCount: assigned,
        canDelete: deleteBlockedReason === null,
        deleteBlockedReason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    if (query.status === "active") {
      records = records.filter((r) => r.isActive);
    } else if (query.status === "inactive") {
      records = records.filter((r) => !r.isActive);
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      records = records.filter(
        (r) =>
          r.name.toLowerCase().includes(term) || (r.description ?? "").toLowerCase().includes(term),
      );
    }

    const dir = query.sortDir === "asc" ? 1 : -1;
    records.sort((a, b) => {
      switch (query.sortBy) {
        case "minNoticeDays":
          return (a.minNoticeDays - b.minNoticeDays) * dir;
        case "isDefault":
          return (Number(b.isDefault) - Number(a.isDefault)) * dir;
        case "updatedAt":
          return a.updatedAt.localeCompare(b.updatedAt) * dir;
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });

    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    return {
      data: records.slice(offset, offset + query.pageSize),
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages },
    };
  }

  async createPolicy(dto: CreateLeavePolicyDto, user: User): Promise<LeavePolicyRecord> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    try {
      const createdId = await this.db.transaction(async (tx) => {
        if (dto.isDefault) {
          await tx
            .update(leavePolicies)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(leavePolicies.isDefault, true));
        }

        const [created] = await tx
          .insert(leavePolicies)
          .values({
            name: dto.name,
            description: dto.description?.trim() || null,
            minNoticeDays: dto.minNoticeDays,
            allowBackdatedFiling: dto.allowBackdatedFiling,
            maxBackdatedDays: dto.allowBackdatedFiling ? (dto.maxBackdatedDays ?? null) : null,
            maxConsecutiveDays: dto.maxConsecutiveDays ?? null,
            allowHalfDay: dto.allowHalfDay,
            accrualMode: dto.accrualMode,
            allowNegativeBalance: dto.allowNegativeBalance,
            carryOverEnabled: dto.carryOverEnabled,
            carryOverMaxDays: formatCreditDecimal(dto.carryOverEnabled ? dto.carryOverMaxDays : 0),
            countRestDays: dto.countRestDays,
            allowAttachments: dto.allowAttachments,
            requireAttachment: dto.allowAttachments ? dto.requireAttachment : false,
            isDefault: dto.isDefault,
            isActive: dto.isActive,
          })
          .returning({ id: leavePolicies.id });

        if (!created) throw new Error("Failed to create leave policy");
        return created.id;
      });

      const list = await this.listPolicies(
        { page: 1, pageSize: 100, status: "all", sortBy: "name", sortDir: "asc" },
        user,
      );
      const found = list.data.find((p) => p.id === createdId);
      if (!found) throw new NotFoundException(`Leave policy #${createdId} not found`);
      return found;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Leave policy "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async updatePolicy(
    id: number,
    dto: UpdateLeavePolicyDto,
    user: User,
  ): Promise<LeavePolicyRecord> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    try {
      await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(leavePolicies)
          .where(eq(leavePolicies.id, id))
          .for("update");
        if (!existing) {
          throw new NotFoundException(`Leave policy #${id} not found`);
        }

        // Rule 2: Cannot deactivate or unset the sole active default policy
        if (existing.isDefault && (!dto.isActive || !dto.isDefault)) {
          const [otherDefault] = await tx
            .select({ id: leavePolicies.id })
            .from(leavePolicies)
            .where(
              and(
                ne(leavePolicies.id, id),
                eq(leavePolicies.isDefault, true),
                eq(leavePolicies.isActive, true),
              ),
            )
            .limit(1);
          if (!otherDefault) {
            throw new BadRequestException(
              "Cannot deactivate or remove default status from the sole active default policy. Promote another active policy as default first.",
            );
          }
        }

        if (dto.isDefault && !existing.isDefault) {
          await tx
            .update(leavePolicies)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(ne(leavePolicies.id, id), eq(leavePolicies.isDefault, true)));
        }

        await tx
          .update(leavePolicies)
          .set({
            name: dto.name,
            description: dto.description?.trim() || null,
            minNoticeDays: dto.minNoticeDays,
            allowBackdatedFiling: dto.allowBackdatedFiling,
            maxBackdatedDays: dto.allowBackdatedFiling ? (dto.maxBackdatedDays ?? null) : null,
            maxConsecutiveDays: dto.maxConsecutiveDays ?? null,
            allowHalfDay: dto.allowHalfDay,
            accrualMode: dto.accrualMode,
            allowNegativeBalance: dto.allowNegativeBalance,
            carryOverEnabled: dto.carryOverEnabled,
            carryOverMaxDays: formatCreditDecimal(dto.carryOverEnabled ? dto.carryOverMaxDays : 0),
            countRestDays: dto.countRestDays,
            allowAttachments: dto.allowAttachments,
            requireAttachment: dto.allowAttachments ? dto.requireAttachment : false,
            isDefault: dto.isDefault,
            isActive: dto.isActive,
            updatedAt: new Date(),
          })
          .where(eq(leavePolicies.id, id));
      });

      const list = await this.listPolicies(
        { page: 1, pageSize: 100, status: "all", sortBy: "name", sortDir: "asc" },
        user,
      );
      const found = list.data.find((p) => p.id === id);
      if (!found) throw new NotFoundException(`Leave policy #${id} not found`);
      return found;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Leave policy "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async deletePolicy(id: number, user: User): Promise<void> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(leavePolicies)
        .where(eq(leavePolicies.id, id))
        .for("update");
      if (!existing) {
        throw new NotFoundException(`Leave policy #${id} not found`);
      }
      if (existing.isDefault) {
        throw new ConflictException("Cannot delete the default leave policy");
      }

      const [assigned] = await tx
        .select({ total: count() })
        .from(leaveTypes)
        .where(eq(leaveTypes.leavePolicyId, id));
      if (Number(assigned?.total ?? 0) > 0) {
        throw new ConflictException(
          "Cannot delete leave policy because it is assigned to one or more leave types",
        );
      }

      await tx.delete(leavePolicies).where(eq(leavePolicies.id, id));
    });
  }

  // =========================================================================
  // LEAVE TYPES CRUD
  // =========================================================================

  async listLeaveTypes(
    query: ListLeaveTypesQuery,
    user: User,
  ): Promise<PaginatedResponse<LeaveTypeRecord>> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    const [types, policies, creditCounts, appCounts] = await Promise.all([
      this.db.select().from(leaveTypes),
      this.db.select({ id: leavePolicies.id, name: leavePolicies.name }).from(leavePolicies),
      this.db
        .select({ leaveTypeId: employeeLeaveCredits.leaveTypeId, total: count() })
        .from(employeeLeaveCredits)
        .groupBy(employeeLeaveCredits.leaveTypeId),
      this.db
        .select({ leaveTypeId: leaveApplications.leaveTypeId, total: count() })
        .from(leaveApplications)
        .groupBy(leaveApplications.leaveTypeId),
    ]);

    const policyNameMap = new Map(policies.map((p) => [p.id, p.name]));
    const creditMap = new Map(creditCounts.map((c) => [c.leaveTypeId, Number(c.total)]));
    const appMap = new Map(appCounts.map((c) => [c.leaveTypeId, Number(c.total)]));

    let records: LeaveTypeRecord[] = types.map((t) => {
      const creditCount = creditMap.get(t.id) ?? 0;
      const applicationCount = appMap.get(t.id) ?? 0;
      const deleteBlockedReason =
        applicationCount > 0
          ? `Referenced by ${applicationCount} application${applicationCount === 1 ? "" : "s"}`
          : creditCount > 0
            ? `Referenced by ${creditCount} employee credit balance${creditCount === 1 ? "" : "s"}`
            : null;
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        leavePolicyId: t.leavePolicyId,
        leavePolicyName:
          t.leavePolicyId !== null ? (policyNameMap.get(t.leavePolicyId) ?? null) : null,
        isPaid: t.isPaid,
        requiresCredits: t.requiresCredits,
        defaultCredits: Number(t.defaultCredits),
        isActive: t.isActive,
        creditCount,
        applicationCount,
        canDelete: deleteBlockedReason === null,
        deleteBlockedReason,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    if (query.status === "active") {
      records = records.filter((r) => r.isActive);
    } else if (query.status === "inactive") {
      records = records.filter((r) => !r.isActive);
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      records = records.filter(
        (r) =>
          r.code.toLowerCase().includes(term) ||
          r.name.toLowerCase().includes(term) ||
          (r.description ?? "").toLowerCase().includes(term),
      );
    }

    const dir = query.sortDir === "asc" ? 1 : -1;
    records.sort((a, b) => {
      switch (query.sortBy) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "defaultCredits":
          return (a.defaultCredits - b.defaultCredits) * dir;
        case "updatedAt":
          return a.updatedAt.localeCompare(b.updatedAt) * dir;
        default:
          return a.code.localeCompare(b.code) * dir;
      }
    });

    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    return {
      data: records.slice(offset, offset + query.pageSize),
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages },
    };
  }

  async createLeaveType(dto: CreateLeaveTypeDto, user: User): Promise<LeaveTypeRecord> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    if (dto.leavePolicyId) {
      const [pol] = await this.db
        .select({ id: leavePolicies.id })
        .from(leavePolicies)
        .where(eq(leavePolicies.id, dto.leavePolicyId))
        .limit(1);
      if (!pol) {
        throw new BadRequestException(`Leave policy #${dto.leavePolicyId} does not exist`);
      }
    }

    try {
      const [created] = await this.db
        .insert(leaveTypes)
        .values({
          code: dto.code,
          name: dto.name,
          description: dto.description?.trim() || null,
          leavePolicyId: dto.leavePolicyId ?? null,
          isPaid: dto.isPaid,
          requiresCredits: dto.requiresCredits,
          defaultCredits: formatCreditDecimal(dto.requiresCredits ? dto.defaultCredits : 0),
          isActive: dto.isActive,
        })
        .returning({ id: leaveTypes.id });

      if (!created) throw new Error("Failed to create leave type");
      const list = await this.listLeaveTypes(
        { page: 1, pageSize: 100, status: "all", sortBy: "code", sortDir: "asc" },
        user,
      );
      const found = list.data.find((t) => t.id === created.id);
      if (!found) throw new NotFoundException(`Leave type #${created.id} not found`);
      return found;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Leave type code "${dto.code}" already exists`);
      }
      throw error;
    }
  }

  async updateLeaveType(id: number, dto: UpdateLeaveTypeDto, user: User): Promise<LeaveTypeRecord> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    const [existing] = await this.db
      .select({ id: leaveTypes.id })
      .from(leaveTypes)
      .where(eq(leaveTypes.id, id))
      .limit(1);
    if (!existing) {
      throw new NotFoundException(`Leave type #${id} not found`);
    }

    if (dto.leavePolicyId) {
      const [pol] = await this.db
        .select({ id: leavePolicies.id })
        .from(leavePolicies)
        .where(eq(leavePolicies.id, dto.leavePolicyId))
        .limit(1);
      if (!pol) {
        throw new BadRequestException(`Leave policy #${dto.leavePolicyId} does not exist`);
      }
    }

    try {
      await this.db
        .update(leaveTypes)
        .set({
          code: dto.code,
          name: dto.name,
          description: dto.description?.trim() || null,
          leavePolicyId: dto.leavePolicyId ?? null,
          isPaid: dto.isPaid,
          requiresCredits: dto.requiresCredits,
          defaultCredits: formatCreditDecimal(dto.requiresCredits ? dto.defaultCredits : 0),
          isActive: dto.isActive,
          updatedAt: new Date(),
        })
        .where(eq(leaveTypes.id, id));

      const list = await this.listLeaveTypes(
        { page: 1, pageSize: 100, status: "all", sortBy: "code", sortDir: "asc" },
        user,
      );
      const found = list.data.find((t) => t.id === id);
      if (!found) throw new NotFoundException(`Leave type #${id} not found`);
      return found;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Leave type code "${dto.code}" already exists`);
      }
      throw error;
    }
  }

  async deleteLeaveType(id: number, user: User): Promise<void> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.id, id))
        .for("update");
      if (!existing) {
        throw new NotFoundException(`Leave type #${id} not found`);
      }

      const [[creditsRef], [appsRef]] = await Promise.all([
        tx
          .select({ total: count() })
          .from(employeeLeaveCredits)
          .where(eq(employeeLeaveCredits.leaveTypeId, id)),
        tx
          .select({ total: count() })
          .from(leaveApplications)
          .where(eq(leaveApplications.leaveTypeId, id)),
      ]);

      if (Number(creditsRef?.total ?? 0) > 0 || Number(appsRef?.total ?? 0) > 0) {
        throw new ConflictException(
          "Cannot delete leave type because it is referenced by employee leave credits or applications",
        );
      }

      await tx.delete(leaveTypes).where(eq(leaveTypes.id, id));
    });
  }

  // =========================================================================
  // FILING OPTIONS & EMPLOYEE CREDITS / LEDGER
  // =========================================================================

  async getFilingOptions(user: User): Promise<LeaveFilingOptionsResponse> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view Leave Management");
    }

    const [activeTypes, activePolicies, currentEmpRow] = await Promise.all([
      this.db
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.isActive, true))
        .orderBy(asc(leaveTypes.code)),
      this.db.select().from(leavePolicies).where(eq(leavePolicies.isActive, true)),
      actor.employeeId
        ? this.db
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
            .limit(1)
        : Promise.resolve([]),
    ]);

    const policyById = new Map(activePolicies.map((p) => [p.id, p]));
    const defaultPolicy = activePolicies.find((p) => p.isDefault) ?? null;

    const currentEmp = currentEmpRow[0];

    return {
      currentEmployee: currentEmp
        ? {
            employeeId: currentEmp.employeeId,
            fullName: formatName(currentEmp),
            department: currentEmp.department,
            position: currentEmp.position,
          }
        : null,
      leaveTypes: activeTypes.map((lt) => {
        const resolved =
          (lt.leavePolicyId !== null ? policyById.get(lt.leavePolicyId) : undefined) ??
          defaultPolicy;
        return {
          id: lt.id,
          code: lt.code,
          name: lt.name,
          description: lt.description,
          isPaid: lt.isPaid,
          requiresCredits: lt.requiresCredits,
          defaultCredits: Number(lt.defaultCredits),
          effectivePolicy: resolved
            ? {
                id: resolved.id,
                name: resolved.name,
                minNoticeDays: resolved.minNoticeDays,
                allowBackdatedFiling: resolved.allowBackdatedFiling,
                maxBackdatedDays: resolved.maxBackdatedDays,
                maxConsecutiveDays: resolved.maxConsecutiveDays,
                allowHalfDay: resolved.allowHalfDay,
                allowNegativeBalance: resolved.allowNegativeBalance,
                countRestDays: resolved.countRestDays,
                allowAttachments: resolved.allowAttachments,
                requireAttachment: resolved.requireAttachment,
              }
            : null,
        };
      }),
    };
  }

  async getMyCredits(year: number | undefined, user: User): Promise<EmployeeLeaveCreditRecord[]> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view leave balances");
    }
    if (!actor.employeeId) {
      return [];
    }

    const targetYear = year ?? new Date().getFullYear();
    const rows = await this.db
      .select({
        credit: employeeLeaveCredits,
        leaveType: leaveTypes,
        emp: {
          employeeId: employees.employeeId,
          firstName: employees.firstName,
          middleName: employees.middleName,
          lastName: employees.lastName,
          department: employees.department,
        },
      })
      .from(employeeLeaveCredits)
      .innerJoin(leaveTypes, eq(employeeLeaveCredits.leaveTypeId, leaveTypes.id))
      .innerJoin(employees, eq(employeeLeaveCredits.employeeId, employees.employeeId))
      .where(
        and(
          eq(employeeLeaveCredits.employeeId, actor.employeeId),
          eq(employeeLeaveCredits.year, targetYear),
          eq(leaveTypes.requiresCredits, true),
        ),
      )
      .orderBy(asc(leaveTypes.code));

    return rows.map((r) => this.toCreditRecord(r.credit, r.leaveType, r.emp));
  }

  async listCredits(
    query: ListLeaveCreditsQuery,
    user: User,
  ): Promise<PaginatedResponse<EmployeeLeaveCreditRecord>> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    const conditions = [];
    if (query.year !== undefined) {
      conditions.push(eq(employeeLeaveCredits.year, query.year));
    }
    if (query.leaveTypeId !== undefined) {
      conditions.push(eq(employeeLeaveCredits.leaveTypeId, query.leaveTypeId));
    }

    const rows = await this.db
      .select({
        credit: employeeLeaveCredits,
        leaveType: leaveTypes,
        emp: {
          employeeId: employees.employeeId,
          firstName: employees.firstName,
          middleName: employees.middleName,
          lastName: employees.lastName,
          department: employees.department,
        },
      })
      .from(employeeLeaveCredits)
      .innerJoin(leaveTypes, eq(employeeLeaveCredits.leaveTypeId, leaveTypes.id))
      .innerJoin(employees, eq(employeeLeaveCredits.employeeId, employees.employeeId))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    let records = rows.map((r) => this.toCreditRecord(r.credit, r.leaveType, r.emp));

    if (query.search) {
      const term = query.search.toLowerCase();
      records = records.filter(
        (r) =>
          r.employeeId.toLowerCase().includes(term) ||
          r.employeeName.toLowerCase().includes(term) ||
          r.leaveTypeCode.toLowerCase().includes(term) ||
          r.leaveTypeName.toLowerCase().includes(term),
      );
    }

    const dir = query.sortDir === "asc" ? 1 : -1;
    records.sort((a, b) => {
      switch (query.sortBy) {
        case "leaveTypeCode":
          return a.leaveTypeCode.localeCompare(b.leaveTypeCode) * dir;
        case "allocatedCredits":
          return (a.allocatedCredits - b.allocatedCredits) * dir;
        case "availableCredits":
          return (a.availableCredits - b.availableCredits) * dir;
        default:
          return a.employeeName.localeCompare(b.employeeName) * dir;
      }
    });

    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    return {
      data: records.slice(offset, offset + query.pageSize),
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages },
    };
  }

  async upsertCredit(dto: UpsertLeaveCreditDto, user: User): Promise<EmployeeLeaveCreditRecord> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    const creditId = await this.db.transaction(async (tx) => {
      const [emp] = await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(eq(employees.employeeId, dto.employeeId))
        .for("update");
      if (!emp) {
        throw new BadRequestException(`Employee "${dto.employeeId}" does not exist`);
      }

      const [lt] = await tx
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.id, dto.leaveTypeId))
        .limit(1);
      if (!lt) {
        throw new BadRequestException(`Leave type #${dto.leaveTypeId} does not exist`);
      }

      const [existing] = await tx
        .select()
        .from(employeeLeaveCredits)
        .where(
          and(
            eq(employeeLeaveCredits.employeeId, dto.employeeId),
            eq(employeeLeaveCredits.leaveTypeId, dto.leaveTypeId),
            eq(employeeLeaveCredits.year, dto.year),
          ),
        )
        .for("update");

      const nextAllocated = roundCreditValue(dto.allocatedCredits);

      if (!existing) {
        const [created] = await tx
          .insert(employeeLeaveCredits)
          .values({
            employeeId: dto.employeeId,
            leaveTypeId: dto.leaveTypeId,
            year: dto.year,
            allocatedCredits: formatCreditDecimal(nextAllocated),
            usedCredits: "0.00",
            pendingCredits: "0.00",
          })
          .returning();

        if (!created) throw new Error("Failed to create employee leave credit");

        await tx.insert(employeeLeaveCreditLogs).values({
          employeeLeaveCreditId: created.id,
          changeType: "grant",
          amount: formatCreditDecimal(nextAllocated),
          balanceAfter: formatCreditDecimal(nextAllocated),
          remarks: dto.remarks?.trim() || `Initial ${dto.year} allocation`,
          actedBy: actor.employeeId,
        });

        return created.id;
      }

      const used = Number(existing.usedCredits);
      const pending = Number(existing.pendingCredits);
      const minFloor = roundCreditValue(used + pending);

      // Rule 7: Allocation floor check
      if (nextAllocated < minFloor) {
        throw new BadRequestException(
          `Allocated credits (${nextAllocated.toFixed(2)}) cannot be lowered below used + pending credits (${minFloor.toFixed(2)})`,
        );
      }

      const prevAllocated = Number(existing.allocatedCredits);
      const delta = roundCreditValue(nextAllocated - prevAllocated);
      const nextAvailable = roundCreditValue(nextAllocated - used - pending);

      await tx
        .update(employeeLeaveCredits)
        .set({
          allocatedCredits: formatCreditDecimal(nextAllocated),
          updatedAt: new Date(),
        })
        .where(eq(employeeLeaveCredits.id, existing.id));

      await tx.insert(employeeLeaveCreditLogs).values({
        employeeLeaveCreditId: existing.id,
        changeType: "adjustment",
        amount: formatCreditDecimal(delta),
        balanceAfter: formatCreditDecimal(nextAvailable),
        remarks:
          dto.remarks?.trim() ||
          `Adjusted ${dto.year} allocation from ${prevAllocated.toFixed(2)} to ${nextAllocated.toFixed(2)}`,
        actedBy: actor.employeeId,
      });

      return existing.id;
    });

    const [row] = await this.db
      .select({
        credit: employeeLeaveCredits,
        leaveType: leaveTypes,
        emp: {
          employeeId: employees.employeeId,
          firstName: employees.firstName,
          middleName: employees.middleName,
          lastName: employees.lastName,
          department: employees.department,
        },
      })
      .from(employeeLeaveCredits)
      .innerJoin(leaveTypes, eq(employeeLeaveCredits.leaveTypeId, leaveTypes.id))
      .innerJoin(employees, eq(employeeLeaveCredits.employeeId, employees.employeeId))
      .where(eq(employeeLeaveCredits.id, creditId))
      .limit(1);

    if (!row) throw new NotFoundException(`Leave credit #${creditId} not found`);
    return this.toCreditRecord(row.credit, row.leaveType, row.emp);
  }

  async bulkAllocateCredits(
    dto: BulkAllocateLeaveCreditsDto,
    user: User,
  ): Promise<BulkAllocateCreditsResult> {
    const actor = await this.resolveActor(user);
    this.assertAdmin(actor);

    return this.db.transaction(async (tx) => {
      const targetEmps =
        dto.employeeIds && dto.employeeIds.length > 0
          ? await tx
              .select({ employeeId: employees.employeeId })
              .from(employees)
              .where(inArray(employees.employeeId, dto.employeeIds))
              .orderBy(asc(employees.employeeId))
              .for("update")
          : await tx
              .select({ employeeId: employees.employeeId })
              .from(employees)
              .where(eq(employees.employmentStatus, "ACTIVE"))
              .orderBy(asc(employees.employeeId))
              .for("update");

      const targetTypes = dto.leaveTypeId
        ? await tx
            .select()
            .from(leaveTypes)
            .where(and(eq(leaveTypes.id, dto.leaveTypeId), eq(leaveTypes.isActive, true)))
        : await tx
            .select()
            .from(leaveTypes)
            .where(and(eq(leaveTypes.isActive, true), eq(leaveTypes.requiresCredits, true)));

      if (targetTypes.length === 0) {
        throw new BadRequestException("No active credit-bearing leave types found for allocation");
      }

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const emp of targetEmps) {
        for (const lt of targetTypes) {
          const targetAlloc = roundCreditValue(
            dto.allocatedCredits !== undefined ? dto.allocatedCredits : Number(lt.defaultCredits),
          );

          const [existing] = await tx
            .select()
            .from(employeeLeaveCredits)
            .where(
              and(
                eq(employeeLeaveCredits.employeeId, emp.employeeId),
                eq(employeeLeaveCredits.leaveTypeId, lt.id),
                eq(employeeLeaveCredits.year, dto.year),
              ),
            )
            .for("update");

          if (!existing) {
            const [created] = await tx
              .insert(employeeLeaveCredits)
              .values({
                employeeId: emp.employeeId,
                leaveTypeId: lt.id,
                year: dto.year,
                allocatedCredits: formatCreditDecimal(targetAlloc),
                usedCredits: "0.00",
                pendingCredits: "0.00",
              })
              .returning();

            if (created) {
              await tx.insert(employeeLeaveCreditLogs).values({
                employeeLeaveCreditId: created.id,
                changeType: "grant",
                amount: formatCreditDecimal(targetAlloc),
                balanceAfter: formatCreditDecimal(targetAlloc),
                remarks: dto.remarks?.trim() || `Bulk ${dto.year} credit allocation`,
                actedBy: actor.employeeId,
              });
              createdCount += 1;
            }
          } else if (dto.overwriteExisting) {
            const used = Number(existing.usedCredits);
            const pending = Number(existing.pendingCredits);
            const minFloor = roundCreditValue(used + pending);
            if (targetAlloc < minFloor) {
              skippedCount += 1;
              continue;
            }
            const prevAlloc = Number(existing.allocatedCredits);
            const delta = roundCreditValue(targetAlloc - prevAlloc);
            const avail = roundCreditValue(targetAlloc - used - pending);

            await tx
              .update(employeeLeaveCredits)
              .set({
                allocatedCredits: formatCreditDecimal(targetAlloc),
                updatedAt: new Date(),
              })
              .where(eq(employeeLeaveCredits.id, existing.id));

            await tx.insert(employeeLeaveCreditLogs).values({
              employeeLeaveCreditId: existing.id,
              changeType: "adjustment",
              amount: formatCreditDecimal(delta),
              balanceAfter: formatCreditDecimal(avail),
              remarks: dto.remarks?.trim() || `Bulk ${dto.year} allocation overwrite`,
              actedBy: actor.employeeId,
            });
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
        }
      }

      return { year: dto.year, createdCount, updatedCount, skippedCount };
    });
  }

  async getCreditLogs(creditId: number, user: User): Promise<LeaveCreditLogRecord[]> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view leave credit logs");
    }

    const [credit] = await this.db
      .select()
      .from(employeeLeaveCredits)
      .where(eq(employeeLeaveCredits.id, creditId))
      .limit(1);

    if (!credit) {
      throw new NotFoundException(`Leave credit #${creditId} not found`);
    }

    if (!actor.isAdmin && credit.employeeId !== actor.employeeId) {
      throw new NotFoundException(`Leave credit #${creditId} not found`);
    }

    const logs = await this.db
      .select()
      .from(employeeLeaveCreditLogs)
      .where(eq(employeeLeaveCreditLogs.employeeLeaveCreditId, creditId))
      .orderBy(desc(employeeLeaveCreditLogs.createdAt), desc(employeeLeaveCreditLogs.id));

    const actorIds = Array.from(
      new Set(logs.map((l) => l.actedBy).filter((v): v is string => v !== null)),
    );
    const actorEmps =
      actorIds.length > 0
        ? await this.db
            .select({
              employeeId: employees.employeeId,
              firstName: employees.firstName,
              middleName: employees.middleName,
              lastName: employees.lastName,
            })
            .from(employees)
            .where(inArray(employees.employeeId, actorIds))
        : [];
    const empNameMap = new Map(actorEmps.map((e) => [e.employeeId, formatName(e)]));

    return logs.map((l) => ({
      id: l.id,
      employeeLeaveCreditId: l.employeeLeaveCreditId,
      changeType: l.changeType as LeaveCreditChangeType,
      amount: Number(l.amount),
      balanceAfter: Number(l.balanceAfter),
      leaveApplicationId: l.leaveApplicationId,
      remarks: l.remarks,
      actedBy: l.actedBy,
      actedByName: l.actedBy ? (empNameMap.get(l.actedBy) ?? l.actedBy) : null,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  // =========================================================================
  // LEAVE APPLICATIONS LIFECYCLE
  // =========================================================================

  async listApplications(
    query: ListLeaveApplicationsQuery,
    user: User,
  ): Promise<PaginatedResponse<LeaveApplicationRecord>> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view leave applications");
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
          .select({ id: leaveApplications.id })
          .from(leaveApplications)
          .where(eq(leaveApplications.employeeId, actor.employeeId)),
        this.db
          .select({ applicationId: applicationApprovals.applicationId })
          .from(applicationApprovals)
          .where(
            and(
              eq(applicationApprovals.applicationType, "leave"),
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
      conditions.push(inArray(leaveApplications.id, allowedIds));
    }
    if (query.status !== "all") {
      conditions.push(eq(leaveApplications.status, query.status));
    }
    if (query.leaveTypeId !== undefined) {
      conditions.push(eq(leaveApplications.leaveTypeId, query.leaveTypeId));
    }
    if (query.dateFrom) {
      conditions.push(gte(leaveApplications.dateTo, query.dateFrom));
    }
    if (query.dateTo) {
      conditions.push(lte(leaveApplications.dateFrom, query.dateTo));
    }

    const rawApps = await this.db
      .select()
      .from(leaveApplications)
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
          app.leaveTypeCode.toLowerCase().includes(term) ||
          app.leaveTypeName.toLowerCase().includes(term) ||
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
        case "dateFrom":
          return a.dateFrom.localeCompare(b.dateFrom) * dir;
        case "totalDays":
          return (a.totalDays - b.totalDays) * dir;
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

  async getApplicationById(id: number, user: User): Promise<LeaveApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to view leave applications");
    }

    const [row] = await this.db
      .select()
      .from(leaveApplications)
      .where(eq(leaveApplications.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Leave application #${id} not found`);
    }

    const [hydrated] = await this.hydrateApplications([row], actor);
    if (!hydrated) {
      throw new NotFoundException(`Leave application #${id} not found`);
    }

    if (!actor.isAdmin) {
      const isApplicant = actor.employeeId !== null && hydrated.employeeId === actor.employeeId;
      const isApprover =
        actor.employeeId !== null &&
        hydrated.approvals.some((s) => s.approverId === actor.employeeId);
      if (!isApplicant && !isApprover) {
        throw new NotFoundException(`Leave application #${id} not found`);
      }
    }

    return hydrated;
  }

  async getAttachmentDownload(
    id: number,
    user: User,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    // Enforces Rule 5 visibility scoping (applicant, snapshotted approver, or admin)
    await this.getApplicationById(id, user);

    const [row] = await this.db
      .select({
        attachmentPath: leaveApplications.attachmentPath,
        attachmentName: leaveApplications.attachmentName,
      })
      .from(leaveApplications)
      .where(eq(leaveApplications.id, id))
      .limit(1);

    if (!row?.attachmentPath) {
      throw new NotFoundException(`Leave application #${id} has no attachment`);
    }

    const { buffer, mimeType } = await this.storage.readPrivateAttachment(row.attachmentPath);
    return {
      buffer,
      mimeType,
      filename: row.attachmentName ?? "attachment",
    };
  }

  async createApplication(
    dto: CreateLeaveApplicationDto,
    file: UploadedAttachmentInput | null,
    user: User,
  ): Promise<LeaveApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canCreate) {
      throw new ForbiddenException("You do not have permission to submit leave applications");
    }

    // Rule 1: Single-employee filing & Admin-only auto-approval
    if (dto.autoApprove && !actor.isAdmin) {
      throw new ForbiddenException("Only administrators may submit auto-approved leave requests");
    }

    let targetEmployeeId: string;
    if (actor.isAdmin) {
      targetEmployeeId = dto.employeeId ?? actor.employeeId ?? "";
      if (!targetEmployeeId) {
        throw new BadRequestException("Select a target employee for this leave request");
      }
    } else {
      if (!actor.employeeId) {
        throw new ForbiddenException(
          "Your user account must be linked to an employee record to file leave",
        );
      }
      if (dto.employeeId && dto.employeeId !== actor.employeeId) {
        throw new ForbiddenException("Employees may only file leave for themselves");
      }
      targetEmployeeId = actor.employeeId;
    }

    // Validate attachment upfront before storing on disk
    if (file) {
      this.storage.validateAttachment(file);
    }

    let storedAttachmentPath: string | null = null;
    let storedAttachmentName: string | null = null;

    try {
      const createdId = await this.db.transaction(async (tx) => {
        // Lock target employee first
        const [emp] = await tx
          .select({ employeeId: employees.employeeId })
          .from(employees)
          .where(eq(employees.employeeId, targetEmployeeId))
          .for("update");
        if (!emp) {
          throw new BadRequestException(`Employee "${targetEmployeeId}" does not exist`);
        }

        // Load active leave type & resolve policy (Rule 2)
        const [lt] = await tx
          .select()
          .from(leaveTypes)
          .where(eq(leaveTypes.id, dto.leaveTypeId))
          .limit(1);
        if (!lt?.isActive) {
          throw new BadRequestException("Selected leave type is inactive or does not exist");
        }

        let policy = lt.leavePolicyId
          ? (
              await tx
                .select()
                .from(leavePolicies)
                .where(
                  and(eq(leavePolicies.id, lt.leavePolicyId), eq(leavePolicies.isActive, true)),
                )
                .limit(1)
            )[0]
          : undefined;

        if (!policy) {
          policy = (
            await tx
              .select()
              .from(leavePolicies)
              .where(and(eq(leavePolicies.isDefault, true), eq(leavePolicies.isActive, true)))
              .limit(1)
          )[0];
        }

        if (!policy) {
          throw new BadRequestException({
            statusCode: 400,
            error: "Bad Request",
            code: "MISSING_LEAVE_POLICY",
            message:
              "No active default leave policy is configured. Configure Leave Policies first.",
          });
        }

        // Attachment policy enforcement (Rule 5)
        if (file && !policy.allowAttachments) {
          throw new BadRequestException("Supporting document uploads are disabled by this policy");
        }
        if (!file && policy.allowAttachments && policy.requireAttachment) {
          throw new BadRequestException(
            "A supporting document attachment is required by this leave policy",
          );
        }

        const sortedDetails = [...dto.details].sort((a, b) => a.date.localeCompare(b.date));
        const dateFrom = sortedDetails[0]?.date ?? "";
        const dateTo = sortedDetails[sortedDetails.length - 1]?.date ?? dateFrom;

        // Resolve rest days from employee's active schedule when !policy.countRestDays
        const restDates = new Set<string>();
        if (!policy.countRestDays) {
          const assignments = await tx
            .select()
            .from(employeeSchedules)
            .where(
              and(
                eq(employeeSchedules.employeeId, targetEmployeeId),
                lte(employeeSchedules.effectiveFrom, dateTo),
                or(
                  isNull(employeeSchedules.effectiveTo),
                  gte(employeeSchedules.effectiveTo, dateFrom),
                ),
              ),
            );
          const schedIds = Array.from(new Set(assignments.map((a) => a.scheduleId)));
          if (schedIds.length > 0) {
            const [activeScheds, schedDetailRows] = await Promise.all([
              tx
                .select({ id: schedules.id, isActive: schedules.isActive })
                .from(schedules)
                .where(inArray(schedules.id, schedIds)),
              tx
                .select()
                .from(scheduleDetails)
                .where(inArray(scheduleDetails.scheduleId, schedIds)),
            ]);
            const activeSchedIds = new Set(activeScheds.filter((s) => s.isActive).map((s) => s.id));
            const detailsBySched = new Map<number, typeof schedDetailRows>();
            for (const d of schedDetailRows) {
              const list = detailsBySched.get(d.scheduleId) ?? [];
              list.push(d);
              detailsBySched.set(d.scheduleId, list);
            }

            for (const reqRow of sortedDetails) {
              const matched = assignments
                .filter(
                  (a) =>
                    a.effectiveFrom <= reqRow.date &&
                    (a.effectiveTo === null || a.effectiveTo >= reqRow.date) &&
                    activeSchedIds.has(a.scheduleId),
                )
                .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
              if (!matched) continue;
              const dow = getIsoWeekday(reqRow.date);
              const dayRows = (detailsBySched.get(matched.scheduleId) ?? []).filter(
                (d) => d.dayOfWeek === dow,
              );
              if (dayRows.length > 0 && dayRows.every((d) => d.isRestDay)) {
                restDates.add(reqRow.date);
              }
            }
          }
        }

        // Policy rules check (Rule 3)
        const policyError = validateLeaveDatesAgainstPolicy({
          details: sortedDetails,
          policy,
          todayIso: getTodayIsoLocal(),
          restDates,
        });
        if (policyError) {
          throw new BadRequestException(policyError);
        }

        // Overlap / half-day pairing check against active leave requests (Rule 4)
        const requestedDates = sortedDetails.map((d) => d.date);
        const existingActiveRows = await tx
          .select({
            applicationId: leaveApplications.id,
            date: leaveApplicationDetails.date,
            durationType: leaveApplicationDetails.durationType,
          })
          .from(leaveApplicationDetails)
          .innerJoin(
            leaveApplications,
            eq(leaveApplicationDetails.leaveApplicationId, leaveApplications.id),
          )
          .where(
            and(
              eq(leaveApplications.employeeId, targetEmployeeId),
              inArray(leaveApplications.status, ["pending", "approved"]),
              inArray(leaveApplicationDetails.date, requestedDates),
            ),
          );

        const conflictError = checkLeaveDateConflicts({
          requested: sortedDetails,
          existingActive: existingActiveRows.map((r) => ({
            applicationId: r.applicationId,
            date: r.date,
            durationType: r.durationType as LeaveDurationType,
          })),
        });
        if (conflictError) {
          throw new BadRequestException(conflictError);
        }

        const totalDays = roundCreditValue(
          sortedDetails.reduce((sum, d) => sum + durationTypeToDayValue(d.durationType), 0),
        );

        // Store file to private disk only after policy & conflict checks pass
        if (file) {
          const stored = await this.storage.storePrivateAttachment(targetEmployeeId, file);
          storedAttachmentPath = stored.relativePath;
          storedAttachmentName = stored.originalName;
        }

        const now = new Date();
        const initialStatus: ApprovalStatus = dto.autoApprove ? "approved" : "pending";

        const [createdApp] = await tx
          .insert(leaveApplications)
          .values({
            employeeId: targetEmployeeId,
            leaveTypeId: lt.id,
            filedByUserId: actor.userId,
            dateFrom,
            dateTo,
            totalDays: formatCreditDecimal(totalDays),
            reason: dto.reason,
            attachmentPath: storedAttachmentPath,
            attachmentName: storedAttachmentName,
            status: initialStatus,
            autoApproved: dto.autoApprove,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (!createdApp) {
          throw new Error("Failed to insert leave application");
        }

        await tx.insert(leaveApplicationDetails).values(
          sortedDetails.map((d) => ({
            leaveApplicationId: createdApp.id,
            date: d.date,
            durationType: d.durationType,
            dayValue: formatCreditDecimal(durationTypeToDayValue(d.durationType)),
          })),
        );

        // Multi-year credit reservation / deduction (Rule 6)
        if (lt.requiresCredits) {
          const byYear = groupRequestedDaysByYear(sortedDetails);
          for (const { year, days } of byYear) {
            let [creditRow] = await tx
              .select()
              .from(employeeLeaveCredits)
              .where(
                and(
                  eq(employeeLeaveCredits.employeeId, targetEmployeeId),
                  eq(employeeLeaveCredits.leaveTypeId, lt.id),
                  eq(employeeLeaveCredits.year, year),
                ),
              )
              .for("update");

            if (!creditRow) {
              if (!policy.allowNegativeBalance) {
                throw new BadRequestException({
                  statusCode: 400,
                  error: "Bad Request",
                  code: "INSUFFICIENT_LEAVE_CREDITS",
                  message: `No ${year} leave credits allocated for ${targetEmployeeId} (${lt.code}). Allocate credits in Leave Setup first.`,
                });
              }
              const [autoCreated] = await tx
                .insert(employeeLeaveCredits)
                .values({
                  employeeId: targetEmployeeId,
                  leaveTypeId: lt.id,
                  year,
                  allocatedCredits: "0.00",
                  usedCredits: "0.00",
                  pendingCredits: "0.00",
                })
                .returning();
              creditRow = autoCreated;
            }

            if (!creditRow) {
              throw new Error("Failed to lock or initialize leave credit row");
            }

            const allocated = Number(creditRow.allocatedCredits);
            const used = Number(creditRow.usedCredits);
            const pending = Number(creditRow.pendingCredits);
            const available = roundCreditValue(allocated - used - pending);

            if (!policy.allowNegativeBalance && available < days) {
              throw new BadRequestException({
                statusCode: 400,
                error: "Bad Request",
                code: "INSUFFICIENT_LEAVE_CREDITS",
                message: `Insufficient ${year} ${lt.code} credits for ${targetEmployeeId}: available ${available.toFixed(2)} day(s), requested ${days.toFixed(2)} day(s).`,
              });
            }

            if (dto.autoApprove) {
              const nextUsed = roundCreditValue(used + days);
              const nextBalance = roundCreditValue(allocated - nextUsed - pending);
              await tx
                .update(employeeLeaveCredits)
                .set({ usedCredits: formatCreditDecimal(nextUsed), updatedAt: now })
                .where(eq(employeeLeaveCredits.id, creditRow.id));

              await tx.insert(employeeLeaveCreditLogs).values({
                employeeLeaveCreditId: creditRow.id,
                changeType: "deduct",
                amount: formatCreditDecimal(days),
                balanceAfter: formatCreditDecimal(nextBalance),
                leaveApplicationId: createdApp.id,
                remarks: `Auto-approved leave #${createdApp.id}`,
                actedBy: actor.employeeId,
              });
            } else {
              const nextPending = roundCreditValue(pending + days);
              const nextBalance = roundCreditValue(allocated - used - nextPending);
              await tx
                .update(employeeLeaveCredits)
                .set({ pendingCredits: formatCreditDecimal(nextPending), updatedAt: now })
                .where(eq(employeeLeaveCredits.id, creditRow.id));

              await tx.insert(employeeLeaveCreditLogs).values({
                employeeLeaveCreditId: creditRow.id,
                changeType: "reserve",
                amount: formatCreditDecimal(days),
                balanceAfter: formatCreditDecimal(nextBalance),
                leaveApplicationId: createdApp.id,
                remarks: `Reserved for pending leave #${createdApp.id}`,
                actedBy: actor.employeeId,
              });
            }
          }
        }

        if (!dto.autoApprove) {
          await this.approvalEngine.snapshotChain(tx, {
            employeeId: targetEmployeeId,
            applicationType: "leave",
            applicationId: createdApp.id,
            currentParentStatus: "pending",
          });
        }

        return createdApp.id;
      });

      return this.getApplicationById(createdId, user);
    } catch (error) {
      // Clean up newly written file so rollbacks leave zero orphaned attachments (Rule 5)
      if (storedAttachmentPath) {
        await this.storage.deletePrivateAttachment(storedAttachmentPath);
      }
      throw error;
    }
  }

  async approveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<LeaveApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException("You do not have leave update permission to approve requests");
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(leaveApplications)
        .where(eq(leaveApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Leave application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.approveStep(tx, {
        applicationType: "leave",
        applicationId: app.id,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(leaveApplications)
        .set({ status: nextParentStatus, updatedAt: new Date() })
        .where(eq(leaveApplications.id, app.id));

      if (nextParentStatus === "approved") {
        await this.applyCreditTransition(tx, {
          application: app,
          transition: "pending_to_used",
          actedByEmployeeId: actor.employeeId,
          remarks: `Final approval of leave #${app.id}`,
        });
      }
    });

    return this.getApplicationById(id, user);
  }

  async disapproveApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<LeaveApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canUpdate) {
      throw new ForbiddenException(
        "You do not have leave update permission to disapprove requests",
      );
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(leaveApplications)
        .where(eq(leaveApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Leave application #${id} not found`);
      }

      const { nextParentStatus, wasPreviouslyApproved } = await this.approvalEngine.disapproveStep(
        tx,
        {
          applicationType: "leave",
          applicationId: app.id,
          currentParentStatus: app.status as ApprovalStatus,
          actorEmployeeId: actor.employeeId,
          actorUserId: actor.userId,
          isAdmin: actor.isAdmin,
          remarks,
        },
      );

      await tx
        .update(leaveApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(leaveApplications.id, app.id));

      await this.applyCreditTransition(tx, {
        application: app,
        transition: wasPreviouslyApproved ? "restore_used" : "release_pending",
        actedByEmployeeId: actor.employeeId,
        remarks: wasPreviouslyApproved
          ? `Admin override disapproval of approved leave #${app.id}`
          : `Disapproved pending leave #${app.id}`,
      });
    });

    return this.getApplicationById(id, user);
  }

  async cancelApplication(
    id: number,
    remarks: string | undefined,
    user: User,
  ): Promise<LeaveApplicationRecord> {
    const actor = await this.resolveActor(user);
    if (!actor.canView) {
      throw new ForbiddenException("You do not have permission to access leave applications");
    }

    await this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(leaveApplications)
        .where(eq(leaveApplications.id, id))
        .for("update");
      if (!app) {
        throw new NotFoundException(`Leave application #${id} not found`);
      }

      const { nextParentStatus } = await this.approvalEngine.cancelApplication(tx, {
        applicationType: "leave",
        applicationId: app.id,
        applicantEmployeeId: app.employeeId,
        currentParentStatus: app.status as ApprovalStatus,
        actorEmployeeId: actor.employeeId,
        actorUserId: actor.userId,
        remarks,
      });

      await tx
        .update(leaveApplications)
        .set({
          status: nextParentStatus,
          decisionRemarks: remarks?.trim() || app.decisionRemarks,
          updatedAt: new Date(),
        })
        .where(eq(leaveApplications.id, app.id));

      await this.applyCreditTransition(tx, {
        application: app,
        transition: "release_pending",
        actedByEmployeeId: actor.employeeId,
        remarks: `Cancelled pending leave #${app.id}`,
      });
    });

    return this.getApplicationById(id, user);
  }

  private async applyCreditTransition(
    tx: ApprovalTx,
    params: {
      application: typeof leaveApplications.$inferSelect;
      transition: "pending_to_used" | "release_pending" | "restore_used";
      actedByEmployeeId: string | null;
      remarks: string;
    },
  ): Promise<void> {
    const [lt] = await tx
      .select({ requiresCredits: leaveTypes.requiresCredits })
      .from(leaveTypes)
      .where(eq(leaveTypes.id, params.application.leaveTypeId))
      .limit(1);

    if (!lt?.requiresCredits) return;

    const details = await tx
      .select({
        date: leaveApplicationDetails.date,
        durationType: leaveApplicationDetails.durationType,
      })
      .from(leaveApplicationDetails)
      .where(eq(leaveApplicationDetails.leaveApplicationId, params.application.id));

    const byYear = groupRequestedDaysByYear(
      details.map((d) => ({
        date: d.date,
        durationType: d.durationType as LeaveDurationType,
      })),
    );

    const now = new Date();
    for (const { year, days } of byYear) {
      const [creditRow] = await tx
        .select()
        .from(employeeLeaveCredits)
        .where(
          and(
            eq(employeeLeaveCredits.employeeId, params.application.employeeId),
            eq(employeeLeaveCredits.leaveTypeId, params.application.leaveTypeId),
            eq(employeeLeaveCredits.year, year),
          ),
        )
        .for("update");

      if (!creditRow) continue;

      const allocated = Number(creditRow.allocatedCredits);
      let used = Number(creditRow.usedCredits);
      let pending = Number(creditRow.pendingCredits);
      let changeType: LeaveCreditChangeType;

      if (params.transition === "pending_to_used") {
        pending = roundCreditValue(Math.max(0, pending - days));
        used = roundCreditValue(used + days);
        changeType = "deduct";
      } else if (params.transition === "release_pending") {
        pending = roundCreditValue(Math.max(0, pending - days));
        changeType = "release";
      } else {
        used = roundCreditValue(Math.max(0, used - days));
        changeType = "restore";
      }

      const balanceAfter = roundCreditValue(allocated - used - pending);

      await tx
        .update(employeeLeaveCredits)
        .set({
          usedCredits: formatCreditDecimal(used),
          pendingCredits: formatCreditDecimal(pending),
          updatedAt: now,
        })
        .where(eq(employeeLeaveCredits.id, creditRow.id));

      await tx.insert(employeeLeaveCreditLogs).values({
        employeeLeaveCreditId: creditRow.id,
        changeType,
        amount: formatCreditDecimal(days),
        balanceAfter: formatCreditDecimal(balanceAfter),
        leaveApplicationId: params.application.id,
        remarks: params.remarks.slice(0, 255),
        actedBy: params.actedByEmployeeId,
      });
    }
  }

  private toCreditRecord(
    credit: typeof employeeLeaveCredits.$inferSelect,
    leaveType: typeof leaveTypes.$inferSelect,
    emp: {
      employeeId: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      department: string | null;
    },
  ): EmployeeLeaveCreditRecord {
    const allocated = Number(credit.allocatedCredits);
    const used = Number(credit.usedCredits);
    const pending = Number(credit.pendingCredits);
    return {
      id: credit.id,
      employeeId: credit.employeeId,
      employeeName: formatName(emp),
      employeeDepartment: emp.department,
      leaveTypeId: credit.leaveTypeId,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      isPaid: leaveType.isPaid,
      year: credit.year,
      allocatedCredits: allocated,
      usedCredits: used,
      pendingCredits: pending,
      availableCredits: roundCreditValue(allocated - used - pending),
      updatedAt: credit.updatedAt.toISOString(),
    };
  }

  private async hydrateApplications(
    apps: Array<typeof leaveApplications.$inferSelect>,
    actor: ResolvedLeaveActor,
  ): Promise<LeaveApplicationRecord[]> {
    if (apps.length === 0) return [];

    const appIds = apps.map((a) => a.id);
    const empIds = Array.from(new Set(apps.map((a) => a.employeeId)));
    const typeIds = Array.from(new Set(apps.map((a) => a.leaveTypeId)));
    const filerIds = Array.from(
      new Set(apps.map((a) => a.filedByUserId).filter((id): id is string => id !== null)),
    );

    const [detailRows, empRows, typeRows, filerRows, approvalsMap] = await Promise.all([
      this.db
        .select()
        .from(leaveApplicationDetails)
        .where(inArray(leaveApplicationDetails.leaveApplicationId, appIds))
        .orderBy(
          asc(leaveApplicationDetails.leaveApplicationId),
          asc(leaveApplicationDetails.date),
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
      this.db
        .select({
          id: leaveTypes.id,
          code: leaveTypes.code,
          name: leaveTypes.name,
          isPaid: leaveTypes.isPaid,
        })
        .from(leaveTypes)
        .where(inArray(leaveTypes.id, typeIds)),
      filerIds.length > 0
        ? this.db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, filerIds))
        : Promise.resolve([]),
      this.approvalEngine.loadApprovalStepsMap(this.db, "leave", appIds),
    ]);

    const empMap = new Map(empRows.map((e) => [e.employeeId, e]));
    const typeMap = new Map(typeRows.map((t) => [t.id, t]));
    const filerMap = new Map(filerRows.map((u) => [u.id, u.name]));
    const detailsMap = new Map<number, LeaveApplicationDetailRecord[]>();

    for (const d of detailRows) {
      const list = detailsMap.get(d.leaveApplicationId) ?? [];
      list.push({
        id: d.id,
        date: d.date,
        durationType: d.durationType as LeaveDurationType,
        dayValue: Number(d.dayValue),
      });
      detailsMap.set(d.leaveApplicationId, list);
    }

    return apps.map((app) => {
      const emp = empMap.get(app.employeeId);
      const lt = typeMap.get(app.leaveTypeId);
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
        leaveTypeId: app.leaveTypeId,
        leaveTypeCode: lt?.code ?? "—",
        leaveTypeName: lt?.name ?? "Leave",
        isPaid: lt?.isPaid ?? true,
        dateFrom: app.dateFrom,
        dateTo: app.dateTo,
        totalDays: Number(app.totalDays),
        reason: app.reason,
        hasAttachment: Boolean(app.attachmentPath),
        attachmentName: app.attachmentName,
        status: app.status as ApprovalStatus,
        autoApproved: app.autoApproved,
        decisionRemarks: app.decisionRemarks,
        submittedAt: app.submittedAt.toISOString(),
        details,
        approvals,
        ...actionability,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      };
    });
  }
}
