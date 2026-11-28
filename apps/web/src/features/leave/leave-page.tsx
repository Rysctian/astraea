import type { ApprovalStatus, LeaveApplicationRecord } from "@starter/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import {
  Ban,
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  Filter,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import {
  ColumnVisibilityPopover,
  type ServerColumnDef,
  ServerDataTable,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverLabel } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { formatShortTimestamp, getInitials } from "../approver-setup/approver-setup-utils";
import { APPROVAL_STATUS_META, formatDateShort } from "../overtime/overtime-utils";
import { LeaveApplyDrawer } from "./leave-apply-drawer";
import { LeaveDetailDrawer } from "./leave-detail-drawer";
import { LeavePoliciesTab } from "./leave-policies-tab";
import { LeaveSetupTab } from "./leave-setup-tab";
import { formatDays } from "./leave-utils";

export type LeaveMainTab = "applications" | "setup" | "policies";
type StatusFilter = "all" | ApprovalStatus;

interface DecisionDialogState {
  mode: "approve" | "disapprove" | "cancel";
  ids: number[];
  title: string;
  description: string;
}

const COLUMN_OPTIONS = [
  { id: "leaveType", label: "Leave Type" },
  { id: "dateFrom", label: "Leave Period" },
  { id: "totalDays", label: "Days" },
  { id: "status", label: "Status" },
  { id: "submittedAt", label: "Submitted" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  leaveType: true,
  dateFrom: true,
  totalDays: true,
  status: true,
  submittedAt: true,
};

export function LeavePage({ initialTab = "applications" }: { initialTab?: LeaveMainTab }) {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<LeaveMainTab>(initialTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "submittedAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [detailApp, setDetailApp] = useState<LeaveApplicationRecord | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialogState | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  const accessQuery = useQuery({
    queryKey: ["rbac", "me"],
    queryFn: api.getMyAccess,
  });

  const roleCode = accessQuery.data?.role?.code ?? null;
  const permissions = accessQuery.data?.permissions ?? {};
  const isAdmin =
    roleCode === "admin" ||
    Boolean(permissions.user_management?.canView) ||
    Boolean(permissions.approver_setup?.canView) ||
    Boolean(permissions.leave_applications?.canDelete);
  const canCreate =
    roleCode === "admin" ||
    Boolean(permissions.leave_applications?.canCreate) ||
    accessQuery.isPending;
  const canOpenApproverSetup = roleCode === "admin" || Boolean(permissions.approver_setup?.canView);

  const effectiveTab: LeaveMainTab =
    !isAdmin && activeTab !== "applications" ? "applications" : activeTab;

  const openApplyDrawer = () => {
    if (!canCreate) return;
    setApplyOpen(true);
  };

  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();
  registerCreateHandler(openApplyDrawer);
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const optionsQuery = useQuery({
    queryKey: ["leave", "options"],
    queryFn: api.getLeaveFilingOptions,
  });

  const myCreditsQuery = useQuery({
    queryKey: ["leave", "my-credits", new Date().getFullYear()],
    queryFn: () => api.getMyLeaveCredits(new Date().getFullYear()),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "leave-picker"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
    enabled: isAdmin,
  });

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "employeeName" ||
    activeSort?.id === "dateFrom" ||
    activeSort?.id === "totalDays" ||
    activeSort?.id === "status"
      ? activeSort.id
      : "submittedAt";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const listQuery = useQuery({
    queryKey: [
      "leave",
      "applications",
      {
        search: search.trim(),
        statusFilter,
        leaveTypeFilter,
        dateFrom,
        dateTo,
        page,
        pageSize,
        sortBy,
        sortDir,
      },
    ],
    queryFn: () =>
      api.listLeaveApplications({
        search: search.trim() || undefined,
        status: statusFilter,
        leaveTypeId: leaveTypeFilter ? Number(leaveTypeFilter) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
    enabled: effectiveTab === "applications",
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { total: 0, page, pageSize, totalPages: 1 };
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const activeSelectedRows = useMemo(
    () =>
      selectedIds
        .map((id) => rowsById.get(id))
        .filter(
          (r): r is LeaveApplicationRecord => r !== undefined && (r.canApprove || r.canDisapprove),
        ),
    [selectedIds, rowsById],
  );

  const actionableRows = useMemo(() => rows.filter((r) => r.canApprove || r.canDisapprove), [rows]);

  const allActionableSelected =
    actionableRows.length > 0 && actionableRows.every((r) => selectedIds.includes(r.id));

  const canBatchApprove =
    activeSelectedRows.length > 0 && activeSelectedRows.every((r) => r.canApprove);
  const canBatchDisapprove =
    activeSelectedRows.length > 0 && activeSelectedRows.every((r) => r.canDisapprove);

  const toggleRowSelection = useCallback((id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const toggleAllActionable = useCallback(() => {
    if (allActionableSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(actionableRows.map((r) => r.id));
    }
  }, [allActionableSelected, actionableRows]);

  const runDecisionBatch = async () => {
    if (!decisionDialog) return;
    setDecisionBusy(true);
    const cleaned = decisionRemarks.trim() || undefined;
    const { mode, ids } = decisionDialog;

    const settled = await Promise.allSettled(
      ids.map((id) => {
        if (mode === "approve") return api.approveLeaveApplication(id, { remarks: cleaned });
        if (mode === "disapprove") return api.disapproveLeaveApplication(id, { remarks: cleaned });
        return api.cancelLeaveApplication(id, { remarks: cleaned });
      }),
    );

    const failedIds: number[] = [];
    let succeededCount = 0;
    const errorNotes: string[] = [];

    settled.forEach((result, idx) => {
      const id = ids[idx];
      if (result.status === "fulfilled") {
        succeededCount += 1;
      } else if (id !== undefined) {
        failedIds.push(id);
        errorNotes.push(
          `#${id}: ${result.reason instanceof Error ? result.reason.message : "Failed"}`,
        );
      }
    });

    setDecisionBusy(false);
    setDecisionDialog(null);
    setDecisionRemarks("");
    setSelectedIds(failedIds);

    const verb =
      mode === "approve" ? "approved" : mode === "disapprove" ? "disapproved" : "cancelled";

    if (failedIds.length === 0) {
      setBanner({
        tone: "success",
        text: `${succeededCount} leave request${succeededCount === 1 ? "" : "s"} ${verb}.`,
      });
    } else {
      setBanner({
        tone: "warning",
        text: `${succeededCount} succeeded, ${failedIds.length} failed (${errorNotes.slice(0, 2).join("; ")}). Failed items remain selected.`,
      });
    }

    await queryClient.invalidateQueries({ queryKey: ["leave"] });
  };

  const columns = useMemo<ServerColumnDef<LeaveApplicationRecord>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <button
            type="button"
            aria-label="Select all actionable leave rows"
            disabled={actionableRows.length === 0}
            onClick={toggleAllActionable}
            className={cn(
              "flex h-4 w-4 cursor-pointer items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              allActionableSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background",
            )}
          >
            {allActionableSelected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
          </button>
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const actionable = item.canApprove || item.canDisapprove;
          const checked = selectedIds.includes(item.id);
          return (
            <button
              type="button"
              aria-label={`Select leave request #${item.id}`}
              disabled={!actionable}
              onClick={() => toggleRowSelection(item.id)}
              className={cn(
                "flex h-4 w-4 cursor-pointer items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background",
              )}
            >
              {checked ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            </button>
          );
        },
      },
      {
        id: "employeeName",
        accessorKey: "employeeName",
        header: "Applicant",
        enableSorting: true,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {getInitials(item.employeeName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{item.employeeName}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {item.employeeId}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "leaveType",
        header: "Leave Type",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Badge variant="blue">{row.original.leaveTypeCode}</Badge>
            <span className="truncate text-xs text-foreground">{row.original.leaveTypeName}</span>
            {row.original.hasAttachment ? (
              <Paperclip
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-label="Has attachment"
              />
            ) : null}
          </div>
        ),
      },
      {
        id: "dateFrom",
        accessorKey: "dateFrom",
        header: "Leave Period",
        enableSorting: true,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="whitespace-nowrap text-xs text-foreground">
              {item.dateFrom === item.dateTo
                ? formatDateShort(item.dateFrom)
                : `${formatDateShort(item.dateFrom)} → ${formatDateShort(item.dateTo)}`}
            </span>
          );
        },
      },
      {
        id: "totalDays",
        accessorKey: "totalDays",
        header: "Days",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums">
            {formatDays(row.original.totalDays)}
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => {
          const meta = APPROVAL_STATUS_META[row.original.status];
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant={meta.variant} dotColor={meta.dotColor}>
                {meta.label}
              </Badge>
              {row.original.autoApproved ? (
                <Badge variant="purple" className="text-[10px]">
                  Auto
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "submittedAt",
        accessorKey: "submittedAt",
        header: "Submitted",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatShortTimestamp(row.original.submittedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`View leave #${item.id}`}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setDetailApp(item)}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              {item.canApprove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Approve leave #${item.id}`}
                  className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400"
                  onClick={() =>
                    setDecisionDialog({
                      mode: "approve",
                      ids: [item.id],
                      title: `Approve Leave #${item.id}`,
                      description: `Approve ${formatDays(item.totalDays)} of ${item.leaveTypeName} for ${item.employeeName}?`,
                    })
                  }
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : null}
              {item.canDisapprove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Disapprove leave #${item.id}`}
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    setDecisionDialog({
                      mode: "disapprove",
                      ids: [item.id],
                      title:
                        item.status === "approved"
                          ? `Override Disapprove Leave #${item.id}`
                          : `Disapprove Leave #${item.id}`,
                      description:
                        item.status === "approved"
                          ? `Override disapprove approved leave #${item.id}? Used credits will be restored automatically.`
                          : `Disapprove pending leave #${item.id}? Reserved credits will be released automatically.`,
                    })
                  }
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : null}
              {item.canCancel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Cancel leave #${item.id}`}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setDecisionDialog({
                      mode: "cancel",
                      ids: [item.id],
                      title: `Cancel Leave #${item.id}`,
                      description:
                        "Cancel your pending leave request? Reserved credits will be released back to your balance.",
                    })
                  }
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      actionableRows.length,
      allActionableSelected,
      selectedIds,
      toggleAllActionable,
      toggleRowSelection,
    ],
  );

  const filterCount = (leaveTypeFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
  const myCredits = myCreditsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-5 px-6 py-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Leave Management</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Track annual leave balances, file whole-day or half-day leave requests with supporting
            documents, and administer leave types, credits, and policies.
          </p>
        </div>

        {effectiveTab === "applications" && canCreate ? (
          <Button type="button" size="sm" onClick={openApplyDrawer}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Apply Leave
          </Button>
        ) : null}
      </div>

      {banner ? (
        <div
          role="status"
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs",
            banner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
          )}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            className="cursor-pointer text-[11px] font-medium hover:underline"
            onClick={() => setBanner(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Unified Three-Tab Switcher */}
      <div>
        <TabsList aria-label="Leave management tabs">
          <TabsTrigger
            active={effectiveTab === "applications"}
            onClick={() => setActiveTab("applications")}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Leave Applications</span>
          </TabsTrigger>
          {isAdmin ? (
            <>
              <TabsTrigger active={effectiveTab === "setup"} onClick={() => setActiveTab("setup")}>
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Leave Setup</span>
              </TabsTrigger>
              <TabsTrigger
                active={effectiveTab === "policies"}
                onClick={() => setActiveTab("policies")}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Leave Policies</span>
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>
      </div>

      {effectiveTab === "applications" ? (
        <div className="space-y-4">
          {/* Balance Utilization Strip */}
          {myCredits.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {myCredits.map((credit) => {
                const denom = Math.max(credit.allocatedCredits, 0.01);
                const usedPct = Math.min(100, (credit.usedCredits / denom) * 100);
                const pendingPct = Math.min(100 - usedPct, (credit.pendingCredits / denom) * 100);
                return (
                  <div
                    key={credit.id}
                    className="rounded-xl border border-border bg-card p-3.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {credit.leaveTypeName}
                      </span>
                      <Badge variant="blue">{credit.leaveTypeCode}</Badge>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        {credit.availableCredits.toFixed(2)}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          avail
                        </span>
                      </p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        of {credit.allocatedCredits.toFixed(2)} d ({credit.year})
                      </p>
                    </div>
                    <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{ width: `${usedPct}%` }}
                      />
                      <div
                        className="bg-amber-400 transition-all"
                        style={{ width: `${pendingPct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {credit.usedCredits.toFixed(2)} used · {credit.pendingCredits.toFixed(2)}{" "}
                      pending
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList aria-label="Leave status filter">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "pending", label: "Pending" },
                  { id: "approved", label: "Approved" },
                  { id: "disapproved", label: "Disapproved" },
                  { id: "cancelled", label: "Cancelled" },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  active={statusFilter === tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setSelectedIds([]);
                    setPage(1);
                  }}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

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
                  placeholder="Search applicant, reason, leave type..."
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
                    {filterCount > 0 ? (
                      <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                        {filterCount}
                      </Badge>
                    ) : null}
                  </Button>
                }
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <PopoverLabel className="p-0">Leave Filters</PopoverLabel>
                    {filterCount > 0 ? (
                      <button
                        type="button"
                        className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                        onClick={() => {
                          setLeaveTypeFilter("");
                          setDateFrom("");
                          setDateTo("");
                          setPage(1);
                        }}
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="lv-flt-type" className="text-[11px] text-muted-foreground">
                      Leave Type
                    </label>
                    <SelectMenu
                      id="lv-flt-type"
                      className="h-8 text-xs"
                      value={leaveTypeFilter}
                      onValueChange={(v) => {
                        setLeaveTypeFilter(v);
                        setPage(1);
                      }}
                      options={[
                        { value: "", label: "All leave types" },
                        ...(optionsQuery.data?.leaveTypes ?? []).map((lt) => ({
                          value: String(lt.id),
                          label: `${lt.code} — ${lt.name}`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label htmlFor="lv-flt-from" className="text-[11px] text-muted-foreground">
                        From
                      </label>
                      <DatePicker
                        id="lv-flt-from"
                        className="h-8 text-xs"
                        placeholder="Start"
                        value={dateFrom}
                        onChange={(val) => {
                          setDateFrom(val);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="lv-flt-to" className="text-[11px] text-muted-foreground">
                        To
                      </label>
                      <DatePicker
                        id="lv-flt-to"
                        className="h-8 text-xs"
                        placeholder="End"
                        value={dateTo}
                        onChange={(val) => {
                          setDateTo(val);
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
                options={COLUMN_OPTIONS}
                columnVisibility={columnVisibility}
                onToggle={(id) =>
                  setColumnVisibility((prev) => ({ ...prev, [id]: prev[id] === false }))
                }
                onReset={() => setColumnVisibility(DEFAULT_VISIBILITY)}
              />
            </div>
          </div>

          <ServerDataTable
            data={rows}
            columns={columns}
            meta={meta}
            sorting={sorting}
            onSortingChange={(u) => {
              setSorting((prev) => (typeof u === "function" ? u(prev) : u));
              setPage(1);
            }}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            onPageChange={(next) => {
              setPage(next);
              setSelectedIds([]);
            }}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setSelectedIds([]);
              setPage(1);
            }}
            isPending={listQuery.isPending}
            isFetching={listQuery.isFetching}
            emptyState={
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CalendarDays className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">No leave applications found</p>
                  <p className="text-xs text-muted-foreground">
                    Submit a leave request or adjust your status and date filters.
                  </p>
                </div>
              </div>
            }
          />
        </div>
      ) : effectiveTab === "setup" ? (
        <LeaveSetupTab
          employees={employeesQuery.data?.data ?? []}
          onNotify={(text) => setBanner({ tone: "success", text })}
        />
      ) : (
        <LeavePoliciesTab onNotify={(text) => setBanner({ tone: "success", text })} />
      )}

      {/* Floating Bulk Action Bar */}
      {effectiveTab === "applications" && activeSelectedRows.length > 0 ? (
        <section
          aria-label="Bulk leave actions"
          className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 shadow-xl backdrop-blur-md"
        >
          <span className="text-xs font-semibold text-foreground">
            {activeSelectedRows.length} selected
          </span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            disabled={!canBatchApprove}
            onClick={() =>
              setDecisionDialog({
                mode: "approve",
                ids: activeSelectedRows.map((r) => r.id),
                title: `Approve ${activeSelectedRows.length} Leave Request${activeSelectedRows.length === 1 ? "" : "s"}`,
                description:
                  "Each selected leave request will be approved independently. Failed items remain selected.",
              })
            }
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Approve
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            disabled={!canBatchDisapprove}
            onClick={() =>
              setDecisionDialog({
                mode: "disapprove",
                ids: activeSelectedRows.map((r) => r.id),
                title: `Disapprove ${activeSelectedRows.length} Leave Request${activeSelectedRows.length === 1 ? "" : "s"}`,
                description:
                  "Each selected leave request will be disapproved independently with automatic credit release/restore.",
              })
            }
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Disapprove
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => setSelectedIds([])}
          >
            Clear
          </Button>
        </section>
      ) : null}

      <LeaveApplyDrawer
        key={`lv-apply-${applyOpen ? "open" : "closed"}-${optionsQuery.data?.leaveTypes.length ?? 0}`}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        isAdmin={isAdmin}
        canOpenApproverSetup={canOpenApproverSetup}
        currentEmployee={optionsQuery.data?.currentEmployee ?? null}
        employees={employeesQuery.data?.data ?? []}
        leaveTypes={optionsQuery.data?.leaveTypes ?? []}
        onOpenAdminTab={(tab) => setActiveTab(tab)}
        onCreated={(code, days) => {
          setBanner({
            tone: "success",
            text: `Submitted ${formatDays(days)} ${code} leave application.`,
          });
          void queryClient.invalidateQueries({ queryKey: ["leave"] });
        }}
      />

      <LeaveDetailDrawer
        key={`lv-detail-${detailApp?.id ?? "none"}-${detailApp?.updatedAt ?? ""}`}
        open={detailApp !== null}
        onOpenChange={(next) => {
          if (!next) setDetailApp(null);
        }}
        application={detailApp}
        onMutated={(updated, text) => {
          setDetailApp(updated);
          setBanner({ tone: "success", text });
          void queryClient.invalidateQueries({ queryKey: ["leave"] });
        }}
      />

      <Dialog
        open={decisionDialog !== null}
        onOpenChange={(next) => {
          if (!next && !decisionBusy) {
            setDecisionDialog(null);
            setDecisionRemarks("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisionDialog?.title}</DialogTitle>
            <DialogDescription>{decisionDialog?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="lv-batch-remarks" className="text-xs font-medium text-foreground">
              Remarks (Optional)
            </label>
            <textarea
              id="lv-batch-remarks"
              rows={3}
              maxLength={5000}
              value={decisionRemarks}
              onChange={(e) => setDecisionRemarks(e.target.value)}
              placeholder="Optional note recorded in the approval history..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={decisionBusy}
              onClick={() => {
                setDecisionDialog(null);
                setDecisionRemarks("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={decisionDialog?.mode === "disapprove" ? "destructive" : "default"}
              size="sm"
              disabled={decisionBusy}
              onClick={() => void runDecisionBatch()}
            >
              {decisionBusy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {decisionDialog?.mode === "approve"
                ? "Confirm Approve"
                : decisionDialog?.mode === "disapprove"
                  ? "Confirm Disapprove"
                  : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
