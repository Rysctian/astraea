import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { CorrectionsPage } from "./corrections-page";

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
    getCorrectionContext: vi.fn(),
    previewCorrectionLogs: vi.fn(),
    listEmployees: vi.fn(),
    listCorrectionApplications: vi.fn(),
    createCorrectionApplication: vi.fn(),
    approveCorrectionApplication: vi.fn(),
    disapproveCorrectionApplication: vi.fn(),
    cancelCorrectionApplication: vi.fn(),
  },
}));

describe("CorrectionsPage", () => {
  it("renders correction rows with AM/PM summary, opens Old vs New detail drawer and Apply drawer", async () => {
    vi.mocked(api.getMyAccess).mockResolvedValue({
      role: { id: 1, code: "admin", name: "Administrator" },
      permissions: {
        approver_setup: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
        correction_applications: {
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
        },
      },
      navigation: [],
    });

    vi.mocked(api.getCorrectionContext).mockResolvedValue({
      currentEmployee: {
        employeeId: "EMP-20260001",
        fullName: "Christian Reyes",
        department: "Engineering",
        position: "Lead",
      },
    });

    vi.mocked(api.previewCorrectionLogs).mockResolvedValue({
      employeeId: "EMP-20260001",
      date: "2026-11-28",
      timezone: "Asia/Manila",
      logs: [],
      paired: { amIn: null, amOut: null, pmIn: null, pmOut: null },
    });

    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });

    vi.mocked(api.listCorrectionApplications).mockResolvedValue({
      data: [
        {
          id: 31,
          employeeId: "EMP-20260002",
          employeeName: "Jane Doe",
          employeeDepartment: "Engineering",
          employeePosition: "Engineer",
          filedByUserId: "00000000-0000-0000-0000-000000000001",
          filedByName: "Christian Reyes",
          reason: "Biometric terminal offline during out punch",
          status: "pending",
          autoApproved: false,
          decisionRemarks: null,
          submittedAt: "2026-11-28T01:00:00.000Z",
          dateCount: 1,
          details: [
            {
              id: 1,
              date: "2026-11-27",
              oldAmIn: "08:02:00",
              oldAmOut: null,
              oldPmIn: null,
              oldPmOut: null,
              amIn: "08:02:00",
              amOut: null,
              pmIn: null,
              pmOut: "17:05:00",
            },
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
          <CorrectionsPage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText(/AM: 8:02 AM/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view correction #31/i }));
    expect(
      await screen.findByText("Before vs After Punch Comparison (1 date)"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply correction/i }));
    expect(await screen.findByText("Apply Attendance Correction")).toBeInTheDocument();
  });
});
