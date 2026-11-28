import type { AttendanceLogRecord, CutOffScheduleType, DtrRowStatus } from "@starter/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import {
  CalendarCheck,
  Clock,
  Filter,
  Loader2,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Search,
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverLabel } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import {
  formatDateLabel,
  formatHoursDecimal,
  formatLogSource,
  formatSecondsCompact,
  formatTime12h,
  formatTimestamp,
  getDefaultMonthRange,
  getDtrStatusVariant,
  getLogSourceVariant,
} from "./attendance-utils";
import { LogEntryDrawer } from "./log-entry-drawer";

type MainTab = "dtr" | "logs";
type DtrStatusFilter = "all" | DtrRowStatus;

const LOG_COLUMN_OPTIONS = [
  { id: "employee", label: "Employee" },
  { id: "source", label: "Source" },
  { id: "device", label: "Device" },
  { id: "createdAt", label: "Uploaded / Recorded" },
];

const DEFAULT_LOG_VISIBILITY: ColumnVisibilityState = {
  employee: true,
  source: true,
  device: true,
  createdAt: true,
};

export function AttendancePage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const defaultRange = useMemo(getDefaultMonthRange, []);
  const [activeTab, setActiveTab] = useState<MainTab>("dtr");

  // DTR tab state
  const [cutOffType, setCutOffType] = useState<"all" | CutOffScheduleType>("all");
  const [selectedPresetKey, setSelectedPresetKey] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [dtrStatusFilter, setDtrStatusFilter] = useState<DtrStatusFilter>("all");
  const [dtrSearch, setDtrSearch] = useState("");

  // Raw logs tab state
  const [logSearch, setLogSearch] = useState("");
  const [logSourceFilter, setLogSourceFilter] = useState<
    "all" | "biometric" | "manual" | "excel_import" | "correction"
  >("all");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(20);
  const [logSorting, setLogSorting] = useState<SortingState>([{ id: "loggedAt", desc: true }]);
  const [logVisibility, setLogVisibility] = useState<ColumnVisibilityState>(DEFAULT_LOG_VISIBILITY);
  const [logFilterOpen, setLogFilterOpen] = useState(false);
  const [logColumnsOpen, setLogColumnsOpen] = useState(false);

  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);

  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();
  registerCreateHandler(() => setEntryDrawerOpen(true));
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const employeesQuery = useQuery({
    queryKey: ["employees", "attendance-picker"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
  });

  const employees = employeesQuery.data?.data ?? [];
  const effectiveEmployeeId = selectedEmployeeId || employees[0]?.employeeId || "";

  const presetsQuery = useQuery({
    queryKey: ["cut-offs", "presets", cutOffType],
    queryFn: () => api.getCutOffPresets(cutOffType === "all" ? undefined : cutOffType),
  });

  const presets = presetsQuery.data ?? [];

  const dtrQuery = useQuery({
    queryKey: ["attendance", "dtr", effectiveEmployeeId, fromDate, toDate],
    queryFn: () =>
      api.getDtr({
        employeeId: effectiveEmployeeId,
        from: fromDate,
        to: toDate,
      }),
    enabled: Boolean(effectiveEmployeeId && fromDate && toDate && toDate >= fromDate),
  });

  const logActiveSort = logSorting[0];
  const logSortBy =
    logActiveSort?.id === "createdAt" ||
    logActiveSort?.id === "employeeId" ||
    logActiveSort?.id === "source"
      ? logActiveSort.id
      : "loggedAt";
  const logSortDir: "asc" | "desc" = logActiveSort?.desc ? "desc" : "asc";

  const logsQuery = useQuery({
    queryKey: [
      "attendance",
      "logs",
      {
        logSearch: logSearch.trim(),
        logSourceFilter,
        logDateFrom,
        logDateTo,
        logPage,
        logPageSize,
        logSortBy,
        logSortDir,
      },
    ],
    queryFn: () =>
      api.listAttendanceLogs({
        search: logSearch.trim() || undefined,
        source: logSourceFilter,
        dateFrom: logDateFrom || undefined,
        dateTo: logDateTo || undefined,
        page: logPage,
        pageSize: logPageSize,
        sortBy: logSortBy,
        sortDir: logSortDir,
      }),
    placeholderData: keepPreviousData,
    enabled: activeTab === "logs",
  });

  const filteredDtrRows = useMemo(() => {
    const allRows = dtrQuery.data?.rows ?? [];
    const term = dtrSearch.trim().toLowerCase();
    return allRows.filter((row) => {
      if (dtrStatusFilter !== "all" && row.status !== dtrStatusFilter) {
        return false;
      }
      if (!term) return true;
      return (
        row.date.toLowerCase().includes(term) ||
        row.remarks.toLowerCase().includes(term) ||
        (row.scheduleName ?? "").toLowerCase().includes(term)
      );
    });
  }, [dtrQuery.data?.rows, dtrStatusFilter, dtrSearch]);

  const logColumns = useMemo<ServerColumnDef<AttendanceLogRecord>[]>(
    () => [
      {
        id: "loggedAt",
        accessorKey: "loggedAt",
        header: "Logged At",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs font-medium text-foreground">
            {formatTimestamp(row.original.loggedAt)}
          </span>
        ),
      },
      {
        id: "employee",
        accessorKey: "employeeId",
        header: "Employee",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.employeeName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{row.original.employeeId}</p>
          </div>
        ),
      },
      {
        id: "source",
        accessorKey: "source",
        header: "Source",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={getLogSourceVariant(row.original.source)}>
            {formatLogSource(row.original.source)}
          </Badge>
        ),
      },
      {
        id: "device",
        header: "Device",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.deviceId ?? "—"}
          </span>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Uploaded / Recorded",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground">
            <span className="tabular-nums">{formatTimestamp(row.original.createdAt)}</span>
            {row.original.createdByName ? (
              <span className="block text-[10px]">by {row.original.createdByName}</span>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  const summary = dtrQuery.data?.summary ?? {
    totalRenderedSeconds: 0,
    totalScheduledSeconds: 0,
    presentDays: 0,
    absentDays: 0,
    totalTardySeconds: 0,
    totalUndertimeSeconds: 0,
  };

  const logRows = logsQuery.data?.data ?? [];
  const logMeta = logsQuery.data?.meta ?? {
    total: 0,
    page: logPage,
    pageSize: logPageSize,
    totalPages: 1,
  };
  const logFilterCount =
    (logSourceFilter !== "all" ? 1 : 0) + (logDateFrom ? 1 : 0) + (logDateTo ? 1 : 0);

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Attendance &amp; Logs
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily Time Record (DTR) evaluation, manual time entry, and bulk attendance log imports.
          </p>
        </div>

        <Button type="button" size="sm" onClick={() => setEntryDrawerOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Add / Import Logs
        </Button>
      </div>

      {/* Top Segmented Tabs */}
      <div>
        <TabsList aria-label="Attendance views">
          <TabsTrigger active={activeTab === "dtr"} onClick={() => setActiveTab("dtr")}>
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Attendance (DTR)</span>
          </TabsTrigger>
          <TabsTrigger active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Manage In/Out</span>
          </TabsTrigger>
        </TabsList>
      </div>

      {activeTab === "dtr" ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList aria-label="Cut-off cadence filter">
                <TabsTrigger
                  active={cutOffType === "all"}
                  onClick={() => {
                    setCutOffType("all");
                    setSelectedPresetKey("");
                  }}
                >
                  All types
                </TabsTrigger>
                <TabsTrigger
                  active={cutOffType === "monthly"}
                  onClick={() => {
                    setCutOffType("monthly");
                    setSelectedPresetKey("");
                  }}
                >
                  Monthly
                </TabsTrigger>
                <TabsTrigger
                  active={cutOffType === "semi_monthly"}
                  onClick={() => {
                    setCutOffType("semi_monthly");
                    setSelectedPresetKey("");
                  }}
                >
                  Semi-monthly
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => dtrQuery.refetch()}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Refresh</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Print DTR</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor="dtr-emp" className="text-[11px] font-medium text-muted-foreground">
                  Employee
                </label>
                <SelectMenu
                  id="dtr-emp"
                  placeholder="Select employee..."
                  value={effectiveEmployeeId}
                  onValueChange={setSelectedEmployeeId}
                  options={employees.map((e) => ({
                    value: e.employeeId,
                    label: `${e.firstName} ${e.lastName} (${e.employeeId})`,
                  }))}
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="dtr-preset"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Cut-Off Preset
                </label>
                <SelectMenu
                  id="dtr-preset"
                  placeholder="Apply cut-off preset..."
                  value={selectedPresetKey}
                  onValueChange={(val) => {
                    setSelectedPresetKey(val);
                    const matched = presets.find((p) => String(p.periodId) === val);
                    if (matched) {
                      setFromDate(matched.presetDateFrom);
                      setToDate(matched.presetDateTo);
                    }
                  }}
                  options={[
                    { value: "", label: "Custom date range" },
                    ...presets.map((p) => ({
                      value: String(p.periodId),
                      label: `${p.cutOffName} — #${p.cutOffNo} (${p.presetDateFrom} → ${p.presetDateTo})`,
                    })),
                  ]}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="dtr-from" className="text-[11px] font-medium text-muted-foreground">
                  From Date
                </label>
                <DatePicker
                  id="dtr-from"
                  allowClear={false}
                  value={fromDate}
                  onChange={(val) => {
                    setSelectedPresetKey("");
                    setFromDate(val);
                  }}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="dtr-to" className="text-[11px] font-medium text-muted-foreground">
                  To Date
                </label>
                <DatePicker
                  id="dtr-to"
                  allowClear={false}
                  value={toDate}
                  onChange={(val) => {
                    setSelectedPresetKey("");
                    setToDate(val);
                  }}
                />
              </div>
            </div>
          </div>

          {/* 5 KPI Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-medium text-muted-foreground">Rendered Hours</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatHoursDecimal(summary.totalRenderedSeconds)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                of {formatHoursDecimal(summary.totalScheduledSeconds)} scheduled
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-medium text-muted-foreground">Present Days</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {summary.presentDays}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">With rendered shift time</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-medium text-muted-foreground">Absent Days</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                {summary.absentDays}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Full-day absences</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-medium text-muted-foreground">Total Tardy</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {formatSecondsCompact(summary.totalTardySeconds)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">After policy grace</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-medium text-muted-foreground">Total Undertime</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {formatSecondsCompact(summary.totalUndertimeSeconds)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Shortfall + absences</p>
            </div>
          </div>

          {/* DTR Toolbar & Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Daily Time Record</h2>
                  <Badge variant="neutral">{filteredDtrRows.length} rows</Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {dtrQuery.data
                    ? `${dtrQuery.data.employeeName} (${dtrQuery.data.employeeId}) · ${fromDate} to ${toDate}`
                    : "Select an employee and date range to compute DTR"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <TabsList aria-label="DTR status filter">
                  {(
                    [
                      { id: "all", label: "All Logs" },
                      { id: "present", label: "Present" },
                      { id: "absent", label: "Absent" },
                      { id: "late_or_undertime", label: "Late / Undertime" },
                      { id: "rest_day", label: "Rest Day" },
                    ] as const
                  ).map((pill) => (
                    <TabsTrigger
                      key={pill.id}
                      active={dtrStatusFilter === pill.id}
                      onClick={() => setDtrStatusFilter(pill.id)}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      {pill.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="relative w-48">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={searchInputRef}
                    value={dtrSearch}
                    onChange={(e) => setDtrSearch(e.target.value)}
                    placeholder="Filter dates or remarks..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {dtrQuery.isPending && effectiveEmployeeId ? (
              <div className="flex items-center justify-center gap-2 py-14 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Computing Daily Time Record...</span>
              </div>
            ) : dtrQuery.isError ? (
              <div role="alert" className="p-6 text-center text-xs text-destructive">
                {dtrQuery.error.message}
              </div>
            ) : filteredDtrRows.length === 0 ? (
              <div className="py-14 text-center text-xs text-muted-foreground">
                {effectiveEmployeeId
                  ? "No DTR rows match the current status filter."
                  : "Onboard an employee first to evaluate attendance records."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Scheduled Shift</TableHead>
                      <TableHead>Time In</TableHead>
                      <TableHead>Time Out</TableHead>
                      <TableHead>Rendered</TableHead>
                      <TableHead>Late</TableHead>
                      <TableHead>Undertime</TableHead>
                      <TableHead>Status / Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDtrRows.map((row) => (
                      <TableRow key={`${row.date}-${row.slotIndex}`}>
                        <TableCell className="whitespace-nowrap text-xs font-medium text-foreground">
                          {formatDateLabel(row.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {row.schedStart && row.schedEnd ? (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <span>
                                {formatTime12h(row.schedStart)} – {formatTime12h(row.schedEnd)}
                              </span>
                              {row.isOvernight ? (
                                <Moon className="h-3 w-3 text-purple-500" aria-hidden="true" />
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs text-foreground">
                          {formatTime12h(row.timeIn)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs text-foreground">
                          {formatTime12h(row.timeOut)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs font-medium text-foreground">
                          {formatSecondsCompact(row.renderedSeconds)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs text-amber-600 dark:text-amber-400">
                          {row.tardySeconds > 0 ? formatSecondsCompact(row.tardySeconds) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs text-amber-600 dark:text-amber-400">
                          {row.undertimeSeconds > 0
                            ? formatSecondsCompact(row.undertimeSeconds)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getDtrStatusVariant(row.status)}>{row.remarks}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={4} className="text-xs text-foreground">
                        Totals ({filteredDtrRows.length} rows)
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-foreground">
                        {formatSecondsCompact(summary.totalRenderedSeconds)}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-amber-700 dark:text-amber-300">
                        {formatSecondsCompact(summary.totalTardySeconds)}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-amber-700 dark:text-amber-300">
                        {formatSecondsCompact(summary.totalUndertimeSeconds)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {summary.presentDays}P / {summary.absentDays}A
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchInputRef}
                value={logSearch}
                onChange={(e) => {
                  setLogSearch(e.target.value);
                  setLogPage(1);
                }}
                placeholder="Search employee ID, name, device..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Popover
              open={logFilterOpen}
              onOpenChange={setLogFilterOpen}
              className="w-72 p-3"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setLogFilterOpen((o) => !o)}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Filter</span>
                  {logFilterCount > 0 ? (
                    <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                      {logFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <PopoverLabel className="p-0">Raw Log Filters</PopoverLabel>
                  {logFilterCount > 0 ? (
                    <button
                      type="button"
                      className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                      onClick={() => {
                        setLogSourceFilter("all");
                        setLogDateFrom("");
                        setLogDateTo("");
                        setLogPage(1);
                      }}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="log-flt-source"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Source
                  </label>
                  <SelectMenu
                    id="log-flt-source"
                    className="h-8 text-xs"
                    value={logSourceFilter}
                    onValueChange={(val) => {
                      setLogSourceFilter(
                        val as "all" | "biometric" | "manual" | "excel_import" | "correction",
                      );
                      setLogPage(1);
                    }}
                    options={[
                      { value: "all", label: "All sources" },
                      { value: "biometric", label: "Biometric" },
                      { value: "manual", label: "Manual" },
                      { value: "excel_import", label: "Excel import" },
                      { value: "correction", label: "Correction" },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="log-flt-from"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Log From
                    </label>
                    <DatePicker
                      id="log-flt-from"
                      className="h-8 text-xs"
                      placeholder="Start"
                      value={logDateFrom}
                      onChange={(val) => {
                        setLogDateFrom(val);
                        setLogPage(1);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="log-flt-to"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Log To
                    </label>
                    <DatePicker
                      id="log-flt-to"
                      className="h-8 text-xs"
                      placeholder="End"
                      value={logDateTo}
                      onChange={(val) => {
                        setLogDateTo(val);
                        setLogPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </Popover>

            <ColumnVisibilityPopover
              open={logColumnsOpen}
              onOpenChange={setLogColumnsOpen}
              options={LOG_COLUMN_OPTIONS}
              columnVisibility={logVisibility}
              onToggle={(id) => setLogVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))}
              onReset={() => setLogVisibility(DEFAULT_LOG_VISIBILITY)}
            />
          </div>

          <ServerDataTable
            data={logRows}
            columns={logColumns}
            meta={logMeta}
            sorting={logSorting}
            onSortingChange={(updater) => {
              setLogSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
              setLogPage(1);
            }}
            columnVisibility={logVisibility}
            onColumnVisibilityChange={setLogVisibility}
            onPageChange={setLogPage}
            onPageSizeChange={(next) => {
              setLogPageSize(next);
              setLogPage(1);
            }}
            isPending={logsQuery.isPending}
            isFetching={logsQuery.isFetching}
            emptyState={
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No attendance logs yet</p>
                <p className="text-xs text-muted-foreground">
                  Record manual punches or upload an attendance spreadsheet to populate raw logs.
                </p>
              </div>
            }
          />
        </div>
      )}

      <LogEntryDrawer
        key={`log-drawer-${effectiveEmployeeId}-${entryDrawerOpen ? "open" : "closed"}`}
        open={entryDrawerOpen}
        onOpenChange={setEntryDrawerOpen}
        employees={employees}
        defaultEmployeeId={effectiveEmployeeId}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["attendance"] });
        }}
      />
    </div>
  );
}
