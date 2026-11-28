import {
  APPLICATION_TYPES,
  type ApplicationType,
  type ApproverWorkflowGroupRecord,
  type SaveApproverWorkflowDto,
  saveApproverWorkflowSchema,
} from "@starter/shared";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  CalendarDays,
  Check,
  Clock,
  FileEdit,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { type ApiEmployee, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { APPLICATION_TYPE_META, getInitials } from "./approver-setup-utils";

export type ApproverDrawerMode = "create" | "edit" | "view";

interface StepDraft {
  key: string;
  approverId: string;
}

const APP_TYPE_ICONS: Record<ApplicationType, typeof Clock> = {
  overtime: Clock,
  official_business: Briefcase,
  correction: FileEdit,
  leave: CalendarDays,
};

let stepSeqKey = 0;
function nextStepKey(): string {
  stepSeqKey += 1;
  return `step-${stepSeqKey}`;
}

export function ApproverSetupDrawer({
  open,
  onOpenChange,
  mode,
  workflow,
  defaultApplicationType = "overtime",
  employees,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ApproverDrawerMode;
  workflow: ApproverWorkflowGroupRecord | null;
  defaultApplicationType?: ApplicationType;
  employees: ApiEmployee[];
  onSaved: (message: string) => void;
}) {
  const isView = mode === "view";
  const isEdit = mode === "edit";

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(() =>
    workflow ? [workflow.employeeId] : [],
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [applicationType, setApplicationType] = useState<ApplicationType>(
    () => workflow?.applicationType ?? defaultApplicationType,
  );
  const [steps, setSteps] = useState<StepDraft[]>(() =>
    workflow && workflow.steps.length > 0
      ? workflow.steps.map((s) => ({ key: nextStepKey(), approverId: s.approverId }))
      : [{ key: nextStepKey(), approverId: "" }],
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.employeeId, e])), [employees]);

  const filteredEmployees = useMemo(() => {
    const term = employeeSearch.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) => {
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return (
        fullName.includes(term) ||
        e.employeeId.toLowerCase().includes(term) ||
        (e.department ?? "").toLowerCase().includes(term)
      );
    });
  }, [employees, employeeSearch]);

  const approverOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.employeeId,
        label: `${e.firstName} ${e.lastName} (${e.employeeId})${e.position ? ` · ${e.position}` : ""}`,
      })),
    [employees],
  );

  const duplicateApproverIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of steps) {
      if (!s.approverId) continue;
      counts.set(s.approverId, (counts.get(s.approverId) ?? 0) + 1);
    }
    const dups = new Set<string>();
    for (const [id, c] of counts.entries()) {
      if (c > 1) dups.add(id);
    }
    return dups;
  }, [steps]);

  const saveMutation = useMutation({
    mutationFn: (payload: SaveApproverWorkflowDto) => api.saveApproverWorkflows(payload),
    onSuccess: (res) => {
      const typeLabel = APPLICATION_TYPE_META[res.applicationType].label;
      onSaved(
        `Saved ${res.stepCount}-step ${typeLabel} workflow for ${res.updatedEmployeeCount} employee${res.updatedEmployeeCount === 1 ? "" : "s"}.`,
      );
      onOpenChange(false);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to save approval workflow");
    },
  });

  const toggleEmployee = (employeeId: string) => {
    if (isView || isEdit) return;
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
    setFormError(null);
  };

  const selectAllFiltered = () => {
    if (isView || isEdit) return;
    const merged = new Set(selectedEmployeeIds);
    for (const emp of filteredEmployees) {
      if (merged.size >= 500) break;
      merged.add(emp.employeeId);
    }
    setSelectedEmployeeIds(Array.from(merged));
    setFormError(null);
  };

  const moveStep = (fromIdx: number, toIdx: number) => {
    if (isView || toIdx < 0 || toIdx >= steps.length || fromIdx === toIdx) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return prev;
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isView) return;
    setFormError(null);

    const payload: SaveApproverWorkflowDto = {
      employeeIds: selectedEmployeeIds,
      applicationType,
      approvers: steps.map((s, idx) => ({
        sequence: idx + 1,
        approverId: s.approverId,
      })),
    };

    const parsed = saveApproverWorkflowSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Please complete all required workflow fields",
      );
      return;
    }

    saveMutation.mutate(parsed.data);
  };

  const visibleChips = selectedEmployeeIds.slice(0, 8);
  const overflowCount = Math.max(0, selectedEmployeeIds.length - 8);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>
            {isView
              ? "View Approval Workflow"
              : isEdit
                ? "Edit Approval Workflow"
                : "Configure Approval Workflow"}
          </DrawerTitle>
          <DrawerDescription>
            {isView
              ? "Inspect the sequential approval chain configured for this employee and application type."
              : "Assign 1 to 100 ordered approvers for one or multiple employees. Existing in-flight applications keep their snapshotted chain."}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-6">
            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
              >
                {formError}
              </div>
            ) : null}

            {/* Section 1: Application Type Cards */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">1. Application Type</p>
                {isEdit || isView ? (
                  <span className="text-[11px] text-muted-foreground">
                    Locked for existing workflow
                  </span>
                ) : null}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {APPLICATION_TYPES.map((type) => {
                  const meta = APPLICATION_TYPE_META[type];
                  const Icon = APP_TYPE_ICONS[type];
                  const selected = applicationType === type;
                  const locked = isView || isEdit;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        setApplicationType(type);
                        setFormError(null);
                      }}
                      className={cn(
                        "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
                        selected
                          ? "border-primary bg-primary/[0.05] ring-1 ring-primary/30"
                          : "border-border bg-background hover:border-foreground/25 hover:bg-muted/30",
                        locked && "cursor-not-allowed opacity-75",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg",
                            selected
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        {selected ? (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" aria-hidden="true" />
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs font-semibold text-foreground">{meta.label}</p>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {meta.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Target Employees */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-foreground">2. Target Employees</p>
                  <Badge variant="blue">{selectedEmployeeIds.length} selected</Badge>
                </div>
                {!isView && !isEdit ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={selectAllFiltered}
                    >
                      Select All ({filteredEmployees.length})
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      disabled={selectedEmployeeIds.length === 0}
                      onClick={() => setSelectedEmployeeIds([])}
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Removable Chips (max 8 + overflow counter) */}
              {selectedEmployeeIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
                  {visibleChips.map((id) => {
                    const emp = employeeById.get(id);
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : id;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground shadow-2xs"
                      >
                        <span className="truncate max-w-[160px]">{name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
                        {!isView && !isEdit ? (
                          <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            onClick={() => toggleEmployee(id)}
                            className="cursor-pointer rounded text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                  {overflowCount > 0 ? (
                    <Badge variant="neutral">+{overflowCount} more</Badge>
                  ) : null}
                </div>
              ) : null}

              {!isView && !isEdit ? (
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        placeholder="Search employees by name, ID, or department..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 divide-y divide-border/60 overflow-y-auto">
                    {filteredEmployees.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>No matching employees found</span>
                      </div>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const checked = selectedEmployeeIds.includes(emp.employeeId);
                        const fullName = `${emp.firstName} ${emp.lastName}`;
                        return (
                          <button
                            key={emp.employeeId}
                            type="button"
                            onClick={() => toggleEmployee(emp.employeeId)}
                            className={cn(
                              "flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                              checked ? "bg-primary/[0.06]" : "hover:bg-muted/40",
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                  checked
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input bg-background",
                                )}
                              >
                                {checked ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                              </span>
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                {getInitials(fullName)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-foreground">
                                  {fullName}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  <span className="font-mono">{emp.employeeId}</span>
                                  {emp.department ? ` · ${emp.department}` : ""}
                                </p>
                              </div>
                            </div>
                            {emp.position ? (
                              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                                {emp.position}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Section 3: Sequential Approver Chain Builder */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    3. Approval Sequence ({steps.length} {steps.length === 1 ? "level" : "levels"})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Drag handles or use arrow buttons to reorder. Each approver must be unique.
                  </p>
                </div>
                {!isView ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={steps.length >= 100}
                    onClick={() => {
                      setSteps((prev) => [...prev, { key: nextStepKey(), approverId: "" }]);
                      setFormError(null);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Step</span>
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                {steps.map((step, index) => {
                  const isDup = Boolean(
                    step.approverId && duplicateApproverIds.has(step.approverId),
                  );
                  const emp = employeeById.get(step.approverId);
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop reorder target; keyboard move up/down buttons are provided
                    <div
                      key={step.key}
                      draggable={!isView}
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => {
                        if (!isView) e.preventDefault();
                      }}
                      onDrop={() => {
                        if (dragIndex !== null && dragIndex !== index) {
                          moveStep(dragIndex, index);
                        }
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border bg-background p-3 transition-colors",
                        isDup ? "border-destructive/60 bg-destructive/[0.03]" : "border-border",
                        dragIndex === index && "opacity-60 ring-2 ring-primary/30",
                      )}
                    >
                      {!isView ? (
                        <span
                          className="cursor-grab text-muted-foreground/70 hover:text-foreground"
                          title="Drag to reorder"
                        >
                          <GripVertical className="h-4 w-4" aria-hidden="true" />
                        </span>
                      ) : null}

                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        {isView ? (
                          <div>
                            <p className="text-xs font-medium text-foreground">
                              {emp ? `${emp.firstName} ${emp.lastName}` : step.approverId}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {step.approverId}
                              {emp?.position ? ` · ${emp.position}` : ""}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <SelectMenu
                              placeholder={`Select Level ${index + 1} approver...`}
                              value={step.approverId}
                              onValueChange={(val) => {
                                setSteps((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, approverId: val } : item,
                                  ),
                                );
                                setFormError(null);
                              }}
                              options={approverOptions}
                            />
                            {isDup ? (
                              <p className="text-[11px] text-destructive">
                                Duplicate approver — choose a different employee for this level.
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {!isView ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Move step ${index + 1} up`}
                            className="h-7 w-7 p-0"
                            disabled={index === 0}
                            onClick={() => moveStep(index, index - 1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Move step ${index + 1} down`}
                            className="h-7 w-7 p-0"
                            disabled={index === steps.length - 1}
                            onClick={() => moveStep(index, index + 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove step ${index + 1}`}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            disabled={steps.length <= 1}
                            onClick={() =>
                              setSteps((prev) => prev.filter((_, idx) => idx !== index))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              {isView ? "Close" : "Cancel"}
            </Button>

            {!isView ? (
              <Button
                type="submit"
                size="sm"
                disabled={saveMutation.isPending || duplicateApproverIds.size > 0}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {isEdit ? "Save Workflow Changes" : "Save Approval Workflow"}
              </Button>
            ) : null}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
