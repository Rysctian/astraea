import { HRIS_REFERENCES } from "@starter/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { ArrowUpDown, Filter, Plus, RotateCcw, Search } from "lucide-react";
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
import { type ApiEmployee, api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { EmployeeCreateDrawer } from "./employee-create";
import {
  ALL_DEPARTMENTS,
  formatEmployeeDate,
  getEmployeeAvatarTone,
  getEmployeeInitials,
  getEmployeeStatusBadge,
} from "./employee-utils";

type EmployeeSortField = "id" | "employeeId" | "firstName" | "lastName" | "dateHired" | "createdAt";

const COLUMN_TOGGLE_OPTIONS = [
  { id: "employee", label: "Employee" },
  { id: "department", label: "Department & Position" },
  { id: "employment", label: "Employment" },
  { id: "status", label: "Status" },
  { id: "dateHired", label: "Date Hired" },
  { id: "contact", label: "Contact" },
  { id: "createdAt", label: "Created" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  employee: true,
  department: true,
  employment: true,
  status: true,
  dateHired: true,
  contact: true,
  createdAt: false,
};

export function EmployeeTablePage() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [workArrangementFilter, setWorkArrangementFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [civilStatusFilter, setCivilStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  registerCreateHandler(() => setDrawerOpen(true));
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const activeSort = sorting[0];
  const sortBy: EmployeeSortField =
    activeSort?.id === "employeeId" ||
    activeSort?.id === "firstName" ||
    activeSort?.id === "lastName" ||
    activeSort?.id === "dateHired" ||
    activeSort?.id === "id"
      ? activeSort.id
      : "createdAt";
  const sortDir: "asc" | "desc" = activeSort?.desc === false ? "asc" : "desc";

  const activeFilterCount = [
    departmentFilter,
    positionFilter,
    statusFilter,
    typeFilter,
    workArrangementFilter,
    genderFilter,
    civilStatusFilter,
    dateFrom,
    dateTo,
  ].filter(Boolean).length;

  const employeesQuery = useQuery({
    queryKey: [
      "employees",
      {
        page,
        pageSize,
        search,
        departmentFilter,
        positionFilter,
        statusFilter,
        typeFilter,
        workArrangementFilter,
        genderFilter,
        civilStatusFilter,
        dateFrom,
        dateTo,
        sortBy,
        sortDir,
      },
    ],
    queryFn: () =>
      api.listEmployees({
        page,
        pageSize,
        search: search.trim() || undefined,
        department: departmentFilter || undefined,
        position: positionFilter || undefined,
        employmentStatus: statusFilter || undefined,
        type: typeFilter || undefined,
        workArrangement: workArrangementFilter || undefined,
        gender: genderFilter || undefined,
        civilStatus: civilStatusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  function clearFilters() {
    setDepartmentFilter("");
    setPositionFilter("");
    setStatusFilter("");
    setTypeFilter("");
    setWorkArrangementFilter("");
    setGenderFilter("");
    setCivilStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const columns = useMemo<ServerColumnDef<ApiEmployee>[]>(
    () => [
      {
        id: "employeeId",
        accessorKey: "employeeId",
        header: "Employee ID",
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            to="/employees/$employeeId"
            params={{ employeeId: row.original.employeeId }}
            className="font-mono text-xs font-medium text-primary hover:underline"
          >
            {row.original.employeeId}
          </Link>
        ),
      },
      {
        id: "employee",
        accessorKey: "firstName",
        header: "Employee",
        enableSorting: true,
        cell: ({ row }) => {
          const emp = row.original;
          const fullName = `${emp.firstName} ${emp.lastName}`;
          return (
            <div className="flex min-w-[210px] items-center gap-2.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${getEmployeeAvatarTone(emp.employeeId)}`}
              >
                {getEmployeeInitials(emp.firstName, emp.lastName)}
              </span>
              <div className="min-w-0">
                <Link
                  to="/employees/$employeeId"
                  params={{ employeeId: emp.employeeId }}
                  className="block truncate font-medium text-foreground hover:text-primary"
                >
                  {fullName}
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">
                  {emp.personalEmail ?? emp.workEmail ?? emp.mobileNo ?? "—"}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "department",
        header: "Department & Position",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-[160px]">
            <p className="truncate text-xs font-medium text-foreground">
              {row.original.department ?? "Unassigned"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.original.position ?? "—"}
            </p>
          </div>
        ),
      },
      {
        id: "employment",
        header: "Employment",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral" dotColor="bg-indigo-500">
              {row.original.type === "admin" ? "Admin" : "Employee"}
            </Badge>
            {row.original.workArrangement ? (
              <Badge variant="blue" dotColor="bg-sky-500">
                {row.original.workArrangement}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => {
          const badge = getEmployeeStatusBadge(row.original.employmentStatus);
          return (
            <Badge variant={badge.variant} dotColor={badge.dotColor}>
              {badge.label}
            </Badge>
          );
        },
      },
      {
        id: "dateHired",
        accessorKey: "dateHired",
        header: "Date Hired",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatEmployeeDate(row.original.dateHired)}
          </span>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground">
            <p className="truncate text-foreground/90">{row.original.mobileNo ?? "—"}</p>
            {row.original.workEmail ? (
              <p className="truncate text-[11px]">{row.original.workEmail}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatEmployeeDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const rows = employeesQuery.data?.data ?? [];
  const meta = employeesQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Employee 201</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Authoritative personnel directory and 201 profiles ({meta.total}{" "}
            {meta.total === 1 ? "employee" : "employees"}).
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          className="h-8.5 gap-1.5 rounded-md px-3 text-[13px] font-medium"
          onClick={() => {
            setFilterOpen(false);
            setSortOpen(false);
            setColumnsOpen(false);
            setDrawerOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add Employee</span>
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
              placeholder="Search name, EMP ID, email..."
              aria-label="Search employees"
              className="h-8 w-60 pl-8 text-xs"
            />
          </div>

          <Popover
            open={filterOpen}
            onOpenChange={setFilterOpen}
            className="w-80 p-3"
            trigger={
              <Button
                type="button"
                variant={activeFilterCount > 0 || filterOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                onClick={() => setFilterOpen((prev) => !prev)}
              >
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Filter</span>
                {activeFilterCount > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            }
          >
            <div className="mb-2 flex items-center justify-between">
              <PopoverLabel className="p-0">Directory Filters</PopoverLabel>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="space-y-1">
                <label
                  htmlFor="flt-status"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="flt-status"
                  className="h-8 text-xs"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {HRIS_REFERENCES.employmentStatuses.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="flt-dept" className="text-[11px] font-medium text-muted-foreground">
                  Department
                </label>
                <Select
                  id="flt-dept"
                  className="h-8 text-xs"
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All departments</option>
                  {ALL_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="flt-pos" className="text-[11px] font-medium text-muted-foreground">
                  Position
                </label>
                <Select
                  id="flt-pos"
                  className="h-8 text-xs"
                  value={positionFilter}
                  onChange={(e) => {
                    setPositionFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All positions</option>
                  {HRIS_REFERENCES.positions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="flt-work" className="text-[11px] font-medium text-muted-foreground">
                  Work Setup
                </label>
                <Select
                  id="flt-work"
                  className="h-8 text-xs"
                  value={workArrangementFilter}
                  onChange={(e) => {
                    setWorkArrangementFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All setups</option>
                  {HRIS_REFERENCES.workArrangements.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="flt-type" className="text-[11px] font-medium text-muted-foreground">
                  Employee Type
                </label>
                <Select
                  id="flt-type"
                  className="h-8 text-xs"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All types</option>
                  {HRIS_REFERENCES.employeeTypes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="flt-gender"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Gender
                </label>
                <Select
                  id="flt-gender"
                  className="h-8 text-xs"
                  value={genderFilter}
                  onChange={(e) => {
                    setGenderFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All genders</option>
                  {HRIS_REFERENCES.genders.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="flt-civil"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Civil Status
                </label>
                <Select
                  id="flt-civil"
                  className="h-8 text-xs"
                  value={civilStatusFilter}
                  onChange={(e) => {
                    setCivilStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  {HRIS_REFERENCES.civilStatuses.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="flt-from" className="text-[11px] font-medium text-muted-foreground">
                  Added From
                </label>
                <Input
                  id="flt-from"
                  type="date"
                  className="h-8 text-xs"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="col-span-2 space-y-1">
                <label htmlFor="flt-to" className="text-[11px] font-medium text-muted-foreground">
                  Added To
                </label>
                <Input
                  id="flt-to"
                  type="date"
                  className="h-8 text-xs"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </Popover>

          <Popover
            open={sortOpen}
            onOpenChange={setSortOpen}
            className="w-48"
            trigger={
              <Button
                type="button"
                variant={sortOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                onClick={() => setSortOpen((prev) => !prev)}
              >
                <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sort: {sortBy}</span>
              </Button>
            }
          >
            <PopoverLabel>Server sort</PopoverLabel>
            {(
              [
                { id: "createdAt", desc: true, label: "Newest added" },
                { id: "employeeId", desc: false, label: "Employee ID (Asc)" },
                { id: "firstName", desc: false, label: "First Name (A–Z)" },
                { id: "lastName", desc: false, label: "Last Name (A–Z)" },
                { id: "dateHired", desc: true, label: "Date Hired (Recent)" },
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
                className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
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
      </div>

      {employeesQuery.isError ? (
        <div
          role="alert"
          className="mx-6 my-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {employeesQuery.error.message}
        </div>
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
          isPending={employeesQuery.isPending}
          isFetching={employeesQuery.isFetching}
          emptyState={
            <div className="flex flex-col items-center">
              <p className="text-sm font-medium text-foreground">No employees found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Onboard your first employee to generate an EMP-YYYYNNNN 201 file and login account.
              </p>
              <Button type="button" size="sm" className="mt-4" onClick={() => setDrawerOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Employee</span>
              </Button>
            </div>
          }
        />
      )}

      <EmployeeCreateDrawer open={drawerOpen} onOpenChange={setDrawerOpen} supervisors={rows} />
    </div>
  );
}
