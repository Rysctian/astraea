import { Link } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  FileText,
  FolderKanban,
  LogOut,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverLabel, PopoverSeparator } from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ApiUser } from "@/lib/api";
import { useWorkspaceActions, WorkspaceActionsProvider } from "@/lib/workspace-actions";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return (parts[0] ?? "U").slice(0, 2).toUpperCase();
  }
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

const HRIS_MODULES = [
  {
    id: "employee-201-mod",
    label: "Employee 201",
    icon: FolderKanban,
    badgeBg: "bg-sky-100 text-sky-600",
    dotColor: "bg-blue-500",
    matchPrefix: "/employees",
    children: [{ label: "Directory", to: "/employees" as const }],
  },
  {
    id: "org-setup",
    label: "Organizational Setup",
    icon: Building2,
    badgeBg: "bg-emerald-100 text-emerald-600",
    dotColor: "bg-emerald-500",
    matchPrefix: "/organization",
    children: [{ label: "Hierarchy & Catalogs", to: "/organization" as const }],
  },
  {
    id: "ref-setup",
    label: "Reference Setup",
    icon: BookOpen,
    badgeBg: "bg-violet-100 text-violet-600",
    dotColor: "bg-violet-500",
    matchPrefix: "/setup",
    children: [
      { label: "Employee Information", to: "/setup/employee-info" as const },
      { label: "Employment", to: "/setup/employment" as const },
      { label: "Administrative", to: "/setup/administrative" as const },
    ],
  },
  {
    id: "user-management",
    label: "User Management",
    icon: ShieldCheck,
    badgeBg: "bg-indigo-100 text-indigo-600",
    dotColor: "bg-indigo-500",
    matchPrefix: "/",
    children: [{ label: "Users", to: "/" as const }],
  },
  {
    id: "attendance",
    label: "Attendance",
    icon: Clock,
    badgeBg: "bg-pink-100 text-pink-600",
    dotColor: "bg-emerald-500",
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: Wallet,
    badgeBg: "bg-amber-100 text-amber-600",
    dotColor: "bg-rose-500",
  },
  {
    id: "policies",
    label: "Policies",
    icon: FileText,
    badgeBg: "bg-teal-100 text-teal-600",
    dotColor: "bg-amber-500",
  },
] as const;

