import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./users-page.js";

describe("UsersPage (Server-side TanStack Table + shadcn Drawer + RHF)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders server-paginated table, toggles columns, and validates create drawer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            employeeId: null,
            email: "alice@example.com",
            name: "Alice",
            createdAt: "2026-11-27T00:00:00.000Z",
            updatedAt: "2026-11-27T00:00:00.000Z",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }),
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
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^columns$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /toggle email column/i }));
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reset columns/i }));
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    const drawer = screen.getByRole("dialog");
    fireEvent.change(within(drawer).getByLabelText(/^email$/i), { target: { value: "invalid" } });
    fireEvent.change(within(drawer).getByLabelText(/^name$/i), { target: { value: "Bob" } });
    fireEvent.click(within(drawer).getByRole("button", { name: /add user/i }));

    await waitFor(() => {
      expect(within(drawer).getByRole("alert")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
