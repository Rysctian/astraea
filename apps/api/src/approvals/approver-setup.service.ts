import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { approverSetups, type Database, employees } from "@starter/db";
import type {
  ApplicationType,
  ApproverStepRecord,
  ApproverWorkflowGroupRecord,
  ListApproverWorkflowsQuery,
  PaginatedResponse,
  SaveApproverWorkflowDto,
  SaveApproverWorkflowResult,
} from "@starter/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DB } from "../database/database.module.js";

function formatName(e: { firstName: string; middleName: string | null; lastName: string }): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

@Injectable()
export class ApproverSetupService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Lists approver workflows grouped by (employeeId, applicationType) so pagination
   * matches visible grouped workflow rows (Rebuild Note #2).
   */
  async listWorkflows(
    query: ListApproverWorkflowsQuery,
  ): Promise<PaginatedResponse<ApproverWorkflowGroupRecord>> {
    const rawRows = await this.db
      .select({
        id: approverSetups.id,
        employeeId: approverSetups.employeeId,
        applicationType: approverSetups.applicationType,
        approverId: approverSetups.approverId,
        sequence: approverSetups.sequence,
        updatedAt: approverSetups.updatedAt,
      })
      .from(approverSetups)
      .where(
        query.applicationType !== "all"
          ? eq(approverSetups.applicationType, query.applicationType)
          : undefined,
      )
      .orderBy(asc(approverSetups.employeeId), asc(approverSetups.sequence));

    if (rawRows.length === 0) {
      return {
        data: [],
        meta: { total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 },
      };
    }

    const involvedIds = Array.from(
      new Set([...rawRows.map((r) => r.employeeId), ...rawRows.map((r) => r.approverId)]),
    );

    const empRows = await this.db
      .select({
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
        department: employees.department,
        position: employees.position,
      })
      .from(employees)
      .where(inArray(employees.employeeId, involvedIds));

    const empMap = new Map(empRows.map((e) => [e.employeeId, e]));

    const groupedMap = new Map<string, ApproverWorkflowGroupRecord>();
    for (const row of rawRows) {
      const key = `${row.employeeId}::${row.applicationType}`;
      const applicant = empMap.get(row.employeeId);
      const approver = empMap.get(row.approverId);

      const step: ApproverStepRecord = {
        id: row.id,
        sequence: row.sequence,
        approverId: row.approverId,
        approverName: approver ? formatName(approver) : row.approverId,
        approverPosition: approver?.position ?? null,
      };

      const existing = groupedMap.get(key);
      if (!existing) {
        groupedMap.set(key, {
          employeeId: row.employeeId,
          employeeName: applicant ? formatName(applicant) : row.employeeId,
          employeeDepartment: applicant?.department ?? null,
          employeePosition: applicant?.position ?? null,
          applicationType: row.applicationType as ApplicationType,
          stepCount: 1,
          steps: [step],
          updatedAt: row.updatedAt.toISOString(),
        });
      } else {
        existing.steps.push(step);
        existing.stepCount = existing.steps.length;
        const iso = row.updatedAt.toISOString();
        if (iso > existing.updatedAt) {
          existing.updatedAt = iso;
        }
      }
    }

    let groups = Array.from(groupedMap.values());

    if (query.search) {
      const term = query.search.toLowerCase();
      groups = groups.filter(
        (g) =>
          g.employeeId.toLowerCase().includes(term) ||
          g.employeeName.toLowerCase().includes(term) ||
          g.steps.some(
            (s) =>
              s.approverId.toLowerCase().includes(term) ||
              s.approverName.toLowerCase().includes(term),
          ),
      );
    }

    const dir = query.sortDir === "asc" ? 1 : -1;
    groups.sort((a, b) => {
      switch (query.sortBy) {
        case "employeeId":
          return a.employeeId.localeCompare(b.employeeId) * dir;
        case "employeeName":
          return a.employeeName.localeCompare(b.employeeName) * dir;
        case "applicationType":
          return a.applicationType.localeCompare(b.applicationType) * dir;
        case "stepCount":
          return (a.stepCount - b.stepCount) * dir;
        default:
          return a.updatedAt.localeCompare(b.updatedAt) * dir;
      }
    });

    const total = groups.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    const paged = groups.slice(offset, offset + query.pageSize);

    return {
      data: paged,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages,
      },
    };
  }

  async getWorkflow(
    employeeId: string,
    applicationType: ApplicationType,
  ): Promise<ApproverWorkflowGroupRecord> {
    const rows = await this.db
      .select()
      .from(approverSetups)
      .where(
        and(
          eq(approverSetups.employeeId, employeeId),
          eq(approverSetups.applicationType, applicationType),
        ),
      )
      .orderBy(asc(approverSetups.sequence));

    if (rows.length === 0) {
      throw new NotFoundException(
        `No approver workflow configured for ${employeeId} (${applicationType})`,
      );
    }

    const involvedIds = Array.from(new Set([employeeId, ...rows.map((r) => r.approverId)]));
    const empRows = await this.db
      .select({
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
        department: employees.department,
        position: employees.position,
      })
      .from(employees)
      .where(inArray(employees.employeeId, involvedIds));
    const empMap = new Map(empRows.map((e) => [e.employeeId, e]));
    const applicant = empMap.get(employeeId);

    const steps: ApproverStepRecord[] = rows.map((r) => {
      const appr = empMap.get(r.approverId);
      return {
        id: r.id,
        sequence: r.sequence,
        approverId: r.approverId,
        approverName: appr ? formatName(appr) : r.approverId,
        approverPosition: appr?.position ?? null,
      };
    });

    const latestUpdated = new Date(
      Math.max(...rows.map((r) => r.updatedAt.getTime())),
    ).toISOString();

    return {
      employeeId,
      employeeName: applicant ? formatName(applicant) : employeeId,
      employeeDepartment: applicant?.department ?? null,
      employeePosition: applicant?.position ?? null,
      applicationType,
      stepCount: steps.length,
      steps,
      updatedAt: latestUpdated,
    };
  }

  /**
   * Atomically replaces approval chain templates for 1..500 target employees and one application type.
   * Locks target employee rows in deterministic order to avoid deadlocks with concurrent filings.
   */
  async saveWorkflows(
    dto: SaveApproverWorkflowDto,
    actorUserId: string,
  ): Promise<SaveApproverWorkflowResult> {
    const sortedTargets = [...dto.employeeIds].sort();
    const approverIds = dto.approvers.map((a) => a.approverId);
    const orderedSteps = [...dto.approvers].sort((a, b) => a.sequence - b.sequence);

    return this.db.transaction(async (tx) => {
      // Lock target employee rows first in sorted order (deadlock-safe serialization)
      const lockedTargets = await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(inArray(employees.employeeId, sortedTargets))
        .orderBy(asc(employees.employeeId))
        .for("update");

      const foundTargets = new Set(lockedTargets.map((e) => e.employeeId));
      const missingTargets = sortedTargets.filter((id) => !foundTargets.has(id));
      if (missingTargets.length > 0) {
        throw new BadRequestException(
          `Unknown target employee ID(s): ${missingTargets.slice(0, 5).join(", ")}`,
        );
      }

      // Verify all approvers exist
      const existingApprovers = await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(inArray(employees.employeeId, approverIds));

      const foundApprovers = new Set(existingApprovers.map((e) => e.employeeId));
      const missingApprovers = approverIds.filter((id) => !foundApprovers.has(id));
      if (missingApprovers.length > 0) {
        throw new BadRequestException(
          `Unknown approver employee ID(s): ${missingApprovers.slice(0, 5).join(", ")}`,
        );
      }

      // Delete only matching (employeeId, applicationType) template rows
      await tx
        .delete(approverSetups)
        .where(
          and(
            inArray(approverSetups.employeeId, sortedTargets),
            eq(approverSetups.applicationType, dto.applicationType),
          ),
        );

      const now = new Date();
      const rowsToInsert = sortedTargets.flatMap((empId) =>
        orderedSteps.map((step) => ({
          employeeId: empId,
          applicationType: dto.applicationType,
          approverId: step.approverId,
          sequence: step.sequence,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        })),
      );

      await tx.insert(approverSetups).values(rowsToInsert);

      return {
        updatedEmployeeCount: sortedTargets.length,
        applicationType: dto.applicationType,
        stepCount: orderedSteps.length,
      };
    });
  }

  /**
   * Removes an employee's template chain for one application type.
   * Existing runtime snapshots in `application_approvals` are untouched.
   */
  async deleteWorkflow(employeeId: string, applicationType: ApplicationType): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .select({ employeeId: employees.employeeId })
        .from(employees)
        .where(eq(employees.employeeId, employeeId))
        .for("update");

      const deleted = await tx
        .delete(approverSetups)
        .where(
          and(
            eq(approverSetups.employeeId, employeeId),
            eq(approverSetups.applicationType, applicationType),
          ),
        )
        .returning({ id: approverSetups.id });

      if (deleted.length === 0) {
        throw new NotFoundException(
          `No approver workflow configured for ${employeeId} (${applicationType})`,
        );
      }
    });
  }
}
