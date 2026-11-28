import { z } from "zod";
import { paginationQuerySchema } from "./pagination.js";

export const APPLICATION_TYPES = ["overtime", "official_business", "correction", "leave"] as const;

export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  overtime: "Overtime",
  official_business: "Official Business",
  correction: "Attendance Correction",
  leave: "Leave",
};

export const APPROVAL_STATUSES = ["pending", "approved", "disapproved", "cancelled"] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const applicationTypeSchema = z.enum(APPLICATION_TYPES);

export const approverStepInputSchema = z.object({
  sequence: z.coerce.number().int().min(1).max(100),
  approverId: z.string().trim().min(1, "Approver is required").max(30),
});

export type ApproverStepInput = z.infer<typeof approverStepInputSchema>;

export const saveApproverWorkflowSchema = z
  .object({
    employeeIds: z
      .array(z.string().trim().min(1).max(30))
      .min(1, "Select at least one target employee")
      .max(500, "Cannot update more than 500 employees at once"),
    applicationType: applicationTypeSchema,
    approvers: z
      .array(approverStepInputSchema)
      .min(1, "Add at least one approver step")
      .max(100, "Maximum of 100 approver steps allowed"),
  })
  .superRefine((data, ctx) => {
    const uniqueEmployees = new Set(data.employeeIds);
    if (uniqueEmployees.size !== data.employeeIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employeeIds"],
        message: "Target employee list contains duplicate employee IDs",
      });
    }

    const sequences = data.approvers.map((a) => a.sequence).sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approvers"],
          message: `Approver sequences must form a consecutive 1..${sequences.length} range with no gaps or duplicates`,
        });
        break;
      }
    }

    const seenApprovers = new Set<string>();
    for (let i = 0; i < data.approvers.length; i++) {
      const approverId = data.approvers[i]?.approverId;
      if (!approverId) continue;
      if (seenApprovers.has(approverId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approvers", i, "approverId"],
          message: "The same approver cannot appear twice in one workflow sequence",
        });
      }
      seenApprovers.add(approverId);
    }
  });

export type SaveApproverWorkflowDto = z.infer<typeof saveApproverWorkflowSchema>;

export const listApproverWorkflowsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  applicationType: z.enum(["all", ...APPLICATION_TYPES]).default("all"),
  sortBy: z
    .enum(["employeeId", "employeeName", "applicationType", "stepCount", "updatedAt"])
    .default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListApproverWorkflowsQuery = z.infer<typeof listApproverWorkflowsQuerySchema>;

export const approverWorkflowKeyParamSchema = z.object({
  employeeId: z.string().trim().min(1).max(30),
  applicationType: applicationTypeSchema,
});

export type ApproverWorkflowKeyParam = z.infer<typeof approverWorkflowKeyParamSchema>;

export const decisionRemarksSchema = z
  .object({
    remarks: z.string().trim().max(5000, "Remarks cannot exceed 5,000 characters").optional(),
  })
  .strict();

export type DecisionRemarksDto = z.infer<typeof decisionRemarksSchema>;

export interface ApproverStepRecord {
  id: number;
  sequence: number;
  approverId: string;
  approverName: string;
  approverPosition: string | null;
}

export interface ApproverWorkflowGroupRecord {
  employeeId: string;
  employeeName: string;
  employeeDepartment: string | null;
  employeePosition: string | null;
  applicationType: ApplicationType;
  stepCount: number;
  steps: ApproverStepRecord[];
  updatedAt: string;
}

export interface SaveApproverWorkflowResult {
  updatedEmployeeCount: number;
  applicationType: ApplicationType;
  stepCount: number;
}

export interface ApplicationApprovalStepRecord {
  id: number;
  sequence: number;
  approverId: string;
  approverName: string;
  approverPosition: string | null;
  status: ApprovalStatus;
  remarks: string | null;
  actedAt: string | null;
  actedByUserName: string | null;
}
