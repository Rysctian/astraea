import type { CreateRoleDto, RoleRecord, UpdateRoleDto } from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { Filter, Pencil, Plus, Search, Shield, ShieldCheck, Trash2, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import {
  ColumnVisibilityPopover,
  type ServerColumnDef,
  ServerDataTable,
} from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverLabel } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleDrawer } from "@/features/users/role-drawer";
import { UserCreateDrawer } from "@/features/users/user-create-drawer";
import { type ApiUser, api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";

type UserManagementTab = "users" | "roles";

const USER_COLUMN_OPTIONS = [
  { id: "employeeId", label: "Employee ID" },
  { id: "email", label: "Email" },
  { id: "currentRole", label: "Current Role" },
  { id: "accessRole", label: "Access Role" },
  { id: "createdAt", label: "Created" },
];

const DEFAULT_USER_VISIBILITY: ColumnVisibilityState = {
  employeeId: true,
  email: true,
  currentRole: true,
  accessRole: true,
  createdAt: true,
};

const ROLE_COLUMN_OPTIONS = [
  { id: "code", label: "Code" },
  { id: "grants", label: "Permissions" },
  { id: "users", label: "Assigned Users" },
  { id: "createdAt", label: "Created" },
];

const DEFAULT_ROLE_VISIBILITY: ColumnVisibilityState = {
  code: true,
  grants: true,
  users: true,
  createdAt: true,
};

const AVATAR_TONES = [
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return (parts[0] ?? "U").slice(0, 2).toUpperCase();
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
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();

  const [activeTab, setActiveTab] = useState<UserManagementTab>("users");

  // Users tab state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [roleIdFilter, setRoleIdFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_USER_VISIBILITY);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<ApiUser | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  // Roles tab state
  const [rolesPage, setRolesPage] = useState(1);
  const [rolesPageSize, setRolesPageSize] = useState(20);
  const [rolesSearch, setRolesSearch] = useState("");
  const [rolesCreatedFrom, setRolesCreatedFrom] = useState("");
  const [rolesCreatedTo, setRolesCreatedTo] = useState("");
  const [rolesSorting, setRolesSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [rolesVisibility, setRolesVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_ROLE_VISIBILITY);
  const [rolesFilterOpen, setRolesFilterOpen] = useState(false);
  const [rolesColumnsOpen, setRolesColumnsOpen] = useState(false);

  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [roleDrawerError, setRoleDrawerError] = useState<string | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRecord | null>(null);
  const [deleteRoleError, setDeleteRoleError] = useState<string | null>(null);

  const openCreateRole = () => {
    setEditingRoleId(null);
    setRoleDrawerError(null);
    setRoleDrawerOpen(true);
  };

  registerCreateHandler(() => (activeTab === "users" ? setCreateOpen(true) : openCreateRole()));
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  // Role options & menu catalog
  const roleOptionsQuery = useQuery({
    queryKey: ["rbac", "role-options"],
    queryFn: api.getRoleOptions,
  });

  const menuCatalogQuery = useQuery({
    queryKey: ["rbac", "menus"],
    queryFn: api.getMenuCatalog,
    enabled: activeTab === "roles" || roleDrawerOpen,
  });

  const roleDetailQuery = useQuery({
    queryKey: ["rbac", "role-detail", editingRoleId],
    queryFn: () => api.getRoleById(editingRoleId as number),
    enabled: roleDrawerOpen && editingRoleId !== null,
  });

  // Users query
  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "name" ||
    activeSort?.id === "email" ||
    activeSort?.id === "employeeId" ||
    activeSort?.id === "roleId"
      ? activeSort.id
      : "createdAt";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const usersQuery = useQuery({
    queryKey: [
      "users",
      {
        page,
        pageSize,
        search: search.trim(),
        roleIdFilter,
        createdFrom,
        createdTo,
        sortBy,
        sortDir,
      },
    ],
    queryFn: () =>
      api.listUsers({
        page,
        pageSize,
        search: search.trim() || undefined,
        roleId: roleIdFilter ? Number(roleIdFilter) : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  // Roles query
  const roleActiveSort = rolesSorting[0];
  const roleSortBy =
    roleActiveSort?.id === "id" || roleActiveSort?.id === "code" || roleActiveSort?.id === "name"
      ? roleActiveSort.id
      : "createdAt";
  const roleSortDir: "asc" | "desc" = roleActiveSort?.desc ? "desc" : "asc";

  const rolesQuery = useQuery({
    queryKey: [
      "rbac",
      "roles",
      {
        rolesPage,
        rolesPageSize,
        rolesSearch: rolesSearch.trim(),
        rolesCreatedFrom,
        rolesCreatedTo,
        roleSortBy,
        roleSortDir,
      },
    ],
    queryFn: () =>
      api.listRoles({
        page: rolesPage,
        pageSize: rolesPageSize,
        search: rolesSearch.trim() || undefined,
        createdFrom: rolesCreatedFrom || undefined,
        createdTo: rolesCreatedTo || undefined,
        sortBy: roleSortBy,
        sortDir: roleSortDir,
      }),
    placeholderData: keepPreviousData,
    enabled: activeTab === "roles",
  });

  const invalidateRbacAndUsers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["rbac"] }),
    ]);
  };

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: number }) =>
      api.assignUserRole(userId, { roleId }),
    onMutate: ({ userId }) => {
      setAssignError(null);
      setAssigningUserId(userId);
    },
    onSuccess: async () => {
      await invalidateRbacAndUsers();
    },
    onError: (err: Error) => {
      setAssignError(err.message);
    },
    onSettled: () => {
      setAssigningUserId(null);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: async () => {
      setDeleteUserTarget(null);
      setDeleteUserError(null);
      await invalidateRbacAndUsers();
    },
    onError: (err: Error) => setDeleteUserError(err.message),
  });

  const createRoleMutation = useMutation({
    mutationFn: (payload: CreateRoleDto) => api.createRole(payload),
    onSuccess: async () => {
      setRoleDrawerOpen(false);
      setRoleDrawerError(null);
      await invalidateRbacAndUsers();
    },
    onError: (err: Error) => setRoleDrawerError(err.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateRoleDto }) =>
      api.updateRole(id, payload),
    onSuccess: async () => {
      setRoleDrawerOpen(false);
      setRoleDrawerError(null);
      await invalidateRbacAndUsers();
    },
    onError: (err: Error) => setRoleDrawerError(err.message),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => api.deleteRole(id),
    onSuccess: async () => {
      setDeleteRoleTarget(null);
      setDeleteRoleError(null);
      await invalidateRbacAndUsers();
    },
    onError: (err: Error) => setDeleteRoleError(err.message),
  });

  const roleOptions = roleOptionsQuery.data ?? [];

  const userColumns = useMemo<ServerColumnDef<ApiUser>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Employee",
        enableSorting: true,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarTone(user.email)}`}
              >
                {getInitials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "employeeId",
        accessorKey: "employeeId",
        header: "Employee ID",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.employeeId ?? "—"}
          </span>
        ),
      },
      {
        id: "email",
        accessorKey: "email",
        header: "Email",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        id: "currentRole",
        header: "Current Role",
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          if (!u.roleName) {
            return <Badge variant="neutral">Unassigned</Badge>;
          }
          return <Badge variant={u.roleCode === "admin" ? "purple" : "blue"}>{u.roleName}</Badge>;
        },
      },
      {
        id: "accessRole",
        header: "Access Role",
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          const isSaving = assigningUserId === u.id;
          return (
            <div className="w-44">
              <SelectMenu
                className="h-8 text-xs"
                placeholder="Assign role..."
                disabled={isSaving || roleOptions.length === 0}
                value={u.roleId ? String(u.roleId) : ""}
                onValueChange={(nextRoleId) => {
                  if (!nextRoleId || Number(nextRoleId) === u.roleId) return;
                  assignRoleMutation.mutate({ userId: u.id, roleId: Number(nextRoleId) });
                }}
                options={roleOptions.map((r) => ({ value: String(r.id), label: r.name }))}
              />
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
          <span className="tabular-nums text-xs text-muted-foreground">
            {formatShortDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            aria-label={`Delete ${row.original.name}`}
            onClick={() => {
              setDeleteUserTarget(row.original);
              setDeleteUserError(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [roleOptions, assigningUserId, assignRoleMutation],
  );

  const roleColumns = useMemo<ServerColumnDef<RoleRecord>[]>(
    () => [
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label={`Edit ${item.name}`}
                onClick={() => {
                  setEditingRoleId(item.id);
                  setRoleDrawerError(null);
                  setRoleDrawerOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                aria-label={`Delete ${item.name}`}
                title={item.deleteBlockedReason ?? "Delete role"}
                onClick={() => {
                  setDeleteRoleTarget(item);
                  setDeleteRoleError(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="font-medium text-foreground">{row.original.name}</span>
            {row.original.isSystem ? (
              <Badge variant="neutral" className="text-[10px]">
                System
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "code",
        accessorKey: "code",
        header: "Code",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="blue" className="font-mono text-[11px]">
            {row.original.code}
          </Badge>
        ),
      },
      {
        id: "grants",
        header: "Permissions",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {row.original.grantCount} {row.original.grantCount === 1 ? "module" : "modules"}
          </span>
        ),
      },
      {
        id: "users",
        header: "Assigned Users",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-foreground">{row.original.userCount}</span>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {formatShortDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const usersRows = usersQuery.data?.data ?? [];
  const usersMeta = usersQuery.data?.meta ?? { total: 0, page, pageSize, totalPages: 1 };

  const rolesRows = rolesQuery.data?.data ?? [];
  const rolesMeta = rolesQuery.data?.meta ?? {
    total: 0,
    page: rolesPage,
    pageSize: rolesPageSize,
    totalPages: 1,
  };

  const userFilterCount = (roleIdFilter ? 1 : 0) + (createdFrom ? 1 : 0) + (createdTo ? 1 : 0);
  const roleFilterCount = (rolesCreatedFrom ? 1 : 0) + (rolesCreatedTo ? 1 : 0);

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">User Management</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Assign RBAC roles to employee accounts and configure per-module CRUD permission
            matrices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "users" ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              New User
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={openCreateRole}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              New Role
            </Button>
          )}
        </div>
      </div>

      {/* Segmented Tabs */}
      <div>
        <TabsList aria-label="User management views">
          <TabsTrigger active={activeTab === "users"} onClick={() => setActiveTab("users")}>
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Employees (Users)</span>
            <Badge variant="neutral" className="ml-0.5 px-1.5 py-0 text-[10px]">
              {usersMeta.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger active={activeTab === "roles"} onClick={() => setActiveTab("roles")}>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Roles &amp; Permissions</span>
            {roleOptions.length > 0 ? (
              <Badge variant="neutral" className="ml-0.5 px-1.5 py-0 text-[10px]">
                {roleOptions.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>

      {activeTab === "users" ? (
        <>
          {assignError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs text-destructive"
            >
              {assignError}
            </div>
          ) : null}

          <ConfirmDialog
            open={deleteUserTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteUserTarget(null);
                setDeleteUserError(null);
              }
            }}
            title={`Delete user "${deleteUserTarget?.name ?? ""}"?`}
            description="This permanently deletes the user login account."
            errorMessage={deleteUserError}
            isPending={deleteUserMutation.isPending}
            onConfirm={() => {
              if (deleteUserTarget) {
                deleteUserMutation.mutate(deleteUserTarget.id);
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, email, or employee ID..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Popover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              className="w-72 p-3"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setFilterOpen((o) => !o)}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filter</span>
                  {userFilterCount > 0 ? (
                    <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {userFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <PopoverLabel className="p-0">User Filters</PopoverLabel>
                  {userFilterCount > 0 ? (
                    <button
                      type="button"
                      className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                      onClick={() => {
                        setRoleIdFilter("");
                        setCreatedFrom("");
                        setCreatedTo("");
                        setPage(1);
                      }}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="usr-flt-role"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Role
                  </label>
                  <SelectMenu
                    id="usr-flt-role"
                    className="h-8 text-xs"
                    value={roleIdFilter}
                    onValueChange={(val) => {
                      setRoleIdFilter(val);
                      setPage(1);
                    }}
                    options={[
                      { value: "", label: "All roles" },
                      ...roleOptions.map((r) => ({ value: String(r.id), label: r.name })),
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="usr-flt-from"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Created From
                    </label>
                    <DatePicker
                      id="usr-flt-from"
                      className="h-8 text-xs"
                      placeholder="Start"
                      value={createdFrom}
                      onChange={(val) => {
                        setCreatedFrom(val);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="usr-flt-to"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Created To
                    </label>
                    <DatePicker
                      id="usr-flt-to"
                      className="h-8 text-xs"
                      placeholder="End"
                      value={createdTo}
                      onChange={(val) => {
                        setCreatedTo(val);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </Popover>

            <ColumnVisibilityPopover
              open={columnsOpen}
              onOpenChange={setColumnsOpen}
              options={USER_COLUMN_OPTIONS}
              columnVisibility={columnVisibility}
              onToggle={(id) =>
                setColumnVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))
              }
              onReset={() => setColumnVisibility(DEFAULT_USER_VISIBILITY)}
            />
          </div>

          <ServerDataTable
            data={usersRows}
            columns={userColumns}
            meta={usersMeta}
            sorting={sorting}
            onSortingChange={(updater) => {
              setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
              setPage(1);
            }}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
            isPending={usersQuery.isPending}
            isFetching={usersQuery.isFetching}
            emptyState={
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No users found</p>
                <p className="text-xs text-muted-foreground">
                  Create a user account or onboard an employee to manage access roles.
                </p>
              </div>
            }
          />
        </>
      ) : (
        <>
          <ConfirmDialog
            open={deleteRoleTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteRoleTarget(null);
                setDeleteRoleError(null);
              }
            }}
            title={`Delete role "${deleteRoleTarget?.name ?? ""}"?`}
            description="This permanently removes the custom role and all of its permission grants."
            errorMessage={deleteRoleError ?? deleteRoleTarget?.deleteBlockedReason ?? null}
            isPending={deleteRoleMutation.isPending}
            onConfirm={() => {
              if (deleteRoleTarget) {
                deleteRoleMutation.mutate(deleteRoleTarget.id);
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchInputRef}
                value={rolesSearch}
                onChange={(e) => {
                  setRolesSearch(e.target.value);
                  setRolesPage(1);
                }}
                placeholder="Search role name or code..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Popover
              open={rolesFilterOpen}
              onOpenChange={setRolesFilterOpen}
              className="w-72 p-3"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setRolesFilterOpen((o) => !o)}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filter</span>
                  {roleFilterCount > 0 ? (
                    <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {roleFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <PopoverLabel className="p-0">Role Filters</PopoverLabel>
                  {roleFilterCount > 0 ? (
                    <button
                      type="button"
                      className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                      onClick={() => {
                        setRolesCreatedFrom("");
                        setRolesCreatedTo("");
                        setRolesPage(1);
                      }}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="role-flt-from"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Created From
                    </label>
                    <DatePicker
                      id="role-flt-from"
                      className="h-8 text-xs"
                      placeholder="Start"
                      value={rolesCreatedFrom}
                      onChange={(val) => {
                        setRolesCreatedFrom(val);
                        setRolesPage(1);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="role-flt-to"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Created To
                    </label>
                    <DatePicker
                      id="role-flt-to"
                      className="h-8 text-xs"
                      placeholder="End"
                      value={rolesCreatedTo}
                      onChange={(val) => {
                        setRolesCreatedTo(val);
                        setRolesPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </Popover>

            <ColumnVisibilityPopover
              open={rolesColumnsOpen}
              onOpenChange={setRolesColumnsOpen}
              options={ROLE_COLUMN_OPTIONS}
              columnVisibility={rolesVisibility}
              onToggle={(id) =>
                setRolesVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))
              }
              onReset={() => setRolesVisibility(DEFAULT_ROLE_VISIBILITY)}
            />
          </div>

          <ServerDataTable
            data={rolesRows}
            columns={roleColumns}
            meta={rolesMeta}
            sorting={rolesSorting}
            onSortingChange={(updater) => {
              setRolesSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
              setRolesPage(1);
            }}
            columnVisibility={rolesVisibility}
            onColumnVisibilityChange={setRolesVisibility}
            onPageChange={setRolesPage}
            onPageSizeChange={(next) => {
              setRolesPageSize(next);
              setRolesPage(1);
            }}
            isPending={rolesQuery.isPending}
            isFetching={rolesQuery.isFetching}
            emptyState={
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No roles found</p>
                <p className="text-xs text-muted-foreground">
                  Create a custom role to configure granular module permissions.
                </p>
              </div>
            }
          />
        </>
      )}

      <UserCreateDrawer open={createOpen} onOpenChange={setCreateOpen} />

      <RoleDrawer
        key={`role-${editingRoleId ?? "new"}-${roleDetailQuery.data?.updatedAt ?? "init"}-${roleDrawerOpen ? "open" : "closed"}`}
        open={roleDrawerOpen}
        onOpenChange={setRoleDrawerOpen}
        role={editingRoleId !== null ? (roleDetailQuery.data ?? null) : null}
        menuGroups={menuCatalogQuery.data ?? []}
        isLoadingDetail={editingRoleId !== null && roleDetailQuery.isPending}
        isPending={createRoleMutation.isPending || updateRoleMutation.isPending}
        serverError={roleDrawerError}
        onCreate={(payload) => createRoleMutation.mutate(payload)}
        onUpdate={(id, payload) => updateRoleMutation.mutate({ id, payload })}
      />
    </div>
  );
}
