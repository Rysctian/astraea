import type { CreateCutOffDto, CutOffRecord } from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { CutOffDrawer, type CutOffDrawerMode } from "./cut-off-drawer";
import {
  formatDateRange,
  formatScheduleType,
  formatShortDate,
  getMonthLabel,
  MONTH_OPTIONS,
} from "./cut-off-utils";

const COLUMN_TOGGLE_OPTIONS = [
  { id: "scheduleType", label: "Schedule" },
  { id: "dtrPeriod", label: "DTR Period" },
  { id: "payrollPeriod", label: "Payroll Period" },
  { id: "releaseDate", label: "Release Date" },
  { id: "status", label: "Status" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  scheduleType: true,
  dtrPeriod: true,
  payrollPeriod: true,
  releaseDate: true,
  status: true,
};

export function CutOffsPage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<"all" | "monthly" | "semi_monthly">(
    "all",
  );
  const [monthFilter, setMonthFilter] = useState("");
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
  const [drawerMode, setDrawerMode] = useState<CutOffDrawerMode>("create");
  const [selectedCutOff, setSelectedCutOff] = useState<CutOffRecord | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CutOffRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openCreate = () => {
    setSelectedCutOff(null);
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
    activeSort?.id === "year" ||
    activeSort?.id === "month" ||
    activeSort?.id === "scheduleType" ||
    activeSort?.id === "isActive"
      ? activeSort.id
      : "createdAt";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const listQuery = useQuery({
    queryKey: [
      "cut-offs",
      "list",
      {
        search: search.trim(),
        scheduleTypeFilter,
        monthFilter,
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
      api.listCutOffs({
        search: search.trim() || undefined,
        scheduleType: scheduleTypeFilter,
        month: monthFilter ? Number(monthFilter) : undefined,
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

  const invalidateCutOffs = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cut-offs"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateCutOffDto) => api.createCutOff(payload),
    onSuccess: async () => {
      setDrawerOpen(false);
      setDrawerError(null);
      await invalidateCutOffs();
    },
    onError: (err: Error) => setDrawerError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CreateCutOffDto }) =>
      api.updateCutOff(id, payload),
    onSuccess: async () => {
      setDrawerOpen(false);
      setDrawerError(null);
      await invalidateCutOffs();
    },
    onError: (err: Error) => setDrawerError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCutOff(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      setDeleteError(null);
      await invalidateCutOffs();
    },
    onError: (err: Error) => setDeleteError(err.message),
  });

  const activeFilterCount =
    (scheduleTypeFilter !== "all" ? 1 : 0) +
    (monthFilter ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  const columns = useMemo<ServerColumnDef<CutOffRecord>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {getMonthLabel(row.original.month)} {row.original.year}
            </p>
          </div>
        ),
      },
      {
        id: "scheduleType",
        accessorKey: "scheduleType",
        header: "Schedule",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={row.original.scheduleType === "semi_monthly" ? "purple" : "blue"}>
            {formatScheduleType(row.original.scheduleType)}
          </Badge>
        ),
      },
      {
        id: "dtrPeriod",
        header: "DTR Period",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.periods.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  #{p.cutOffNo}
                </span>
                {p.noDtr ? (
                  <Badge variant="amber" className="px-1.5 py-0 text-[10px]">
                    No DTR
                  </Badge>
                ) : (
                  <span className="tabular-nums text-foreground">
                    {formatDateRange(p.dtrDateFrom, p.dtrDateTo)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "payrollPeriod",
        header: "Payroll Period",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.periods.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  #{p.cutOffNo}
                </span>
                <span className="tabular-nums text-foreground">
                  {formatDateRange(p.payrollDateFrom, p.payrollDateTo)}
                </span>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "releaseDate",
        header: "Release Date",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.periods.map((p) => (
              <div key={p.id} className="tabular-nums text-xs text-muted-foreground">
                {formatShortDate(p.releaseDate)}
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "isActive",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge
            variant={row.original.isActive ? "emerald" : "neutral"}
            dotColor={row.original.isActive ? "bg-emerald-500" : "bg-zinc-400"}
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
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
                  setSelectedCutOff(item);
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
                  setSelectedCutOff(item);
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
            Cut-Off Management
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure monthly and semi-monthly DTR coverage, confirmation windows, payroll ranges,
            and salary release dates ({meta.total} {meta.total === 1 ? "calendar" : "calendars"}).
          </p>
        </div>

        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          New Cut-Off
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
        title={`Delete "${deleteTarget?.name ?? "cut-off"}"?`}
        description={`This permanently removes "${deleteTarget?.name ?? ""}" and all ${deleteTarget?.periods.length ?? 0} child cut-off period(s).`}
        errorMessage={deleteError}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
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
            placeholder="Search cut-off name..."
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
              <PopoverLabel className="p-0">Cut-Off Filters</PopoverLabel>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                  onClick={() => {
                    setScheduleTypeFilter("all");
                    setMonthFilter("");
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
                htmlFor="co-flt-type"
                className="text-[11px] font-medium text-muted-foreground"
              >
                Schedule Type
              </label>
              <SelectMenu
                id="co-flt-type"
                className="h-8 text-xs"
                value={scheduleTypeFilter}
                onValueChange={(val) => {
                  setScheduleTypeFilter(val as "all" | "monthly" | "semi_monthly");
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All cadences" },
                  { value: "monthly", label: "Monthly" },
                  { value: "semi_monthly", label: "Semi-Monthly" },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="co-flt-month"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Month
                </label>
                <SelectMenu
                  id="co-flt-month"
                  className="h-8 text-xs"
                  value={monthFilter}
                  onValueChange={(val) => {
                    setMonthFilter(val);
                    setPage(1);
                  }}
                  options={[
                    { value: "", label: "All months" },
                    ...MONTH_OPTIONS.map((m) => ({ value: String(m.value), label: m.label })),
                  ]}
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="co-flt-active"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Status
                </label>
                <SelectMenu
                  id="co-flt-active"
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
                  htmlFor="co-flt-from"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Created From
                </label>
                <DatePicker
                  id="co-flt-from"
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
                <label
                  htmlFor="co-flt-to"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Created To
                </label>
                <DatePicker
                  id="co-flt-to"
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
          onToggle={(id) => setColumnVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))}
          onReset={() => setColumnVisibility(DEFAULT_VISIBILITY)}
        />
      </div>

      {listQuery.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        >
          <span>{listQuery.error?.message ?? "Failed to load cut-offs."}</span>
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
            <p className="text-sm font-medium text-foreground">No cut-off calendars yet</p>
            <p className="text-xs text-muted-foreground">
              Create your first monthly or semi-monthly cut-off calendar to define DTR and payroll
              cycles.
            </p>
          </div>
        }
      />

      <CutOffDrawer
        key={`${drawerMode}-${selectedCutOff?.id ?? "new"}-${drawerOpen ? "open" : "closed"}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        cutOff={selectedCutOff}
        isPending={createMutation.isPending || updateMutation.isPending}
        serverError={drawerError}
        onSubmitPayload={(payload) => {
          setDrawerError(null);
          if (drawerMode === "create") {
            createMutation.mutate(payload);
          } else if (selectedCutOff) {
            updateMutation.mutate({ id: selectedCutOff.id, payload });
          }
        }}
      />
    </div>
  );
}
