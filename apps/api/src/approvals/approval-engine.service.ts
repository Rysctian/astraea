import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { applicationApprovals, approverSetups, type Database, employees, users } from "@starter/db";
import type {
  ApplicationApprovalStepRecord,
  ApplicationType,
  ApprovalStatus,
} from "@starter/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

export type ApprovalTx = Pick<Database, "select" | "insert" | "update" | "delete">;

export interface MissingApproverErrorPayload {
  statusCode: number;
  error: string;
  code: "MISSING_APPROVER_SETUP";
  applicationType: ApplicationType;
  employeeId: string;
  message: string;
}

export function computeStepActionability(params: {
  parentStatus: ApprovalStatus;
  applicantEmployeeId: string;
  actorEmployeeId: string | null;
  isAdmin: boolean;
  canUpdateModule: boolean;
  steps: Array<{ sequence: number; approverId: string; status: ApprovalStatus }>;
}): { canApprove: boolean; canDisapprove: boolean; canCancel: boolean } {
  const { parentStatus, applicantEmployeeId, actorEmployeeId, isAdmin, canUpdateModule, steps } =
    params;

  const canCancel =
    parentStatus === "pending" &&
    actorEmployeeId !== null &&
    actorEmployeeId === applicantEmployeeId;

  if (!canUpdateModule) {
    return { canApprove: false, canDisapprove: false, canCancel };
  }

  const ordered = [...steps].sort((a, b) => a.sequence - b.sequence);
  const earliestPending = ordered.find((s) => s.status === "pending");
  const allBeforeApproved = earliestPending
    ? ordered
        .filter((s) => s.sequence < earliestPending.sequence)
        .every((s) => s.status === "approved")
    : false;

  const isCurrentTurnApprover =
    parentStatus === "pending" &&
    earliestPending !== undefined &&
    allBeforeApproved &&
    actorEmployeeId !== null &&
    earliestPending.approverId === actorEmployeeId;

  // Administrators cannot bypass turn order to approve (Rule 9)
  const canApprove = isCurrentTurnApprover;

  // Current approver may disapprove pending; admin may override-disapprove pending or approved
  const canDisapprove =
    isCurrentTurnApprover ||
    (isAdmin && (parentStatus === "pending" || parentStatus === "approved"));

  return { canApprove, canDisapprove, canCancel };
}

@Injectable()
export class ApprovalEngineService {
  /**
   * Snapshots an employee's consecutive 1..N approval template into `application_approvals`
   * inside the caller's transaction. Rolls back the entire submission if no valid chain exists.
   */
  async snapshotChain(
    tx: ApprovalTx,
    params: {
      employeeId: string;
      applicationType: ApplicationType;
      applicationId: number;
      currentParentStatus: ApprovalStatus;
    },
  ): Promise<void> {
    if (params.currentParentStatus !== "pending") {
      throw new BadRequestException("Only pending applications can be snapshotted for approval");
    }

    // Lock applicant employee row to serialize against concurrent approver-setup replacements
    const [emp] = await tx
      .select({ employeeId: employees.employeeId })
      .from(employees)
      .where(eq(employees.employeeId, params.employeeId))
      .for("update");

    if (!emp) {
      throw new BadRequestException(`Employee "${params.employeeId}" does not exist`);
    }

    // Guard single immutable snapshot (Rule 5)
    const existingSnapshot = await tx
      .select({ id: applicationApprovals.id })
      .from(applicationApprovals)
      .where(
        and(
          eq(applicationApprovals.applicationType, params.applicationType),
          eq(applicationApprovals.applicationId, params.applicationId),
        ),
      )
      .limit(1);

    if (existingSnapshot.length > 0) {
      throw new BadRequestException(
        "Approval chain has already been snapshotted for this application",
      );
    }

    const templateSteps = await tx
      .select()
      .from(approverSetups)
      .where(
        and(
          eq(approverSetups.employeeId, params.employeeId),
          eq(approverSetups.applicationType, params.applicationType),
        ),
      )
      .orderBy(asc(approverSetups.sequence))
      .for("update");

    if (templateSteps.length === 0 || templateSteps.length > 100) {
      const payload: MissingApproverErrorPayload = {
        statusCode: 400,
        error: "Bad Request",
        code: "MISSING_APPROVER_SETUP",
        applicationType: params.applicationType,
        employeeId: params.employeeId,
        message: `No approver workflow is configured for ${params.employeeId} (${params.applicationType}). Configure Approver Setup first.`,
      };
      throw new BadRequestException(payload);
    }

    for (let i = 0; i < templateSteps.length; i++) {
      if (templateSteps[i]?.sequence !== i + 1) {
        const payload: MissingApproverErrorPayload = {
          statusCode: 400,
          error: "Bad Request",
          code: "MISSING_APPROVER_SETUP",
          applicationType: params.applicationType,
          employeeId: params.employeeId,
          message: `Approver workflow for ${params.employeeId} (${params.applicationType}) has an invalid sequence. Please re-save it in Approver Setup.`,
        };
        throw new BadRequestException(payload);
      }
    }

    await tx.insert(applicationApprovals).values(
      templateSteps.map((step) => ({
        employeeId: params.employeeId,
        applicationType: params.applicationType,
        applicationId: params.applicationId,
        approverId: step.approverId,
        sequence: step.sequence,
        status: "pending",
      })),
    );
  }

