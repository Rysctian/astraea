import {
  type CorrectionLogPreviewResponse,
  type CreateCorrectionApplicationDto,
  createCorrectionApplicationSchema,
} from "@starter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Loader2,
  Plus,
  Sparkles,
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
import { SelectMenu } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimePicker } from "@/components/ui/time-picker";
import { type ApiEmployee, ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatLogSource, getLogSourceVariant } from "../attendance/attendance-utils";
import { getTodayIso } from "../overtime/overtime-utils";
import { formatSlotTime, toHHMM } from "./corrections-utils";

interface CorrectionRowDraft {
  date: string;
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
}

interface CorrectionFormValues {
  employeeId: string;
  autoApprove: boolean;
  reason: string;
  details: CorrectionRowDraft[];
}

function ExistingLogsPreview({
  employeeId,
  date,
  onApplyPaired,
}: {
  employeeId: string;
  date: string;
  onApplyPaired: (preview: CorrectionLogPreviewResponse) => void;
}) {
  const previewQuery = useQuery({
    queryKey: ["corrections", "preview", employeeId, date],
    queryFn: () => api.previewCorrectionLogs({ employeeId: employeeId || undefined, date }),
    enabled: Boolean(date && employeeId),
  });

  if (!employeeId || !date) return null;

  return (
    <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span>Existing Recorded Logs</span>
          {previewQuery.data ? (
            <span className="text-[10px] font-normal text-muted-foreground">
              ({previewQuery.data.timezone})
            </span>
          ) : null}
        </span>
        {previewQuery.data && previewQuery.data.logs.length > 0 ? (
          <button
            type="button"
            onClick={() => onApplyPaired(previewQuery.data)}
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span>Prefill Paired Punches</span>
          </button>
        ) : null}
      </div>

      {previewQuery.isPending ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          <span>Loading punches for {date}...</span>
        </div>
      ) : previewQuery.isError ? (
        <p className="mt-1 text-destructive">{previewQuery.error.message}</p>
      ) : (previewQuery.data?.logs.length ?? 0) === 0 ? (
        <p className="mt-1 text-muted-foreground">
          No recorded punches found on {date}. Enter the missing times below.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {previewQuery.data?.logs.map((log) => (
            <span
              key={log.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-[11px]"
            >
              <span className="font-medium tabular-nums text-foreground">
                {formatSlotTime(log.timeLocal)}
              </span>
              <Badge
                variant={getLogSourceVariant(
                  log.source as "biometric" | "manual" | "excel_import" | "correction",
                )}
                className="px-1 py-0 text-[9px]"
              >
                {formatLogSource(
                  log.source as "biometric" | "manual" | "excel_import" | "correction",
                )}
              </Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CorrectionApplyDrawer({
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
  currentEmployee: {
    employeeId: string;
    fullName: string;
    department: string | null;
    position: string | null;
  } | null;
  employees: ApiEmployee[];
  onCreated: (autoApproved: boolean, dateCount: number) => void;
}) {
  const queryClient = useQueryClient();
  const today = useMemo(getTodayIso, []);
  const [serverError, setServerError] = useState<string | null>(null);
  const [missingApproverLink, setMissingApproverLink] = useState(false);

  const initialEmpId = currentEmployee?.employeeId ?? employees[0]?.employeeId ?? "";

  const form = useForm<CorrectionFormValues>({
    defaultValues: {
      employeeId: initialEmpId,
      autoApprove: false,
      reason: "",
      details: [{ date: today, amIn: "", amOut: "", pmIn: "", pmOut: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "details",
  });

  const watchedEmployeeId = isAdmin
    ? form.watch("employeeId")
    : (currentEmployee?.employeeId ?? "");
  const watchedReason = form.watch("reason");
  const watchedAutoApprove = form.watch("autoApprove");
  const watchedDetails = form.watch("details");

  const applyPreviewToRow = (index: number, preview: CorrectionLogPreviewResponse) => {
    form.setValue(`details.${index}.amIn`, toHHMM(preview.paired.amIn));
    form.setValue(`details.${index}.amOut`, toHHMM(preview.paired.amOut));
    form.setValue(`details.${index}.pmIn`, toHHMM(preview.paired.pmIn));
    form.setValue(`details.${index}.pmOut`, toHHMM(preview.paired.pmOut));
  };

  const fetchAndPrefillRow = async (empId: string, date: string, index: number) => {
    if (!empId || !date) return;
    try {
      const preview = await queryClient.fetchQuery({
        queryKey: ["corrections", "preview", empId, date],
        queryFn: () => api.previewCorrectionLogs({ employeeId: empId, date }),
      });
      applyPreviewToRow(index, preview);
    } catch {
      // Preview error is displayed inline by ExistingLogsPreview
    }
  };

  const submitMutation = useMutation({
    mutationFn: (payload: CreateCorrectionApplicationDto) =>
      api.createCorrectionApplication(payload),
    onSuccess: (created) => {
      onCreated(created.autoApproved, created.dateCount);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MISSING_APPROVER_SETUP") {
        setMissingApproverLink(true);
        setServerError(err.message);
      } else {
        setMissingApproverLink(false);
        setServerError(err instanceof Error ? err.message : "Failed to submit correction request");
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    setMissingApproverLink(false);

    const payload: CreateCorrectionApplicationDto = {
      ...(isAdmin && values.employeeId ? { employeeId: values.employeeId } : {}),
      reason: values.reason.trim(),
      autoApprove: isAdmin ? values.autoApprove : false,
      details: values.details.map((d) => ({
        date: d.date,
        amIn: d.amIn || null,
        amOut: d.amOut || null,
        pmIn: d.pmIn || null,
        pmOut: d.pmOut || null,
      })),
    };

    const parsed = createCorrectionApplicationSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Please complete all correction fields");
      return;
    }

    submitMutation.mutate(parsed.data);
  });

  const canSubmit =
    !submitMutation.isPending &&
    Boolean(watchedEmployeeId) &&
    watchedReason.trim().length > 0 &&
    watchedDetails.length > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>Apply Attendance Correction</DrawerTitle>
          <DrawerDescription>
            Preview recorded daily logs, propose corrected AM/PM punches, and capture an immutable
            before-and-after audit trail.
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
                      search={{ openCreate: true, type: "correction" }}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      <span>Configure Correction Approver Setup</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Single-Employee Picker (Admin) or Authoritative Banner (Self-Service) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">
                  {isAdmin ? "Employee (Single Applicant)" : "Applicant"}
                </p>
                {isAdmin ? (
                  <Controller
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <SelectMenu
                        placeholder="Select employee..."
                        value={field.value}
                        onValueChange={(nextEmp) => {
                          field.onChange(nextEmp);
                          setServerError(null);
                          const firstDate = form.getValues("details.0.date");
                          if (firstDate) {
                            void fetchAndPrefillRow(nextEmp, firstDate, 0);
                          }
                        }}
                        options={employees.map((e) => ({
                          value: e.employeeId,
                          label: `${e.firstName} ${e.lastName} (${e.employeeId})`,
                        }))}
                      />
                    )}
                  />
                ) : (
                  <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <UserCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-medium text-foreground">
                        {currentEmployee?.fullName ?? "Unlinked account"}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {currentEmployee?.employeeId ?? "No linked employee record"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {isAdmin ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">Approval Routing</p>
                  <TabsList aria-label="Correction approval routing">
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
                      Auto Approve &amp; Sync
                    </TabsTrigger>
                  </TabsList>
                </div>
              ) : null}
            </div>

            {/* Dynamic Per-Date Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Dates to Correct ({fields.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    At least one AM/PM punch is required per date. Times must be chronological.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={fields.length >= 100}
                  onClick={() => append({ date: today, amIn: "", amOut: "", pmIn: "", pmOut: "" })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Date</span>
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map((field, idx) => {
                  const rowDate = watchedDetails[idx]?.date ?? "";
                  return (
                    <div
                      key={field.id}
                      className="space-y-3 rounded-xl border border-border bg-background p-3.5"
                    >
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div className="w-52 space-y-1">
                          <label
                            htmlFor={`corr-date-${idx}`}
                            className="text-[11px] font-medium text-muted-foreground"
                          >
                            Calendar Date
                          </label>
                          <Controller
                            control={form.control}
                            name={`details.${idx}.date`}
                            render={({ field: f }) => (
                              <DatePicker
                                id={`corr-date-${idx}`}
                                allowClear={false}
                                value={f.value}
                                onChange={(nextDate) => {
                                  f.onChange(nextDate);
                                  void fetchAndPrefillRow(watchedEmployeeId, nextDate, idx);
                                }}
                              />
                            )}
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove correction date ${idx + 1}`}
                          className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
                          disabled={fields.length <= 1}
                          onClick={() => remove(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Remove</span>
                        </Button>
                      </div>

                      <ExistingLogsPreview
                        employeeId={watchedEmployeeId}
                        date={rowDate}
                        onApplyPaired={(preview) => applyPreviewToRow(idx, preview)}
                      />

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {(
                          [
                            { name: "amIn", label: "AM In" },
                            { name: "amOut", label: "AM Out" },
                            { name: "pmIn", label: "PM In" },
                            { name: "pmOut", label: "PM Out" },
                          ] as const
                        ).map((slot) => (
                          <div key={slot.name} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label
                                htmlFor={`corr-${slot.name}-${idx}`}
                                className="text-[11px] font-medium text-muted-foreground"
                              >
                                {slot.label}
                              </label>
                              {watchedDetails[idx]?.[slot.name] ? (
                                <button
                                  type="button"
                                  aria-label={`Clear ${slot.label}`}
                                  onClick={() => form.setValue(`details.${idx}.${slot.name}`, "")}
                                  className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                              ) : null}
                            </div>
                            <Controller
                              control={form.control}
                              name={`details.${idx}.${slot.name}`}
                              render={({ field: f }) => (
                                <TimePicker
                                  id={`corr-${slot.name}-${idx}`}
                                  value={f.value}
                                  onChange={f.onChange}
                                  placeholder="None"
                                />
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="corr-reason" className="text-xs font-semibold text-foreground">
                  Reason for Correction
                </label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {watchedReason.length.toLocaleString()} / 5,000
                </span>
              </div>
              <textarea
                id="corr-reason"
                rows={3}
                maxLength={5000}
                placeholder="Explain the missed biometric tap, device outage, or correction context..."
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
              {watchedAutoApprove && isAdmin ? "Submit & Sync Logs" : "Submit Correction Request"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
