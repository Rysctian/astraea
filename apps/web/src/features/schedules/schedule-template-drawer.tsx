import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AttendancePolicyOptionsResponse,
  type CreateScheduleDto,
  ISO_WEEKDAYS,
  isValidIanaTimezone,
  type ScheduleRecord,
  type UpdateScheduleDto,
  validateScheduleDetails,
} from "@starter/shared";
import { Clipboard, ClipboardPaste, Eraser, Loader2, Lock, Moon, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  COMMON_TIMEZONES,
  createDefaultWeekDraft,
  createEmptySlot,
  type DayScheduleDraft,
  isSlotOvernight,
  nextSlotUid,
  type ShiftSlotDraft,
  scheduleToWeekDraft,
  weekDraftToDetails,
} from "./schedule-utils";

const scheduleHeaderSchema = z.object({
  name: z.string().trim().min(1, "Schedule name is required").max(100),
  timezone: z
    .string()
    .trim()
    .min(1, "Timezone is required")
    .refine(isValidIanaTimezone, "Invalid IANA timezone"),
  attendancePolicyId: z.string().optional().default(""),
  isActive: z.boolean().default(true),
});

type ScheduleHeaderValues = z.infer<typeof scheduleHeaderSchema>;

export function ScheduleTemplateDrawer({
  open,
  onOpenChange,
  schedule,
  policyOptions,
  isPending,
  serverError,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleRecord | null;
  policyOptions: AttendancePolicyOptionsResponse | undefined;
  isPending: boolean;
  serverError: string | null;
  onCreate: (payload: CreateScheduleDto) => void;
  onUpdate: (id: number, payload: UpdateScheduleDto) => void;
}) {
  const isEdit = schedule !== null;
  const isLocked = Boolean(schedule?.isLocked);

  const initialHeader = useMemo<ScheduleHeaderValues>(
    () => ({
      name: schedule?.name ?? "",
      timezone: schedule?.timezone ?? "Asia/Manila",
      attendancePolicyId: schedule?.attendancePolicyId ? String(schedule.attendancePolicyId) : "",
      isActive: schedule?.isActive ?? true,
    }),
    [schedule],
  );

  const form = useForm<ScheduleHeaderValues>({
    values: initialHeader,
    resolver: zodResolver(scheduleHeaderSchema) as never,
  });

  const [days, setDays] = useState<DayScheduleDraft[]>(() =>
    schedule ? scheduleToWeekDraft(schedule) : createDefaultWeekDraft(),
  );
  const [copiedDay, setCopiedDay] = useState<{
    isRestDay: boolean;
    slots: ShiftSlotDraft[];
  } | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const timezoneChoices = useMemo(() => {
    const set = new Set<string>(COMMON_TIMEZONES);
    if (schedule?.timezone) {
      set.add(schedule.timezone);
    }
    return Array.from(set);
  }, [schedule?.timezone]);

  const toggleRestDay = (dayOfWeek: number) => {
    if (isLocked) return;
    setSlotsError(null);
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const nextRest = !d.isRestDay;
        return {
          ...d,
          isRestDay: nextRest,
          slots: nextRest ? [] : [createEmptySlot()],
        };
      }),
    );
  };

  const updateSlotField = (
    dayOfWeek: number,
    slotIndex: number,
    field: keyof ShiftSlotDraft,
    value: string,
  ) => {
    if (isLocked) return;
    setSlotsError(null);
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        return {
          ...d,
          slots: d.slots.map((s, idx) => (idx === slotIndex ? { ...s, [field]: value } : s)),
        };
      }),
    );
  };

  const addSlotRow = (dayOfWeek: number) => {
    if (isLocked) return;
    setSlotsError(null);
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? { ...d, isRestDay: false, slots: [...d.slots, createEmptySlot()] }
          : d,
      ),
    );
  };

  const deleteSlotRow = (dayOfWeek: number, slotIndex: number) => {
    if (isLocked) return;
    setSlotsError(null);
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const remaining = d.slots.filter((_, idx) => idx !== slotIndex);
        return remaining.length === 0
          ? { ...d, isRestDay: true, slots: [] }
          : { ...d, slots: remaining };
      }),
    );
  };

  const clearDay = (dayOfWeek: number) => {
    if (isLocked) return;
    setSlotsError(null);
    setDays((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, isRestDay: true, slots: [] } : d)),
    );
  };

  const pasteDay = (dayOfWeek: number) => {
    if (isLocked || !copiedDay) return;
    setSlotsError(null);
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? {
              ...d,
              isRestDay: copiedDay.isRestDay,
              slots: copiedDay.slots.map((s) => ({ ...s, uid: nextSlotUid() })),
            }
          : d,
      ),
    );
  };

  const onSubmit = form.handleSubmit((header) => {
    const policyId = header.attendancePolicyId ? Number(header.attendancePolicyId) : null;

    if (isEdit && schedule && isLocked) {
      onUpdate(schedule.id, {
        name: header.name.trim(),
        attendancePolicyId: policyId,
        isActive: header.isActive,
      });
      return;
    }

    const details = weekDraftToDetails(days);
    const err = validateScheduleDetails(details);
    if (err) {
      setSlotsError(err);
      return;
    }
    setSlotsError(null);

    if (isEdit && schedule) {
      onUpdate(schedule.id, {
        name: header.name.trim(),
        timezone: header.timezone,
        attendancePolicyId: policyId,
        isActive: header.isActive,
        details,
      });
    } else {
      onCreate({
        name: header.name.trim(),
        timezone: header.timezone,
        attendancePolicyId: policyId,
        isActive: header.isActive,
        details,
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="2xl">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? `Edit ${schedule.name}` : "New Schedule Template"}</DrawerTitle>
          <DrawerDescription>
            Configure a 7-day weekly schedule supporting single, split, rest-day, and overnight
            shifts.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {serverError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {serverError}
              </div>
            ) : null}

            {isLocked ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  This template is assigned to {schedule?.assignmentCount} employee record(s). Shift
                  slots and timezone are locked. To change shift hours, archive this template and
                  create a new one.
                </span>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="sched-name" className="text-xs font-medium text-foreground">
                  Schedule Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="sched-name"
                  placeholder="e.g. Regular 9AM–6PM"
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sched-tz" className="text-xs font-medium text-foreground">
                  IANA Timezone
                </label>
                <Select id="sched-tz" disabled={isLocked} {...form.register("timezone")}>
                  {timezoneChoices.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sched-policy" className="text-xs font-medium text-foreground">
                  Attendance Policy
                </label>
                <Select id="sched-policy" {...form.register("attendancePolicyId")}>
                  <option value="">
                    System default policy
                    {policyOptions?.defaultPolicyName
                      ? ` (${policyOptions.defaultPolicyName})`
                      : ""}
                  </option>
                  {(policyOptions?.items ?? []).map((opt) => (
                    <option key={opt.id} value={String(opt.id)}>
                      {opt.name}
                      {opt.isDefault ? " (Default)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-end pb-1">
                <label
                  htmlFor="sched-is-active"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs"
                >
                  <Checkbox
                    id="sched-is-active"
                    checked={form.watch("isActive")}
                    onCheckedChange={(checked) =>
                      form.setValue("isActive", checked, { shouldDirty: true })
                    }
                  />
                  <span className="font-medium text-foreground">
                    Active template (available for new assignments)
                  </span>
                </label>
              </div>
            </div>

            {/* Day-off quick toggles */}
            <div className="space-y-2 rounded-lg border border-border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Rest Days (Day-Off)</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Toggle rest days (highlighted). All 7 weekdays must be defined.
                  </p>
                </div>
                <label
                  htmlFor="sched-show-overrides"
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <Checkbox
                    id="sched-show-overrides"
                    checked={showOverrides}
                    onCheckedChange={setShowOverrides}
                  />
                  <span>Show per-slot cutoff overrides</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ISO_WEEKDAYS.map((w) => {
                  const day = days.find((d) => d.dayOfWeek === w.dayOfWeek);
                  const isRest = Boolean(day?.isRestDay);
                  return (
                    <button
                      key={w.dayOfWeek}
                      type="button"
                      disabled={isLocked}
                      onClick={() => toggleRestDay(w.dayOfWeek)}
                      className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isRest
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {w.codeDay} {isRest ? "• Off" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {slotsError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {slotsError}
              </div>
            ) : null}

            {/* 7-day shift slot editor */}
            <div className="space-y-2.5">
              {days.map((day) => {
                const weekday = ISO_WEEKDAYS.find((w) => w.dayOfWeek === day.dayOfWeek);
                return (
                  <div key={day.dayOfWeek} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={day.isRestDay ? "amber" : "blue"}>{weekday?.codeDay}</Badge>
                        <span className="text-xs font-semibold text-foreground">
                          {weekday?.label}
                        </span>
                        {day.isRestDay ? (
                          <span className="text-[11px] text-muted-foreground">Rest Day</span>
                        ) : null}
                      </div>

                      {!isLocked ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() =>
                              setCopiedDay({
                                isRestDay: day.isRestDay,
                                slots: day.slots.map((s) => ({ ...s })),
                              })
                            }
                          >
                            <Clipboard className="mr-1 h-3 w-3" aria-hidden="true" />
                            Copy
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={!copiedDay}
                            onClick={() => pasteDay(day.dayOfWeek)}
                          >
                            <ClipboardPaste className="mr-1 h-3 w-3" aria-hidden="true" />
                            Paste
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => clearDay(day.dayOfWeek)}
                          >
                            <Eraser className="mr-1 h-3 w-3" aria-hidden="true" />
                            Clear
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => addSlotRow(day.dayOfWeek)}
                          >
                            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                            Add row
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {!day.isRestDay ? (
                      <div className="mt-2.5 space-y-2">
                        {day.slots.map((slot, slotIdx) => {
                          const overnight = isSlotOvernight(slot.startTime, slot.endTime);
                          return (
                            <div
                              key={slot.uid}
                              className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground">Start</span>
                                  <TimePicker
                                    disabled={isLocked}
                                    value={slot.startTime}
                                    onChange={(val) =>
                                      updateSlotField(day.dayOfWeek, slotIdx, "startTime", val)
                                    }
                                    className="w-32"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground">End</span>
                                  <TimePicker
                                    disabled={isLocked}
                                    value={slot.endTime}
                                    onChange={(val) =>
                                      updateSlotField(day.dayOfWeek, slotIdx, "endTime", val)
                                    }
                                    className="w-32"
                                  />
                                </div>

                                {overnight ? (
                                  <Badge variant="purple" className="gap-1">
                                    <Moon className="h-2.5 w-2.5" aria-hidden="true" />
                                    Overnight (+1d)
                                  </Badge>
                                ) : null}

                                {!isLocked ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    aria-label={`Delete slot ${slotIdx + 1} on ${weekday?.label}`}
                                    onClick={() => deleteSlotRow(day.dayOfWeek, slotIdx)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>

                              {showOverrides ? (
                                <div className="grid gap-2 pt-1 sm:grid-cols-3">
                                  <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      Tardy Start Override
                                    </span>
                                    <TimePicker
                                      disabled={isLocked}
                                      allowClear
                                      placeholder="Use policy"
                                      value={slot.tardyStart}
                                      onChange={(val) =>
                                        updateSlotField(day.dayOfWeek, slotIdx, "tardyStart", val)
                                      }
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      Undertime Start Override
                                    </span>
                                    <TimePicker
                                      disabled={isLocked}
                                      allowClear
                                      placeholder="Use policy"
                                      value={slot.undertimeStart}
                                      onChange={(val) =>
                                        updateSlotField(
                                          day.dayOfWeek,
                                          slotIdx,
                                          "undertimeStart",
                                          val,
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      Early Dismissal Start
                                    </span>
                                    <TimePicker
                                      disabled={isLocked}
                                      allowClear
                                      placeholder="Optional"
                                      value={slot.earlyDismissalStart}
                                      onChange={(val) =>
                                        updateSlotField(
                                          day.dayOfWeek,
                                          slotIdx,
                                          "earlyDismissalStart",
                                          val,
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {isEdit ? "Save Template" : "Create Template"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
