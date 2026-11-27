import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { SchedulesPage } from "./schedules-page";

vi.mock("@/lib/api", () => ({
  api: {
    getAttendancePolicyOptions: vi.fn(),
    listEmployees: vi.fn(),
    listSchedules: vi.fn(),
    listEmployeeSchedules: vi.fn(),
    resolveEmployeeSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    batchAssignSchedule: vi.fn(),
    updateEmployeeSchedule: vi.fn(),
    deleteEmployeeSchedule: vi.fn(),
  },
}));

describe("SchedulesPage", () => {
  it("renders schedule templates and opens 7-day template drawer", async () => {
    vi.mocked(api.getAttendancePolicyOptions).mockResolvedValue({
      defaultPolicyId: 1,
      defaultPolicyName: "Standard Grace",
      items: [],
    });
    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 },
    });
    vi.mocked(api.listSchedules).mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Regular 9AM–6PM",
          timezone: "Asia/Manila",
          attendancePolicyId: null,
          attendancePolicyName: null,
          isActive: true,
          workingDaysCount: 5,
          assignmentCount: 0,
          isLocked: false,
          details: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    vi.mocked(api.listEmployeeSchedules).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WorkspaceActionsProvider>
          <SchedulesPage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Regular 9AM–6PM")).toBeInTheDocument();
    expect(screen.getByText("5 days / week")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));
    expect(await screen.findByText("New Schedule Template")).toBeInTheDocument();
  });
});
