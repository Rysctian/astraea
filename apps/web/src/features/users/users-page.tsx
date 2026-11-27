import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import {
  ArrowUpDown,
  Circle,
  CircleDashed,
  Filter,
  Kanban,
  List,
  Plus,
  Search,
  Shield,
  SignalHigh,
  SignalMedium,
  Table2,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ColumnVisibilityPopover,
  type ServerColumnDef,
  ServerDataTable,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Popover, PopoverLabel } from "@/components/ui/popover";
import { UserCreateDrawer } from "@/features/users/user-create-drawer";
import { type ApiUser, api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";

type ViewMode = "list" | "board" | "table";
type RoleFilter = "all" | "admin" | "member";
type UserSortField = "createdAt" | "name" | "email";

const COLUMN_TOGGLE_OPTIONS = [
  { id: "status", label: "Status" },
  { id: "role", label: "Role" },
  { id: "email", label: "Email" },
  { id: "labels", label: "Labels" },
  { id: "createdAt", label: "Created" },
  { id: "updatedAt", label: "Updated" },
  { id: "module", label: "Module" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  status: true,
  role: true,
  email: true,
  labels: true,
  createdAt: true,
  updatedAt: false,
  module: true,
};

const AVATAR_TONES = [
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
] as const;

function isAdminUser(user: ApiUser): boolean {
  return user.email.toLowerCase().includes("admin") || user.name.toLowerCase().includes("admin");
}

function getShortCode(user: ApiUser): string {
  return user.employeeId ?? `USR-${user.id.replaceAll("-", "").slice(0, 4).toUpperCase()}`;
}

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

function getAvatarTone(seed: string): string {
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) {
    total += seed.charCodeAt(i);
  }
  return AVATAR_TONES[total % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  registerCreateHandler(() => setCreateOpen(true));
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const activeSort = sorting[0];
  const sortBy: UserSortField =
    activeSort?.id === "name" || activeSort?.id === "email" ? activeSort.id : "createdAt";
  const sortDir: "asc" | "desc" = activeSort?.desc === false ? "asc" : "desc";

  const usersQuery = useQuery({
    queryKey: ["users", { page, pageSize, search, roleFilter, sortBy, sortDir }],
    queryFn: () =>
      api.listUsers({
        page,
        pageSize,
        search: search.trim() || undefined,
        role: roleFilter,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteUser,
    onMutate: (id) => {
      setDeletingId(id);
      setDeleteError(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const columns = useMemo<ServerColumnDef<ApiUser>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "User",
        enableSorting: true,
        cell: ({ row }) => {
          const user = row.original;
          const admin = isAdminUser(user);
          return (
            <div className="flex min-w-[220px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                {admin ? (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <CircleDashed
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate font-medium text-foreground">{user.name}</span>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground/85 tabular-nums">
                {getShortCode(user)}
              </span>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: () => (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle className="h-3 w-3 text-emerald-500" aria-hidden="true" />
            <span>Active</span>
          </span>
        ),
      },
      {
        id: "role",
        header: "Role",
        enableSorting: false,
        cell: ({ row }) => {
          const admin = isAdminUser(row.original);
          return (
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
              {admin ? (
                <SignalHigh className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              ) : (
                <SignalMedium className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              )}
              <span>{admin ? "Admin" : "Employee"}</span>
            </span>
          );
        },
      },
      {
        id: "email",
        accessorKey: "email",
        header: "Email",
        enableSorting: true,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${getAvatarTone(user.email)}`}
              >
                {getInitials(user.name)}
              </span>
              <span className="truncate text-foreground/90">{user.email}</span>
            </div>
          );
        },
      },
      {
        id: "labels",
        header: "Labels",
        enableSorting: false,
        cell: ({ row }) => {
          const admin = isAdminUser(row.original);
          return (
            <div className="flex items-center gap-1.5">
              <Badge
                variant={admin ? "purple" : "neutral"}
                dotColor={admin ? "bg-purple-500" : "bg-emerald-500"}
              >
                {admin ? "RBAC" : "HRIS"}
              </Badge>
              {row.original.employeeId ? (
                <Badge variant="blue" dotColor="bg-blue-500">
                  201 Linked
                </Badge>
              ) : (
                <Badge variant="neutral" dotColor="bg-sky-500">
                  Portal
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatShortDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Updated",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatShortDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "module",
        header: "Module",
        enableSorting: false,
        cell: ({ row }) => {
          const admin = isAdminUser(row.original);
          return (
            <span className="inline-flex items-center gap-2 text-xs text-foreground">
              <span
                className={`h-2 w-2 rounded-full ${admin ? "bg-indigo-500" : "bg-sky-500"}`}
                aria-hidden="true"
              />
              <span>{admin ? "User Management" : "Employee 201"}</span>
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground opacity-70 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label={`Delete ${row.original.name}`}
              disabled={deletingId === row.original.id}
              onClick={() => deleteMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation, deletingId],
  );

  const rows = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Users</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Server-paginated workspace accounts across Astraea HRIS ({meta.total}{" "}
            {meta.total === 1 ? "member" : "members"}).
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          className="h-8.5 gap-1.5 rounded-md px-3 text-[13px] font-medium"
          onClick={() => {
            setColumnsOpen(false);
            setFilterOpen(false);
            setSortOpen(false);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New user</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search users..."
              aria-label="Search users"
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>

          <Popover
            open={filterOpen}
            onOpenChange={setFilterOpen}
            className="w-44"
            trigger={
              <Button
                type="button"
                variant={roleFilter !== "all" || filterOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                onClick={() => setFilterOpen((prev) => !prev)}
              >
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {roleFilter === "all"
                    ? "Filter"
                    : roleFilter === "admin"
                      ? "Filter: Admin"
                      : "Filter: Member"}
                </span>
              </Button>
            }
          >
            <PopoverLabel>Filter by role</PopoverLabel>
            {(
              [
                { value: "all", label: "All users" },
                { value: "admin", label: "Administrators" },
                { value: "member", label: "Workspace members" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRoleFilter(option.value);
                  setPage(1);
                  setFilterOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                  roleFilter === option.value
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <span>{option.label}</span>
                {roleFilter === option.value ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </Popover>

          <Popover
            open={sortOpen}
            onOpenChange={setSortOpen}
            className="w-44"
            trigger={
              <Button
                type="button"
                variant={sortOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                onClick={() => setSortOpen((prev) => !prev)}
              >
                <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Sort:{" "}
                  {sortBy === "createdAt" ? (sortDir === "desc" ? "Newest" : "Oldest") : sortBy}
                </span>
              </Button>
            }
          >
            <PopoverLabel>Sort by</PopoverLabel>
            {(
              [
                { id: "createdAt", desc: true, label: "Newest" },
                { id: "createdAt", desc: false, label: "Oldest" },
                { id: "name", desc: false, label: "Name (A–Z)" },
                { id: "email", desc: false, label: "Email (A–Z)" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  setSorting([{ id: opt.id, desc: opt.desc }]);
                  setPage(1);
                  setSortOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </Popover>

          <ColumnVisibilityPopover
            open={columnsOpen}
            onOpenChange={setColumnsOpen}
            options={COLUMN_TOGGLE_OPTIONS}
            columnVisibility={columnVisibility}
            onToggle={(id) =>
              setColumnVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))
            }
            onReset={() => setColumnVisibility(DEFAULT_VISIBILITY)}
          />
        </div>

        <div
          role="tablist"
          aria-label="View mode"
          className="inline-flex items-center rounded-md border border-border/80 bg-muted/60 p-0.5"
        >
          {(
            [
              { id: "list", label: "List", icon: List },
              { id: "board", label: "Board", icon: Kanban },
              { id: "table", label: "Table", icon: Table2 },
            ] as const
          ).map((mode) => {
            const Icon = mode.icon;
            const active = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setViewMode(mode.id)}
                className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors ${
                  active
                    ? "bg-background font-medium text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {deleteError ? (
        <div
          role="alert"
          className="mx-6 mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {deleteError}
        </div>
      ) : null}

      {usersQuery.isError ? (
        <div
          role="alert"
          className="mx-6 my-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {usersQuery.error.message}
        </div>
      ) : viewMode === "board" ? (
        <div className="grid gap-4 border-t border-border p-6 md:grid-cols-2">
          {(["Administrators", "Workspace Members"] as const).map((groupLabel) => {
            const items = rows.filter((u) =>
              groupLabel === "Administrators" ? isAdminUser(u) : !isAdminUser(u),
            );
            return (
              <div
                key={groupLabel}
                className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-foreground">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>{groupLabel}</span>
                  <span className="text-muted-foreground tabular-nums">{items.length}</span>
                </div>
                {items.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-md border border-border bg-card p-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{user.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {getShortCode(user)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : viewMode === "list" ? (
        <ul className="divide-y divide-border/70 border-t border-border">
          {rows.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-4 px-6 py-2.5 text-[13px] hover:bg-muted/35"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${getAvatarTone(user.email)}`}
                >
                  {getInitials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{getShortCode(user)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ServerDataTable
          columns={columns}
          data={rows}
          meta={meta}
          sorting={sorting}
          onSortingChange={(updater) => {
            setSorting(updater);
            setPage(1);
          }}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          isPending={usersQuery.isPending}
          isFetching={usersQuery.isFetching}
          emptyState={
            <div>
              <p className="text-sm font-medium text-foreground">No users found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try adjusting your search or filter criteria, or add a new user.
              </p>
            </div>
          }
        />
      )}

      <UserCreateDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
