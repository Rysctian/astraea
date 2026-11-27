import type {
  BatchAssignScheduleDto,
  CreateScheduleDto,
  EmployeeScheduleRecord,
  ScheduleRecord,
  UpdateEmployeeScheduleDto,
  UpdateScheduleDto,
} from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import {
  CalendarClock,
  CalendarDays,
  Filter,
  Lock,
  Moon,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
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
import { api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { ScheduleAssignmentDrawer } from "./assignment-drawer";
import { ScheduleTemplateDrawer } from "./schedule-template-drawer";
import {
  addDaysIso,
  COMMON_TIMEZONES,
  formatMinutesLabel,
  getTodayIso,
  toHHMM,
} from "./schedule-utils";

type ScheduleTab = "templates" | "individual";

const TEMPLATE_COLUMN_OPTIONS = [
  { id: "policy", label: "Attendance Policy" },
  { id: "status", label: "Status" },
  { id: "workingDays", label: "Working Days" },
  { id: "createdAt", label: "Created" },
];

const ASSIGNMENT_COLUMN_OPTIONS = [
  { id: "employee", label: "Employee" },
  { id: "effectiveFrom", label: "Effective From" },
  { id: "effectiveTo", label: "Effective To" },
  { id: "assignmentStatus", label: "Assignment" },
];

export function SchedulesPage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ScheduleTab>("templates");

  // Templates tab state
  const [tplSearch, setTplSearch] = useState("");
  const [tplStatus, setTplStatus] = useState<"all" | "active" | "inactive">("all");
  const [tplTimezone, setTplTimezone] = useState("");
  const [tplCreatedFrom, setTplCreatedFrom] = useState("");
  const [tplCreatedTo, setTplCreatedTo] = useState("");
  const [tplPage, setTplPage] = useState(1);
  const [tplPageSize, setTplPageSize] = useState(20);
  const [tplSorting, setTplSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [tplVisibility, setTplVisibility] = useState<ColumnVisibilityState>({
    policy: true,
    status: true,
    workingDays: true,
    createdAt: true,
  });
  const [tplFiltersOpen, setTplFiltersOpen] = useState(false);
  const [tplColumnsOpen, setTplColumnsOpen] = useState(false);

  // Template drawer & delete state
  const [tplDrawerOpen, setTplDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScheduleRecord | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<ScheduleRecord | null>(null);
  const [deleteTemplateError, setDeleteTemplateError] = useState<string | null>(null);

  // Individual schedule tab state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [empSearchFilter, setEmpSearchFilter] = useState("");
  const [asgnScheduleFilter, setAsgnScheduleFilter] = useState("");
  const [asgnStatusFilter, setAsgnStatusFilter] = useState<
    "all" | "current" | "history_or_upcoming"
  >("all");
  const [asgnEffectiveFrom, setAsgnEffectiveFrom] = useState("");
  const [asgnPage, setAsgnPage] = useState(1);
  const [asgnPageSize, setAsgnPageSize] = useState(20);
  const [asgnSorting, setAsgnSorting] = useState<SortingState>([
    { id: "effectiveFrom", desc: true },
  ]);
  const [asgnVisibility, setAsgnVisibility] = useState<ColumnVisibilityState>({
    employee: true,
    effectiveFrom: true,
    effectiveTo: true,
    assignmentStatus: true,
  });
  const [asgnFiltersOpen, setAsgnFiltersOpen] = useState(false);
  const [asgnColumnsOpen, setAsgnColumnsOpen] = useState(false);

  // Assignment drawer & delete state
  const [asgnDrawerOpen, setAsgnDrawerOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<EmployeeScheduleRecord | null>(null);
  const [asgnError, setAsgnError] = useState<string | null>(null);
  const [deleteAsgnTarget, setDeleteAsgnTarget] = useState<EmployeeScheduleRecord | null>(null);
  const [deleteAsgnError, setDeleteAsgnError] = useState<string | null>(null);

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTplError(null);
    setTplDrawerOpen(true);
  };

  const openBatchAssign = () => {
    setEditingAssignment(null);
    setAsgnError(null);
    setAsgnDrawerOpen(true);
  };

  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();
  registerCreateHandler(() =>
    activeTab === "templates" ? openCreateTemplate() : openBatchAssign(),
  );
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const policyOptionsQuery = useQuery({
    queryKey: ["attendance-policies", "options"],
    queryFn: api.getAttendancePolicyOptions,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "schedule-picker"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
  });

  const activeTemplatesQuery = useQuery({
    queryKey: ["schedules", "active-options"],
    queryFn: () => api.listSchedules({ status: "active", page: 1, pageSize: 100 }),
  });

  // Templates query
  const tplActiveSort = tplSorting[0];
  const tplSortBy =
    tplActiveSort?.id === "name" ||
    tplActiveSort?.id === "timezone" ||
    tplActiveSort?.id === "isActive"
      ? tplActiveSort.id
      : "createdAt";
  const tplSortDir: "asc" | "desc" = tplActiveSort?.desc ? "desc" : "asc";

  const templatesQuery = useQuery({
    queryKey: [
      "schedules",
      "list",
      {
        tplSearch: tplSearch.trim(),
        tplStatus,
        tplTimezone,
        tplCreatedFrom,
        tplCreatedTo,
        tplPage,
        tplPageSize,
        tplSortBy,
        tplSortDir,
      },
    ],
    queryFn: () =>
      api.listSchedules({
        search: tplSearch.trim() || undefined,
        status: tplStatus,
        timezone: tplTimezone || undefined,
        createdFrom: tplCreatedFrom || undefined,
        createdTo: tplCreatedTo || undefined,
        page: tplPage,
        pageSize: tplPageSize,
        sortBy: tplSortBy,
        sortDir: tplSortDir,
      }),
    placeholderData: keepPreviousData,
  });

  // Assignments query
  const asgnActiveSort = asgnSorting[0];
  const asgnSortBy =
    asgnActiveSort?.id === "effectiveTo" || asgnActiveSort?.id === "createdAt"
      ? asgnActiveSort.id
      : "effectiveFrom";
  const asgnSortDir: "asc" | "desc" = asgnActiveSort?.desc ? "desc" : "asc";

  const assignmentsQuery = useQuery({
    queryKey: [
      "schedules",
      "assignments",
      {
        selectedEmployeeId,
        asgnScheduleFilter,
        asgnStatusFilter,
        asgnEffectiveFrom,
        asgnPage,
        asgnPageSize,
        asgnSortBy,
        asgnSortDir,
      },
    ],
    queryFn: () =>
      api.listEmployeeSchedules({
        employeeId: selectedEmployeeId || undefined,
        scheduleId: asgnScheduleFilter ? Number(asgnScheduleFilter) : undefined,
        status: asgnStatusFilter,
        effectiveFrom: asgnEffectiveFrom || undefined,
        page: asgnPage,
        pageSize: asgnPageSize,
        sortBy: asgnSortBy,
        sortDir: asgnSortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const todayIso = getTodayIso();
  const weekEndIso = addDaysIso(todayIso, 6);

  const resolvedWeekQuery = useQuery({
    queryKey: ["schedules", "resolve", selectedEmployeeId, todayIso, weekEndIso],
    queryFn: () => api.resolveEmployeeSchedule(selectedEmployeeId, todayIso, weekEndIso),
    enabled: activeTab === "individual" && Boolean(selectedEmployeeId),
  });

  const invalidateSchedules = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["schedules"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-policies"] }),
    ]);
  };

  const createTemplateMutation = useMutation({
    mutationFn: (payload: CreateScheduleDto) => api.createSchedule(payload),
    onSuccess: async () => {
      setTplDrawerOpen(false);
      setTplError(null);
      await invalidateSchedules();
    },
    onError: (err: Error) => setTplError(err.message),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateScheduleDto }) =>
      api.updateSchedule(id, payload),
    onSuccess: async () => {
      setTplDrawerOpen(false);
      setTplError(null);
      await invalidateSchedules();
    },
    onError: (err: Error) => setTplError(err.message),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => api.deleteSchedule(id),
    onSuccess: async () => {
      setDeleteTemplateTarget(null);
      setDeleteTemplateError(null);
      await invalidateSchedules();
    },
    onError: (err: Error) => setDeleteTemplateError(err.message),
  });

  const batchAssignMutation = useMutation({
    mutationFn: (payload: BatchAssignScheduleDto) => api.batchAssignSchedule(payload),
    onSuccess: async () => {
      setAsgnDrawerOpen(false);
      setAsgnError(null);
      await invalidateSchedules();
    },
    onError: (err: Error) => setAsgnError(err.message),
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateEmployeeScheduleDto }) =>
      api.updateEmployeeSchedule(id, payload),
    onSuccess: async () => {
      setAsgnDrawerOpen(false);
      setAsgnError(null);
      await invalidateSchedules();
    },
    onError: (err: Error) => setAsgnError(err.message),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (id: number) => api.deleteEmployeeSchedule(id),
    onSuccess: async () => {
      setDeleteAsgnTarget(null);
      setDeleteAsgnError(null);
      await invalidateSchedules();
    },
    onError: (err: Error) => setDeleteAsgnError(err.message),
  });

  const templateColumns = useMemo<ServerColumnDef<ScheduleRecord>[]>(
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
                  setEditingTemplate(item);
                  setTplError(null);
                  setTplDrawerOpen(true);
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
                title={
                  item.isLocked
                    ? `Assigned to ${item.assignmentCount} record(s) — archive instead`
                    : "Delete template"
                }
                onClick={() => {
                  setDeleteTemplateTarget(item);
                  setDeleteTemplateError(null);
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
        header: "Schedule",
        enableSorting: true,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-foreground">{item.name}</span>
                {item.isLocked ? (
                  <Badge variant="amber" className="gap-1">
                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                    Locked ({item.assignmentCount})
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.timezone}</p>
            </div>
          );
        },
      },
      {
        id: "policy",
        header: "Attendance Policy",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.attendancePolicyName ? (
            <Badge variant="purple">{row.original.attendancePolicyName}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">System default</span>
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
        id: "workingDays",
        header: "Working Days",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-foreground">
            {row.original.workingDaysCount} {row.original.workingDaysCount === 1 ? "day" : "days"} /
            week
          </span>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {row.original.createdAt.slice(0, 10)}
          </span>
        ),
      },
    ],
    [],
  );

  const assignmentColumns = useMemo<ServerColumnDef<EmployeeScheduleRecord>[]>(
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
                disabled={item.isPast}
                aria-label={`Edit assignment for ${item.employeeName}`}
                title={item.isPast ? "Past assignments are immutable" : "Update end date"}
                onClick={() => {
                  setEditingAssignment(item);
                  setAsgnError(null);
                  setAsgnDrawerOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                aria-label={`Delete assignment for ${item.employeeName}`}
                title={
                  item.isFuture
                    ? "Delete future assignment"
                    : "Current/past assignments cannot be deleted"
                }
                onClick={() => {
                  setDeleteAsgnTarget(item);
                  setDeleteAsgnError(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
      {
        id: "employee",
        header: "Employee",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.employeeName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{row.original.employeeId}</p>
          </div>
        ),
      },
      {
        id: "scheduleName",
        accessorKey: "scheduleName",
        header: "Schedule",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.scheduleName}</p>
            <p className="text-[11px] text-muted-foreground">{row.original.scheduleTimezone}</p>
          </div>
        ),
      },
      {
        id: "effectiveFrom",
        accessorKey: "effectiveFrom",
        header: "Effective From",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-foreground">{row.original.effectiveFrom}</span>
        ),
      },
      {
        id: "effectiveTo",
        accessorKey: "effectiveTo",
        header: "Effective To",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {row.original.effectiveTo ?? "Ongoing"}
          </span>
        ),
      },
      {
        id: "assignmentStatus",
        header: "Assignment",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isCurrent ? (
            <Badge variant="emerald" dotColor="bg-emerald-500">
              Current
            </Badge>
          ) : row.original.isFuture ? (
            <Badge variant="blue" dotColor="bg-blue-500">
              Upcoming
            </Badge>
          ) : (
            <Badge variant="neutral">History</Badge>
          ),
      },
    ],
    [],
  );

  const employeesList = employeesQuery.data?.data ?? [];
  const filteredPickerEmployees = useMemo(() => {
    const term = empSearchFilter.trim().toLowerCase();
    if (!term) return employeesList;
    return employeesList.filter(
      (e) =>
        e.employeeId.toLowerCase().includes(term) ||
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(term),
    );
  }, [employeesList, empSearchFilter]);

  const currentEmployeeAssignment = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return (assignmentsQuery.data?.data ?? []).find((a) => a.isCurrent) ?? null;
  }, [selectedEmployeeId, assignmentsQuery.data?.data]);

  const tplRows = templatesQuery.data?.data ?? [];
  const tplMeta = templatesQuery.data?.meta ?? {
    total: 0,
    page: tplPage,
    pageSize: tplPageSize,
    totalPages: 1,
  };

  const asgnRows = assignmentsQuery.data?.data ?? [];
  const asgnMeta = assignmentsQuery.data?.meta ?? {
    total: 0,
    page: asgnPage,
    pageSize: asgnPageSize,
    totalPages: 1,
  };

  const tplFilterCount =
    (tplStatus !== "all" ? 1 : 0) +
    (tplTimezone ? 1 : 0) +
    (tplCreatedFrom ? 1 : 0) +
    (tplCreatedTo ? 1 : 0);

  const asgnFilterCount =
    (asgnScheduleFilter ? 1 : 0) +
    (asgnStatusFilter !== "all" ? 1 : 0) +
    (asgnEffectiveFrom ? 1 : 0);

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Schedule Management
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Define reusable 7-day shift templates and manage non-overlapping employee schedule
            assignments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openBatchAssign}>
            <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Assign Schedule
          </Button>
          <Button type="button" size="sm" onClick={openCreateTemplate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            New Schedule
          </Button>
        </div>
      </div>

      {/* Segmented Tabs */}
      <div>
        <TabsList aria-label="Schedule workspace views">
          <TabsTrigger active={activeTab === "templates"} onClick={() => setActiveTab("templates")}>
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Schedules</span>
            <Badge variant="neutral" className="ml-0.5 px-1.5 py-0 text-[10px]">
              {tplMeta.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            active={activeTab === "individual"}
            onClick={() => setActiveTab("individual")}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Individual Schedule</span>
          </TabsTrigger>
        </TabsList>
      </div>

      {activeTab === "templates" ? (
        <>
          <ConfirmDialog
            open={deleteTemplateTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteTemplateTarget(null);
                setDeleteTemplateError(null);
              }
            }}
            title={`Delete "${deleteTemplateTarget?.name ?? "schedule"}"?`}
            description="This permanently deletes this unassigned schedule template and its shift slots."
            errorMessage={
              deleteTemplateError ??
              (deleteTemplateTarget?.isLocked
                ? `Assigned to ${deleteTemplateTarget.assignmentCount} employee record(s). Archive it by setting Active = off instead.`
                : null)
            }
            isPending={deleteTemplateMutation.isPending}
            onConfirm={() => {
              if (deleteTemplateTarget) {
                deleteTemplateMutation.mutate(deleteTemplateTarget.id);
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
                value={tplSearch}
                onChange={(e) => {
                  setTplSearch(e.target.value);
                  setTplPage(1);
                }}
                placeholder="Search schedule name or timezone..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Popover
              open={tplFiltersOpen}
              onOpenChange={setTplFiltersOpen}
              className="w-72 p-3"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setTplFiltersOpen((o) => !o)}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filter</span>
                  {tplFilterCount > 0 ? (
                    <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {tplFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <PopoverLabel className="p-0">Template Filters</PopoverLabel>
                  {tplFilterCount > 0 ? (
                    <button
                      type="button"
                      className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                      onClick={() => {
                        setTplStatus("all");
                        setTplTimezone("");
                        setTplCreatedFrom("");
                        setTplCreatedTo("");
                        setTplPage(1);
                      }}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="tpl-flt-status"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Status
                  </label>
                  <SelectMenu
                    id="tpl-flt-status"
                    className="h-8 text-xs"
                    value={tplStatus}
                    onValueChange={(val) => {
                      setTplStatus(val as "all" | "active" | "inactive");
                      setTplPage(1);
                    }}
                    options={[
                      { value: "all", label: "All statuses" },
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive / Archived" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="tpl-flt-tz"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Timezone
                  </label>
                  <SelectMenu
                    id="tpl-flt-tz"
                    className="h-8 text-xs"
                    value={tplTimezone}
                    onValueChange={(val) => {
                      setTplTimezone(val);
                      setTplPage(1);
                    }}
                    options={[
                      { value: "", label: "All timezones" },
                      ...COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz })),
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="tpl-flt-from"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Created From
                    </label>
                    <DatePicker
                      id="tpl-flt-from"
                      className="h-8 text-xs"
                      placeholder="Start date"
                      value={tplCreatedFrom}
                      onChange={(val) => {
                        setTplCreatedFrom(val);
                        setTplPage(1);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="tpl-flt-to"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Created To
                    </label>
                    <DatePicker
                      id="tpl-flt-to"
                      className="h-8 text-xs"
                      placeholder="End date"
                      value={tplCreatedTo}
                      onChange={(val) => {
                        setTplCreatedTo(val);
                        setTplPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </Popover>

            <ColumnVisibilityPopover
              open={tplColumnsOpen}
              onOpenChange={setTplColumnsOpen}
              options={TEMPLATE_COLUMN_OPTIONS}
              columnVisibility={tplVisibility}
              onToggle={(id) => setTplVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))}
              onReset={() =>
                setTplVisibility({ policy: true, status: true, workingDays: true, createdAt: true })
              }
            />
          </div>

          {templatesQuery.isError ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
            >
              <span>{templatesQuery.error?.message ?? "Failed to load schedule templates."}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => templatesQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          <ServerDataTable
            data={tplRows}
            columns={templateColumns}
            meta={tplMeta}
            sorting={tplSorting}
            onSortingChange={(updater) => {
              setTplSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
              setTplPage(1);
            }}
            columnVisibility={tplVisibility}
            onColumnVisibilityChange={setTplVisibility}
            onPageChange={setTplPage}
            onPageSizeChange={(next) => {
              setTplPageSize(next);
              setTplPage(1);
            }}
            isPending={templatesQuery.isPending}
            isFetching={templatesQuery.isFetching}
            emptyState={
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No schedule templates yet</p>
                <p className="text-xs text-muted-foreground">
                  Create a 7-day weekly template to start assigning employee work schedules.
                </p>
              </div>
            }
          />
        </>
      ) : (
        <div className="space-y-4">
          {/* Employee Picker & Current Banner */}
          <div className="grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              <label htmlFor="ind-emp-select" className="text-xs font-medium text-foreground">
                Employee Filter
              </label>
              <Input
                ref={searchInputRef}
                value={empSearchFilter}
                onChange={(e) => setEmpSearchFilter(e.target.value)}
                placeholder="Filter employee list..."
                className="h-8 text-xs"
              />
              <SelectMenu
                id="ind-emp-select"
                className="h-8 text-xs"
                value={selectedEmployeeId}
                onValueChange={(val) => {
                  setSelectedEmployeeId(val);
                  setAsgnPage(1);
                }}
                options={[
                  { value: "", label: "Everyone (company-wide)" },
                  ...filteredPickerEmployees.map((emp) => ({
                    value: emp.employeeId,
                    label: `${emp.firstName} ${emp.lastName} (${emp.employeeId})`,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-md border border-border/70 bg-muted/20 p-3.5">
              {selectedEmployeeId ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Active Schedule for {selectedEmployeeId}
                      </p>
                      {currentEmployeeAssignment ? (
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {currentEmployeeAssignment.scheduleName}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({currentEmployeeAssignment.effectiveFrom} →{" "}
                            {currentEmployeeAssignment.effectiveTo ?? "Ongoing"})
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          No active schedule assignment today.
                        </p>
                      )}
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={openBatchAssign}>
                      <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Assign Schedule
                    </Button>
                  </div>

                  {/* 7-day resolved preview */}
                  {resolvedWeekQuery.data ? (
                    <div className="grid grid-cols-7 gap-1.5 pt-1">
                      {resolvedWeekQuery.data.days.map((d) => (
                        <div
                          key={d.date}
                          className={`rounded border px-2 py-1.5 text-[10px] ${
                            d.status === "working"
                              ? "border-primary/25 bg-background"
                              : d.status === "rest_day"
                                ? "border-amber-500/25 bg-amber-500/10"
                                : "border-border bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold text-foreground">
                            <span>{d.codeDay}</span>
                            <span className="font-normal text-muted-foreground">
                              {d.date.slice(5)}
                            </span>
                          </div>
                          {d.status === "working" ? (
                            <div className="mt-1 space-y-0.5">
                              {d.slots.map((s) => (
                                <p
                                  key={`${d.date}-${s.startTime}`}
                                  className="flex items-center gap-0.5 tabular-nums text-foreground"
                                >
                                  <span>
                                    {toHHMM(s.startTime)}–{toHHMM(s.endTime)}
                                  </span>
                                  {s.isOvernight ? (
                                    <Moon
                                      className="h-2.5 w-2.5 text-violet-500"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                </p>
                              ))}
                              <p className="text-muted-foreground">
                                {formatMinutesLabel(d.totalScheduledMinutes)}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-1 text-muted-foreground">
                              {d.status === "rest_day" ? "Rest Day" : "Unassigned"}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Select an employee to inspect their current schedule and 7-day resolved shifts
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Or review and manage all employee schedule assignments below.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={openBatchAssign}>
                    <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Batch Assign
                  </Button>
                </div>
              )}
            </div>
          </div>

          <ConfirmDialog
            open={deleteAsgnTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteAsgnTarget(null);
                setDeleteAsgnError(null);
              }
            }}
            title={`Delete assignment for ${deleteAsgnTarget?.employeeName ?? "employee"}?`}
            description="This removes the upcoming assignment before it takes effect."
            errorMessage={
              deleteAsgnError ??
              (deleteAsgnTarget && !deleteAsgnTarget.isFuture
                ? "Only future-dated assignments can be deleted. End current assignments by setting an Effective To date."
                : null)
            }
            isPending={deleteAssignmentMutation.isPending}
            onConfirm={() => {
              if (deleteAsgnTarget) {
                deleteAssignmentMutation.mutate(deleteAsgnTarget.id);
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Popover
              open={asgnFiltersOpen}
              onOpenChange={setAsgnFiltersOpen}
              className="w-72 p-3"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setAsgnFiltersOpen((o) => !o)}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filter Assignments</span>
                  {asgnFilterCount > 0 ? (
                    <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {asgnFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <PopoverLabel className="p-0">Assignment Filters</PopoverLabel>
                  {asgnFilterCount > 0 ? (
                    <button
                      type="button"
                      className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                      onClick={() => {
                        setAsgnScheduleFilter("");
                        setAsgnStatusFilter("all");
                        setAsgnEffectiveFrom("");
                        setAsgnPage(1);
                      }}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="asgn-flt-sched"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Schedule Template
                  </label>
                  <SelectMenu
                    id="asgn-flt-sched"
                    className="h-8 text-xs"
                    value={asgnScheduleFilter}
                    onValueChange={(val) => {
                      setAsgnScheduleFilter(val);
                      setAsgnPage(1);
                    }}
                    options={[
                      { value: "", label: "All templates" },
                      ...tplRows.map((s) => ({ value: String(s.id), label: s.name })),
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="asgn-flt-status"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Assignment Status
                  </label>
                  <SelectMenu
                    id="asgn-flt-status"
                    className="h-8 text-xs"
                    value={asgnStatusFilter}
                    onValueChange={(val) => {
                      setAsgnStatusFilter(val as "all" | "current" | "history_or_upcoming");
                      setAsgnPage(1);
                    }}
                    options={[
                      { value: "all", label: "All" },
                      { value: "current", label: "Current" },
                      { value: "history_or_upcoming", label: "History / Upcoming" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="asgn-flt-from"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Effective From
                  </label>
                  <DatePicker
                    id="asgn-flt-from"
                    className="h-8 text-xs"
                    placeholder="Start date"
                    value={asgnEffectiveFrom}
                    onChange={(val) => {
                      setAsgnEffectiveFrom(val);
                      setAsgnPage(1);
                    }}
                  />
                </div>
              </div>
            </Popover>

            <ColumnVisibilityPopover
              open={asgnColumnsOpen}
              onOpenChange={setAsgnColumnsOpen}
              options={ASSIGNMENT_COLUMN_OPTIONS}
              columnVisibility={asgnVisibility}
              onToggle={(id) =>
                setAsgnVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))
              }
              onReset={() =>
                setAsgnVisibility({
                  employee: true,
                  effectiveFrom: true,
                  effectiveTo: true,
                  assignmentStatus: true,
                })
              }
            />
          </div>

          {assignmentsQuery.isError ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
            >
              <span>{assignmentsQuery.error?.message ?? "Failed to load assignments."}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => assignmentsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          <ServerDataTable
            data={asgnRows}
            columns={assignmentColumns}
            meta={asgnMeta}
            sorting={asgnSorting}
            onSortingChange={(updater) => {
              setAsgnSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
              setAsgnPage(1);
            }}
            columnVisibility={asgnVisibility}
            onColumnVisibilityChange={setAsgnVisibility}
            onPageChange={setAsgnPage}
            onPageSizeChange={(next) => {
              setAsgnPageSize(next);
              setAsgnPage(1);
            }}
            isPending={assignmentsQuery.isPending}
            isFetching={assignmentsQuery.isFetching}
            emptyState={
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No schedule assignments found</p>
                <p className="text-xs text-muted-foreground">
                  Assign an active schedule template to one or more employees to begin tracking.
                </p>
              </div>
            }
          />
        </div>
      )}

      <ScheduleTemplateDrawer
        key={`tpl-${editingTemplate?.id ?? "new"}-${tplDrawerOpen ? "open" : "closed"}`}
        open={tplDrawerOpen}
        onOpenChange={setTplDrawerOpen}
        schedule={editingTemplate}
        policyOptions={policyOptionsQuery.data}
        isPending={createTemplateMutation.isPending || updateTemplateMutation.isPending}
        serverError={tplError}
        onCreate={(payload) => createTemplateMutation.mutate(payload)}
        onUpdate={(id, payload) => updateTemplateMutation.mutate({ id, payload })}
      />

      <ScheduleAssignmentDrawer
        key={`asgn-${editingAssignment?.id ?? "new"}-${selectedEmployeeId}-${asgnDrawerOpen ? "open" : "closed"}`}
        open={asgnDrawerOpen}
        onOpenChange={setAsgnDrawerOpen}
        editingAssignment={editingAssignment}
        defaultEmployeeId={selectedEmployeeId || null}
        activeSchedules={activeTemplatesQuery.data?.data ?? []}
        employees={employeesList}
        isPending={batchAssignMutation.isPending || updateAssignmentMutation.isPending}
        serverError={asgnError}
        onBatchAssign={(payload) => batchAssignMutation.mutate(payload)}
        onUpdateAssignment={(id, payload) => updateAssignmentMutation.mutate({ id, payload })}
      />
    </div>
  );
}
