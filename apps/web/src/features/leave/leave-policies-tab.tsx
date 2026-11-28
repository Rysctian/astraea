import {
  type CreateLeavePolicyDto,
  createLeavePolicySchema,
  type LeaveAccrualMode,
  type LeavePolicyRecord,
} from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { Loader2, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ServerColumnDef, ServerDataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { api } from "@/lib/api";
import { LEAVE_ACCRUAL_LABELS } from "./leave-utils";

interface PolicyFormValues {
  name: string;
  description: string;
  minNoticeDays: string;
  allowBackdatedFiling: boolean;
  maxBackdatedDays: string;
  maxConsecutiveDays: string;
  allowHalfDay: boolean;
  accrualMode: LeaveAccrualMode;
  allowNegativeBalance: boolean;
  carryOverEnabled: boolean;
  carryOverMaxDays: string;
  countRestDays: boolean;
  allowAttachments: boolean;
  requireAttachment: boolean;
  isDefault: boolean;
  isActive: boolean;
}

function LeavePolicyDrawer({
  open,
  onOpenChange,
  policy,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: LeavePolicyRecord | null;
  onSaved: (message: string) => void;
}) {
  const isEdit = policy !== null;
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<PolicyFormValues>({
    defaultValues: {
      name: policy?.name ?? "",
      description: policy?.description ?? "",
      minNoticeDays: String(policy?.minNoticeDays ?? 0),
      allowBackdatedFiling: policy?.allowBackdatedFiling ?? false,
      maxBackdatedDays: policy?.maxBackdatedDays != null ? String(policy.maxBackdatedDays) : "",
      maxConsecutiveDays:
        policy?.maxConsecutiveDays != null ? String(policy.maxConsecutiveDays) : "",
      allowHalfDay: policy?.allowHalfDay ?? true,
      accrualMode: policy?.accrualMode ?? "upfront_annual",
      allowNegativeBalance: policy?.allowNegativeBalance ?? false,
      carryOverEnabled: policy?.carryOverEnabled ?? false,
      carryOverMaxDays: String(policy?.carryOverMaxDays ?? 0),
      countRestDays: policy?.countRestDays ?? false,
      allowAttachments: policy?.allowAttachments ?? false,
      requireAttachment: policy?.requireAttachment ?? false,
      isDefault: policy?.isDefault ?? false,
      isActive: policy?.isActive ?? true,
    },
  });

  const allowBackdate = form.watch("allowBackdatedFiling");
  const carryOver = form.watch("carryOverEnabled");
  const allowAttachments = form.watch("allowAttachments");

  const saveMutation = useMutation({
    mutationFn: (dto: CreateLeavePolicyDto) =>
      isEdit && policy ? api.updateLeavePolicy(policy.id, dto) : api.createLeavePolicy(dto),
    onSuccess: (saved) => {
      onSaved(
        isEdit ? `Updated leave policy "${saved.name}".` : `Created leave policy "${saved.name}".`,
      );
      onOpenChange(false);
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Failed to save policy"),
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    const parsed = createLeavePolicySchema.safeParse({
      name: values.name,
      description: values.description || null,
      minNoticeDays: Number(values.minNoticeDays || 0),
      allowBackdatedFiling: values.allowBackdatedFiling,
      maxBackdatedDays:
        values.allowBackdatedFiling && values.maxBackdatedDays !== ""
          ? Number(values.maxBackdatedDays)
          : null,
      maxConsecutiveDays:
        values.maxConsecutiveDays !== "" ? Number(values.maxConsecutiveDays) : null,
      allowHalfDay: values.allowHalfDay,
      accrualMode: values.accrualMode,
      allowNegativeBalance: values.allowNegativeBalance,
      carryOverEnabled: values.carryOverEnabled,
      carryOverMaxDays: values.carryOverEnabled ? Number(values.carryOverMaxDays || 0) : 0,
      countRestDays: values.countRestDays,
      allowAttachments: values.allowAttachments,
      requireAttachment: values.allowAttachments ? values.requireAttachment : false,
      isDefault: values.isDefault,
      isActive: values.isActive,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please review policy fields");
      return;
    }

    saveMutation.mutate(parsed.data);
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit Leave Policy" : "Create Leave Policy"}</DrawerTitle>
          <DrawerDescription>
            Configure filing notice windows, backdating limits, half-day eligibility, attachments,
            and default fallback behavior.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-5">
            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
              >
                {formError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="lp-name" className="text-xs font-medium text-foreground">
                  Policy Name
                </label>
                <Input
                  id="lp-name"
                  placeholder="e.g. Standard Leave Policy"
                  {...form.register("name")}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="lp-accrual" className="text-xs font-medium text-foreground">
                  Accrual Strategy
                </label>
                <Controller
                  control={form.control}
                  name="accrualMode"
                  render={({ field }) => (
                    <SelectMenu
                      id="lp-accrual"
                      value={field.value}
                      onValueChange={(val) => field.onChange(val as LeaveAccrualMode)}
                      options={[
                        { value: "upfront_annual", label: LEAVE_ACCRUAL_LABELS.upfront_annual },
                        { value: "monthly_accrual", label: LEAVE_ACCRUAL_LABELS.monthly_accrual },
                        { value: "none", label: LEAVE_ACCRUAL_LABELS.none },
                      ]}
                    />
                  )}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="lp-desc" className="text-xs font-medium text-foreground">
                  Description
                </label>
                <Input
                  id="lp-desc"
                  placeholder="Short policy summary..."
                  {...form.register("description")}
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="lp-notice" className="text-xs font-medium text-foreground">
                  Min Notice Days
                </label>
                <Input id="lp-notice" type="number" min={0} {...form.register("minNoticeDays")} />
              </div>
              <div className="space-y-1">
                <label htmlFor="lp-consec" className="text-xs font-medium text-foreground">
                  Max Consecutive Days
                </label>
                <Input
                  id="lp-consec"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  {...form.register("maxConsecutiveDays")}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="lp-backdays" className="text-xs font-medium text-foreground">
                  Max Backdated Days
                </label>
                <Input
                  id="lp-backdays"
                  type="number"
                  min={0}
                  disabled={!allowBackdate}
                  placeholder={allowBackdate ? "Unlimited" : "Backdating off"}
                  {...form.register("maxBackdatedDays")}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    name: "allowBackdatedFiling",
                    label: "Allow Backdated Filing",
                    hint: "Permit submitting leave for past dates",
                  },
                  {
                    name: "allowHalfDay",
                    label: "Allow Half-Day Leave",
                    hint: "Enable AM/PM 0.50 day leave filings",
                  },
                  {
                    name: "countRestDays",
                    label: "Count Scheduled Rest Days",
                    hint: "Allow filing leave on scheduled rest days",
                  },
                  {
                    name: "allowNegativeBalance",
                    label: "Allow Negative Credit Balance",
                    hint: "Permit filing even when credits are exhausted",
                  },
                  {
                    name: "allowAttachments",
                    label: "Allow Supporting Attachments",
                    hint: "Enable private file uploads up to 5 MB",
                  },
                  {
                    name: "requireAttachment",
                    label: "Require Attachment",
                    hint: "Make supporting document mandatory on submission",
                    disabled: !allowAttachments,
                  },
                  {
                    name: "carryOverEnabled",
                    label: "Carry-Over Eligible",
                    hint: "Year-end carry-over metadata flag",
                  },
                  {
                    name: "isDefault",
                    label: "Default Fallback Policy",
                    hint: "Used by leave types without an explicit policy",
                  },
                  {
                    name: "isActive",
                    label: "Active Policy",
                    hint: "Inactive policies cannot be used for new filings",
                  },
                ] as const
              ).map((toggle) => (
                <label
                  key={toggle.name}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-background p-3"
                >
                  <input
                    type="checkbox"
                    disabled={"disabled" in toggle ? toggle.disabled : false}
                    {...form.register(toggle.name)}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{toggle.label}</p>
                    <p className="text-[11px] text-muted-foreground">{toggle.hint}</p>
                  </div>
                </label>
              ))}
            </div>

            {carryOver ? (
              <div className="max-w-xs space-y-1">
                <label htmlFor="lp-co-max" className="text-xs font-medium text-foreground">
                  Carry-Over Max Days
                </label>
                <Input
                  id="lp-co-max"
                  type="number"
                  step="0.5"
                  min={0}
                  {...form.register("carryOverMaxDays")}
                />
              </div>
            ) : null}
          </DrawerBody>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {isEdit ? "Save Policy" : "Create Policy"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function LeavePoliciesTab({ onNotify }: { onNotify: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LeavePolicyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeavePolicyRecord | null>(null);

  const activeSort = sorting[0];
  const sortBy =
    activeSort?.id === "minNoticeDays" ||
    activeSort?.id === "isDefault" ||
    activeSort?.id === "updatedAt"
      ? activeSort.id
      : "name";
  const sortDir: "asc" | "desc" = activeSort?.desc ? "desc" : "asc";

  const policiesQuery = useQuery({
    queryKey: ["leave", "policies", { search: search.trim(), page, pageSize, sortBy, sortDir }],
    queryFn: () =>
      api.listLeavePolicies({
        search: search.trim() || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLeavePolicy(id),
    onSuccess: () => {
      const target = deleteTarget;
      setDeleteTarget(null);
      if (target) onNotify(`Deleted leave policy "${target.name}".`);
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
  });

  const columns = useMemo<ServerColumnDef<LeavePolicyRecord>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Policy Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs font-semibold text-foreground">{row.original.name}</p>
              {row.original.isDefault ? (
                <Badge variant="blue">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  Default
                </Badge>
              ) : null}
            </div>
            {row.original.description ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "rules",
        header: "Rules Summary",
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="neutral">Notice {p.minNoticeDays}d</Badge>
              {p.allowBackdatedFiling ? (
                <Badge variant="neutral">
                  Backdate {p.maxBackdatedDays != null ? `≤${p.maxBackdatedDays}d` : "Yes"}
                </Badge>
              ) : null}
              {p.allowHalfDay ? <Badge variant="neutral">Half-Day</Badge> : null}
              {p.allowNegativeBalance ? <Badge variant="amber">Neg. Bal</Badge> : null}
              {p.allowAttachments ? (
                <Badge variant={p.requireAttachment ? "amber" : "neutral"}>
                  {p.requireAttachment ? "File Req." : "File Opt."}
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "assigned",
        header: "Leave Types",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="neutral">{row.original.assignedLeaveTypeCount} assigned</Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "emerald" : "neutral"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit policy ${row.original.name}`}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditing(row.original);
                setDrawerOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Delete policy ${row.original.name}`}
              title={row.original.deleteBlockedReason ?? "Delete policy"}
              disabled={!row.original.canDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search leave policies..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          New Policy
        </Button>
      </div>

      <ServerDataTable
        data={policiesQuery.data?.data ?? []}
        columns={columns}
        meta={policiesQuery.data?.meta ?? { total: 0, page, pageSize, totalPages: 1 }}
        sorting={sorting}
        onSortingChange={(u) => {
          setSorting((prev) => (typeof u === "function" ? u(prev) : u));
          setPage(1);
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
        isPending={policiesQuery.isPending}
        isFetching={policiesQuery.isFetching}
      />

      <LeavePolicyDrawer
        key={`lp-drawer-${editing?.id ?? "new"}-${drawerOpen ? "open" : "closed"}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        policy={editing}
        onSaved={(msg) => {
          onNotify(msg);
          void queryClient.invalidateQueries({ queryKey: ["leave"] });
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Delete Leave Policy"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? Policies assigned to any leave type or marked default cannot be deleted.`
            : ""
        }
        confirmLabel="Delete Policy"
        isPending={deleteMutation.isPending}
        errorMessage={deleteMutation.error?.message ?? null}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
