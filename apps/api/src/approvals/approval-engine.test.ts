import { describe, expect, it } from "vitest";
import { computeStepActionability } from "./approval-engine.service.js";

describe("computeStepActionability", () => {
  const twoStepChain = [
    { sequence: 1, approverId: "EMP-A", status: "approved" as const },
    { sequence: 2, approverId: "EMP-B", status: "pending" as const },
  ];

  it("allows only the current sequence approver to approve, never an admin out of turn", () => {
    const turnApprover = computeStepActionability({
      parentStatus: "pending",
      applicantEmployeeId: "EMP-USER",
      actorEmployeeId: "EMP-B",
      isAdmin: false,
      canUpdateModule: true,
      steps: twoStepChain,
    });
    expect(turnApprover).toEqual({ canApprove: true, canDisapprove: true, canCancel: false });

    const adminOutOfTurn = computeStepActionability({
      parentStatus: "pending",
      applicantEmployeeId: "EMP-USER",
      actorEmployeeId: "EMP-ADMIN",
      isAdmin: true,
      canUpdateModule: true,
      steps: twoStepChain,
    });
    expect(adminOutOfTurn).toEqual({ canApprove: false, canDisapprove: true, canCancel: false });
  });

  it("permits admin override disapproval on approved applications, and applicant-only cancel on pending", () => {
    const adminOnApproved = computeStepActionability({
      parentStatus: "approved",
      applicantEmployeeId: "EMP-USER",
      actorEmployeeId: "EMP-ADMIN",
      isAdmin: true,
      canUpdateModule: true,
      steps: [
        { sequence: 1, approverId: "EMP-A", status: "approved" },
        { sequence: 2, approverId: "EMP-B", status: "approved" },
      ],
    });
    expect(adminOnApproved).toEqual({ canApprove: false, canDisapprove: true, canCancel: false });

    const applicantPending = computeStepActionability({
      parentStatus: "pending",
      applicantEmployeeId: "EMP-USER",
      actorEmployeeId: "EMP-USER",
      isAdmin: false,
      canUpdateModule: false,
      steps: twoStepChain,
    });
    expect(applicantPending).toEqual({ canApprove: false, canDisapprove: false, canCancel: true });
  });

  it("blocks approve/disapprove when actor lacks module update permission", () => {
    const noUpdateGrant = computeStepActionability({
      parentStatus: "pending",
      applicantEmployeeId: "EMP-USER",
      actorEmployeeId: "EMP-B",
      isAdmin: false,
      canUpdateModule: false,
      steps: twoStepChain,
    });
    expect(noUpdateGrant).toEqual({ canApprove: false, canDisapprove: false, canCancel: false });
  });
});
