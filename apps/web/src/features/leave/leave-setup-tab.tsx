import {
  type BulkAllocateLeaveCreditsDto,
  bulkAllocateLeaveCreditsSchema,
  type CreateLeaveTypeDto,
  createLeaveTypeSchema,
  type EmployeeLeaveCreditRecord,
  type LeavePolicyRecord,
  type LeaveTypeRecord,
  type UpsertLeaveCreditDto,
  upsertLeaveCreditSchema,
} from "@starter/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table";
import { History, Layers, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ApiEmployee, api } from "@/lib/api";
import { formatShortTimestamp } from "../approver-setup/approver-setup-utils";
import { CREDIT_CHANGE_META } from "./leave-utils";

// --- Leave Type Drawer ---

function LeaveTypeDrawer({
  open,
  onOpenChange,
  leaveType,
  policies,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveType: LeaveTypeRecord | null;
  policies: LeavePolicyRecord[];
  onSaved: (msg: string) => void;
}) {
  const isEdit = leaveType !== null;
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      code: leaveType?.code ?? "",
      name: leaveType?.name ?? "",
      description: leaveType?.description ?? "",
      leavePolicyId: leaveType?.leavePolicyId ? String(leaveType.leavePolicyId) : "",
      isPaid: leaveType?.isPaid ?? true,
      requiresCredits: leaveType?.requiresCredits ?? true,
      defaultCredits: String(leaveType?.defaultCredits ?? 0),
      isActive: leaveType?.isActive ?? true,
    },
  });

  const requiresCredits = form.watch("requiresCredits");

  const saveMutation = useMutation({
    mutationFn: (dto: CreateLeaveTypeDto) =>
      isEdit && leaveType ? api.updateLeaveType(leaveType.id, dto) : api.createLeaveType(dto),
    onSuccess: (saved) => {
      onSaved(
        isEdit
          ? `Updated leave type ${saved.code} (${saved.name}).`
          : `Created leave type ${saved.code} (${saved.name}).`,
      );
      onOpenChange(false);
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "Failed to save leave type"),
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    const parsed = createLeaveTypeSchema.safeParse({
      code: values.code,
      name: values.name,
      description: values.description || null,
      leavePolicyId: values.leavePolicyId ? Number(values.leavePolicyId) : null,
      isPaid: values.isPaid,
      requiresCredits: values.requiresCredits,
      defaultCredits: values.requiresCredits ? Number(values.defaultCredits || 0) : 0,
      isActive: values.isActive,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check leave type fields");
      return;
    }
    saveMutation.mutate(parsed.data);
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit Leave Type" : "Add Leave Type"}</DrawerTitle>
          <DrawerDescription>
            Define leave codes (e.g. VL, SL, EL, LWOP), credit requirements, and policy assignment.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-4">
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
                <label htmlFor="lt-code" className="text-xs font-medium text-foreground">
                  Leave Code
                </label>
                <Input id="lt-code" placeholder="VL" {...form.register("code")} />
              </div>
              <div className="space-y-1">
                <label htmlFor="lt-name" className="text-xs font-medium text-foreground">
                  Leave Type Name
                </label>
                <Input id="lt-name" placeholder="Vacation Leave" {...form.register("name")} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="lt-desc" className="text-xs font-medium text-foreground">
                  Description
                </label>
                <Input
                  id="lt-desc"
                  placeholder="Optional description..."
                  {...form.register("description")}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="lt-pol" className="text-xs font-medium text-foreground">
                  Governing Policy
                </label>
                <Controller
                  control={form.control}
                  name="leavePolicyId"
                  render={({ field }) => (
                    <SelectMenu
                      id="lt-pol"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: "", label: "Fallback to Default Policy" },
                        ...policies.map((p) => ({
                          value: String(p.id),
                          label: p.isDefault ? `${p.name} (Default)` : p.name,
                        })),
                      ]}
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="lt-def" className="text-xs font-medium text-foreground">
                  Default Annual Credits (Days)
                </label>
                <Input
                  id="lt-def"
                  type="number"
                  step="0.5"
                  min={0}
                  disabled={!requiresCredits}
                  {...form.register("defaultCredits")}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 text-xs font-medium">
                <input
                  type="checkbox"
                  {...form.register("isPaid")}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span>Paid Leave</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 text-xs font-medium">
                <input
                  type="checkbox"
                  {...form.register("requiresCredits")}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span>Requires Credits</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 text-xs font-medium">
                <input
                  type="checkbox"
                  {...form.register("isActive")}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span>Active</span>
              </label>
            </div>
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
              {isEdit ? "Save Leave Type" : "Create Leave Type"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// --- Upsert Individual Credit Drawer ---

function UpsertCreditDrawer({
  open,
  onOpenChange,
  credit,
  year,
  employees,
  leaveTypes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credit: EmployeeLeaveCreditRecord | null;
  year: number;
  employees: ApiEmployee[];
  leaveTypes: LeaveTypeRecord[];
  onSaved: (msg: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const creditTypes = leaveTypes.filter((lt) => lt.requiresCredits);

  const form = useForm({
    defaultValues: {
      employeeId: credit?.employeeId ?? employees[0]?.employeeId ?? "",
      leaveTypeId: credit
        ? String(credit.leaveTypeId)
        : creditTypes[0]
          ? String(creditTypes[0].id)
          : "",
      year: String(credit?.year ?? year),
      allocatedCredits: String(credit?.allocatedCredits ?? creditTypes[0]?.defaultCredits ?? 15),
      remarks: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: (dto: UpsertLeaveCreditDto) => api.upsertLeaveCredit(dto),
    onSuccess: (saved) => {
      onSaved(
        `Saved ${saved.year} ${saved.leaveTypeCode} allocation (${saved.allocatedCredits.toFixed(2)} days) for ${saved.employeeName}.`,
      );
      onOpenChange(false);
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Failed to save credit"),
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    const parsed = upsertLeaveCreditSchema.safeParse({
      employeeId: values.employeeId,
      leaveTypeId: Number(values.leaveTypeId),
      year: Number(values.year),
      allocatedCredits: Number(values.allocatedCredits),
      remarks: values.remarks || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check credit fields");
      return;
    }
    saveMutation.mutate(parsed.data);
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="md">
        <DrawerHeader>
          <DrawerTitle>{credit ? "Adjust Leave Credit" : "Set Employee Leave Credit"}</DrawerTitle>
          <DrawerDescription>
            Allocated credits cannot be set below existing used + pending credits. Every change is
            logged in the append-only audit ledger.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-4">
            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
              >
                {formError}
              </div>
            ) : null}

            <div className="space-y-1">
              <label htmlFor="uc-emp" className="text-xs font-medium text-foreground">
                Employee
              </label>
              <Controller
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <SelectMenu
                    id="uc-emp"
                    disabled={credit !== null}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={employees.map((e) => ({
                      value: e.employeeId,
                      label: `${e.firstName} ${e.lastName} (${e.employeeId})`,
                    }))}
                  />
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="uc-type" className="text-xs font-medium text-foreground">
                  Leave Type
                </label>
                <Controller
                  control={form.control}
                  name="leaveTypeId"
                  render={({ field }) => (
                    <SelectMenu
                      id="uc-type"
                      disabled={credit !== null}
                      value={field.value}
                      onValueChange={field.onChange}
                      options={creditTypes.map((lt) => ({
                        value: String(lt.id),
                        label: `${lt.code} — ${lt.name}`,
                      }))}
                    />
                  )}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="uc-year" className="text-xs font-medium text-foreground">
                  Calendar Year
                </label>
                <Input
                  id="uc-year"
                  type="number"
                  disabled={credit !== null}
                  {...form.register("year")}
                />
              </div>
            </div>

            {credit ? (
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <Badge variant="neutral">Used: {credit.usedCredits.toFixed(2)}</Badge>
                <Badge variant="amber">Pending: {credit.pendingCredits.toFixed(2)}</Badge>
                <Badge variant="blue">
                  Min Floor: {(credit.usedCredits + credit.pendingCredits).toFixed(2)}
                </Badge>
              </div>
            ) : null}

            <div className="space-y-1">
              <label htmlFor="uc-alloc" className="text-xs font-medium text-foreground">
                Allocated Credits (Days)
              </label>
              <Input
                id="uc-alloc"
                type="number"
                step="0.5"
                min={0}
                {...form.register("allocatedCredits")}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="uc-rem" className="text-xs font-medium text-foreground">
                Audit Remarks (Optional)
              </label>
              <Input
                id="uc-rem"
                placeholder="Reason for grant or adjustment..."
                {...form.register("remarks")}
              />
            </div>
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
              Save Allocation
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// --- Bulk Allocate Credits Drawer ---

function BulkAllocateDrawer({
  open,
  onOpenChange,
  year,
  leaveTypes,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  leaveTypes: LeaveTypeRecord[];
  onDone: (msg: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const creditTypes = leaveTypes.filter((lt) => lt.requiresCredits && lt.isActive);

  const form = useForm({
    defaultValues: {
      year: String(year),
      leaveTypeId: "",
      allocatedCredits: "",
      overwriteExisting: false,
      remarks: "",
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (dto: BulkAllocateLeaveCreditsDto) => api.bulkAllocateLeaveCredits(dto),
    onSuccess: (res) => {
      onDone(
        `Bulk ${res.year} allocation complete: ${res.createdCount} created, ${res.updatedCount} updated, ${res.skippedCount} skipped.`,
      );
      onOpenChange(false);
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Bulk allocation failed"),
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    const parsed = bulkAllocateLeaveCreditsSchema.safeParse({
      year: Number(values.year),
      leaveTypeId: values.leaveTypeId ? Number(values.leaveTypeId) : undefined,
      allocatedCredits:
        values.allocatedCredits !== "" ? Number(values.allocatedCredits) : undefined,
      overwriteExisting: values.overwriteExisting,
      remarks: values.remarks || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check bulk allocation fields");
      return;
    }
    bulkMutation.mutate(parsed.data);
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="md">
        <DrawerHeader>
          <DrawerTitle>Bulk Allocate Annual Leave Credits</DrawerTitle>
          <DrawerDescription>
            Seed or update annual leave entitlements for all active employees using each leave
            type&apos;s default credits or a custom override.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-4">
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
                <label htmlFor="ba-year" className="text-xs font-medium text-foreground">
                  Entitlement Year
                </label>
                <Input id="ba-year" type="number" {...form.register("year")} />
              </div>

              <div className="space-y-1">
                <label htmlFor="ba-type" className="text-xs font-medium text-foreground">
                  Leave Type Scope
                </label>
                <Controller
                  control={form.control}
                  name="leaveTypeId"
                  render={({ field }) => (
                    <SelectMenu
                      id="ba-type"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: "", label: "All Active Credit-Bearing Types" },
                        ...creditTypes.map((lt) => ({
                          value: String(lt.id),
                          label: `${lt.code} — ${lt.name} (${lt.defaultCredits}d default)`,
                        })),
                      ]}
                    />
                  )}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="ba-days" className="text-xs font-medium text-foreground">
                Custom Days Override (Leave blank to use each type&apos;s default)
              </label>
              <Input
                id="ba-days"
                type="number"
                step="0.5"
                min={0}
                placeholder="Use type default credits"
                {...form.register("allocatedCredits")}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
              <input
                type="checkbox"
                {...form.register("overwriteExisting")}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
              />
              <div>
                <p className="text-xs font-medium text-foreground">Overwrite Existing Balances</p>
                <p className="text-[11px] text-muted-foreground">
                  Update already-allocated rows (rows whose used + pending exceeds target are safely
                  skipped).
                </p>
              </div>
            </label>

            <div className="space-y-1">
              <label htmlFor="ba-rem" className="text-xs font-medium text-foreground">
                Ledger Remarks
              </label>
              <Input
                id="ba-rem"
                placeholder="e.g. Annual 2026 entitlement grant"
                {...form.register("remarks")}
              />
            </div>
          </DrawerBody>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={bulkMutation.isPending}>
              {bulkMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Run Bulk Allocation
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// --- Credit Audit Ledger Drawer ---

function CreditLedgerDrawer({
  credit,
  onOpenChange,
}: {
  credit: EmployeeLeaveCreditRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const logsQuery = useQuery({
    queryKey: ["leave", "credit-logs", credit?.id],
    queryFn: () => (credit ? api.getLeaveCreditLogs(credit.id) : Promise.resolve([])),
    enabled: credit !== null,
  });

  return (
    <Drawer open={credit !== null} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle>Credit Audit Ledger{credit ? ` — ${credit.employeeName}` : ""}</DrawerTitle>
          <DrawerDescription>
            {credit
              ? `${credit.year} ${credit.leaveTypeCode} (${credit.leaveTypeName}) · Available: ${credit.availableCredits.toFixed(2)} of ${credit.allocatedCredits.toFixed(2)} days`
              : ""}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody>
          {logsQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Loading audit ledger...</span>
            </div>
          ) : (logsQuery.data ?? []).length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              No credit ledger entries recorded yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance After</TableHead>
                    <TableHead>Remarks / Actor</TableHead>
                    <TableHead>Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logsQuery.data ?? []).map((log) => {
                    const meta = CREDIT_CHANGE_META[log.changeType];
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-semibold tabular-nums">
                          {meta.sign}
                          {log.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {log.balanceAfter.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <p className="text-foreground">{log.remarks ?? "—"}</p>
                          {log.actedByName ? (
                            <p className="text-[10px]">by {log.actedByName}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                          {formatShortTimestamp(log.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DrawerBody>

        <DrawerFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// --- Main Leave Setup Tab ---

export function LeaveSetupTab({
  employees,
  onNotify,
}: {
  employees: ApiEmployee[];
  onNotify: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [subTab, setSubTab] = useState<"credits" | "types">("credits");
  const [year, setYear] = useState(currentYear);
  const [creditSearch, setCreditSearch] = useState("");
  const [creditTypeFilter, setCreditTypeFilter] = useState("");
  const [creditPage, setCreditPage] = useState(1);
  const [creditPageSize, setCreditPageSize] = useState(20);
  const [creditSorting, setCreditSorting] = useState<SortingState>([
    { id: "employeeName", desc: false },
  ]);
  const [creditVisibility, setCreditVisibility] = useState<ColumnVisibilityState>({});

  const [typeSearch, setTypeSearch] = useState("");
  const [typePage, setTypePage] = useState(1);
  const [typePageSize, setTypePageSize] = useState(20);
  const [typeSorting, setTypeSorting] = useState<SortingState>([{ id: "code", desc: false }]);
  const [typeVisibility, setTypeVisibility] = useState<ColumnVisibilityState>({});

  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveTypeRecord | null>(null);
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<LeaveTypeRecord | null>(null);

  const [creditDrawerOpen, setCreditDrawerOpen] = useState(false);
  const [editingCredit, setEditingCredit] = useState<EmployeeLeaveCreditRecord | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [ledgerCredit, setLedgerCredit] = useState<EmployeeLeaveCreditRecord | null>(null);

  const policiesQuery = useQuery({
    queryKey: ["leave", "policies", "picker"],
    queryFn: () => api.listLeavePolicies({ page: 1, pageSize: 100 }),
  });

  const allTypesQuery = useQuery({
    queryKey: ["leave", "types", "picker"],
    queryFn: () => api.listLeaveTypes({ page: 1, pageSize: 100 }),
  });

  const typeSort = typeSorting[0];
  const typesQuery = useQuery({
    queryKey: [
      "leave",
      "types",
      {
        search: typeSearch.trim(),
        page: typePage,
        pageSize: typePageSize,
        sortBy: typeSort?.id ?? "code",
        sortDir: typeSort?.desc ? "desc" : "asc",
      },
    ],
    queryFn: () =>
      api.listLeaveTypes({
        search: typeSearch.trim() || undefined,
        page: typePage,
        pageSize: typePageSize,
        sortBy:
          typeSort?.id === "name" ||
          typeSort?.id === "defaultCredits" ||
          typeSort?.id === "updatedAt"
            ? typeSort.id
            : "code",
        sortDir: typeSort?.desc ? "desc" : "asc",
      }),
    placeholderData: keepPreviousData,
    enabled: subTab === "types",
  });

  const creditSort = creditSorting[0];
  const creditsQuery = useQuery({
    queryKey: [
      "leave",
      "credits",
      {
        year,
        leaveTypeId: creditTypeFilter || undefined,
        search: creditSearch.trim(),
        page: creditPage,
        pageSize: creditPageSize,
        sortBy: creditSort?.id ?? "employeeName",
        sortDir: creditSort?.desc ? "desc" : "asc",
      },
    ],
    queryFn: () =>
      api.listLeaveCredits({
        year,
        leaveTypeId: creditTypeFilter ? Number(creditTypeFilter) : undefined,
        search: creditSearch.trim() || undefined,
        page: creditPage,
        pageSize: creditPageSize,
        sortBy:
          creditSort?.id === "leaveTypeCode" ||
          creditSort?.id === "allocatedCredits" ||
          creditSort?.id === "availableCredits"
            ? creditSort.id
            : "employeeName",
        sortDir: creditSort?.desc ? "desc" : "asc",
      }),
    placeholderData: keepPreviousData,
    enabled: subTab === "credits",
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) => api.deleteLeaveType(id),
    onSuccess: () => {
      const t = deleteTypeTarget;
      setDeleteTypeTarget(null);
      if (t) onNotify(`Deleted leave type ${t.code} (${t.name}).`);
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
  });

  const creditColumns = useMemo<ServerColumnDef<EmployeeLeaveCreditRecord>[]>(
    () => [
      {
        id: "employeeName",
        accessorKey: "employeeName",
        header: "Employee",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <p className="text-xs font-medium text-foreground">{row.original.employeeName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{row.original.employeeId}</p>
          </div>
        ),
      },
      {
        id: "leaveTypeCode",
        accessorKey: "leaveTypeCode",
        header: "Leave Type",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="blue">
            {row.original.leaveTypeCode} · {row.original.leaveTypeName}
          </Badge>
        ),
      },
      {
        id: "allocatedCredits",
        accessorKey: "allocatedCredits",
        header: "Allocated",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs font-medium tabular-nums">
            {row.original.allocatedCredits.toFixed(2)}
          </span>
        ),
      },
      {
        id: "used",
        header: "Used / Pending",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.usedCredits.toFixed(2)} used · {row.original.pendingCredits.toFixed(2)}{" "}
            pending
          </span>
        ),
      },
      {
        id: "availableCredits",
        accessorKey: "availableCredits",
        header: "Available",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={row.original.availableCredits > 0 ? "emerald" : "amber"}>
            {row.original.availableCredits.toFixed(2)} d
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
              aria-label={`View credit ledger for ${row.original.employeeName}`}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setLedgerCredit(row.original)}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Adjust credit for ${row.original.employeeName}`}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditingCredit(row.original);
                setCreditDrawerOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const typeColumns = useMemo<ServerColumnDef<LeaveTypeRecord>[]>(
    () => [
      {
        id: "code",
        accessorKey: "code",
        header: "Code",
        enableSorting: true,
        cell: ({ row }) => <Badge variant="blue">{row.original.code}</Badge>,
      },
      {
        id: "name",
        accessorKey: "name",
        header: "Leave Type",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <p className="text-xs font-semibold text-foreground">{row.original.name}</p>
            {row.original.description ? (
              <p className="text-[11px] text-muted-foreground">{row.original.description}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "policy",
        header: "Policy",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.leavePolicyName ?? "Default Policy"}
          </span>
        ),
      },
      {
        id: "defaultCredits",
        accessorKey: "defaultCredits",
        header: "Entitlement",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Badge variant={row.original.isPaid ? "emerald" : "neutral"}>
              {row.original.isPaid ? "Paid" : "Unpaid"}
            </Badge>
            <span className="text-xs tabular-nums text-muted-foreground">
              {row.original.requiresCredits
                ? `${row.original.defaultCredits.toFixed(2)} d/yr`
                : "No credits"}
            </span>
          </div>
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
              aria-label={`Edit leave type ${row.original.code}`}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditingType(row.original);
                setTypeDrawerOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Delete leave type ${row.original.code}`}
              title={row.original.deleteBlockedReason ?? "Delete leave type"}
              disabled={!row.original.canDelete}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
              onClick={() => setDeleteTypeTarget(row.original)}
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
        <TabsList aria-label="Leave setup sections">
          <TabsTrigger active={subTab === "credits"} onClick={() => setSubTab("credits")}>
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Annual Leave Credits</span>
          </TabsTrigger>
          <TabsTrigger active={subTab === "types"} onClick={() => setSubTab("types")}>
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Leave Types Catalog</span>
          </TabsTrigger>
        </TabsList>

        {subTab === "credits" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Bulk Allocate
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingCredit(null);
                setCreditDrawerOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Set Credit
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingType(null);
              setTypeDrawerOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Add Leave Type
          </Button>
        )}
      </div>

      {subTab === "credits" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-28">
              <SelectMenu
                className="h-8 text-xs"
                value={String(year)}
                onValueChange={(v) => {
                  setYear(Number(v));
                  setCreditPage(1);
                }}
                options={[currentYear - 1, currentYear, currentYear + 1].map((y) => ({
                  value: String(y),
                  label: String(y),
                }))}
              />
            </div>
            <div className="w-48">
              <SelectMenu
                className="h-8 text-xs"
                value={creditTypeFilter}
                onValueChange={(v) => {
                  setCreditTypeFilter(v);
                  setCreditPage(1);
                }}
                options={[
                  { value: "", label: "All leave types" },
                  ...(allTypesQuery.data?.data ?? []).map((lt) => ({
                    value: String(lt.id),
                    label: `${lt.code} — ${lt.name}`,
                  })),
                ]}
              />
            </div>
            <div className="relative w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={creditSearch}
                onChange={(e) => {
                  setCreditSearch(e.target.value);
                  setCreditPage(1);
                }}
                placeholder="Search employee or leave type..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <ServerDataTable
            data={creditsQuery.data?.data ?? []}
            columns={creditColumns}
            meta={
              creditsQuery.data?.meta ?? {
                total: 0,
                page: creditPage,
                pageSize: creditPageSize,
                totalPages: 1,
              }
            }
            sorting={creditSorting}
            onSortingChange={(u) => {
              setCreditSorting((prev) => (typeof u === "function" ? u(prev) : u));
              setCreditPage(1);
            }}
            columnVisibility={creditVisibility}
            onColumnVisibilityChange={setCreditVisibility}
            onPageChange={setCreditPage}
            onPageSizeChange={(next) => {
              setCreditPageSize(next);
              setCreditPage(1);
            }}
            isPending={creditsQuery.isPending}
            isFetching={creditsQuery.isFetching}
            emptyState={
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No leave credits allocated for {year}
                </p>
                <p className="text-xs text-muted-foreground">
                  Use Bulk Allocate or Set Credit to grant annual leave balances.
                </p>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={typeSearch}
              onChange={(e) => {
                setTypeSearch(e.target.value);
                setTypePage(1);
              }}
              placeholder="Search leave types..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <ServerDataTable
            data={typesQuery.data?.data ?? []}
            columns={typeColumns}
            meta={
              typesQuery.data?.meta ?? {
                total: 0,
                page: typePage,
                pageSize: typePageSize,
                totalPages: 1,
              }
            }
            sorting={typeSorting}
            onSortingChange={(u) => {
              setTypeSorting((prev) => (typeof u === "function" ? u(prev) : u));
              setTypePage(1);
            }}
            columnVisibility={typeVisibility}
            onColumnVisibilityChange={setTypeVisibility}
            onPageChange={setTypePage}
            onPageSizeChange={(next) => {
              setTypePageSize(next);
              setTypePage(1);
            }}
            isPending={typesQuery.isPending}
            isFetching={typesQuery.isFetching}
          />
        </div>
      )}

      <LeaveTypeDrawer
        key={`lt-drawer-${editingType?.id ?? "new"}-${typeDrawerOpen ? "open" : "closed"}`}
        open={typeDrawerOpen}
        onOpenChange={setTypeDrawerOpen}
        leaveType={editingType}
        policies={policiesQuery.data?.data ?? []}
        onSaved={(msg) => {
          onNotify(msg);
          void queryClient.invalidateQueries({ queryKey: ["leave"] });
        }}
      />

      <UpsertCreditDrawer
        key={`uc-drawer-${editingCredit?.id ?? "new"}-${creditDrawerOpen ? "open" : "closed"}`}
        open={creditDrawerOpen}
        onOpenChange={setCreditDrawerOpen}
        credit={editingCredit}
        year={year}
        employees={employees}
        leaveTypes={allTypesQuery.data?.data ?? []}
        onSaved={(msg) => {
          onNotify(msg);
          void queryClient.invalidateQueries({ queryKey: ["leave"] });
        }}
      />

      <BulkAllocateDrawer
        key={`ba-drawer-${year}-${bulkOpen ? "open" : "closed"}`}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        year={year}
        leaveTypes={allTypesQuery.data?.data ?? []}
        onDone={(msg) => {
          onNotify(msg);
          void queryClient.invalidateQueries({ queryKey: ["leave"] });
        }}
      />

      <CreditLedgerDrawer
        credit={ledgerCredit}
        onOpenChange={(next) => {
          if (!next) setLedgerCredit(null);
        }}
      />

      <ConfirmDialog
        open={deleteTypeTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTypeTarget(null);
        }}
        title="Delete Leave Type"
        description={
          deleteTypeTarget
            ? `Delete leave type "${deleteTypeTarget.code} — ${deleteTypeTarget.name}"? Types referenced by credits or applications cannot be deleted.`
            : ""
        }
        confirmLabel="Delete Leave Type"
        isPending={deleteTypeMutation.isPending}
        errorMessage={deleteTypeMutation.error?.message ?? null}
        onConfirm={() => {
          if (deleteTypeTarget) deleteTypeMutation.mutate(deleteTypeTarget.id);
        }}
      />
    </div>
  );
}
