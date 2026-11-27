import {
  ISO_WEEKDAYS,
  type ScheduleDetailInput,
  type ScheduleRecord,
  timeToMinutes,
} from "@starter/shared";

export const COMMON_TIMEZONES = [
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Australia/Sydney",
] as const;

let slotUidSeq = 1;

export function nextSlotUid(): string {
  slotUidSeq += 1;
  return `slot-${slotUidSeq}`;
}

export interface ShiftSlotDraft {
  uid: string;
  startTime: string;
  endTime: string;
  tardyStart: string;
  undertimeStart: string;
  earlyDismissalStart: string;
}

export interface DayScheduleDraft {
  dayOfWeek: number;
  isRestDay: boolean;
  slots: ShiftSlotDraft[];
}

export function createEmptySlot(): ShiftSlotDraft {
  return {
    uid: nextSlotUid(),
    startTime: "09:00",
    endTime: "18:00",
    tardyStart: "",
    undertimeStart: "",
    earlyDismissalStart: "",
  };
}

export function createDefaultWeekDraft(): DayScheduleDraft[] {
  return ISO_WEEKDAYS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    isRestDay: day.dayOfWeek === 6 || day.dayOfWeek === 7,
    slots: day.dayOfWeek === 6 || day.dayOfWeek === 7 ? [] : [createEmptySlot()],
  }));
}

export function toHHMM(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 5);
}

export function scheduleToWeekDraft(schedule: ScheduleRecord): DayScheduleDraft[] {
  return ISO_WEEKDAYS.map((day) => {
    const dayRows = schedule.details.filter((d) => d.dayOfWeek === day.dayOfWeek);
    if (dayRows.length === 0 || dayRows.some((d) => d.isRestDay)) {
      return {
        dayOfWeek: day.dayOfWeek,
        isRestDay: true,
        slots: [],
      };
    }
    return {
      dayOfWeek: day.dayOfWeek,
      isRestDay: false,
      slots: dayRows.map((d) => ({
        uid: nextSlotUid(),
        startTime: toHHMM(d.startTime),
        endTime: toHHMM(d.endTime),
        tardyStart: toHHMM(d.tardyStart),
        undertimeStart: toHHMM(d.undertimeStart),
        earlyDismissalStart: toHHMM(d.earlyDismissalStart),
      })),
    };
  });
}

export function weekDraftToDetails(days: DayScheduleDraft[]): ScheduleDetailInput[] {
  const details: ScheduleDetailInput[] = [];
  for (const day of days) {
    if (day.isRestDay || day.slots.length === 0) {
      details.push({
        dayOfWeek: day.dayOfWeek,
        isRestDay: true,
        startTime: null,
        endTime: null,
        tardyStart: null,
        undertimeStart: null,
        earlyDismissalStart: null,
      });
    } else {
      for (const slot of day.slots) {
        details.push({
          dayOfWeek: day.dayOfWeek,
          isRestDay: false,
          startTime: slot.startTime || null,
          endTime: slot.endTime || null,
          tardyStart: slot.tardyStart || null,
          undertimeStart: slot.undertimeStart || null,
          earlyDismissalStart: slot.earlyDismissalStart || null,
        });
      }
    }
  }
  return details;
}

export function isSlotOvernight(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) {
    return false;
  }
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return s >= 0 && e >= 0 && e < s;
}

export function getTodayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysIso(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}

export function formatMinutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
