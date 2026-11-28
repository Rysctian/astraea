import { parseTimeToSeconds } from "@starter/shared";

export interface ObWindowSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ExistingObWindow extends ObWindowSlot {
  applicationId: number;
  status: string;
}

export function checkOfficialBusinessOverlaps(params: {
  employeeId: string;
  requested: ObWindowSlot[];
  existingActive: ExistingObWindow[];
}): string | null {
  const byDateRequested = new Map<
    string,
    Array<{ startSec: number; endSec: number; raw: ObWindowSlot }>
  >();

  for (const slot of params.requested) {
    const startSec = parseTimeToSeconds(slot.startTime);
    const endSec = parseTimeToSeconds(slot.endTime);
    if (endSec <= startSec) {
      return `Schedule window on ${slot.date} must have an end time strictly after start time`;
    }
    const list = byDateRequested.get(slot.date) ?? [];
    list.push({ startSec, endSec, raw: slot });
    byDateRequested.set(slot.date, list);
  }

  // Intra-application non-overlap
  for (const [date, slots] of byDateRequested.entries()) {
    const sorted = [...slots].sort((a, b) => a.startSec - b.startSec);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev && curr && curr.startSec < prev.endSec) {
        return `Schedule window ${curr.raw.startTime.slice(0, 5)}–${curr.raw.endTime.slice(0, 5)} overlaps another slot on ${date}`;
      }
    }
  }

  // Cross-application non-overlap against pending/approved windows
  const byDateExisting = new Map<
    string,
    Array<{ startSec: number; endSec: number; raw: ExistingObWindow }>
  >();
  for (const ex of params.existingActive) {
    if (ex.status !== "pending" && ex.status !== "approved") continue;
    const list = byDateExisting.get(ex.date) ?? [];
    list.push({
      startSec: parseTimeToSeconds(ex.startTime),
      endSec: parseTimeToSeconds(ex.endTime),
      raw: ex,
    });
    byDateExisting.set(ex.date, list);
  }

  for (const [date, reqSlots] of byDateRequested.entries()) {
    const existingList = byDateExisting.get(date);
    if (!existingList || existingList.length === 0) continue;

    for (const req of reqSlots) {
      for (const ex of existingList) {
        if (req.startSec < ex.endSec && ex.startSec < req.endSec) {
          return `Schedule window ${req.raw.startTime.slice(0, 5)}–${req.raw.endTime.slice(0, 5)} on ${date} for ${params.employeeId} overlaps existing ${ex.raw.status} OB/WFH application #${ex.raw.applicationId} (${ex.raw.startTime.slice(0, 5)}–${ex.raw.endTime.slice(0, 5)})`;
        }
      }
    }
  }

  return null;
}
