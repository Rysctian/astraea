import { getReferenceCategoriesByGroup } from "@starter/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceSetupPage } from "./reference-page.js";

describe("ReferenceSetupPage (Category Sidebar + ServerDataTable + Drawer)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders group categories, displays default and usage-protected rows, and opens add drawer", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/categories")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            getReferenceCategoriesByGroup("employee_information").map((c) => ({
              ...c,
              totalCount: c.category === "gender" ? 1 : 0,
              activeCount: c.category === "gender" ? 1 : 0,
            })),
        };
      }
      if (url.includes("/options")) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              group: "employee_information",
              category: "gender",
              code: "FEMALE",
              name: "Female",
              description: null,
              parentId: null,
              parentName: null,
              parentCode: null,
              metadata: null,
              sortOrder: 0,
              isDefault: true,
              isActive: true,
              usageCount: 3,
              isInUse: true,
              usageReason: "Referenced by 3 employees. Deactivate instead of deleting.",
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
        <ReferenceSetupPage group="employee_information" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("FEMALE")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("In use (3)")).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: /delete female/i });
    expect(deleteBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: /create item/i }));
    expect(await within(drawer).findByText(/code is required/i)).toBeInTheDocument();
  });
});
