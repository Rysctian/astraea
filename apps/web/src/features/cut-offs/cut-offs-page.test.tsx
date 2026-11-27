import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { CutOffsPage } from "./cut-offs-page";

vi.mock("@/lib/api", () => ({
  api: {
    listCutOffs: vi.fn(),
    createCutOff: vi.fn(),
    updateCutOff: vi.fn(),
    deleteCutOff: vi.fn(),
  },
}));

describe("CutOffsPage", () => {
  it("renders cut-off table with No DTR badge and opens create drawer", async () => {
    vi.mocked(api.listCutOffs).mockResolvedValue({
      data: [
        {
          id: 1,
          scheduleType: "semi_monthly",
          name: "October 2026 Semi-Monthly",
          year: 2026,
          month: 10,
          isActive: true,
          periods: [
            {
              id: 10,
              cutOffId: 1,
              cutOffNo: 1,
              noDtr: false,
              dtrDateFrom: "2026-10-01",
              dtrDateTo: "2026-10-15",
              confirmationStartDate: "2026-10-16",
              confirmationEndDate: "2026-10-16",
              confirmationTimeFrom: "08:00:00",
              confirmationTimeTo: "17:00:00",
              payrollDateFrom: "2026-10-01",
              payrollDateTo: "2026-10-15",
              releaseDate: "2026-10-20",
            },
            {
              id: 11,
              cutOffId: 1,
              cutOffNo: 2,
              noDtr: true,
              dtrDateFrom: null,
              dtrDateTo: null,
              confirmationStartDate: null,
              confirmationEndDate: null,
              confirmationTimeFrom: null,
              confirmationTimeTo: null,
              payrollDateFrom: "2026-10-16",
              payrollDateTo: "2026-10-31",
              releaseDate: "2026-11-05",
            },
          ],
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WorkspaceActionsProvider>
          <CutOffsPage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("October 2026 Semi-Monthly")).toBeInTheDocument();
    expect(screen.getByText("Semi-Monthly")).toBeInTheDocument();
    expect(screen.getByText("No DTR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new cut-off/i }));
    expect(await screen.findByText("New Cut-Off Calendar")).toBeInTheDocument();
  });
});
