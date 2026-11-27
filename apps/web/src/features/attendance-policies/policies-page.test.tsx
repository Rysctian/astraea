import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { AttendancePoliciesPage } from "./policies-page";

vi.mock("@/lib/api", () => ({
  api: {
    listAttendancePolicies: vi.fn(),
    createAttendancePolicy: vi.fn(),
    updateAttendancePolicy: vi.fn(),
    deleteAttendancePolicy: vi.fn(),
  },
}));

describe("AttendancePoliciesPage", () => {
  it("renders policy table with default badge and opens create drawer", async () => {
    vi.mocked(api.listAttendancePolicies).mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Standard Office Policy",
          description: "15m grace window",
          tardyGraceSeconds: 900,
          tardyCountFrom: "after_grace",
          absentAfterLateSeconds: 3600,
          undertimeGraceSeconds: 600,
          earlyInWindowSeconds: 14400,
          lateOutWindowSeconds: 14400,
          duplicateTapWindowSeconds: 120,
          isDefault: true,
          isActive: true,
          scheduleCount: 3,
          canDelete: false,
          deleteBlockedReason: "System default policy cannot be deleted",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WorkspaceActionsProvider>
          <AttendancePoliciesPage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Standard Office Policy")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("1 hr")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new policy/i }));
    expect(await screen.findByText("New Attendance Policy")).toBeInTheDocument();
  });
});