function AppShellInner({
  user,
  onSignOut,
  isSigningOut,
  currentPath,
  pageTitle,
  children,
}: {
  user: ApiUser;
  onSignOut: () => void;
  isSigningOut: boolean;
  currentPath: string;
  pageTitle: string;
  children: ReactNode;
}) {
  const { open } = useSidebar();
  const { triggerCreate, triggerSearchFocus } = useWorkspaceActions();
  const [expandedModule, setExpandedModule] = useState<string | null>(
    currentPath.startsWith("/employees")
      ? "employee-201-mod"
      : currentPath.startsWith("/organization")
        ? "org-setup"
        : currentPath.startsWith("/setup")
          ? "ref-setup"
          : "user-management",
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [footerMenuOpen, setFooterMenuOpen] = useState(false);
  const initials = getInitials(user.name);

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-md py-1 pr-1 text-[13px] font-semibold tracking-tight text-foreground transition-colors hover:text-foreground/80"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-[10px] font-bold text-white shadow-2xs dark:bg-white dark:text-zinc-950">
              AS
            </span>
            <span className="truncate">Astraea HRIS</span>
            <ChevronsUpDown
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
          <SidebarTrigger />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {HRIS_MODULES.map((mod) => {
                const Icon = mod.icon;
                const hasChildren = "children" in mod;
                const isExpanded = hasChildren && expandedModule === mod.id;
                const isActive =
                  "matchPrefix" in mod &&
                  (mod.matchPrefix === "/"
                    ? currentPath === "/"
                    : currentPath.startsWith(mod.matchPrefix));

                return (
                  <SidebarMenuItem key={mod.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => {
                        if (hasChildren) {
                          setExpandedModule((prev) => (prev === mod.id ? null : mod.id));
                        }
                      }}
                    >
                      <span
                        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded ${mod.badgeBg}`}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <span className="flex-1 truncate">{mod.label}</span>
                      {hasChildren ? (
                        isExpanded ? (
                          <ChevronDown
                            className="h-3 w-3 shrink-0 text-muted-foreground/70"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronRight
                            className="h-3 w-3 shrink-0 text-muted-foreground/70"
                            aria-hidden="true"
                          />
                        )
                      ) : null}
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${mod.dotColor}`}
                        aria-hidden="true"
                      />
                    </SidebarMenuButton>
                    {isExpanded && hasChildren ? (
                      <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2.5">
                        {mod.children.map((child) => {
                          const childActive =
                            child.to === "/"
                              ? currentPath === "/"
                              : currentPath.startsWith(child.to);
                          return (
                            <li key={child.label} className="list-none">
                              <Link
                                to={child.to}
                                className={`flex h-7 w-full items-center rounded-md px-2 text-left text-xs transition-colors ${
                                  childActive
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
                                }`}
                              >
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center justify-between gap-2 rounded-md">
            <div className="flex min-w-0 items-center gap-2 px-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {initials}
              </span>
              <span className="truncate text-[13px] font-medium text-foreground">{user.name}</span>
            </div>

            <Popover
              open={footerMenuOpen}
              onOpenChange={setFooterMenuOpen}
              align="end"
              className="bottom-full top-auto mb-1.5 mt-0 w-48"
              trigger={
                <button
                  type="button"
                  aria-label="Account options"
                  onClick={() => setFooterMenuOpen((prev) => !prev)}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground"
                >
                  <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              }
            >
              <div className="px-2 py-1.5">
                <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
              <PopoverSeparator />
              <button
                type="button"
                onClick={() => {
                  setFooterMenuOpen(false);
                  onSignOut();
                }}
                disabled={isSigningOut}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </Popover>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-xs">
          <div className="flex min-w-0 items-center gap-2">
            {!open ? <SidebarTrigger /> : <SidebarTrigger className="md:hidden" />}
            <span className="truncate text-[13px] font-medium text-foreground">{pageTitle}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={triggerSearchFocus}
              className="hidden h-8 w-56 cursor-pointer items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Search or jump to...</span>
              </span>
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
                Ctrl K
              </kbd>
            </button>

            <button
              type="button"
              aria-label="Notifications"
              className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              <span
                className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs font-medium"
              onClick={triggerCreate}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </Button>

            <Popover
              open={userMenuOpen}
              onOpenChange={setUserMenuOpen}
              align="end"
              className="w-52"
              trigger={
                <button
                  type="button"
                  aria-label="Open user menu"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 transition-opacity hover:opacity-90 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800"
                >
                  {initials}
                </button>
              }
            >
              <PopoverLabel>Signed in as</PopoverLabel>
              <div className="px-2 pb-1.5">
                <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
              <PopoverSeparator />
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onSignOut();
                }}
                disabled={isSigningOut}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </Popover>
          </div>
        </header>

        <main className="flex-1 bg-background">{children}</main>
      </SidebarInset>
    </>
  );
}

export function AppShell({
  user,
  onSignOut,
  isSigningOut,
  currentPath = "/",
  pageTitle = "Users",
  children,
}: {
  user: ApiUser;
  onSignOut: () => void;
  isSigningOut: boolean;
  currentPath?: string;
  pageTitle?: string;
  children: ReactNode;
}) {
  return (
    <WorkspaceActionsProvider>
      <SidebarProvider>
        <AppShellInner
          user={user}
          onSignOut={onSignOut}
          isSigningOut={isSigningOut}
          currentPath={currentPath}
          pageTitle={pageTitle}
        >
          {children}
        </AppShellInner>
      </SidebarProvider>
    </WorkspaceActionsProvider>
  );
}
