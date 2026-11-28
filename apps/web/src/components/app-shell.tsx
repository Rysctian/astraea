import { Link } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  FolderKanban,
  LogOut,
  type LucideIcon,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  sidebarMenuButtonClasses,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ApiUser } from "@/lib/api";
import { cn } from "@/lib/utils";
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

type AppRoutePath =
  | "/"
  | "/employees"
  | "/organization"
  | "/setup/employee-info"
  | "/setup/employment"
  | "/setup/administrative"
  | "/attendance"
  | "/attendance/policies"
  | "/attendance/schedules"
  | "/attendance/cut-offs"
  | "/applications/approver-setup"
  | "/applications/overtime";

interface NavChild {
  label: string;
  to: AppRoutePath;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: AppRoutePath;
  matchPrefix?: string;
  children?: readonly NavChild[];
}

const HRIS_MODULES: readonly NavItem[] = [
  {
    id: "employee-201-mod",
    label: "Employee 201",
    icon: FolderKanban,
    to: "/employees",
    matchPrefix: "/employees",
  },
  {
    id: "org-setup",
    label: "Organizational Setup",
    icon: Building2,
    to: "/organization",
    matchPrefix: "/organization",
  },
  {
    id: "ref-setup",
    label: "Reference Setup",
    icon: BookOpen,
    matchPrefix: "/setup",
    children: [
      { label: "Employee Information", to: "/setup/employee-info" },
      { label: "Employment", to: "/setup/employment" },
      { label: "Administrative", to: "/setup/administrative" },
    ],
  },
  {
    id: "user-management",
    label: "User Management",
    icon: ShieldCheck,
    to: "/",
    matchPrefix: "/",
  },
  {
    id: "attendance",
    label: "Attendance",
    icon: Clock,
    matchPrefix: "/attendance",
    children: [
      { label: "Attendance & Logs", to: "/attendance" },
      { label: "Attendance Policies", to: "/attendance/policies" },
      { label: "Schedule Management", to: "/attendance/schedules" },
      { label: "Cut-Off Management", to: "/attendance/cut-offs" },
    ],
  },
  {
    id: "online-applications",
    label: "Online Applications",
    icon: ClipboardCheck,
    matchPrefix: "/applications",
    children: [
      { label: "Approver Setup", to: "/applications/approver-setup" },
      { label: "Overtime Applications", to: "/applications/overtime" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: Wallet,
  },
  {
    id: "policies",
    label: "Policies",
    icon: FileText,
  },
];

function getInitialExpandedId(currentPath: string): string | null {
  if (currentPath.startsWith("/setup")) {
    return "ref-setup";
  }
  if (currentPath.startsWith("/attendance")) {
    return "attendance";
  }
  if (currentPath.startsWith("/applications")) {
    return "online-applications";
  }
  return null;
}

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
  const { open, setMobileOpen } = useSidebar();
  const { triggerCreate, triggerSearchFocus } = useWorkspaceActions();
  const [expandedModule, setExpandedModule] = useState<string | null>(() =>
    getInitialExpandedId(currentPath),
  );
  const initials = getInitials(user.name);

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="group flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 transition-opacity hover:opacity-90"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-700 text-[11px] font-bold tracking-tight text-white shadow-sm ring-1 ring-black/10 dark:from-white dark:to-zinc-300 dark:text-zinc-950 dark:ring-white/20">
              AS
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                Astraea HRIS
              </p>
              <p className="truncate text-[10px] font-medium text-muted-foreground">Workspace</p>
            </div>
          </Link>
          <SidebarTrigger />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarMenu>
              {HRIS_MODULES.map((mod) => {
                const Icon = mod.icon;
                const hasMultipleChildren = Boolean(mod.children && mod.children.length > 1);
                const singleTarget =
                  mod.to ??
                  (mod.children && mod.children.length === 1 ? mod.children[0]?.to : undefined);
                const isExpanded = hasMultipleChildren && expandedModule === mod.id;
                const isActive =
                  mod.matchPrefix !== undefined &&
                  (mod.matchPrefix === "/"
                    ? currentPath === "/"
                    : currentPath.startsWith(mod.matchPrefix));

                if (hasMultipleChildren && mod.children) {
                  return (
                    <SidebarMenuItem key={mod.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedModule((prev) => (prev === mod.id ? null : mod.id))
                        }
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors duration-150",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                          aria-hidden="true"
                        />
                        <span className="flex-1 truncate">{mod.label}</span>
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                            isExpanded && "rotate-90 text-foreground",
                          )}
                          aria-hidden="true"
                        />
                      </SidebarMenuButton>

                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">
                          <ul className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-sidebar-border/80 pl-2.5 pb-1">
                            {mod.children.map((child) => {
                              const childActive =
                                child.to === "/" || child.to === "/attendance"
                                  ? currentPath === child.to
                                  : currentPath.startsWith(child.to);
                              return (
                                <li key={child.label} className="list-none">
                                  <Link
                                    to={child.to}
                                    onClick={() => setMobileOpen(false)}
                                    tabIndex={isExpanded ? 0 : -1}
                                    className={cn(
                                      "relative flex h-7.5 w-full items-center rounded-md px-2 text-left text-xs transition-all duration-150",
                                      childActive
                                        ? "bg-sidebar-accent/90 font-medium text-foreground shadow-2xs ring-1 ring-sidebar-border/60"
                                        : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </SidebarMenuItem>
                  );
                }

                if (singleTarget) {
                  return (
                    <SidebarMenuItem key={mod.id}>
                      <Link
                        to={singleTarget}
                        onClick={() => setMobileOpen(false)}
                        data-active={isActive}
                        className={sidebarMenuButtonClasses(isActive)}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors duration-150",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                          aria-hidden="true"
                        />
                        <span className="flex-1 truncate">{mod.label}</span>
                      </Link>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={mod.id}>
                    <div aria-disabled="true" className={sidebarMenuButtonClasses(false, true)}>
                      <Icon className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                      <span className="flex-1 truncate">{mod.label}</span>
                    </div>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200/80 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800/80">
                {initials}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account options"
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]"
                >
                  <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isSigningOut}
                  onSelect={() => onSignOut()}
                >
                  <LogOut aria-hidden="true" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Open user menu"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 transition-opacity hover:opacity-90 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
                <div className="px-2 pb-1.5">
                  <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isSigningOut}
                  onSelect={() => onSignOut()}
                >
                  <LogOut aria-hidden="true" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
