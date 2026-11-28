import {
  APPLICATION_TYPES,
  type ApplicationType,
  type ApproverWorkflowGroupRecord,
} from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  GitBranch,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ColumnVisibilityPopover,
  type ServerColumnDef,
  ServerDataTable,
} from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useWorkspaceActions } from "@/lib/workspace-actions";
import { type ApproverDrawerMode, ApproverSetupDrawer } from "./approver-setup-drawer";
import { APPLICATION_TYPE_META, formatShortTimestamp, getInitials } from "./approver-setup-utils";

const COLUMN_OPTIONS = [
  { id: "applicationType", label: "Application Type" },
  { id: "chain", label: "Approval Sequence" },
  { id: "stepCount", label: "Depth" },
  { id: "updatedAt", label: "Last Updated" },
];

const DEFAULT_VISIBILITY: ColumnVisibilityState = {
  applicationType: true,
  chain: true,
  stepCount: true,
  updatedAt: true,
};

export function ApproverSetupPage({
  initialOpenCreate = false,
  initialApplicationType = "overtime",
}: {
  initialOpenCreate?: boolean;
  initialApplicationType?: ApplicationType;
}) {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ApplicationType>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(DEFAULT_VISIBILITY);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(initialOpenCreate);
  const [drawerMode, setDrawerMode] = useState<ApproverDrawerMode>("create");
  const [activeWorkflow, setActiveWorkflow] = useState<ApproverWorkflowGroupRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApproverWorkflowGroupRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const accessQuery = useQuery({
    queryKey: ["rbac", "me"],
    queryFn: api.getMyAccess,
  });

  const isSystemAdmin = accessQuery.data?.role?.code === "admin";
  const setupGrant = accessQuery.data?.permissions.approver_setup;
  const canView = isSystemAdmin || Boolean(setupGrant?.canView) || accessQuery.isPending;
  const canUpdate = isSystemAdmin || Boolean(setupGrant?.canUpdate);
  const canDelete = isSystemAdmin || Boolean(setupGrant?.canDelete);

  const openCreateDrawer = () => {
    if (!canUpdate) return;
    setActiveWorkflow(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const { registerCreateHandler, registerSearchFocusHandler } = useWorkspaceActions();
  registerCreateHandler(openCreateDrawer);
  registerSearchFocusHandler(() => searchInputRef.current?.focus());

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "employeeId" ||
    activeSort?.id === "employeeName" ||
    activeSort?.id === "applicationType" ||
    activeSort?.id === "stepCount"
      ? activeSort.id
      : "updatedAt";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const workflowsQuery = useQuery({
    queryKey: [
      "approver-setup",
      { search: search.trim(), typeFilter, page, pageSize, sortBy, sortDir },
    ],
    queryFn: () =>
      api.listApproverWorkflows({
        search: search.trim() || undefined,
        applicationType: typeFilter,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
    enabled: canView,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "approver-setup-picker"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
    enabled: canView,
  });

  const deleteMutation = useMutation({
    mutationFn: (wf: ApproverWorkflowGroupRecord) =>
      api.deleteApproverWorkflow(wf.employeeId, wf.applicationType),
    onSuccess: () => {
      const target = deleteTarget;
      setDeleteTarget(null);
      if (target) {
        setToastMessage(
          `Removed ${APPLICATION_TYPE_META[target.applicationType].label} workflow template for ${target.employeeName}.`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["approver-setup"] });
    },
  });

  const columns = useMemo<ServerColumnDef<ApproverWorkflowGroupRecord>[]>(
    () => [
      {
        id: "employeeName",
        accessorKey: "employeeName",
        header: "Applicant Employee",
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
                  {item.employeeDepartment ? ` · ${item.employeeDepartment}` : ""}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "applicationType",
        accessorKey: "applicationType",
        header: "Application Type",
        enableSorting: true,
        cell: ({ row }) => {
          const meta = APPLICATION_TYPE_META[row.original.applicationType];
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
      },
      {
        id: "chain",
        header: "Approval Sequence",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
            {row.original.steps.map((step, idx) => (
              <div key={step.id} className="inline-flex items-center gap-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold tabular-nums text-primary">
                    {step.sequence}
                  </span>
                  <span className="font-medium text-foreground">{step.approverName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {step.approverId}
                  </span>
                </span>
                {idx < row.original.steps.length - 1 ? (
                  <ArrowRight
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "stepCount",
        accessorKey: "stepCount",
        header: "Depth",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="neutral">
            {row.original.stepCount} {row.original.stepCount === 1 ? "level" : "levels"}
          </Badge>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Last Updated",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatShortTimestamp(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const wf = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`View workflow for ${wf.employeeName}`}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setActiveWorkflow(wf);
                  setDrawerMode("view");
                  setDrawerOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              {canUpdate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit workflow for ${wf.employeeName}`}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setActiveWorkflow(wf);
                    setDrawerMode("edit");
                    setDrawerOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete workflow for ${wf.employeeName}`}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(wf)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canUpdate, canDelete],
  );

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-base font-semibold text-foreground">Access Restricted</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view Approver Setup workflows.
          </p>
        </div>
      </div>
    );
  }

  const rows = workflowsQuery.data?.data ?? [];
  const meta = workflowsQuery.data?.meta ?? {
    total: 0,
    page,
    pageSize,
    totalPages: 1,
  };

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Approver Setup</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure ordered multi-level approval chains per employee across Overtime, Official
            Business, Correction, and Leave applications.
          </p>
        </div>

        {canUpdate ? (
          <Button type="button" size="sm" onClick={openCreateDrawer}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Configure Workflow
          </Button>
        ) : null}
      </div>

      {toastMessage ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{toastMessage}</span>
          </span>
          <button
            type="button"
            className="cursor-pointer text-[11px] font-medium hover:underline"
            onClick={() => setToastMessage(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Application Type Filter Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Filter by application type">
          <TabsTrigger
            active={typeFilter === "all"}
            onClick={() => {
              setTypeFilter("all");
              setPage(1);
            }}
          >
            All Types
          </TabsTrigger>
          {APPLICATION_TYPES.map((type) => (
            <TabsTrigger
              key={type}
              active={typeFilter === type}
              onClick={() => {
                setTypeFilter(type);
                setPage(1);
              }}
            >
              {APPLICATION_TYPE_META[type].shortLabel}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex items-center gap-2">
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
              placeholder="Search applicant or approver..."
              className="h-8 pl-8 text-xs"
            />
          </div>

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
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
        isPending={workflowsQuery.isPending}
        isFetching={workflowsQuery.isFetching}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <GitBranch className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No approval workflows configured
              </p>
              <p className="text-xs text-muted-foreground">
                Configure an employee&apos;s approval sequence before routing online applications.
              </p>
            </div>
          </div>
        }
      />

      <ApproverSetupDrawer
        key={`approver-drawer-${drawerMode}-${activeWorkflow?.employeeId ?? "new"}-${activeWorkflow?.applicationType ?? initialApplicationType}-${drawerOpen ? "open" : "closed"}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        mode={drawerMode}
        workflow={activeWorkflow}
        defaultApplicationType={initialApplicationType}
        employees={employeesQuery.data?.data ?? []}
        onSaved={(msg) => {
          setToastMessage(msg);
          void queryClient.invalidateQueries({ queryKey: ["approver-setup"] });
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Delete Approval Workflow Template"
        description={
          deleteTarget
            ? `Remove the ${APPLICATION_TYPE_META[deleteTarget.applicationType].label} approval template for ${deleteTarget.employeeName} (${deleteTarget.employeeId})? Existing submitted applications keep their snapshotted approvals.`
            : ""
        }
        confirmLabel="Delete Template"
        isPending={deleteMutation.isPending}
        errorMessage={deleteMutation.error?.message ?? null}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget);
          }
        }}
      />
    </div>
  );
}
