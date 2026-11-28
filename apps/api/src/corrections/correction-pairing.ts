import { type FourSlotPunches, parseTimeToSeconds } from "@starter/shared";

const NOON_SEC = 12 * 3600;
const HALF_PAST_NOON_SEC = 12 * 3600 + 30 * 60;
const ONE_PM_SEC = 13 * 3600;
const THREE_PM_SEC = 15 * 3600;

/**
 * Formats a UTC Date to local `HH:MM:SS` in the specified IANA timezone.
 */
export function formatUtcDateToLocalTime(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const s = parts.find((p) => p.type === "second")?.value ?? "00";
    const hourNorm = h === "24" ? "00" : h;
    return `${hourNorm}:${m}:${s}`;
  } catch {
    return date.toISOString().slice(11, 19);
  }
}

/**
 * Exact 4-slot AM/PM heuristic pairing from Module 14 Spec Section 2 Step 1:
 * - 0 punches: all null
 * - 1 punch: < 12:00 -> amIn; 12:00..14:59:59 -> pmIn; >= 15:00 -> pmOut
 * - 2 punches: (first < 12:00 && second <= 13:00) -> amIn, amOut;
 *              (first < 12:00 && second > 13:00) -> amIn, pmOut;
 *              (first >= 12:00) -> pmIn, pmOut
 * - 3 punches: (first < 12:00 && second <= 12:30) -> amIn, amOut, pmOut;
 *              (first < 12:00 && second > 12:30) -> amIn, pmIn, pmOut;
 *              (first >= 12:00) -> pmIn (first), pmOut (third)
 * - 4+ punches: 1st -> amIn, 2nd -> amOut, 2nd-to-last -> pmIn, last -> pmOut
 */
export function pairPunchesToFourSlots(sortedLocalTimes: string[]): FourSlotPunches {
  const n = sortedLocalTimes.length;
  if (n === 0) {
    return { amIn: null, amOut: null, pmIn: null, pmOut: null };
  }

  if (n === 1) {
    const t0 = sortedLocalTimes[0] ?? null;
    if (!t0) return { amIn: null, amOut: null, pmIn: null, pmOut: null };
    const s0 = parseTimeToSeconds(t0);
    if (s0 < NOON_SEC) return { amIn: t0, amOut: null, pmIn: null, pmOut: null };
    if (s0 < THREE_PM_SEC) return { amIn: null, amOut: null, pmIn: t0, pmOut: null };
    return { amIn: null, amOut: null, pmIn: null, pmOut: t0 };
  }

  if (n === 2) {
    const t0 = sortedLocalTimes[0] ?? null;
    const t1 = sortedLocalTimes[1] ?? null;
    if (!t0 || !t1) return { amIn: null, amOut: null, pmIn: null, pmOut: null };
    const s0 = parseTimeToSeconds(t0);
    const s1 = parseTimeToSeconds(t1);
    if (s0 < NOON_SEC && s1 <= ONE_PM_SEC) {
      return { amIn: t0, amOut: t1, pmIn: null, pmOut: null };
    }
    if (s0 < NOON_SEC && s1 > ONE_PM_SEC) {
      return { amIn: t0, amOut: null, pmIn: null, pmOut: t1 };
    }
    return { amIn: null, amOut: null, pmIn: t0, pmOut: t1 };
  }

  if (n === 3) {
    const t0 = sortedLocalTimes[0] ?? null;
    const t1 = sortedLocalTimes[1] ?? null;
    const t2 = sortedLocalTimes[2] ?? null;
    if (!t0 || !t1 || !t2) return { amIn: null, amOut: null, pmIn: null, pmOut: null };
    const s0 = parseTimeToSeconds(t0);
    const s1 = parseTimeToSeconds(t1);
    if (s0 < NOON_SEC && s1 <= HALF_PAST_NOON_SEC) {
      return { amIn: t0, amOut: t1, pmIn: null, pmOut: t2 };
    }
    if (s0 < NOON_SEC && s1 > HALF_PAST_NOON_SEC) {
      return { amIn: t0, amOut: null, pmIn: t1, pmOut: t2 };
    }
    return { amIn: null, amOut: null, pmIn: t0, pmOut: t2 };
  }

  return {
    amIn: sortedLocalTimes[0] ?? null,
    amOut: sortedLocalTimes[1] ?? null,
    pmIn: sortedLocalTimes[n - 2] ?? null,
    pmOut: sortedLocalTimes[n - 1] ?? null,
  };
}

export function extractUniqueSlotTimes(slots: FourSlotPunches): string[] {
  const raw = [slots.amIn, slots.amOut, slots.pmIn, slots.pmOut].filter(
    (v): v is string => v !== null && v.trim().length > 0,
  );
  return Array.from(new Set(raw)).sort();
}

export function computeCorrectionLogDiff(
  oldSlots: FourSlotPunches,
  newSlots: FourSlotPunches,
): { replacedTimes: string[]; requestedTimes: string[] } {
  const oldList = extractUniqueSlotTimes(oldSlots);
  const newList = extractUniqueSlotTimes(newSlots);
  const newSet = new Set(newList);
  const replacedTimes = oldList.filter((t) => !newSet.has(t));
  return { replacedTimes, requestedTimes: newList };
}
