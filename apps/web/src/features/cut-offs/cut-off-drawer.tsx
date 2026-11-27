import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CreateCutOffDto,
  type CutOffRecord,
  type CutOffScheduleType,
  createCutOffSchema,
} from "@starter/shared";
import { Loader2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import {
  createDefaultPeriodDraft,
  MONTH_OPTIONS,
  type PeriodDraft,
  periodDraftToPayload,
  recordToPeriodDraft,
} from "./cut-off-utils";

export type CutOffDrawerMode = "create" | "edit" | "view";

const headerFormSchema = z.object({
  name: z.string().trim().min(1, "Cut-off name is required").max(100),
  scheduleType: z.enum(["monthly", "semi_monthly"]),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(9999),
  isActive: z.boolean().default(true),
});

type HeaderFormValues = z.infer<typeof headerFormSchema>;

export function CutOffDrawer({
  open,
  onOpenChange,
  mode,
  cutOff,
  isPending,
  serverError,
  onSubmitPayload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CutOffDrawerMode;
  cutOff: CutOffRecord | null;
  isPending: boolean;
  serverError: string | null;
  onSubmitPayload: (payload: CreateCutOffDto) => void;
}) {
  const isView = mode === "view";
  const now = new Date();
  const defaultYear = cutOff?.year ?? now.getFullYear();
  const defaultMonth = cutOff?.month ?? now.getMonth() + 1;

  const initialHeader = useMemo<HeaderFormValues>(
    () => ({
      name: cutOff?.name ?? "",
      scheduleType: cutOff?.scheduleType ?? "semi_monthly",
      month: defaultMonth,
      year: defaultYear,
      isActive: cutOff?.isActive ?? true,
    }),
    [cutOff, defaultMonth, defaultYear],
  );

  const form = useForm<HeaderFormValues>({
    values: initialHeader,
    resolver: zodResolver(headerFormSchema) as never,
  });

  // Preserve both period drafts in UI state so toggling monthly <-> semi_monthly never discards 2nd period inputs
  const [period1, setPeriod1] = useState<PeriodDraft>(() => {
    const existing = cutOff?.periods.find((p) => p.cutOffNo === 1);
    return existing
      ? recordToPeriodDraft(existing)
      : createDefaultPeriodDraft(1, defaultYear, defaultMonth);
  });

  const [period2, setPeriod2] = useState<PeriodDraft>(() => {
    const existing = cutOff?.periods.find((p) => p.cutOffNo === 2);
    return existing
      ? recordToPeriodDraft(existing)
      : createDefaultPeriodDraft(2, defaultYear, defaultMonth);
  });

  const [periodErrors, setPeriodErrors] = useState<Record<string, string>>({});

  const scheduleType = form.watch("scheduleType") as CutOffScheduleType;

  const handleSubmit = form.handleSubmit((header) => {
    const periodsPayload =
      header.scheduleType === "monthly"
        ? [periodDraftToPayload(period1)]
        : [periodDraftToPayload(period1), periodDraftToPayload(period2)];

    const candidate: CreateCutOffDto = {
      name: header.name.trim(),
      scheduleType: header.scheduleType,
      month: header.month,
      year: header.year,
      isActive: header.isActive,
      periods: periodsPayload,
    };

    const parsed = createCutOffSchema.safeParse(candidate);
    if (!parsed.success) {
      const nextErrs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!nextErrs[key]) {
          nextErrs[key] = issue.message;
        }
      }
      setPeriodErrors(nextErrs);
      return;
    }

    setPeriodErrors({});
    onSubmitPayload(parsed.data);
  });

  const title =
    mode === "create"
      ? "New Cut-Off Calendar"
      : mode === "edit"
        ? `Edit ${cutOff?.name ?? "Cut-Off"}`
        : (cutOff?.name ?? "Cut-Off Details");

  const description =
    mode === "view"
      ? "Read-only summary of DTR coverage, confirmation windows, payroll dates, and salary release dates."
      : "Define monthly (1 period) or semi-monthly (2 periods) DTR and payroll cut-off schedules.";

  const renderPeriodCard = (
    draft: PeriodDraft,
    setDraft: React.Dispatch<React.SetStateAction<PeriodDraft>>,
    idx: number,
  ) => {
    const label = draft.cutOffNo === 1 ? "1st Cut-Off" : "2nd Cut-Off";
    const prefix = `periods.${idx}`;
    const err = (field: string) => periodErrors[`${prefix}.${field}`];

    return (
      <section
        key={draft.cutOffNo}
        className="space-y-4 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="blue">{label}</Badge>
            <span className="text-xs font-semibold text-foreground">Period #{draft.cutOffNo}</span>
          </div>

          <label
            htmlFor={`co-nodtr-${draft.cutOffNo}`}
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
          >
            <Checkbox
              id={`co-nodtr-${draft.cutOffNo}`}
              checked={draft.noDtr}
              disabled={isView}
              onCheckedChange={(checked) => {
                setPeriodErrors({});
                setDraft((prev) => ({ ...prev, noDtr: checked }));
              }}
            />
            <span className="font-medium text-foreground">No DTR (Payroll-only)</span>
          </label>
        </div>

        {/* DTR Cut-Off */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            DTR Cut-Off
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor={`co-dtr-from-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                DTR From
              </label>
              <DatePicker
                id={`co-dtr-from-${draft.cutOffNo}`}
                disabled={isView || draft.noDtr}
                value={draft.dtrDateFrom}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, dtrDateFrom: val }));
                }}
              />
              {err("dtrDateFrom") ? (
                <p className="text-[11px] text-destructive">{err("dtrDateFrom")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`co-dtr-to-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                DTR To
              </label>
              <DatePicker
                id={`co-dtr-to-${draft.cutOffNo}`}
                disabled={isView || draft.noDtr}
                value={draft.dtrDateTo}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, dtrDateTo: val }));
                }}
              />
              {err("dtrDateTo") ? (
                <p className="text-[11px] text-destructive">{err("dtrDateTo")}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* DTR Confirmation */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            DTR Confirmation Window
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor={`co-cstart-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                Start Date
              </label>
              <DatePicker
                id={`co-cstart-${draft.cutOffNo}`}
                disabled={isView || draft.noDtr}
                value={draft.confirmationStartDate}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, confirmationStartDate: val }));
                }}
              />
              {err("confirmationStartDate") ? (
                <p className="text-[11px] text-destructive">{err("confirmationStartDate")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`co-cend-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                End Date
              </label>
              <DatePicker
                id={`co-cend-${draft.cutOffNo}`}
                disabled={isView || draft.noDtr}
                value={draft.confirmationEndDate}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, confirmationEndDate: val }));
                }}
              />
              {err("confirmationEndDate") ? (
                <p className="text-[11px] text-destructive">{err("confirmationEndDate")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`co-tfrom-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                From Time
              </label>
              <TimePicker
                id={`co-tfrom-${draft.cutOffNo}`}
                disabled={isView || draft.noDtr}
                value={draft.confirmationTimeFrom}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, confirmationTimeFrom: val }));
                }}
              />
              {err("confirmationTimeFrom") ? (
                <p className="text-[11px] text-destructive">{err("confirmationTimeFrom")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`co-tto-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                To Time
              </label>
              <TimePicker
                id={`co-tto-${draft.cutOffNo}`}
                disabled={isView || draft.noDtr}
                value={draft.confirmationTimeTo}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, confirmationTimeTo: val }));
                }}
              />
              {err("confirmationTimeTo") ? (
                <p className="text-[11px] text-destructive">{err("confirmationTimeTo")}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Payroll Cut-Off */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Payroll Cut-Off &amp; Release
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor={`co-pfrom-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                Payroll From <span className="text-destructive">*</span>
              </label>
              <DatePicker
                id={`co-pfrom-${draft.cutOffNo}`}
                disabled={isView}
                allowClear={false}
                value={draft.payrollDateFrom}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, payrollDateFrom: val }));
                }}
              />
              {err("payrollDateFrom") ? (
                <p className="text-[11px] text-destructive">{err("payrollDateFrom")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`co-pto-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                Payroll To <span className="text-destructive">*</span>
              </label>
              <DatePicker
                id={`co-pto-${draft.cutOffNo}`}
                disabled={isView}
                allowClear={false}
                value={draft.payrollDateTo}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, payrollDateTo: val }));
                }}
              />
              {err("payrollDateTo") ? (
                <p className="text-[11px] text-destructive">{err("payrollDateTo")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`co-rel-${draft.cutOffNo}`}
                className="text-xs font-medium text-foreground"
              >
                Release Date <span className="text-destructive">*</span>
              </label>
              <DatePicker
                id={`co-rel-${draft.cutOffNo}`}
                disabled={isView}
                allowClear={false}
                value={draft.releaseDate}
                onChange={(val) => {
                  setPeriodErrors({});
                  setDraft((prev) => ({ ...prev, releaseDate: val }));
                }}
              />
              {err("releaseDate") ? (
                <p className="text-[11px] text-destructive">{err("releaseDate")}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {serverError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            ) : null}

            {periodErrors.periods ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {periodErrors.periods}
              </div>
            ) : null}

            {/* Configuration Header */}
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Configuration
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="co-name" className="text-xs font-medium text-foreground">
                    Cut-Off Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="co-name"
                    placeholder="e.g. October 2026 Semi-Monthly"
                    disabled={isView}
                    {...form.register("name")}
                  />
                  {form.formState.errors.name ? (
                    <p className="text-[11px] text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="co-type" className="text-xs font-medium text-foreground">
                    Schedule Type
                  </label>
                  <Select id="co-type" disabled={isView} {...form.register("scheduleType")}>
                    <option value="semi_monthly">Semi-Monthly (2 Periods)</option>
                    <option value="monthly">Monthly (1 Period)</option>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label htmlFor="co-month" className="text-xs font-medium text-foreground">
                      Month
                    </label>
                    <Select id="co-month" disabled={isView} {...form.register("month")}>
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={String(m.value)}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="co-year" className="text-xs font-medium text-foreground">
                      Year
                    </label>
                    <Input
                      id="co-year"
                      type="number"
                      min={1900}
                      max={9999}
                      disabled={isView}
                      {...form.register("year")}
                    />
                    {form.formState.errors.year ? (
                      <p className="text-[11px] text-destructive">
                        {form.formState.errors.year.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <label
                htmlFor="co-active"
                className="flex cursor-pointer items-center gap-2 pt-1 text-xs"
              >
                <Checkbox
                  id="co-active"
                  checked={form.watch("isActive")}
                  disabled={isView}
                  onCheckedChange={(checked) =>
                    form.setValue("isActive", checked, { shouldDirty: true })
                  }
                />
                <span className="font-medium text-foreground">
                  Active cut-off (exposed as DTR date-range preset)
                </span>
              </label>
            </section>

            {/* Period Cards */}
            {renderPeriodCard(period1, setPeriod1, 0)}
            {scheduleType === "semi_monthly" ? renderPeriodCard(period2, setPeriod2, 1) : null}
          </div>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {isView ? "Close" : "Cancel"}
            </Button>
            {!isView ? (
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {mode === "create" ? "Create Cut-Off" : "Save Changes"}
              </Button>
            ) : null}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
