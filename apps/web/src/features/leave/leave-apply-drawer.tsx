import {
  type CreateLeaveApplicationDto,
  createLeaveApplicationSchema,
  durationTypeToDayValue,
  LEAVE_ATTACHMENT_EXTENSIONS,
  LEAVE_ATTACHMENT_MAX_BYTES,
  type LeaveDurationType,
  type LeaveTypeOptionWithPolicy,
  roundCreditValue,
} from "@starter/shared";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarPlus,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import { type ApiEmployee, ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getTodayIso } from "../overtime/overtime-utils";
import { expandIsoDateRange, formatDays, LEAVE_DURATION_LABELS } from "./leave-utils";

interface LeaveFormValues {
  employeeId: string;
  leaveTypeId: string;
  autoApprove: boolean;
  reason: string;
  details: Array<{
    date: string;
    durationType: LeaveDurationType;
  }>;
}

export function LeaveApplyDrawer({
  open,
  onOpenChange,
  isAdmin,
  canOpenApproverSetup,
  currentEmployee,
  employees,
  leaveTypes,
  onOpenAdminTab,
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
  leaveTypes: LeaveTypeOptionWithPolicy[];
  onOpenAdminTab: (tab: "setup" | "policies") => void;
  onCreated: (leaveTypeCode: string, totalDays: number) => void;
}) {
  const today = useMemo(getTodayIso, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const defaultTypeId = leaveTypes[0] ? String(leaveTypes[0].id) : "";

  const form = useForm<LeaveFormValues>({
    defaultValues: {
      employeeId: currentEmployee?.employeeId ?? employees[0]?.employeeId ?? "",
      leaveTypeId: defaultTypeId,
      autoApprove: false,
      reason: "",
      details: [{ date: today, durationType: "whole_day" }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "details",
  });

  const watchedTypeId = form.watch("leaveTypeId");
  const watchedDetails = form.watch("details");
  const watchedReason = form.watch("reason");
  const watchedAutoApprove = form.watch("autoApprove");

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((lt) => String(lt.id) === watchedTypeId) ?? null,
    [leaveTypes, watchedTypeId],
  );
  const policy = selectedLeaveType?.effectivePolicy ?? null;

  const totalDays = useMemo(
    () =>
      roundCreditValue(
        watchedDetails.reduce((sum, d) => sum + durationTypeToDayValue(d.durationType), 0),
      ),
    [watchedDetails],
  );

  const submitMutation = useMutation({
    mutationFn: ({ payload, file }: { payload: CreateLeaveApplicationDto; file: File | null }) =>
      api.createLeaveApplication(payload, file),
    onSuccess: (created) => {
      onCreated(created.leaveTypeCode, created.totalDays);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrorCode(err.code ?? null);
        setServerError(err.message);
      } else {
        setErrorCode(null);
        setServerError(err instanceof Error ? err.message : "Failed to submit leave request");
      }
    },
  });

  const handleApplyDateRange = () => {
    const dates = expandIsoDateRange(rangeStart, rangeEnd);
    if (dates.length === 0) return;
    replace(dates.map((date) => ({ date, durationType: "whole_day" })));
    setServerError(null);
    setErrorCode(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setAttachedFile(null);
      return;
    }
    if (file.size > LEAVE_ATTACHMENT_MAX_BYTES) {
      setServerError("Attachment exceeds the 5 MB file size limit.");
      setErrorCode(null);
      e.target.value = "";
      return;
    }
    setAttachedFile(file);
    setServerError(null);
    setErrorCode(null);
  };

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    setErrorCode(null);

    if (!values.leaveTypeId) {
      setServerError("Select a leave type.");
      return;
    }

    if (policy?.allowAttachments && policy.requireAttachment && !attachedFile) {
      setServerError("This leave policy requires a supporting document attachment.");
      return;
    }

    const payload: CreateLeaveApplicationDto = {
      ...(isAdmin && values.employeeId ? { employeeId: values.employeeId } : {}),
      leaveTypeId: Number(values.leaveTypeId),
      reason: values.reason.trim(),
      autoApprove: isAdmin ? values.autoApprove : false,
      details: values.details.map((d) => ({
        date: d.date,
        durationType: policy && !policy.allowHalfDay ? "whole_day" : d.durationType,
      })),
    };

    const parsed = createLeaveApplicationSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(
        parsed.error.issues[0]?.message ?? "Please complete all required leave fields",
      );
      return;
    }

    submitMutation.mutate({
      payload: parsed.data,
      file: policy?.allowAttachments ? attachedFile : null,
    });
  });

  const acceptExt = LEAVE_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",");

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>Apply Leave</DrawerTitle>
          <DrawerDescription>
            Submit whole-day or half-day leave dates with automatic policy and annual credit checks.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DrawerBody className="space-y-5">
            {serverError ? (
              <div
                role="alert"
                className={cn(
                  "space-y-2 rounded-lg border px-3.5 py-2.5 text-xs",
                  errorCode
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </div>

                {errorCode === "MISSING_APPROVER_SETUP" && canOpenApproverSetup ? (
                  <div className="pl-6">
                    <Link
                      to="/applications/approver-setup"
                      search={{ openCreate: true, type: "leave" }}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      <span>Configure Leave Approver Setup</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : null}

                {errorCode === "INSUFFICIENT_LEAVE_CREDITS" && isAdmin ? (
                  <div className="pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenAdminTab("setup");
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      <span>Open Leave Setup to Allocate Credits</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                {errorCode === "MISSING_LEAVE_POLICY" && isAdmin ? (
                  <div className="pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenAdminTab("policies");
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      <span>Open Leave Policies Tab</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Applicant + Leave Type Row */}
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
                        onValueChange={field.onChange}
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
                        {currentEmployee?.employeeId ?? "No employee ID linked"}
                        {currentEmployee?.department ? ` · ${currentEmployee.department}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="leave-type-select"
                  className="text-xs font-semibold text-foreground"
                >
                  Leave Type
                </label>
                <Controller
                  control={form.control}
                  name="leaveTypeId"
                  render={({ field }) => (
                    <SelectMenu
                      id="leave-type-select"
                      placeholder="Select leave type..."
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                        setServerError(null);
                        setErrorCode(null);
                      }}
                      options={leaveTypes.map((lt) => ({
                        value: String(lt.id),
                        label: `${lt.code} — ${lt.name}${lt.isPaid ? "" : " (Unpaid)"}`,
                      }))}
                    />
                  )}
                />
              </div>
            </div>

            {/* Active Policy Rules Preview */}
            {policy ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-[11px]">
                <span className="font-semibold text-foreground">Policy: {policy.name}</span>
                <Badge variant="neutral">Notice: {policy.minNoticeDays}d</Badge>
                <Badge variant="neutral">
                  Backdate:{" "}
                  {policy.allowBackdatedFiling
                    ? policy.maxBackdatedDays !== null
                      ? `Up to ${policy.maxBackdatedDays}d`
                      : "Allowed"
                    : "Blocked"}
                </Badge>
                <Badge variant="neutral">
                  Half-day: {policy.allowHalfDay ? "Allowed" : "Whole-day only"}
                </Badge>
                {policy.maxConsecutiveDays !== null ? (
                  <Badge variant="neutral">Max consecutive: {policy.maxConsecutiveDays}d</Badge>
                ) : null}
                <Badge variant={selectedLeaveType?.requiresCredits ? "blue" : "neutral"}>
                  {selectedLeaveType?.requiresCredits ? "Deducts Credits" : "No Credit Check"}
                </Badge>
                {policy.allowAttachments ? (
                  <Badge variant={policy.requireAttachment ? "amber" : "neutral"}>
                    {policy.requireAttachment ? "Attachment Required" : "Attachment Optional"}
                  </Badge>
                ) : null}
              </div>
            ) : null}

            {/* Admin-only Auto-Approve Toggle */}
            {isAdmin ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Approval Routing</p>
                  <p className="text-[11px] text-muted-foreground">
                    Route through the leave approver chain or deduct credits and approve
                    immediately.
                  </p>
                </div>
                <TabsList aria-label="Leave approval mode">
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

            {/* Quick Date Range Generator + Per-Date Duration Rows */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-end gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="lv-rng-from" className="text-[11px] text-muted-foreground">
                      Quick Fill From
                    </label>
                    <DatePicker
                      id="lv-rng-from"
                      allowClear={false}
                      className="h-8 w-40 text-xs"
                      value={rangeStart}
                      onChange={setRangeStart}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="lv-rng-to" className="text-[11px] text-muted-foreground">
                      To
                    </label>
                    <DatePicker
                      id="lv-rng-to"
                      allowClear={false}
                      className="h-8 w-40 text-xs"
                      value={rangeEnd}
                      onChange={setRangeEnd}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={!rangeStart || !rangeEnd || rangeEnd < rangeStart}
                    onClick={handleApplyDateRange}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Fill Dates</span>
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="emerald">Total: {formatDays(totalDays)}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    disabled={fields.length >= 120}
                    onClick={() => append({ date: today, durationType: "whole_day" })}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Date</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="grid items-end gap-2.5 rounded-xl border border-border bg-background p-3 sm:grid-cols-[1fr_1.2fr_auto]"
                  >
                    <div className="space-y-1">
                      <label
                        htmlFor={`lv-date-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Leave Date
                      </label>
                      <Controller
                        control={form.control}
                        name={`details.${idx}.date`}
                        render={({ field: f }) => (
                          <DatePicker
                            id={`lv-date-${idx}`}
                            allowClear={false}
                            value={f.value}
                            onChange={f.onChange}
                          />
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`lv-dur-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Duration
                      </label>
                      <Controller
                        control={form.control}
                        name={`details.${idx}.durationType`}
                        render={({ field: f }) => (
                          <SelectMenu
                            id={`lv-dur-${idx}`}
                            value={policy && !policy.allowHalfDay ? "whole_day" : f.value}
                            onValueChange={(val) => f.onChange(val as LeaveDurationType)}
                            options={
                              policy && !policy.allowHalfDay
                                ? [{ value: "whole_day", label: LEAVE_DURATION_LABELS.whole_day }]
                                : [
                                    { value: "whole_day", label: LEAVE_DURATION_LABELS.whole_day },
                                    {
                                      value: "half_day_am",
                                      label: LEAVE_DURATION_LABELS.half_day_am,
                                    },
                                    {
                                      value: "half_day_pm",
                                      label: LEAVE_DURATION_LABELS.half_day_pm,
                                    },
                                  ]
                            }
                          />
                        )}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove leave date ${idx + 1}`}
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

            {/* Policy-Aware Private File Attachment */}
            {policy?.allowAttachments ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    Supporting Document{" "}
                    {policy.requireAttachment ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="font-normal text-muted-foreground">(Optional)</span>
                    )}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    PDF, JPG, PNG, DOC, DOCX, XLS, XLSX · max 5 MB
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptExt}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {attachedFile ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate font-medium text-foreground">
                        {attachedFile.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        ({(attachedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setAttachedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-4 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 hover:text-foreground"
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>Click to upload private supporting document</span>
                  </button>
                )}
              </div>
            ) : null}

            {/* Reason */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="lv-reason" className="text-xs font-semibold text-foreground">
                  Reason for Leave
                </label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {watchedReason.length.toLocaleString()} / 5,000
                </span>
              </div>
              <textarea
                id="lv-reason"
                rows={3}
                maxLength={5000}
                placeholder="Provide the reason or notes for this leave request..."
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

            <Button
              type="submit"
              size="sm"
              disabled={
                submitMutation.isPending ||
                !watchedTypeId ||
                watchedReason.trim().length === 0 ||
                totalDays <= 0
              }
            >
              {submitMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {watchedAutoApprove && isAdmin ? "Submit & Auto-Approve" : "Submit Leave Request"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
