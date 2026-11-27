import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell.js";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

describe("AppShell (Sidebar + Header)", () => {
  it("renders sidebar navigation, header controls, and triggers sign out", async () => {
    const onSignOut = vi.fn();

    render(
      <AppShell
        user={{
          id: "550e8400-e29b-41d4-a716-446655440000",
          employeeId: null,
          name: "Admin Employee",
          email: "admin@astraea.local",
          createdAt: "2026-11-27T00:00:00.000Z",
          updatedAt: "2026-11-27T00:00:00.000Z",
        }}
        onSignOut={onSignOut}
        isSigningOut={false}
        pageTitle="Users"
      >
        <div>Workspace Content</div>
      </AppShell>,
    );

    expect(screen.getByText("Astraea HRIS")).toBeInTheDocument();
    expect(screen.getByText("Workspace Content")).toBeInTheDocument();
    expect(screen.getByText(/search or jump to/i)).toBeInTheDocument();

    const menuTrigger = screen.getByRole("button", { name: /open user menu/i });
    fireEvent.pointerDown(menuTrigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
