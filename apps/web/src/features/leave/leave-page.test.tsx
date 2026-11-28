import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { LeavePage } from "./leave-page";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/applications/approver-setup" className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly rowErrors?: unknown,
      public readonly code?: string,
    ) {
      super(message);
    }
  },
  api: {
    getMyAccess: vi.fn(),
    getLeaveFilingOptions: vi.fn(),
    getMyLeaveCredits: vi.fn(),
    listEmployees: vi.fn(),
    listLeaveApplications: vi.fn(),
    listLeavePolicies: vi.fn(),
    listLeaveTypes: vi.fn(),
    listLeaveCredits: vi.fn(),
    getLeaveAttachmentUrl: (id: number) => `/leave/applications/${id}/attachment`,
  },
}));

describe("LeavePage", () => {
  it("renders balance utilization strip, leave applications, admin tabs, and Apply Leave drawer", async () => {
    vi.mocked(api.getMyAccess).mockResolvedValue({
      role: { id: 1, code: "admin", name: "Administrator" },
      permissions: {
        approver_setup: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
        leave_applications: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
      },
      navigation: [],
    });

    vi.mocked(api.getLeaveFilingOptions).mockResolvedValue({
      currentEmployee: {
        employeeId: "EMP-20260001",
        fullName: "Christian Reyes",
        department: "Engineering",
        position: "Lead",
      },
      leaveTypes: [
        {
          id: 1,
          code: "VL",
          name: "Vacation Leave",
          description: null,
          isPaid: true,
          requiresCredits: true,
          defaultCredits: 15,
          effectivePolicy: {
            id: 1,
            name: "Standard Leave Policy",
            minNoticeDays: 0,
            allowBackdatedFiling: true,
            maxBackdatedDays: 30,
            maxConsecutiveDays: 30,
            allowHalfDay: true,
            allowNegativeBalance: false,
            countRestDays: false,
            allowAttachments: true,
            requireAttachment: false,
          },
        },
      ],
    });

    vi.mocked(api.getMyLeaveCredits).mockResolvedValue([
      {
        id: 1,
        employeeId: "EMP-20260001",
        employeeName: "Christian Reyes",
        employeeDepartment: "Engineering",
        leaveTypeId: 1,
        leaveTypeCode: "VL",
        leaveTypeName: "Vacation Leave",
        isPaid: true,
        year: 2026,
        allocatedCredits: 15,
        usedCredits: 2,
        pendingCredits: 1,
        availableCredits: 12,
        updatedAt: "2026-11-28T01:00:00.000Z",
      },
    ]);

    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });

    vi.mocked(api.listLeaveApplications).mockResolvedValue({
      data: [
        {
          id: 9,
          employeeId: "EMP-20260002",
          employeeName: "Jane Doe",
          employeeDepartment: "Engineering",
          employeePosition: "Engineer",
          filedByUserId: "00000000-0000-0000-0000-000000000001",
          filedByName: "Christian Reyes",
          leaveTypeId: 1,
          leaveTypeCode: "VL",
          leaveTypeName: "Vacation Leave",
          isPaid: true,
          dateFrom: "2026-12-01",
          dateTo: "2026-12-02",
          totalDays: 1.5,
          reason: "Family vacation",
          hasAttachment: false,
          attachmentName: null,
          status: "pending",
          autoApproved: false,
          decisionRemarks: null,
          submittedAt: "2026-11-28T01:00:00.000Z",
          details: [
            { id: 1, date: "2026-12-01", durationType: "whole_day", dayValue: 1 },
            { id: 2, date: "2026-12-02", durationType: "half_day_am", dayValue: 0.5 },
          ],
          approvals: [],
          canApprove: true,
          canDisapprove: true,
          canCancel: false,
          createdAt: "2026-11-28T01:00:00.000Z",
          updatedAt: "2026-11-28T01:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WorkspaceActionsProvider>
          <LeavePage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("12.00")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("1.5 days")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /leave setup/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /leave policies/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply leave/i }));
    expect(
      await screen.findByText(/submit whole-day or half-day leave dates/i),
    ).toBeInTheDocument();
  });
});