  /**
   * Approves the earliest pending step strictly when it is the actor's turn.
   * Admins cannot bypass another approver's turn.
   */
  async approveStep(
    tx: ApprovalTx,
    params: {
      applicationType: ApplicationType;
      applicationId: number;
      currentParentStatus: ApprovalStatus;
      actorEmployeeId: string | null;
      actorUserId: string;
      remarks?: string;
    },
  ): Promise<{ nextParentStatus: ApprovalStatus }> {
    if (params.currentParentStatus !== "pending") {
      throw new BadRequestException(
        `Cannot approve an application in "${params.currentParentStatus}" status`,
      );
    }

    if (!params.actorEmployeeId) {
      throw new ForbiddenException(
        "Your user account must be linked to an employee record to approve applications",
      );
    }

    const steps = await tx
      .select()
      .from(applicationApprovals)
      .where(
        and(
          eq(applicationApprovals.applicationType, params.applicationType),
          eq(applicationApprovals.applicationId, params.applicationId),
        ),
      )
      .orderBy(asc(applicationApprovals.sequence))
      .for("update");

    if (steps.length === 0) {
      throw new BadRequestException("This application has no approval steps to act on");
    }

    const earliestPending = steps.find((s) => s.status === "pending");
    if (!earliestPending) {
      throw new BadRequestException("No pending approval step remains for this application");
    }

    const priorAllApproved = steps
      .filter((s) => s.sequence < earliestPending.sequence)
      .every((s) => s.status === "approved");

    if (!priorAllApproved || earliestPending.approverId !== params.actorEmployeeId) {
      throw new ForbiddenException(
        "You are not the current sequence approver for this application",
      );
    }

    const now = new Date();
    const cleanedRemarks = params.remarks?.trim() || null;

    await tx
      .update(applicationApprovals)
      .set({
        status: "approved",
        remarks: cleanedRemarks,
        actedAt: now,
        actedByUserId: params.actorUserId,
        updatedAt: now,
      })
      .where(eq(applicationApprovals.id, earliestPending.id));

    const remainingPending = steps.some(
      (s) => s.id !== earliestPending.id && s.status === "pending",
    );

    return { nextParentStatus: remainingPending ? "pending" : "approved" };
  }

  /**
   * Disapproves either as the current sequence approver (pending only)
   * or via administrator override (pending or approved).
   */
  async disapproveStep(
    tx: ApprovalTx,
    params: {
      applicationType: ApplicationType;
      applicationId: number;
      currentParentStatus: ApprovalStatus;
      actorEmployeeId: string | null;
      actorUserId: string;
      isAdmin: boolean;
      remarks?: string;
    },
  ): Promise<{ nextParentStatus: "disapproved"; wasPreviouslyApproved: boolean }> {
    if (
      params.currentParentStatus === "disapproved" ||
      params.currentParentStatus === "cancelled"
    ) {
      throw new BadRequestException(
        `Cannot disapprove an application that is already ${params.currentParentStatus}`,
      );
    }

    const steps = await tx
      .select()
      .from(applicationApprovals)
      .where(
        and(
          eq(applicationApprovals.applicationType, params.applicationType),
          eq(applicationApprovals.applicationId, params.applicationId),
        ),
      )
      .orderBy(asc(applicationApprovals.sequence))
      .for("update");

    const earliestPending = steps.find((s) => s.status === "pending");

    if (!params.isAdmin) {
      if (params.currentParentStatus !== "pending" || !earliestPending) {
        throw new ForbiddenException("Only administrators can disapprove an approved application");
      }
      const priorAllApproved = steps
        .filter((s) => s.sequence < earliestPending.sequence)
        .every((s) => s.status === "approved");

      if (
        !params.actorEmployeeId ||
        !priorAllApproved ||
        earliestPending.approverId !== params.actorEmployeeId
      ) {
        throw new ForbiddenException(
          "You are not the current sequence approver for this application",
        );
      }
    }

    const now = new Date();
    const cleanedRemarks = params.remarks?.trim() || null;

    if (earliestPending) {
      await tx
        .update(applicationApprovals)
        .set({
          status: "disapproved",
          remarks: cleanedRemarks,
          actedAt: now,
          actedByUserId: params.actorUserId,
          updatedAt: now,
        })
        .where(eq(applicationApprovals.id, earliestPending.id));
    }

    return {
      nextParentStatus: "disapproved",
      wasPreviouslyApproved: params.currentParentStatus === "approved",
    };
  }

