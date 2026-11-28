import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { OfficialBusinessPage } from "./official-business-page";

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
    getOfficialBusinessContext: vi.fn(),
    listEmployees: vi.fn(),
    listOfficialBusinessApplications: vi.fn(),
    createOfficialBusinessApplications: vi.fn(),
    approveOfficialBusinessApplication: vi.fn(),
    disapproveOfficialBusinessApplication: vi.fn(),
    cancelOfficialBusinessApplication: vi.fn(),
  },
}));

describe("OfficialBusinessPage", () => {
  it("renders OB/WFH rows with WFH fallback destination, floating bulk bar, and Apply drawer", async () => {
    vi.mocked(api.getMyAccess).mockResolvedValue({
      role: { id: 1, code: "admin", name: "Administrator" },
      permissions: {
        approver_setup: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
        official_business_applications: {
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      },
      navigation: [],
    });

    vi.mocked(api.getOfficialBusinessContext).mockResolvedValue({
      currentEmployee: {
        employeeId: "EMP-20260001",
        fullName: "Christian Reyes",
        department: "Engineering",
        position: "Lead",
      },
    });

    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });

    vi.mocked(api.listOfficialBusinessApplications).mockResolvedValue({
      data: [
        {
          id: 17,
          employeeId: "EMP-20260002",
          employeeName: "Jane Doe",
          employeeDepartment: "Engineering",
          employeePosition: "Engineer",
          filedByUserId: "00000000-0000-0000-0000-000000000001",
          filedByName: "Christian Reyes",
          obType: "wfh",
          destination: null,
          reason: "Remote sprint delivery",
          status: "pending",
          autoApproved: false,
          decisionRemarks: null,
          submittedAt: "2026-11-28T01:00:00.000Z",
          slotCount: 1,
          details: [{ id: 1, date: "2026-12-01", startTime: "08:00:00", endTime: "17:00:00" }],
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
          <OfficialBusinessPage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Work From Home")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select ob request #17/i }));
    expect(await screen.findByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply ob \/ wfh/i }));
    expect(await screen.findByText("Apply Official Business / WFH")).toBeInTheDocument();
  });
});
