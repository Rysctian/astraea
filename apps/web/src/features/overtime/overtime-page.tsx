import type { ApprovalStatus, OvertimeApplicationRecord } from "@starter/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import {
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Loader2,
  Plus,
  Search,
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
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { formatShortTimestamp, getInitials } from "../approver-setup/approver-setup-utils";
import { OvertimeApplyDrawer } from "./overtime-apply-drawer";
import { OvertimeDetailDrawer } from "./overtime-detail-drawer";
import {
  APPROVAL_STATUS_META,
  formatDateShort,
  formatDurationHoursMinutes,
  formatTime12h,
} from "./overtime-utils";

type StatusFilter = "all" | ApprovalStatus;

interface DecisionDialogState {
  mode: "approve" | "disapprove" | "cancel";
  ids: number[];
  title: string;
  description: string;
}

const COLUMN_OPTIONS = [
  { id: "submittedAt", label: "Submitted" },
  { id: "period", label: "Date & Period" },
  { id: "totalRequestedSeconds", label: "Net OT" },
  { id: "status", label: "Status" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  submittedAt: true,
  period: true,
  totalRequestedSeconds: true,
  status: true,
};

export function OvertimePage() {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "submittedAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [detailApp, setDetailApp] = useState<OvertimeApplicationRecord | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialogState | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  const authQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.authMe,
  });

  const accessQuery = useQuery({
    queryKey: ["rbac", "me"],
    queryFn: api.getMyAccess,
  });

  const roleCode = accessQuery.data?.role?.code ?? null;
  const permissions = accessQuery.data?.permissions ?? {};
  const isAdmin =
    roleCode === "admin" ||
    Boolean(permissions.user_management?.canView) ||
    Boolean(permissions.approver_setup?.canView);
  const canCreate =
    roleCode === "admin" ||
    Boolean(permissions.overtime_applications?.canCreate) ||
    accessQuery.isPending;
  const canOpenApproverSetup = roleCode === "admin" || Boolean(permissions.approver_setup?.canView);

  const openApplyDrawer = () => {
    if (!canCreate) return;
    setApplyOpen(true);
  };

  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();
  registerCreateHandler(openApplyDrawer);
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "employeeName" ||
    activeSort?.id === "status" ||
    activeSort?.id === "totalRequestedSeconds"
      ? activeSort.id
      : "submittedAt";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const listQuery = useQuery({
    queryKey: [
      "overtime",
      {
        search: search.trim(),
        statusFilter,
        submittedFrom,
        submittedTo,
        page,
        pageSize,
        sortBy,
        sortDir,
      },
    ],
    queryFn: () =>
      api.listOvertimeApplications({
        search: search.trim() || undefined,
        status: statusFilter,
        submittedFrom: submittedFrom || undefined,
        submittedTo: submittedTo || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "overtime-picker"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
    enabled: isAdmin,
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? {
    total: 0,
    page,
    pageSize,
    totalPages: 1,
  };

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // Keep only selected IDs that are still visible and actionable on current page
  const activeSelectedRows = useMemo(
    () =>
      selectedIds
        .map((id) => rowsById.get(id))
        .filter(
          (r): r is OvertimeApplicationRecord =>
            r !== undefined && (r.canApprove || r.canDisapprove),
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
        if (mode === "approve") return api.approveOvertimeApplication(id, { remarks: cleaned });
        if (mode === "disapprove")
          return api.disapproveOvertimeApplication(id, { remarks: cleaned });
        return api.cancelOvertimeApplication(id, { remarks: cleaned });
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
        text: `${succeededCount} overtime request${succeededCount === 1 ? "" : "s"} ${verb}.`,
      });
    } else {
      setBanner({
        tone: "warning",
        text: `${succeededCount} succeeded, ${failedIds.length} failed (${errorNotes.slice(0, 2).join("; ")}). Failed items remain selected.`,
      });
    }

    await queryClient.invalidateQueries({ queryKey: ["overtime"] });
  };

  const columns = useMemo<ServerColumnDef<OvertimeApplicationRecord>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <button
            type="button"
            aria-label="Select all actionable rows"
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
              aria-label={`Select overtime request #${item.id}`}
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
        id: "period",
        header: "Date & Period",
        enableSorting: false,
        cell: ({ row }) => {
          const first = row.original.details[0];
          const extra = row.original.slotCount - 1;
          return (
            <div className="min-w-0 text-xs">
              {first ? (
                <>
                  <p className="font-medium text-foreground">
                    {formatDateShort(first.date)}
                    {extra > 0 ? (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        +{extra} more {extra === 1 ? "slot" : "slots"}
                      </span>
                    ) : null}
                  </p>
                  <p className="tabular-nums text-[11px] text-muted-foreground">
                    {formatTime12h(first.startTime)} – {formatTime12h(first.endTime)}
                  </p>
                </>
              ) : (
                "—"
              )}
            </div>
          );
        },
      },
      {
        id: "totalRequestedSeconds",
        accessorKey: "totalRequestedSeconds",
        header: "Net OT",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
            {formatDurationHoursMinutes(row.original.totalRequestedSeconds)}
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
                aria-label={`View overtime #${item.id}`}
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
                  aria-label={`Approve overtime #${item.id}`}
                  className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400"
                  onClick={() =>
                    setDecisionDialog({
                      mode: "approve",
                      ids: [item.id],
                      title: `Approve Overtime #${item.id}`,
                      description: `Approve ${formatDurationHoursMinutes(item.totalRequestedSeconds)} overtime for ${item.employeeName}?`,
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
                  aria-label={`Disapprove overtime #${item.id}`}
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    setDecisionDialog({
                      mode: "disapprove",
                      ids: [item.id],
                      title:
                        item.status === "approved"
                          ? `Override Disapprove Overtime #${item.id}`
                          : `Disapprove Overtime #${item.id}`,
                      description: `Disapprove ${formatDurationHoursMinutes(item.totalRequestedSeconds)} overtime for ${item.employeeName}?`,
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
                  aria-label={`Cancel overtime #${item.id}`}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setDecisionDialog({
                      mode: "cancel",
                      ids: [item.id],
                      title: `Cancel Overtime #${item.id}`,
                      description:
                        "Cancel your pending overtime request? Any prior approvals remain logged for audit.",
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

  const dateFilterCount = (submittedFrom ? 1 : 0) + (submittedTo ? 1 : 0);
  const currentUser = authQuery.data?.user ?? null;
  const currentEmployee = currentUser?.employeeId
    ? { employeeId: currentUser.employeeId, name: currentUser.name }
    : null;

  return (
    <div className="flex flex-col gap-5 px-6 py-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Overtime Applications
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            File overtime requests outside scheduled shifts, review net hours after break
            deductions, and process multi-level approvals.
          </p>
        </div>

        {canCreate ? (
          <Button type="button" size="sm" onClick={openApplyDrawer}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Apply Overtime
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

      {/* Status Tabs + Search & Date Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Overtime status filter">
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
              placeholder="Search reason, applicant, approver..."
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
                <span>Submitted Date</span>
                {dateFilterCount > 0 ? (
                  <Badge variant="blue" className="ml-0.5 px-1.5 py-0 text-[10px]">
                    {dateFilterCount}
                  </Badge>
                ) : null}
              </Button>
            }
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <PopoverLabel className="p-0">Submitted Range</PopoverLabel>
                {dateFilterCount > 0 ? (
                  <button
                    type="button"
                    className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
                    onClick={() => {
                      setSubmittedFrom("");
                      setSubmittedTo("");
                      setPage(1);
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="ot-flt-from" className="text-[11px] text-muted-foreground">
                    From
                  </label>
                  <DatePicker
                    id="ot-flt-from"
                    className="h-8 text-xs"
                    placeholder="Start"
                    value={submittedFrom}
                    onChange={(val) => {
                      setSubmittedFrom(val);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ot-flt-to" className="text-[11px] text-muted-foreground">
                    To
                  </label>
                  <DatePicker
                    id="ot-flt-to"
                    className="h-8 text-xs"
                    placeholder="End"
                    value={submittedTo}
                    onChange={(val) => {
                      setSubmittedTo(val);
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
        onSortingChange={(updater) => {
          setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
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
            <Clock className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No overtime applications found</p>
              <p className="text-xs text-muted-foreground">
                Submit an overtime request or adjust your status and date filters.
              </p>
            </div>
          </div>
        }
      />

      {/* Floating Bulk Action Bar */}
      {activeSelectedRows.length > 0 ? (
        <section
          aria-label="Bulk overtime actions"
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
                title: `Approve ${activeSelectedRows.length} Overtime Request${activeSelectedRows.length === 1 ? "" : "s"}`,
                description:
                  "Each selected request will be approved independently. Any item that fails remains selected.",
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
                title: `Disapprove ${activeSelectedRows.length} Overtime Request${activeSelectedRows.length === 1 ? "" : "s"}`,
                description:
                  "Each selected request will be disapproved independently. Any item that fails remains selected.",
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

      <OvertimeApplyDrawer
        key={`ot-apply-${applyOpen ? "open" : "closed"}-${currentEmployee?.employeeId ?? "none"}`}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        isAdmin={isAdmin}
        canOpenApproverSetup={canOpenApproverSetup}
        currentEmployee={currentEmployee}
        employees={employeesQuery.data?.data ?? []}
        onCreated={(count) => {
          setBanner({
            tone: "success",
            text: `Submitted ${count} overtime application${count === 1 ? "" : "s"}.`,
          });
          void queryClient.invalidateQueries({ queryKey: ["overtime"] });
        }}
      />

      <OvertimeDetailDrawer
        key={`ot-detail-${detailApp?.id ?? "none"}-${detailApp?.updatedAt ?? ""}`}
        open={detailApp !== null}
        onOpenChange={(next) => {
          if (!next) setDetailApp(null);
        }}
        application={detailApp}
        onMutated={(updated, msg) => {
          setDetailApp(updated);
          setBanner({ tone: "success", text: msg });
          void queryClient.invalidateQueries({ queryKey: ["overtime"] });
        }}
      />

      {/* Quick / Batch Decision Dialog */}
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
            <label htmlFor="ot-batch-remarks" className="text-xs font-medium text-foreground">
              Remarks (Optional)
            </label>
            <textarea
              id="ot-batch-remarks"
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
