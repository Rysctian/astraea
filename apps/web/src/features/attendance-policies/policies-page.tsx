import type { AttendancePolicyRecord, CreateAttendancePolicyDto } from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { Eye, Filter, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
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
import { api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { AttendancePolicyDrawer, type PolicyDrawerMode } from "./policy-drawer";
import { formatDurationSeconds, formatTardyCountFrom } from "./policy-utils";

const COLUMN_TOGGLE_OPTIONS = [
  { id: "tardyGraceSeconds", label: "Tardy Grace" },
  { id: "tardyCountFrom", label: "Count Tardy From" },
  { id: "absentAfterLateSeconds", label: "Absent After Late" },
  { id: "undertimeGraceSeconds", label: "Undertime Grace" },
  { id: "status", label: "Status" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  tardyGraceSeconds: true,
  tardyCountFrom: true,
  absentAfterLateSeconds: true,
  undertimeGraceSeconds: true,
  status: true,
};

export function AttendancePoliciesPage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [tardyCountFilter, setTardyCountFilter] = useState<
    "all" | "schedule_start" | "after_grace"
  >("all");
  const [defaultFilter, setDefaultFilter] = useState<"all" | "true" | "false">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<PolicyDrawerMode>("create");
  const [selectedPolicy, setSelectedPolicy] = useState<AttendancePolicyRecord | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttendancePolicyRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openCreate = () => {
    setSelectedPolicy(null);
    setDrawerMode("create");
    setDrawerError(null);
    setDrawerOpen(true);
  };

  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();
  registerCreateHandler(openCreate);
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "name" ||
    activeSort?.id === "tardyGraceSeconds" ||
    activeSort?.id === "undertimeGraceSeconds" ||
    activeSort?.id === "absentAfterLateSeconds" ||
    activeSort?.id === "isDefault" ||
    activeSort?.id === "isActive"
      ? activeSort.id
      : "createdAt";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const listQuery = useQuery({
    queryKey: [
      "attendance-policies",
      "list",
      {
        search: search.trim(),
        tardyCountFilter,
        defaultFilter,
        activeFilter,
        createdFrom,
        createdTo,
        page,
        pageSize,
        sortBy,
        sortDir,
      },
    ],
    queryFn: () =>
      api.listAttendancePolicies({
        search: search.trim() || undefined,
        tardyCountFrom: tardyCountFilter,
        isDefault: defaultFilter,
        isActive: activeFilter,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const invalidateRelated = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["attendance-policies"] }),
      queryClient.invalidateQueries({ queryKey: ["schedules"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateAttendancePolicyDto) => api.createAttendancePolicy(payload),
    onSuccess: async () => {
      setDrawerOpen(false);
      setDrawerError(null);
      await invalidateRelated();
    },
    onError: (err: Error) => setDrawerError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CreateAttendancePolicyDto }) =>
      api.updateAttendancePolicy(id, payload),
    onSuccess: async () => {
      setDrawerOpen(false);
      setDrawerError(null);
      await invalidateRelated();
    },
    onError: (err: Error) => setDrawerError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAttendancePolicy(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setDeleteError(null);
      await invalidateRelated();
    },
    onError: (err: Error) => setDeleteError(err.message),
  });

  const activeFilterCount =
    (tardyCountFilter !== "all" ? 1 : 0) +
    (defaultFilter !== "all" ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  const columns = useMemo<ServerColumnDef<AttendancePolicyRecord>[]>(
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
                aria-label={`View ${item.name}`}
                onClick={() => {
                  setSelectedPolicy(item);
                  setDrawerMode("view");
                  setDrawerError(null);
                  setDrawerOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label={`Edit ${item.name}`}
                onClick={() => {
                  setSelectedPolicy(item);
                  setDrawerMode("edit");
                  setDrawerError(null);
                  setDrawerOpen(true);
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
                title={item.deleteBlockedReason ?? "Delete policy"}
                onClick={() => {
                  setDeleteTarget(item);
                  setDeleteError(null);
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
        header: "Policy",
        enableSorting: true,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="min-w-0 max-w-xs">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-foreground">{item.name}</span>
                {item.isDefault ? (
                  <Badge variant="blue" className="gap-1">
                    <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                    Default
                  </Badge>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "tardyGraceSeconds",
        accessorKey: "tardyGraceSeconds",
        header: "Tardy Grace",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-foreground">
            {formatDurationSeconds(row.original.tardyGraceSeconds)}
          </span>
        ),
      },
      {
        id: "tardyCountFrom",
        accessorKey: "tardyCountFrom",
        header: "Count Tardy From",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.tardyCountFrom === "after_grace" ? "purple" : "neutral"}>
            {formatTardyCountFrom(row.original.tardyCountFrom)}
          </Badge>
        ),
      },
      {
        id: "absentAfterLateSeconds",
        accessorKey: "absentAfterLateSeconds",
        header: "Absent After Late",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {formatDurationSeconds(row.original.absentAfterLateSeconds)}
          </span>
        ),
      },
      {
        id: "undertimeGraceSeconds",
        accessorKey: "undertimeGraceSeconds",
        header: "Undertime Grace",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-foreground">
            {formatDurationSeconds(row.original.undertimeGraceSeconds)}
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "isActive",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Badge
              variant={row.original.isActive ? "emerald" : "neutral"}
              dotColor={row.original.isActive ? "bg-emerald-500" : "bg-zinc-400"}
            >
              {row.original.isActive ? "Active" : "Inactive"}
            </Badge>
            {row.original.scheduleCount > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                ({row.original.scheduleCount} sched)
              </span>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { total: 0, page, pageSize, totalPages: 1 };

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Attendance Policies
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Centralized tardy grace, late-to-absent cutoffs, undertime grace, and biometric tap
            windows ({meta.total} {meta.total === 1 ? "policy" : "policies"}).
          </p>
        </div>

        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          New Policy
        </Button>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title={`Delete "${deleteTarget?.name ?? "policy"}"?`}
        description="This permanently removes the unused attendance policy record."
        errorMessage={deleteError ?? deleteTarget?.deleteBlockedReason ?? null}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
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
              placeholder="Search policy name or description..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Popover
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            className="w-72 p-3"
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Filter</span>
                {activeFilterCount > 0 ? (
                  <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
            }
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <PopoverLabel className="p-0">Policy Filters</PopoverLabel>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                    onClick={() => {
                      setTardyCountFilter("all");
                      setDefaultFilter("all");
                      setActiveFilter("all");
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
                  htmlFor="flt-count-from"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Count Tardy From
                </label>
                <SelectMenu
                  id="flt-count-from"
                  className="h-8 text-xs"
                  value={tardyCountFilter}
                  onValueChange={(val) => {
                    setTardyCountFilter(val as "all" | "schedule_start" | "after_grace");
                    setPage(1);
                  }}
                  options={[
                    { value: "all", label: "All modes" },
                    { value: "schedule_start", label: "Schedule start" },
                    { value: "after_grace", label: "After grace" },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="flt-default"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Default
                  </label>
                  <SelectMenu
                    id="flt-default"
                    className="h-8 text-xs"
                    value={defaultFilter}
                    onValueChange={(val) => {
                      setDefaultFilter(val as "all" | "true" | "false");
                      setPage(1);
                    }}
                    options={[
                      { value: "all", label: "All" },
                      { value: "true", label: "Default only" },
                      { value: "false", label: "Non-default" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="flt-active"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Status
                  </label>
                  <SelectMenu
                    id="flt-active"
                    className="h-8 text-xs"
                    value={activeFilter}
                    onValueChange={(val) => {
                      setActiveFilter(val as "all" | "true" | "false");
                      setPage(1);
                    }}
                    options={[
                      { value: "all", label: "All" },
                      { value: "true", label: "Active" },
                      { value: "false", label: "Inactive" },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="flt-from"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Created From
                  </label>
                  <DatePicker
                    id="flt-from"
                    className="h-8 text-xs"
                    placeholder="Start date"
                    value={createdFrom}
                    onChange={(val) => {
                      setCreatedFrom(val);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="flt-to" className="text-[11px] font-medium text-muted-foreground">
                    Created To
                  </label>
                  <DatePicker
                    id="flt-to"
                    className="h-8 text-xs"
                    placeholder="End date"
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
            options={COLUMN_TOGGLE_OPTIONS}
            columnVisibility={columnVisibility}
            onToggle={(id) =>
              setColumnVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))
            }
            onReset={() => setColumnVisibility(DEFAULT_VISIBILITY)}
          />
        </div>
      </div>

      {listQuery.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        >
          <span>{listQuery.error?.message ?? "Failed to load attendance policies."}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <ServerDataTable
        data={rows}
        columns={columns}
        meta={meta}
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
        isPending={listQuery.isPending}
        isFetching={listQuery.isFetching}
        emptyState={
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No attendance policies found</p>
            <p className="text-xs text-muted-foreground">
              Create your first attendance policy to define tardy grace and biometric windows.
            </p>
          </div>
        }
      />

      <AttendancePolicyDrawer
        key={`${drawerMode}-${selectedPolicy?.id ?? "new"}-${drawerOpen ? "open" : "closed"}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        policy={selectedPolicy}
        isPending={createMutation.isPending || updateMutation.isPending}
        serverError={drawerError}
        onSubmitPayload={(payload) => {
          setDrawerError(null);
          if (drawerMode === "create") {
            createMutation.mutate(payload);
          } else if (selectedPolicy) {
            updateMutation.mutate({ id: selectedPolicy.id, payload });
          }
        }}
      />
    </div>
  );
}
