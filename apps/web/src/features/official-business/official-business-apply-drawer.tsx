import {
  type CreateOfficialBusinessApplicationDto,
  createOfficialBusinessApplicationSchema,
  OB_TYPES,
  type ObType,
} from "@starter/shared";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Check,
  Home,
  Loader2,
  MapPin,
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
import { getTodayIso } from "../overtime/overtime-utils";
import { OB_TYPE_META } from "./official-business-utils";

interface ObFormValues {
  obType: ObType;
  destination: string;
  reason: string;
  autoApprove: boolean;
  details: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;
}

export function OfficialBusinessApplyDrawer({
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
  onCreated: (count: number, obType: ObType) => void;
}) {
  const today = useMemo(getTodayIso, []);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(() =>
    currentEmployee ? [currentEmployee.employeeId] : [],
  );
  const [empSearch, setEmpSearch] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [missingApproverLink, setMissingApproverLink] = useState(false);

  const form = useForm<ObFormValues>({
    defaultValues: {
      obType: "ob",
      destination: "",
      reason: "",
      autoApprove: false,
      details: [{ date: today, startTime: "08:00", endTime: "17:00" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "details",
  });

  const watchedObType = form.watch("obType");
  const watchedDestination = form.watch("destination");
  const watchedReason = form.watch("reason");
  const watchedAutoApprove = form.watch("autoApprove");
  const watchedDetails = form.watch("details");

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
    mutationFn: (payload: CreateOfficialBusinessApplicationDto) =>
      api.createOfficialBusinessApplications(payload),
    onSuccess: (res) => {
      onCreated(res.createdCount, watchedObType);
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MISSING_APPROVER_SETUP") {
        setMissingApproverLink(true);
        setServerError(err.message);
      } else {
        setMissingApproverLink(false);
        setServerError(err instanceof Error ? err.message : "Failed to submit OB/WFH request");
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

    if (isAdmin && selectedEmployeeIds.length === 0) {
      setServerError("Select at least one target employee");
      return;
    }

    const payload: CreateOfficialBusinessApplicationDto = {
      ...(isAdmin ? { employeeIds: selectedEmployeeIds } : {}),
      obType: values.obType,
      destination: values.destination.trim() || null,
      reason: values.reason.trim(),
      autoApprove: isAdmin ? values.autoApprove : false,
      details: values.details,
    };

    const parsed = createOfficialBusinessApplicationSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Please complete all required fields");
      return;
    }

    submitMutation.mutate(parsed.data);
  });

  const canSubmit =
    !submitMutation.isPending &&
    watchedReason.trim().length > 0 &&
    (watchedObType === "wfh" || watchedDestination.trim().length > 0) &&
    (isAdmin ? selectedEmployeeIds.length > 0 : Boolean(currentEmployee));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>Apply Official Business / WFH</DrawerTitle>
          <DrawerDescription>
            Request off-site business assignments or remote work schedules. Overlapping active
            OB/WFH windows are automatically prevented.
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
                      search={{ openCreate: true, type: "official_business" }}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      <span>Configure Official Business Approver Setup</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Two-Card OB / WFH Selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Request Type</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {OB_TYPES.map((type) => {
                  const meta = OB_TYPE_META[type];
                  const Icon = type === "ob" ? Briefcase : Home;
                  const active = watchedObType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        form.setValue("obType", type);
                        setServerError(null);
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                        active
                          ? "border-primary bg-primary/[0.05] ring-1 ring-primary/30"
                          : "border-border bg-background hover:border-foreground/25 hover:bg-muted/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground">{meta.label}</p>
                          <Badge variant={meta.variant}>{meta.badge}</Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          {meta.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applicant Picker (Admin) or Authoritative Banner (Self-Service) */}
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
                          placeholder="Search employees for single or batch OB/WFH filing..."
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
                      {currentEmployee?.fullName ?? "Unlinked account"}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {currentEmployee?.employeeId ?? "No linked employee record"}
                      {currentEmployee?.department ? ` · ${currentEmployee.department}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Admin-only Approval Mode Toggle */}
            {isAdmin ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Approval Routing</p>
                  <p className="text-[11px] text-muted-foreground">
                    Route through each employee&apos;s Official Business approver chain or
                    auto-approve immediately.
                  </p>
                </div>
                <TabsList aria-label="OB approval routing">
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

            {/* Conditional Destination */}
            <div className="space-y-1.5">
              <label htmlFor="ob-destination" className="text-xs font-semibold text-foreground">
                Destination{" "}
                {watchedObType === "ob" ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="font-normal text-muted-foreground">
                    (Optional — defaults to &ldquo;Work From Home&rdquo;)
                  </span>
                )}
              </label>
              <div className="relative">
                <MapPin
                  className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="ob-destination"
                  maxLength={255}
                  placeholder={
                    watchedObType === "ob"
                      ? "e.g. Makati Client HQ, Taguig Data Center..."
                      : "Optional location note (leave blank for Work From Home)"
                  }
                  {...form.register("destination")}
                  className="pl-8 text-xs"
                />
              </div>
            </div>

            {/* Schedule Rows */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Schedule Windows ({fields.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Split non-overlapping morning/afternoon sessions on the same date are supported.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={fields.length >= 100}
                  onClick={() => {
                    const lastDate = watchedDetails[watchedDetails.length - 1]?.date ?? today;
                    append({ date: lastDate, startTime: "08:00", endTime: "17:00" });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Schedule</span>
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
                        htmlFor={`ob-date-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Date
                      </label>
                      <Controller
                        control={form.control}
                        name={`details.${idx}.date`}
                        render={({ field: f }) => (
                          <DatePicker
                            id={`ob-date-${idx}`}
                            allowClear={false}
                            value={f.value}
                            onChange={f.onChange}
                          />
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`ob-start-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Start Time
                      </label>
                      <Controller
                        control={form.control}
                        name={`details.${idx}.startTime`}
                        render={({ field: f }) => (
                          <TimePicker
                            id={`ob-start-${idx}`}
                            value={f.value}
                            onChange={f.onChange}
                          />
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={`ob-end-${idx}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        End Time
                      </label>
                      <Controller
                        control={form.control}
                        name={`details.${idx}.endTime`}
                        render={({ field: f }) => (
                          <TimePicker id={`ob-end-${idx}`} value={f.value} onChange={f.onChange} />
                        )}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove schedule row ${idx + 1}`}
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

            {/* Purpose / Reason */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="ob-reason" className="text-xs font-semibold text-foreground">
                  Purpose / Activity Summary
                </label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {watchedReason.length.toLocaleString()} / 5,000
                </span>
              </div>
              <textarea
                id="ob-reason"
                rows={3}
                maxLength={5000}
                placeholder="Describe the client engagement, off-site tasks, or remote deliverables..."
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
              {watchedAutoApprove && isAdmin
                ? "Submit & Auto-Approve"
                : `Submit ${OB_TYPE_META[watchedObType].badge} Request`}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
