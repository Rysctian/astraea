import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { ApproverSetupPage } from "./approver-setup-page";

vi.mock("@/lib/api", () => ({
  api: {
    getMyAccess: vi.fn(),
    listApproverWorkflows: vi.fn(),
    listEmployees: vi.fn(),
    saveApproverWorkflows: vi.fn(),
    deleteApproverWorkflow: vi.fn(),
  },
}));

describe("ApproverSetupPage", () => {
  it("renders grouped approval workflow steps and opens Configure Workflow drawer", async () => {
    vi.mocked(api.getMyAccess).mockResolvedValue({
      role: { id: 1, code: "admin", name: "Administrator" },
      permissions: {
        approver_setup: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
      },
      navigation: [],
    });

    vi.mocked(api.listApproverWorkflows).mockResolvedValue({
      data: [
        {
          employeeId: "EMP-20260001",
          employeeName: "Christian Reyes",
          employeeDepartment: "Engineering",
          employeePosition: "Lead",
          applicationType: "overtime",
          stepCount: 2,
          steps: [
            {
              id: 10,
              sequence: 1,
              approverId: "EMP-20260002",
              approverName: "Jane Doe",
              approverPosition: "Manager",
            },
            {
              id: 11,
              sequence: 2,
              approverId: "EMP-20260003",
              approverName: "Mark Cruz",
              approverPosition: "Director",
            },
          ],
          updatedAt: "2026-11-28T01:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });

    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WorkspaceActionsProvider>
          <ApproverSetupPage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Christian Reyes")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("2 levels")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /configure workflow/i }));
    expect(await screen.findByText("Configure Approval Workflow")).toBeInTheDocument();
  });
});
