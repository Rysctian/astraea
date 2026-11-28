import { type ApprovalStatus, parseTimeToSeconds } from "@starter/shared";
import type { BadgeVariant } from "../approver-setup/approver-setup-utils";

export const APPROVAL_STATUS_META: Record<
  ApprovalStatus,
  { label: string; variant: BadgeVariant; dotColor: string }
> = {
  pending: { label: "Pending", variant: "amber", dotColor: "bg-amber-500" },
  approved: { label: "Approved", variant: "emerald", dotColor: "bg-emerald-500" },
  disapproved: { label: "Disapproved", variant: "neutral", dotColor: "bg-destructive" },
  cancelled: { label: "Cancelled", variant: "neutral", dotColor: "bg-muted-foreground" },
};

export function formatDurationHoursMinutes(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h 0m`;
  return `${hours}h ${mins}m`;
}

export function formatTime12h(raw: string): string {
  const [hStr, mStr] = raw.split(":");
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseCustomBreakHHMM(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  return hours * 3600 + mins * 60;
}

/**
 * Distributes a total break deduction sequentially across slots so every slot keeps
 * at least 1 minute (60s) of positive net overtime if possible.
 */
export function distributeBreakAcrossSlots(
  slots: Array<{ date: string; startTime: string; endTime: string }>,
  totalBreakSeconds: number,
): {
  grossSeconds: number;
  effectiveBreakSeconds: number;
  netSeconds: number;
  perSlotBreaks: number[];
  hasInvalidSlot: boolean;
} {
  let grossSeconds = 0;
  let hasInvalidSlot = false;
  const slotGross: number[] = [];

  for (const s of slots) {
    if (!s.startTime || !s.endTime) {
      slotGross.push(0);
      hasInvalidSlot = true;
      continue;
    }
    const startSec = parseTimeToSeconds(s.startTime);
    const endSec = parseTimeToSeconds(s.endTime);
    const diff = endSec - startSec;
    if (diff <= 0) {
      slotGross.push(0);
      hasInvalidSlot = true;
    } else {
      slotGross.push(diff);
      grossSeconds += diff;
    }
  }

  let remainingBreak = Math.max(0, totalBreakSeconds);
  const perSlotBreaks: number[] = [];

  for (const g of slotGross) {
    if (g <= 0 || remainingBreak <= 0) {
      perSlotBreaks.push(0);
      continue;
    }
    // Keep at least 60s net per slot so break_seconds < gross_seconds holds
    const maxForSlot = Math.max(0, g - 60);
    const take = Math.min(remainingBreak, maxForSlot);
    perSlotBreaks.push(take);
    remainingBreak -= take;
  }

  const effectiveBreakSeconds = perSlotBreaks.reduce((sum, b) => sum + b, 0);
  const unallocatedBreak = remainingBreak > 0;

  return {
    grossSeconds,
    effectiveBreakSeconds,
    netSeconds: Math.max(0, grossSeconds - totalBreakSeconds),
    perSlotBreaks,
    hasInvalidSlot: hasInvalidSlot || unallocatedBreak || grossSeconds <= totalBreakSeconds,
  };
}
