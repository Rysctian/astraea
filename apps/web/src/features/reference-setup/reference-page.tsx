import {
  getReferenceCategoriesByGroup,
  REFERENCE_GROUP_META,
  type ReferenceActiveOptionsMap,
  type ReferenceGroupKey,
  type ReferenceItemRecord,
} from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { Filter, GitBranch, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { ReferenceItemDrawer } from "./reference-drawer";

const COLUMN_TOGGLE_OPTIONS = [
  { id: "code", label: "Code" },
  { id: "parent", label: "Parent" },
  { id: "sortOrder", label: "Order" },
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

export function ReferenceSetupPage({ group }: { group: ReferenceGroupKey }) {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();

  const groupMeta = REFERENCE_GROUP_META[group];
  const fallbackCategories = useMemo(
    () =>
      getReferenceCategoriesByGroup(group).map((c) => ({
        ...c,
        totalCount: 0,
        activeCount: 0,
      })),
    [group],
  );

  const [categorySearch, setCategorySearch] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>(
    fallbackCategories[0]?.category ?? "",
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [parentFilter, setParentFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "sortOrder", desc: false }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);

  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ReferenceItemRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  registerCreateHandler(() => {
    setEditingRecord(null);
    setDrawerOpen(true);
  });
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const categoriesQuery = useQuery({
    queryKey: ["reference-setup", "categories", group],
    queryFn: () => api.getReferenceCategories(group),
  });

  const categories = categoriesQuery.data ?? fallbackCategories;
  const activeCategory =
    categories.find((c) => c.category === selectedCategoryKey) ?? categories[0];

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) {
      return categories;
    }
    return categories.filter(
      (c) =>
        c.label.toLowerCase().includes(term) ||
        c.category.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term),
    );
  }, [categories, categorySearch]);

  const parentOptionsQuery = useQuery<ReferenceActiveOptionsMap>({
    queryKey: ["reference-setup", "options", activeCategory?.parentCategory],
    queryFn: () =>
      activeCategory?.parentCategory
        ? api.getReferenceActiveOptions([activeCategory.parentCategory])
        : Promise.resolve({} as ReferenceActiveOptionsMap),
    enabled: Boolean(activeCategory?.parentCategory),
  });

  const parentOptions = activeCategory?.parentCategory
    ? (parentOptionsQuery.data?.[activeCategory.parentCategory] ?? [])
    : [];

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "code" ||
    activeSort?.id === "name" ||
    activeSort?.id === "id" ||
    activeSort?.id === "createdAt"
      ? activeSort.id
      : "sortOrder";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const itemsQuery = useQuery({
    queryKey: [
      "reference-setup",
      "items",
      group,
      activeCategory?.category,
      { page, pageSize, search, statusFilter, parentFilter, sortBy, sortDir },
    ],
    queryFn: () =>
      api.listReferenceItems(group, {
        category: activeCategory?.category ?? "",
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter,
        parentId: parentFilter ? Number(parentFilter) : undefined,
        sortBy,
        sortDir,
      }),
    enabled: Boolean(activeCategory?.category),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteReferenceItem(group, id),
    onSuccess: async () => {
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["reference-setup"] });
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  const columns = useMemo<ServerColumnDef<ReferenceItemRecord>[]>(
    () => [
      {
        id: "code",
        accessorKey: "code",
        header: "Code",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-primary">{row.original.code}</span>
            {row.original.isDefault ? (
              <Badge variant="amber">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                <span>Default</span>
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-[180px]">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            {row.original.description ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "parent",
        header: "Parent",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.parentName ? (
            <Badge variant="blue" dotColor="bg-sky-500">
              {row.original.parentName}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
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
    [deleteMutation],
  );

  const rows = itemsQuery.data?.data ?? [];
  const meta = itemsQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col lg:flex-row">
      {/* Left Category Sidebar */}
      <aside className="w-full shrink-0 border-b border-border bg-muted/20 p-4 lg:w-72 lg:border-b-0 lg:border-r">
        <div className="mb-2">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {groupMeta.label}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{groupMeta.description}</p>
        </div>

        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder="Filter categories..."
            aria-label="Filter categories"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <ul className="space-y-1">
          {filteredCategories.map((cat) => {
            const selected = activeCategory?.category === cat.category;
            return (
              <li key={cat.category} className="list-none">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryKey(cat.category);
                    setPage(1);
                    setSearch("");
                    setStatusFilter("all");
                    setParentFilter("");
                    setDeleteError(null);
                  }}
                  className={`flex w-full cursor-pointer flex-col rounded-md border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "border-primary/40 bg-background shadow-2xs ring-1 ring-primary/15"
                      : "border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-xs ${
                        selected
                          ? "font-semibold text-foreground"
                          : "font-medium text-foreground/90"
                      }`}
                    >
                      {cat.label}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                      {cat.activeCount}/{cat.totalCount}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {cat.description}
                  </p>
                  {cat.parentCategory ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                      <GitBranch className="h-3 w-3" aria-hidden="true" />
                      <span>Parent: {cat.parentCategory.replaceAll("_", " ")}</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right Items Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {activeCategory ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {activeCategory.label}
                  </h2>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {activeCategory.category}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {activeCategory.description}
                </p>
              </div>

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
                <span>Add Item</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
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
                  placeholder={`Search ${activeCategory.label.toLowerCase()}...`}
                  aria-label="Search reference items"
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>

              <Popover
                open={filterOpen}
                onOpenChange={setFilterOpen}
                className="w-60 p-3"
                trigger={
                  <Button
                    type="button"
                    variant={
                      statusFilter !== "all" || parentFilter || filterOpen ? "secondary" : "ghost"
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
                      htmlFor="ref-flt-status"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Status
                    </label>
                    <Select
                      id="ref-flt-status"
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

                  {activeCategory.parentCategory ? (
                    <div className="space-y-1">
                      <label
                        htmlFor="ref-flt-parent"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Parent Item
                      </label>
                      <Select
                        id="ref-flt-parent"
                        className="h-8 text-xs"
                        value={parentFilter}
                        onChange={(e) => {
                          setParentFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">All parents</option>
                        {parentOptions.map((opt) => (
                          <option key={opt.id} value={String(opt.id)}>
                            {opt.name}
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
              isPending={itemsQuery.isPending}
              isFetching={itemsQuery.isFetching}
              emptyState={
                <div className="flex flex-col items-center">
                  <p className="text-sm font-medium text-foreground">
                    No items in {activeCategory.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add your first reference option for this category.
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
                    <span>Add Item</span>
                  </Button>
                </div>
              }
            />

            <ReferenceItemDrawer
              group={group}
              category={activeCategory}
              open={drawerOpen}
              onOpenChange={setDrawerOpen}
              editingRecord={editingRecord}
              parentOptions={parentOptions}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
