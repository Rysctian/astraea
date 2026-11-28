import { describe, expect, it } from "vitest";
import { decisionRemarksSchema, saveApproverWorkflowSchema } from "./approvals.js";

describe("approvals schemas", () => {
  it("accepts a valid consecutive 1..N workflow", () => {
    const parsed = saveApproverWorkflowSchema.parse({
      employeeIds: ["EMP-20260001", "EMP-20260002"],
      applicationType: "overtime",
      approvers: [
        { sequence: 1, approverId: "EMP-20260010" },
        { sequence: 2, approverId: "EMP-20260020" },
      ],
    });
    expect(parsed.approvers).toHaveLength(2);
    expect(parsed.applicationType).toBe("overtime");
  });

  it("rejects sequence gaps and duplicate approvers", () => {
    const gap = saveApproverWorkflowSchema.safeParse({
      employeeIds: ["EMP-20260001"],
      applicationType: "leave",
      approvers: [
        { sequence: 1, approverId: "EMP-20260010" },
        { sequence: 3, approverId: "EMP-20260020" },
      ],
    });
    expect(gap.success).toBe(false);

    const dup = saveApproverWorkflowSchema.safeParse({
      employeeIds: ["EMP-20260001"],
      applicationType: "overtime",
      approvers: [
        { sequence: 1, approverId: "EMP-20260010" },
        { sequence: 2, approverId: "EMP-20260010" },
      ],
    });
    expect(dup.success).toBe(false);
  });

  it("enforces decision remarks max length", () => {
    expect(decisionRemarksSchema.safeParse({ remarks: "Approved" }).success).toBe(true);
    expect(decisionRemarksSchema.safeParse({ remarks: "a".repeat(5001) }).success).toBe(false);
  });
});
