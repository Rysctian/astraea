import {
  type DtrRowRecord,
  type DtrRowStatus,
  type DtrSummaryMetrics,
  getCodeDay,
  type TardyCountFrom,
} from "@starter/shared";

export interface EvalPolicyRules {
  tardyGraceSeconds: number;
  tardyCountFrom: TardyCountFrom;
  absentAfterLateSeconds: number | null;
  undertimeGraceSeconds: number;
  earlyInWindowSeconds: number;
  lateOutWindowSeconds: number;
  duplicateTapWindowSeconds: number;
}

export const ZERO_POLICY_RULES: EvalPolicyRules = {
  tardyGraceSeconds: 0,
  tardyCountFrom: "schedule_start",
  absentAfterLateSeconds: null,
  undertimeGraceSeconds: 0,
  earlyInWindowSeconds: 14400,
  lateOutWindowSeconds: 14400,
  duplicateTapWindowSeconds: 120,
};

export interface EvalScheduleSlot {
  dayOfWeek: number;
  isRestDay: boolean;
  startTime: string | null;
  endTime: string | null;
  tardyStart: string | null;
  undertimeStart: string | null;
  earlyDismissalStart: string | null;
}

export interface EvalScheduleAssignment {
  scheduleId: number;
  scheduleName: string;
  timezone: string;
  attendancePolicyId: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  details: EvalScheduleSlot[];
}

export interface EvalInput {
  from: string;
  to: string;
  assignments: EvalScheduleAssignment[];
  policiesById: Map<number, EvalPolicyRules>;
  defaultPolicy: EvalPolicyRules | null;
  logs: Date[];
}

const SECONDS_PER_DAY = 86_400;

export function addDaysIso(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}

export function getIsoDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h * 3600 + m * 60 + s;
}

