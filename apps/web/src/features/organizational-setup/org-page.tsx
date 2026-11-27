import { OFFICE_TYPES, type OrgEntityType, type OrgRecord } from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { Filter, GitFork, Loader2, Pencil, Plus, Search, Table2, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ColumnVisibilityPopover,
  type ServerColumnDef,
  ServerDataTable,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Popover, PopoverLabel } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { OrgEntityDrawer } from "./org-drawer";
import { OrgHierarchyTreeView } from "./org-tree";
import { ORG_TABS } from "./org-utils";

const COLUMN_TOGGLE_OPTIONS = [
  { id: "code", label: "Code" },
  { id: "parent", label: "Parent / Scope" },
  { id: "sortOrder", label: "Sort Order" },
  { id: "status", label: "Status" },
  { id: "usage", label: "Usage" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  code: true,
  parent: true,
  sortOrder: true,
  status: true,
  usage: true,
};

export function OrganizationalSetupPage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();

  const [activeEntity, setActiveEntity] = useState<OrgEntityType>("offices");
  const [viewMode, setViewMode] = useState<"table" | "tree">("table");
  const [includeInactiveTree, setIncludeInactiveTree] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");

  const [sorting, setSorting] = useState<SortingState>([{ id: "sortOrder", desc: false }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);

  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OrgRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  registerCreateHandler(() => {
    setEditingRecord(null);
    setDrawerOpen(true);
  });
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const summaryQuery = useQuery({
    queryKey: ["organization", "summary"],
    queryFn: api.getOrgSummary,
  });

  const optionsQuery = useQuery({
    queryKey: ["organization", "options"],
    queryFn: api.getOrgActiveOptions,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "org-head-options"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
    retry: false,
  });

  const treeQuery = useQuery({
    queryKey: ["organization", "tree", includeInactiveTree],
    queryFn: () => api.getOrgTree(includeInactiveTree),
    enabled: viewMode === "tree",
  });

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "code" ||
    activeSort?.id === "name" ||
    activeSort?.id === "title" ||
    activeSort?.id === "id" ||
    activeSort?.id === "createdAt"
      ? activeSort.id
      : "sortOrder";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const listQuery = useQuery({
    queryKey: [
      "organization",
      activeEntity,
      {
        page,
        pageSize,
        search,
        statusFilter,
        typeFilter,
        officeFilter,
        departmentFilter,
        divisionFilter,
        sortBy,
        sortDir,
      },
    ],
    queryFn: () =>
      api.listOrgEntities(activeEntity, {
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter,
        type:
          activeEntity === "offices" && typeFilter
            ? (typeFilter as (typeof OFFICE_TYPES)[number])
            : undefined,
        officeId:
          (activeEntity === "departments" || activeEntity === "reports_items") && officeFilter
            ? Number(officeFilter)
            : undefined,
        departmentId:
          (activeEntity === "divisions" ||
            activeEntity === "sections" ||
            activeEntity === "positions" ||
            activeEntity === "reports_items") &&
          departmentFilter
            ? Number(departmentFilter)
            : undefined,
        divisionId:
          activeEntity === "sections" && divisionFilter ? Number(divisionFilter) : undefined,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
    enabled: viewMode === "table",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteOrgEntity(activeEntity, id),
    onSuccess: async () => {
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  const optionLookup = useMemo(() => {
    const opts = optionsQuery.data;
    return {
      offices: new Map((opts?.offices ?? []).map((o) => [o.id, o.label])),
      departments: new Map((opts?.departments ?? []).map((d) => [d.id, d.label])),
      divisions: new Map((opts?.divisions ?? []).map((d) => [d.id, d.label])),
      sections: new Map((opts?.sections ?? []).map((s) => [s.id, s.label])),
      positions: new Map((opts?.positions ?? []).map((p) => [p.id, p.label])),
    };
  }, [optionsQuery.data]);

  function switchEntity(next: OrgEntityType) {
    setActiveEntity(next);
    setViewMode("table");
    setPage(1);
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("");
    setOfficeFilter("");
    setDepartmentFilter("");
    setDivisionFilter("");
    setDeleteError(null);
  }

  const activeTabMeta = ORG_TABS.find((t) => t.entity === activeEntity) ?? ORG_TABS[0];

  const columns = useMemo<ServerColumnDef<OrgRecord>[]>(
    () => [
      {
        id: "code",
        accessorKey: "code",
        header: "Code",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-primary">{row.original.code}</span>
        ),
      },
      {
        id: activeEntity === "positions" ? "title" : "name",
        accessorKey: activeEntity === "positions" ? "title" : "name",
        header: activeEntity === "positions" ? "Title" : "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-[180px]">
            <p className="truncate font-medium text-foreground">
              {row.original.title ?? row.original.name}
            </p>
            {row.original.shortName || row.original.salaryGrade ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {row.original.shortName ??
                  [row.original.salaryGrade, row.original.jobLevel].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "parent",
        header: "Parent / Scope",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const parts: string[] = [];
          if (r.type) parts.push(r.type);
          if (r.parentId)
            parts.push(optionLookup.offices.get(r.parentId) ?? `Office #${r.parentId}`);
          if (r.officeId)
            parts.push(optionLookup.offices.get(r.officeId) ?? `Office #${r.officeId}`);
          if (r.departmentId) {
            parts.push(optionLookup.departments.get(r.departmentId) ?? `Dept #${r.departmentId}`);
          }
          if (r.divisionId) {
            parts.push(optionLookup.divisions.get(r.divisionId) ?? `Div #${r.divisionId}`);
          }
          if (r.sectionId) {
            parts.push(optionLookup.sections.get(r.sectionId) ?? `Sec #${r.sectionId}`);
          }
          if (r.reportsToPositionId) {
            parts.push(
              `Reports to: ${optionLookup.positions.get(r.reportsToPositionId) ?? `Pos #${r.reportsToPositionId}`}`,
            );
          }
          return (
            <span className="text-xs text-muted-foreground">
              {parts.length > 0 ? parts.join(" · ") : "—"}
            </span>
          );
        },
      },
      {
        id: "sortOrder",
        accessorKey: "sortOrder",
        header: "Order",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.original.sortOrder}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
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
        id: "usage",
        header: "Usage",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isInUse ? (
            <span
              title={row.original.usageReason ?? undefined}
              className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              <span>In use ({row.original.usageCount})</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Unused</span>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Edit ${row.original.code}`}
              onClick={() => {
                setEditingRecord(row.original);
                setDrawerOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:opacity-40"
              aria-label={`Delete ${row.original.code}`}
              title={row.original.isInUse ? (row.original.usageReason ?? "In use") : "Delete"}
              disabled={row.original.isInUse || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [activeEntity, deleteMutation, optionLookup],
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const cascadingSectionDivisions = (optionsQuery.data?.divisions ?? []).filter(
    (d) => !departmentFilter || String(d.departmentId ?? "") === departmentFilter,
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Organizational Setup
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Manage offices, departments, divisions, sections, positions, and reporting-line
            templates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <TabsList aria-label="Organizational view mode">
            <TabsTrigger active={viewMode === "table"} onClick={() => setViewMode("table")}>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Catalogs</span>
            </TabsTrigger>
            <TabsTrigger active={viewMode === "tree"} onClick={() => setViewMode("tree")}>
              <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Hierarchy Tree</span>
            </TabsTrigger>
          </TabsList>

          <Button
            type="button"
            size="sm"
            className="h-8.5 gap-1.5 rounded-md px-3 text-[13px] font-medium"
            onClick={() => {
              setEditingRecord(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add {activeTabMeta?.singular}</span>
          </Button>
        </div>
      </div>

      {/* 6-card KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-2.5 px-6 pb-4 md:grid-cols-3 lg:grid-cols-6">
        {ORG_TABS.map((tab) => {
          const counts = summaryQuery.data?.[tab.entity];
          const selected = viewMode === "table" && activeEntity === tab.entity;
          return (
            <button
              key={tab.entity}
              type="button"
              onClick={() => switchEntity(tab.entity)}
              className={`flex cursor-pointer flex-col rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {tab.label}
              </span>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  {counts?.total ?? 0}
                </span>
                <span className="text-[11px] text-emerald-600 tabular-nums dark:text-emerald-400">
                  {counts?.active ?? 0} active
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {viewMode === "tree" ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-6 pb-3">
            <p className="text-xs text-muted-foreground">
              Nested view across Offices / Colleges → Departments → Divisions → Sections.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="tree-inactive"
                checked={includeInactiveTree}
                onCheckedChange={setIncludeInactiveTree}
              />
              <label
                htmlFor="tree-inactive"
                className="cursor-pointer select-none text-xs text-muted-foreground"
              >
                Include inactive units
              </label>
            </div>
          </div>
          {treeQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 border-t border-border py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Loading hierarchy tree...</span>
            </div>
          ) : treeQuery.data ? (
            <OrgHierarchyTreeView tree={treeQuery.data} />
          ) : null}
        </div>
      ) : (
        <>
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
                  placeholder={`Search ${activeTabMeta?.label.toLowerCase()}...`}
                  aria-label="Search organizational entities"
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>

              <Popover
                open={filterOpen}
                onOpenChange={setFilterOpen}
                className="w-64 p-3"
                trigger={
                  <Button
                    type="button"
                    variant={
                      statusFilter !== "all" ||
                      typeFilter ||
                      officeFilter ||
                      departmentFilter ||
                      divisionFilter ||
                      filterOpen
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                    onClick={() => setFilterOpen((prev) => !prev)}
                  >
                    <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Filter</span>
                  </Button>
                }
              >
                <PopoverLabel className="px-0">Filters</PopoverLabel>
                <div className="space-y-2.5 text-xs">
                  <div className="space-y-1">
                    <label
                      htmlFor="org-flt-status"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Status
                    </label>
                    <Select
                      id="org-flt-status"
                      className="h-8 text-xs"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value as "all" | "active" | "inactive");
                        setPage(1);
                      }}
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                  </div>

                  {activeEntity === "offices" ? (
                    <div className="space-y-1">
                      <label
                        htmlFor="org-flt-type"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Office Type
                      </label>
                      <Select
                        id="org-flt-type"
                        className="h-8 text-xs"
                        value={typeFilter}
                        onChange={(e) => {
                          setTypeFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">All types</option>
                        {OFFICE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}

                  {activeEntity === "departments" || activeEntity === "reports_items" ? (
                    <div className="space-y-1">
                      <label
                        htmlFor="org-flt-office"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Office
                      </label>
                      <Select
                        id="org-flt-office"
                        className="h-8 text-xs"
                        value={officeFilter}
                        onChange={(e) => {
                          setOfficeFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">All offices</option>
                        {(optionsQuery.data?.offices ?? []).map((o) => (
                          <option key={o.id} value={String(o.id)}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}

                  {activeEntity === "divisions" ||
                  activeEntity === "sections" ||
                  activeEntity === "positions" ||
                  activeEntity === "reports_items" ? (
                    <div className="space-y-1">
                      <label
                        htmlFor="org-flt-dept"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Department
                      </label>
                      <Select
                        id="org-flt-dept"
                        className="h-8 text-xs"
                        value={departmentFilter}
                        onChange={(e) => {
                          setDepartmentFilter(e.target.value);
                          setDivisionFilter("");
                          setPage(1);
                        }}
                      >
                        <option value="">All departments</option>
                        {(optionsQuery.data?.departments ?? []).map((d) => (
                          <option key={d.id} value={String(d.id)}>
                            {d.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}

                  {activeEntity === "sections" ? (
                    <div className="space-y-1">
                      <label
                        htmlFor="org-flt-div"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Division
                      </label>
                      <Select
                        id="org-flt-div"
                        className="h-8 text-xs"
                        value={divisionFilter}
                        onChange={(e) => {
                          setDivisionFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">All divisions</option>
                        {cascadingSectionDivisions.map((d) => (
                          <option key={d.id} value={String(d.id)}>
                            {d.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
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

          {deleteError ? (
            <div
              role="alert"
              className="mx-6 mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {deleteError}
            </div>
          ) : null}

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
            isPending={listQuery.isPending}
            isFetching={listQuery.isFetching}
            emptyState={
              <div className="flex flex-col items-center">
                <p className="text-sm font-medium text-foreground">
                  No {activeTabMeta?.label.toLowerCase()} yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add your first {activeTabMeta?.singular.toLowerCase()} to populate the catalog.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setEditingRecord(null);
                    setDrawerOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add {activeTabMeta?.singular}</span>
                </Button>
              </div>
            }
          />
        </>
      )}

      <OrgEntityDrawer
        entity={activeEntity}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editingRecord={editingRecord}
        options={optionsQuery.data}
        employees={employeesQuery.data?.data ?? []}
      />
    </div>
  );
}
