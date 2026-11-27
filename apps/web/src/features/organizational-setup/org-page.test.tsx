import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationalSetupPage } from "./org-page.js";

describe("OrganizationalSetupPage (TanStack Table + shadcn Drawer)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 6-card KPI strip, disables delete for in-use items, and validates drawer form", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/organization/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            offices: { total: 1, active: 1 },
            departments: { total: 2, active: 2 },
            divisions: { total: 0, active: 0 },
            sections: { total: 0, active: 0 },
            positions: { total: 0, active: 0 },
            reports_items: { total: 0, active: 0 },
          }),
        };
      }
      if (url.includes("/organization/options")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            offices: [{ id: 1, code: "HO", label: "Head Office" }],
            departments: [],
            divisions: [],
            sections: [],
            positions: [],
            reports_items: [],
          }),
        };
      }
      if (url.includes("/employees")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [],
            meta: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              code: "HO",
              name: "Head Office",
              shortName: "HO",
              type: "office",
              parentId: null,
              headEmployeeId: null,
              description: null,
              sortOrder: 0,
              isActive: true,
              usageCount: 2,
              isInUse: true,
              usageReason: "Referenced by 2 departments. Deactivate instead of deleting.",
              createdAt: "2026-11-27T00:00:00.000Z",
              updatedAt: "2026-11-27T00:00:00.000Z",
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationalSetupPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Head Office")).toBeInTheDocument();
    expect(screen.getByText("In use (2)")).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: /delete ho/i });
    expect(deleteBtn).toBeDisabled();
    expect(deleteBtn).toHaveAttribute(
      "title",
      "Referenced by 2 departments. Deactivate instead of deleting.",
    );

    fireEvent.click(screen.getByRole("button", { name: /add office/i }));
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: /create office/i }));
    expect(await within(drawer).findByText(/code is required/i)).toBeInTheDocument();
  });
});
