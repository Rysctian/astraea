import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./users-page.js";

describe("UsersPage (Users + Roles & Permissions RBAC)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders users with roles, switches to Roles & Permissions tab, and validates create drawer", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input.includes("/rbac/roles/options")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, code: "admin", name: "Administrator" },
            { id: 2, code: "employee", name: "Employee" },
          ],
        };
      }
      if (input.includes("/rbac/roles")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 1,
                code: "admin",
                name: "Administrator",
                isSystem: true,
                userCount: 1,
                grantCount: 9,
                canDelete: false,
                deleteBlockedReason: "Seeded system role cannot be deleted",
                createdAt: "2026-11-27T00:00:00.000Z",
                updatedAt: "2026-11-27T00:00:00.000Z",
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        };
      }
      if (input.includes("/rbac/menus")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              parentId: null,
              parentCode: null,
              parentTitle: "General Modules",
              sortOrder: 0,
              items: [
                {
                  id: 1,
                  code: "employee_201",
                  title: "Employee 201",
                  path: "/employees",
                  parentId: null,
                  sortOrder: 10,
                },
              ],
            },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              employeeId: "EMP-20260001",
              roleId: 1,
              roleCode: "admin",
              roleName: "Administrator",
              email: "alice@example.com",
              name: "Alice",
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
        <UsersPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    const drawer = screen.getByRole("dialog");
    fireEvent.change(within(drawer).getByLabelText(/^email$/i), { target: { value: "invalid" } });
    fireEvent.change(within(drawer).getByLabelText(/^name$/i), { target: { value: "Bob" } });
    fireEvent.click(within(drawer).getByRole("button", { name: /add user/i }));

    await waitFor(() => {
      expect(within(drawer).getByRole("alert")).toBeInTheDocument();
    });
  });

  it("switches to Roles & Permissions tab and opens the permission matrix drawer", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input.includes("/rbac/roles/options")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 1, code: "admin", name: "Administrator" }],
        };
      }
      if (input.includes("/rbac/roles")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 1,
                code: "admin",
                name: "Administrator",
                isSystem: true,
                userCount: 1,
                grantCount: 9,
                canDelete: false,
                deleteBlockedReason: "Seeded system role cannot be deleted",
                createdAt: "2026-11-27T00:00:00.000Z",
                updatedAt: "2026-11-27T00:00:00.000Z",
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        };
      }
      if (input.includes("/rbac/menus")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              parentId: null,
              parentCode: null,
              parentTitle: "General Modules",
              sortOrder: 0,
              items: [
                {
                  id: 1,
                  code: "employee_201",
                  title: "Employee 201",
                  path: "/employees",
                  parentId: null,
                  sortOrder: 10,
                },
              ],
            },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /roles & permissions/i }));
    expect(await screen.findByText("admin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new role/i }));
    expect(await screen.findByText("New Role & Permissions")).toBeInTheDocument();
  });
});