export function formatSecondsToTime(totalSeconds: number): string {
  const normalized = ((totalSeconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const h = Math.floor(normalized / 3600);
  const m = Math.floor((normalized % 3600) / 60);
  const s = Math.floor(normalized % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Converts a UTC Date into calendar date + seconds-since-midnight in the given IANA timezone.
 */
export function toLocalDateTimeParts(
  date: Date,
  timeZone: string,
): { dateStr: string; secondsOfDay: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  return {
    dateStr: `${year}-${month}-${day}`,
    secondsOfDay: hour * 3600 + minute * 60 + second,
  };
}

/**
 * Computes UTC offset in ms for an IANA timezone at a given local YYYY-MM-DD HH:MM:SS,
 * returning an exact UTC Date.
 */
export function localDateTimeToUtcDate(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = timeStr.split(":").map(Number);
  const approxUtc = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, ss ?? 0));
  const local = toLocalDateTimeParts(approxUtc, timeZone);
  const localDayMs = Date.parse(`${local.dateStr}T00:00:00Z`) + local.secondsOfDay * 1000;
  const targetLocalMs =
    Date.parse(`${dateStr}T00:00:00Z`) + ((hh ?? 0) * 3600 + (mm ?? 0) * 60 + (ss ?? 0)) * 1000;
  const diffMs = targetLocalMs - localDayMs;
  return new Date(approxUtc.getTime() + diffMs);
}

function debouncePunches(sortedOffsets: number[], duplicateTapWindowSeconds: number): number[] {
  if (sortedOffsets.length <= 1 || duplicateTapWindowSeconds <= 0) {
    return sortedOffsets;
  }
  const result: number[] = [];
  for (const offset of sortedOffsets) {
    const last = result[result.length - 1];
    if (last === undefined || offset - last > duplicateTapWindowSeconds) {
      result.push(offset);
    }
  }
  return result;
}

export function evaluateDtr(input: EvalInput): {
  rows: DtrRowRecord[];
  summary: DtrSummaryMetrics;
} {
  const rows: DtrRowRecord[] = [];
  const sortedLogs = [...input.logs].sort((a, b) => a.getTime() - b.getTime());

  // Cache local conversions per timezone
  const logsByTimezone = new Map<
    string,
    Array<{ dateStr: string; secondsOfDay: number; dayEpochSeconds: number }>
  >();

  const getTimezoneLogs = (tz: string) => {
    const cached = logsByTimezone.get(tz);
    if (cached) return cached;
    const mapped = sortedLogs.map((dt) => {
      const parts = toLocalDateTimeParts(dt, tz);
      const dayEpochSeconds = Math.floor(Date.parse(`${parts.dateStr}T00:00:00Z`) / 1000);
      return {
        dateStr: parts.dateStr,
        secondsOfDay: parts.secondsOfDay,
        dayEpochSeconds,
      };
    });
    logsByTimezone.set(tz, mapped);
    return mapped;
  };

  let cursor = input.from;

  while (cursor <= input.to) {
    const dayOfWeek = getIsoDayOfWeek(cursor);
    const codeDay = getCodeDay(dayOfWeek);

    const assignment = input.assignments.find(
      (a) => a.effectiveFrom <= cursor && (a.effectiveTo === null || a.effectiveTo >= cursor),
    );

    if (!assignment) {
      rows.push({
        date: cursor,
        dayOfWeek,
        codeDay,
        scheduleId: null,
        scheduleName: null,
        timezone: null,
        slotIndex: 0,
        schedStart: null,
        schedEnd: null,
        isOvernight: false,
        timeIn: null,
        timeOut: null,
        scheduledSeconds: 0,
        renderedSeconds: 0,
        tardySeconds: 0,
        undertimeSeconds: 0,
        absent: false,
        undertime: false,
        earlyDismiss: false,
        status: "no_schedule",
        remarks: "No schedule",
      });
      cursor = addDaysIso(cursor, 1);
      continue;
    }

    const daySlots = assignment.details.filter((d) => d.dayOfWeek === dayOfWeek);

    if (daySlots.length === 0) {
      rows.push({
        date: cursor,
        dayOfWeek,
        codeDay,
        scheduleId: assignment.scheduleId,
        scheduleName: assignment.scheduleName,
        timezone: assignment.timezone,
        slotIndex: 0,
        schedStart: null,
        schedEnd: null,
        isOvernight: false,
        timeIn: null,
        timeOut: null,
        scheduledSeconds: 0,
        renderedSeconds: 0,
        tardySeconds: 0,
        undertimeSeconds: 0,
        absent: false,
        undertime: false,
        earlyDismiss: false,
        status: "no_schedule",
        remarks: "No schedule details",
      });
      cursor = addDaysIso(cursor, 1);
      continue;
    }

    if (daySlots.some((d) => d.isRestDay)) {
      rows.push({
        date: cursor,
        dayOfWeek,
        codeDay,
        scheduleId: assignment.scheduleId,
        scheduleName: assignment.scheduleName,
        timezone: assignment.timezone,
        slotIndex: 0,
        schedStart: null,
        schedEnd: null,
        isOvernight: false,
        timeIn: null,
        timeOut: null,
        scheduledSeconds: 0,
        renderedSeconds: 0,
        tardySeconds: 0,
        undertimeSeconds: 0,
        absent: false,
        undertime: false,
        earlyDismiss: false,
        status: "rest_day",
        remarks: "Rest day",
      });
      cursor = addDaysIso(cursor, 1);
      continue;
    }

    const policy =
      (assignment.attendancePolicyId !== null
        ? input.policiesById.get(assignment.attendancePolicyId)
        : undefined) ??
      input.defaultPolicy ??
      ZERO_POLICY_RULES;

    const tzLogs = getTimezoneLogs(assignment.timezone);
    const cursorDayEpochSec = Math.floor(Date.parse(`${cursor}T00:00:00Z`) / 1000);

    const workingSlots = daySlots
      .filter((s): s is EvalScheduleSlot & { startTime: string; endTime: string } =>
        Boolean(!s.isRestDay && s.startTime && s.endTime),
      )
      .sort((a, b) => parseTimeToSeconds(a.startTime) - parseTimeToSeconds(b.startTime));

    workingSlots.forEach((slot, slotIdx) => {
      const startSec = parseTimeToSeconds(slot.startTime);
      const rawEndSec = parseTimeToSeconds(slot.endTime);
      const isOvernight = rawEndSec < startSec;
      const endSec = isOvernight ? rawEndSec + SECONDS_PER_DAY : rawEndSec;
      const scheduledSeconds = endSec - startSec;

      // Window boundaries relative to cursor's midnight (seconds)
      const prevSlot = workingSlots[slotIdx - 1];
      const nextSlot = workingSlots[slotIdx + 1];

      let winStart = startSec - policy.earlyInWindowSeconds;
      let winEnd = endSec + policy.lateOutWindowSeconds;

      // For split shifts, clamp slot windows at midpoints between adjacent slots
      if (prevSlot) {
        const prevEnd =
          parseTimeToSeconds(prevSlot.endTime) < parseTimeToSeconds(prevSlot.startTime)
            ? parseTimeToSeconds(prevSlot.endTime) + SECONDS_PER_DAY
            : parseTimeToSeconds(prevSlot.endTime);
        const midpoint = Math.floor((prevEnd + startSec) / 2);
        winStart = Math.max(winStart, midpoint);
      }
      if (nextSlot) {
        const nextStart = parseTimeToSeconds(nextSlot.startTime);
        const midpoint = Math.floor((endSec + nextStart) / 2);
        winEnd = Math.min(winEnd, midpoint);
      }

      const rawCandidateOffsets: number[] = [];
      for (const log of tzLogs) {
        const relSec = log.dayEpochSeconds - cursorDayEpochSec + log.secondsOfDay;
        if (relSec >= winStart && relSec <= winEnd) {
          rawCandidateOffsets.push(relSec);
        }
      }
      rawCandidateOffsets.sort((a, b) => a - b);

      const candidateOffsets = debouncePunches(
        rawCandidateOffsets,
        policy.duplicateTapWindowSeconds,
      );

      const timeInSec = candidateOffsets[0];
      const timeOutSec =
        candidateOffsets.length >= 2 ? candidateOffsets[candidateOffsets.length - 1] : undefined;

      const timeInStr = timeInSec !== undefined ? formatSecondsToTime(timeInSec) : null;
      const timeOutStr = timeOutSec !== undefined ? formatSecondsToTime(timeOutSec) : null;

      // Missing punch check (0 or 1 punch)
      if (timeInSec === undefined || timeOutSec === undefined) {
        rows.push({
          date: cursor,
          dayOfWeek,
          codeDay,
          scheduleId: assignment.scheduleId,
          scheduleName: assignment.scheduleName,
          timezone: assignment.timezone,
          slotIndex: slotIdx,
          schedStart: slot.startTime,
          schedEnd: slot.endTime,
          isOvernight,
          timeIn: timeInStr,
          timeOut: timeOutStr,
          scheduledSeconds,
          renderedSeconds: 0,
          tardySeconds: 0,
          undertimeSeconds: scheduledSeconds,
          absent: true,
          undertime: true,
          earlyDismiss: false,
          status: "absent",
          remarks: timeInSec === undefined ? "Absent" : "Incomplete punch (Absent)",
        });
        return;
      }

      // Late-to-absent policy cutoff (Rule 4)
      if (
        policy.absentAfterLateSeconds !== null &&
        timeInSec > startSec + policy.absentAfterLateSeconds
      ) {
        rows.push({
          date: cursor,
          dayOfWeek,
          codeDay,
          scheduleId: assignment.scheduleId,
          scheduleName: assignment.scheduleName,
          timezone: assignment.timezone,
          slotIndex: slotIdx,
          schedStart: slot.startTime,
          schedEnd: slot.endTime,
          isOvernight,
          timeIn: timeInStr,
          timeOut: timeOutStr,
          scheduledSeconds,
          renderedSeconds: 0,
          tardySeconds: 0,
          undertimeSeconds: scheduledSeconds,
          absent: true,
          undertime: true,
          earlyDismiss: false,
          status: "absent",
          remarks: "Absent (late cutoff)",
        });
        return;
      }

      // Clamped rendered duration (Rule 7)
      const clampedStart = Math.max(timeInSec, startSec);
      const clampedEnd = Math.min(timeOutSec, endSec);
      const renderedSeconds = Math.max(0, clampedEnd - clampedStart);

      if (renderedSeconds === 0) {
        rows.push({
          date: cursor,
          dayOfWeek,
          codeDay,
          scheduleId: assignment.scheduleId,
          scheduleName: assignment.scheduleName,
          timezone: assignment.timezone,
          slotIndex: slotIdx,
          schedStart: slot.startTime,
          schedEnd: slot.endTime,
          isOvernight,
          timeIn: timeInStr,
          timeOut: timeOutStr,
          scheduledSeconds,
          renderedSeconds: 0,
          tardySeconds: 0,
          undertimeSeconds: scheduledSeconds,
          absent: true,
          undertime: true,
          earlyDismiss: false,
          status: "absent",
          remarks: "Absent",
        });
        return;
      }

      // Tardy calculation (Rule 5)
      let tardyCutoffSec = startSec + policy.tardyGraceSeconds;
      if (slot.tardyStart) {
        const rawTardy = parseTimeToSeconds(slot.tardyStart);
        tardyCutoffSec = isOvernight && rawTardy < startSec ? rawTardy + SECONDS_PER_DAY : rawTardy;
      }
      let tardySeconds = 0;
      if (timeInSec > tardyCutoffSec) {
        tardySeconds =
          policy.tardyCountFrom === "after_grace"
            ? timeInSec - tardyCutoffSec
            : timeInSec - startSec;
      }

      // Undertime calculation (Rule 6)
      let undertimeCutoffSec = endSec - policy.undertimeGraceSeconds;
      if (slot.undertimeStart) {
        const rawUt = parseTimeToSeconds(slot.undertimeStart);
        undertimeCutoffSec = isOvernight && rawUt < startSec ? rawUt + SECONDS_PER_DAY : rawUt;
      }
      let undertimeSeconds = 0;
      if (timeOutSec < undertimeCutoffSec) {
        undertimeSeconds = Math.min(Math.max(0, endSec - timeOutSec), scheduledSeconds);
      }
      const undertime = undertimeSeconds > 0;

      // Early dismissal (Rule 6)
      let earlyDismissCutoffSec = endSec;
      if (slot.earlyDismissalStart) {
        const rawEd = parseTimeToSeconds(slot.earlyDismissalStart);
        earlyDismissCutoffSec = isOvernight && rawEd < startSec ? rawEd + SECONDS_PER_DAY : rawEd;
      }
      const earlyDismiss = timeOutSec < earlyDismissCutoffSec;

      const remarkParts: string[] = [];
      if (tardySeconds > 0) remarkParts.push("Late");
      if (undertime) remarkParts.push("Undertime");
      const status: DtrRowStatus = tardySeconds > 0 || undertime ? "late_or_undertime" : "present";

      rows.push({
        date: cursor,
        dayOfWeek,
        codeDay,
        scheduleId: assignment.scheduleId,
        scheduleName: assignment.scheduleName,
        timezone: assignment.timezone,
        slotIndex: slotIdx,
        schedStart: slot.startTime,
        schedEnd: slot.endTime,
        isOvernight,
        timeIn: timeInStr,
        timeOut: timeOutStr,
        scheduledSeconds,
        renderedSeconds,
        tardySeconds,
        undertimeSeconds,
        absent: false,
        undertime,
        earlyDismiss,
        status,
        remarks: remarkParts.length > 0 ? remarkParts.join(" / ") : "Present",
      });
    });

    cursor = addDaysIso(cursor, 1);
  }

  // Compute 5 KPI summary metrics
  let totalRenderedSeconds = 0;
  let totalScheduledSeconds = 0;
  let totalTardySeconds = 0;
  let totalUndertimeSeconds = 0;
  const presentDateSet = new Set<string>();
  const absentCandidateDateSet = new Set<string>();

  for (const r of rows) {
    totalRenderedSeconds += r.renderedSeconds;
    totalScheduledSeconds += r.scheduledSeconds;
    totalTardySeconds += r.tardySeconds;
    totalUndertimeSeconds += r.undertimeSeconds;
    if (r.renderedSeconds > 0) {
      presentDateSet.add(r.date);
    }
    if (r.absent) {
      absentCandidateDateSet.add(r.date);
    }
  }

  // Absent days exclude dates where at least one shift slot rendered time
  let absentDays = 0;
  for (const d of absentCandidateDateSet) {
    if (!presentDateSet.has(d)) {
      absentDays += 1;
    }
  }

  return {
    rows,
    summary: {
      totalRenderedSeconds,
      totalScheduledSeconds,
      presentDays: presentDateSet.size,
      absentDays,
      totalTardySeconds,
      totalUndertimeSeconds,
    },
  };
}
