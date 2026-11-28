import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { OvertimePage } from "./overtime-page";

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
    authMe: vi.fn(),
    getMyAccess: vi.fn(),
    listOvertimeApplications: vi.fn(),
    listEmployees: vi.fn(),
    createOvertimeApplications: vi.fn(),
    approveOvertimeApplication: vi.fn(),
    disapproveOvertimeApplication: vi.fn(),
    cancelOvertimeApplication: vi.fn(),
  },
}));

describe("OvertimePage", () => {
  it("renders overtime rows, opens floating bulk bar on selection, and opens Apply Overtime drawer", async () => {
    vi.mocked(api.authMe).mockResolvedValue({
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        employeeId: "EMP-20260001",
        roleId: 1,
        roleCode: "admin",
        roleName: "Administrator",
        email: "admin@astraea.local",
        name: "Christian Reyes",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    vi.mocked(api.getMyAccess).mockResolvedValue({
      role: { id: 1, code: "admin", name: "Administrator" },
      permissions: {
        approver_setup: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
        overtime_applications: {
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      },
      navigation: [],
    });

    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });

    vi.mocked(api.listOvertimeApplications).mockResolvedValue({
      data: [
        {
          id: 42,
          employeeId: "EMP-20260002",
          employeeName: "Jane Doe",
          employeeDepartment: "Engineering",
          employeePosition: "Engineer",
          filedByUserId: "00000000-0000-0000-0000-000000000001",
          filedByName: "Christian Reyes",
          reason: "Release hotfix deployment",
          status: "pending",
          autoApproved: false,
          decisionRemarks: null,
          submittedAt: "2026-11-28T01:00:00.000Z",
          totalRequestedSeconds: 7200,
          totalBreakSeconds: 0,
          slotCount: 1,
          details: [
            {
              id: 100,
              date: "2026-11-28",
              startTime: "18:00:00",
              endTime: "20:00:00",
              breakSeconds: 0,
              requestedSeconds: 7200,
            },
          ],
          approvals: [
            {
              id: 200,
              sequence: 1,
              approverId: "EMP-20260001",
              approverName: "Christian Reyes",
              approverPosition: "Lead",
              status: "pending",
              remarks: null,
              actedAt: null,
              actedByUserName: null,
            },
          ],
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
          <OvertimePage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("2h 0m")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select overtime request #42/i }));
    expect(await screen.findByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply overtime/i }));
    expect(await screen.findByText(/file structured overtime slots/i)).toBeInTheDocument();
  });
});