  /**
   * Cancels a pending application strictly by the applicant employee.
   * Prior approved steps remain approved; remaining pending steps become cancelled.
   */
  async cancelApplication(
    tx: ApprovalTx,
    params: {
      applicationType: ApplicationType;
      applicationId: number;
      applicantEmployeeId: string;
      currentParentStatus: ApprovalStatus;
      actorEmployeeId: string | null;
      actorUserId: string;
      remarks?: string;
    },
  ): Promise<{ nextParentStatus: "cancelled" }> {
    if (!params.actorEmployeeId || params.actorEmployeeId !== params.applicantEmployeeId) {
      throw new ForbiddenException("Only the applicant employee may cancel this application");
    }

    if (params.currentParentStatus !== "pending") {
      throw new BadRequestException("Only pending applications can be cancelled");
    }

    const now = new Date();
    const cleanedRemarks = params.remarks?.trim() || null;

    await tx
      .update(applicationApprovals)
      .set({
        status: "cancelled",
        remarks: cleanedRemarks,
        actedAt: now,
        actedByUserId: params.actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(applicationApprovals.applicationType, params.applicationType),
          eq(applicationApprovals.applicationId, params.applicationId),
          eq(applicationApprovals.status, "pending"),
        ),
      );

    return { nextParentStatus: "cancelled" };
  }

  /**
   * Batch loads hydrated approval steps keyed by `applicationId` for fast list/detail views.
   */
  async loadApprovalStepsMap(
    db: Pick<Database, "select">,
    applicationType: ApplicationType,
    applicationIds: number[],
  ): Promise<Map<number, ApplicationApprovalStepRecord[]>> {
    const map = new Map<number, ApplicationApprovalStepRecord[]>();
    if (applicationIds.length === 0) {
      return map;
    }

    const rows = await db
      .select({
        id: applicationApprovals.id,
        applicationId: applicationApprovals.applicationId,
        sequence: applicationApprovals.sequence,
        approverId: applicationApprovals.approverId,
        status: applicationApprovals.status,
        remarks: applicationApprovals.remarks,
        actedAt: applicationApprovals.actedAt,
        approverFirstName: employees.firstName,
        approverMiddleName: employees.middleName,
        approverLastName: employees.lastName,
        approverPosition: employees.position,
        actedByUserName: users.name,
      })
      .from(applicationApprovals)
      .innerJoin(employees, eq(applicationApprovals.approverId, employees.employeeId))
      .leftJoin(users, eq(applicationApprovals.actedByUserId, users.id))
      .where(
        and(
          eq(applicationApprovals.applicationType, applicationType),
          inArray(applicationApprovals.applicationId, applicationIds),
        ),
      )
      .orderBy(asc(applicationApprovals.applicationId), asc(applicationApprovals.sequence));

    for (const r of rows) {
      const list = map.get(r.applicationId) ?? [];
      list.push({
        id: r.id,
        sequence: r.sequence,
        approverId: r.approverId,
        approverName: [r.approverFirstName, r.approverMiddleName, r.approverLastName]
          .filter(Boolean)
          .join(" "),
        approverPosition: r.approverPosition,
        status: r.status as ApprovalStatus,
        remarks: r.remarks,
        actedAt: r.actedAt ? r.actedAt.toISOString() : null,
        actedByUserName: r.actedByUserName ?? null,
      });
      map.set(r.applicationId, list);
    }

    return map;
  }
}
