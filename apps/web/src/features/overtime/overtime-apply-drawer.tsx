import {
  type CreateOvertimeApplicationDto,
  createOvertimeApplicationSchema,
} from "@starter/shared";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
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
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimePicker } from "@/components/ui/time-picker";
import { type ApiEmployee, ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getInitials } from "../approver-setup/approver-setup-utils";
import {
  distributeBreakAcrossSlots,
  formatDurationHoursMinutes,
  getTodayIso,
  parseCustomBreakHHMM,
} from "./overtime-utils";

type BreakPreset = "0" | "1800" | "3600" | "5400" | "custom";

interface OvertimeFormValues {
  autoApprove: boolean;
  reason: string;
  slots: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;
}

const BREAK_PRESETS: Array<{ id: BreakPreset; label: string; seconds: number }> = [
  { id: "0", label: "No Break", seconds: 0 },
  { id: "1800", label: "30 mins", seconds: 1800 },
  { id: "3600", label: "1 hour", seconds: 3600 },
  { id: "5400", label: "1.5 hours", seconds: 5400 },
  { id: "custom", label: "Custom HH:MM", seconds: 0 },
];

export function OvertimeApplyDrawer({
  open,
  onOpenChange,
  isAdmin,
  canOpenApproverSetup,
  currentEmployee,
  employees,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  canOpenApproverSetup: boolean;
  currentEmployee: { employeeId: string; name: string } | null;
  employees: ApiEmployee[];
  onCreated: (count: number) => void;
}) {
  const today = useMemo(getTodayIso, []);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(() =>
    currentEmployee ? [currentEmployee.employeeId] : [],
  );
  const [empSearch, setEmpSearch] = useState("");
  const [breakPreset, setBreakPreset] = useState<BreakPreset>("0");
  const [customBreakText, setCustomBreakText] = useState("00:30");
  const [serverError, setServerError] = useState<string | null>(null);
  const [missingApproverLink, setMissingApproverLink] = useState(false);

  const form = useForm<OvertimeFormValues>({
    defaultValues: {
      autoApprove: false,
      reason: "",
      slots: [{ date: today, startTime: "18:00", endTime: "20:00" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "slots",
  });

  const watchedSlots = form.watch("slots");
  const watchedReason = form.watch("reason");
  const watchedAutoApprove = form.watch("autoApprove");

  const customBreakSeconds = useMemo(
    () => (breakPreset === "custom" ? parseCustomBreakHHMM(customBreakText) : Number(breakPreset)),
    [breakPreset, customBreakText],
  );

  const totalBreakSeconds = customBreakSeconds ?? 0;

  const summary = useMemo(
    () => distributeBreakAcrossSlots(watchedSlots, totalBreakSeconds),
    [watchedSlots, totalBreakSeconds],
  );

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.employeeId, e])), [employees]);

  const filteredEmployees = useMemo(() => {
    const term = empSearch.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) => {
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return (
        fullName.includes(term) ||
        e.employeeId.toLowerCase().includes(term) ||
        (e.department ?? "").toLowerCase().includes(term)
      );
    });
  }, [employees, empSearch]);

  const submitMutation = useMutation({
    mutationFn: (payload: CreateOvertimeApplicationDto) => api.createOvertimeApplications(payload),
    onSuccess: (res) => {
      onCreated(res.createdCount);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MISSING_APPROVER_SETUP") {
        setMissingApproverLink(true);
        setServerError(err.message);
      } else {
        setMissingApproverLink(false);
        setServerError(err instanceof Error ? err.message : "Failed to submit overtime request");
      }
    },
  });

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    );
    setServerError(null);
    setMissingApproverLink(false);
  };

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    setMissingApproverLink(false);

    if (breakPreset === "custom" && customBreakSeconds === null) {
      setServerError("Custom break must use HH:MM format (e.g. 00:45 or 01:00)");
      return;
    }

    if (isAdmin && selectedEmployeeIds.length === 0) {
      setServerError("Select at least one target employee");
      return;
    }

    if (summary.hasInvalidSlot || summary.netSeconds <= 0) {
      setServerError("Every slot must have end time after start time and positive net overtime");
      return;
    }

    const details = values.slots.map((slot, index) => ({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      breakSeconds: summary.perSlotBreaks[index] ?? 0,
    }));

    const payload: CreateOvertimeApplicationDto = {
      ...(isAdmin ? { employeeIds: selectedEmployeeIds } : {}),
      reason: values.reason.trim(),
      autoApprove: isAdmin ? values.autoApprove : false,
      details,
    };

    const parsed = createOvertimeApplicationSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Please check your overtime fields");
      return;
    }

    submitMutation.mutate(parsed.data);
  });

  const canSubmit =
    !submitMutation.isPending &&
    !summary.hasInvalidSlot &&
    summary.netSeconds > 0 &&
    watchedReason.trim().length > 0 &&
    (isAdmin ? selectedEmployeeIds.length > 0 : Boolean(currentEmployee));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>Apply Overtime</DrawerTitle>
          <DrawerDescription>
            File structured overtime slots outside scheduled work shifts. Net overtime is calculated
            automatically after unpaid break deductions.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-5">
            {serverError ? (
              <div
                role="alert"
                className={cn(
                  "space-y-2 rounded-lg border px-3.5 py-2.5 text-xs",
                  missingApproverLink
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </div>
                {missingApproverLink && canOpenApproverSetup ? (
                  <div className="pl-6">
                    <Link
                      to="/applications/approver-setup"
                      search={{ openCreate: true, type: "overtime" }}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      <span>Configure Overtime Approver Setup</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Applicant Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  {isAdmin ? "Target Employee(s)" : "Applicant"}
                </p>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="blue">{selectedEmployeeIds.length} selected</Badge>
                    {selectedEmployeeIds.length > 0 ? (
                      <button
                        type="button"
                        className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedEmployeeIds([])}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {isAdmin ? (
                <div className="space-y-2">
                  {selectedEmployeeIds.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/20 p-2">
                      {selectedEmployeeIds.slice(0, 6).map((id) => {
                        const emp = employeeById.get(id);
                        const label = emp ? `${emp.firstName} ${emp.lastName}` : id;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground"
                          >
                            <span>{label}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {id}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${label}`}
                              onClick={() => toggleEmployee(id)}
                              className="cursor-pointer text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        );
                      })}
                      {selectedEmployeeIds.length > 6 ? (
                        <Badge variant="neutral">+{selectedEmployeeIds.length - 6} more</Badge>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-xl border border-border bg-background">
                    <div className="border-b border-border p-2">
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          placeholder="Search employees for single or batch overtime filing..."
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="max-h-36 divide-y divide-border/60 overflow-y-auto">
                      {filteredEmployees.map((emp) => {
                        const checked = selectedEmployeeIds.includes(emp.employeeId);
                        const fullName = `${emp.firstName} ${emp.lastName}`;
                        return (
                          <button
                            key={emp.employeeId}
                            type="button"
                            onClick={() => toggleEmployee(emp.employeeId)}
                            className={cn(
                              "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors",
                              checked ? "bg-primary/[0.06]" : "hover:bg-muted/40",
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2">
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
                              <span className="truncate text-xs font-medium text-foreground">
                                {fullName}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {emp.employeeId}
                              </span>
                            </div>
                            {emp.department ? (
                              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                                {emp.department}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
                  <UserCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  <div className="text-xs">
                    <p className="font-medium text-foreground">
                      {currentEmployee?.name ?? "Unlinked account"}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {currentEmployee?.employeeId ?? "No linked employee record"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Admin-only Approval Mode Toggle (Rebuild Note #1) */}
            {isAdmin ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Approval Routing</p>
                  <p className="text-[11px] text-muted-foreground">
                    Route through each employee&apos;s approver chain or auto-approve immediately.
                  </p>
                </div>
                <TabsList aria-label="Approval mode">
                  <TabsTrigger
                    active={!watchedAutoApprove}
                    onClick={() => form.setValue("autoApprove", false)}
                  >
                    Approver Chain
                  </TabsTrigger>
                  <TabsTrigger
                    active={watchedAutoApprove}
                    onClick={() => form.setValue("autoApprove", true)}
                  >
                    Auto Approve
                  </TabsTrigger>
                </TabsList>
              </div>
            ) : null}

            {/* Overtime Slots (Multi-date capable per Rebuild Note #3) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Overtime Slots ({fields.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Each slot must be outside scheduled work shifts and any prior-day overnight
                    spillover.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={fields.length >= 100}
                  onClick={() => {
                    const lastDate = watchedSlots[watchedSlots.length - 1]?.date ?? today;
                    append({ date: lastDate, startTime: "18:00", endTime: "20:00" });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Slot</span>
                </Button>
              </div>

              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="grid items-end gap-2.5 rounded-xl border border-border bg-background p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]"
                  >
                    <div className="space-y-1">
                      <label
                        htmlFor={`ot-date-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Date
                      </label>
                      <Controller
                        control={form.control}
                        name={`slots.${idx}.date`}
                        render={({ field: f }) => (
                          <DatePicker
                            id={`ot-date-${idx}`}
                            allowClear={false}
                            value={f.value}
                            onChange={f.onChange}
                          />
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`ot-start-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Start Time
                      </label>
                      <Controller
                        control={form.control}
                        name={`slots.${idx}.startTime`}
                        render={({ field: f }) => (
                          <TimePicker
                            id={`ot-start-${idx}`}
                            value={f.value}
                            onChange={f.onChange}
                          />
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`ot-end-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        End Time
                      </label>
                      <Controller
                        control={form.control}
                        name={`slots.${idx}.endTime`}
                        render={({ field: f }) => (
                          <TimePicker id={`ot-end-${idx}`} value={f.value} onChange={f.onChange} />
                        )}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove slot ${idx + 1}`}
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                      disabled={fields.length <= 1}
                      onClick={() => remove(idx)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Break Deduction Presets + Live Gross / Break / Net OT Summary */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Unpaid Break Deduction</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {BREAK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setBreakPreset(preset.id)}
                      className={cn(
                        "cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        breakPreset === preset.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {breakPreset === "custom" ? (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="ot-custom-break"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Custom Duration (HH:MM)
                  </label>
                  <Input
                    id="ot-custom-break"
                    value={customBreakText}
                    onChange={(e) => setCustomBreakText(e.target.value)}
                    placeholder="00:45"
                    className="h-8 w-28 font-mono text-xs"
                  />
                  {customBreakSeconds === null ? (
                    <span className="text-[11px] text-destructive">Use HH:MM (e.g. 00:45)</span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                <Badge variant="neutral">
                  Gross: {formatDurationHoursMinutes(summary.grossSeconds)}
                </Badge>
                <Badge variant="amber">
                  Break: {formatDurationHoursMinutes(totalBreakSeconds)}
                </Badge>
                <Badge variant={summary.hasInvalidSlot ? "neutral" : "emerald"}>
                  Net OT: {formatDurationHoursMinutes(summary.netSeconds)}
                </Badge>
                {summary.hasInvalidSlot ? (
                  <span className="text-[11px] text-destructive">
                    Invalid time window or break exceeds slot duration
                  </span>
                ) : null}
              </div>
            </div>

            {/* Reason + Character Counter */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="ot-reason" className="text-xs font-semibold text-foreground">
                  Business Reason
                </label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {watchedReason.length.toLocaleString()} / 5,000
                </span>
              </div>
              <textarea
                id="ot-reason"
                rows={4}
                maxLength={5000}
                placeholder="Describe the deliverable, incident, or operational need requiring overtime..."
                {...form.register("reason")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </DrawerBody>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button type="submit" size="sm" disabled={!canSubmit}>
              {submitMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {watchedAutoApprove && isAdmin ? "Submit & Auto-Approve" : "Submit Overtime Request"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
