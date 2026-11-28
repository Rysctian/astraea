import type { AttendanceLogSource, DtrRowStatus } from "@starter/shared";
import { format, isValid, parseISO } from "date-fns";

export function formatSecondsCompact(seconds: number): string {
  if (seconds <= 0) {
    return "0m";
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatHoursDecimal(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(2)} hrs`;
}

export function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  const parts = timeStr.split(":");
  const h = Number(parts[0]);
  const m = parts[1];
  if (Number.isNaN(h) || !m) return timeStr;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${m.slice(0, 2)} ${suffix}`;
}

export function formatDateLabel(dateStr: string): string {
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? format(parsed, "MMM d, yyyy (EEE)") : dateStr;
}

export function formatTimestamp(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return format(dt, "MMM d, yyyy hh:mm a");
}

export function formatLogSource(source: AttendanceLogSource): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "excel_import":
      return "Excel import";
    case "correction":
      return "Correction";
    default:
      return "Biometric";
  }
}

export function getLogSourceVariant(
  source: AttendanceLogSource,
): "blue" | "purple" | "emerald" | "amber" {
  switch (source) {
    case "manual":
      return "blue";
    case "excel_import":
      return "purple";
    case "correction":
      return "amber";
    default:
      return "emerald";
  }
}

export function getDtrStatusVariant(
  status: DtrRowStatus,
): "emerald" | "amber" | "neutral" | "purple" | "blue" {
  switch (status) {
    case "present":
      return "emerald";
    case "late_or_undertime":
      return "amber";
    case "absent":
      return "purple";
    case "rest_day":
      return "blue";
    default:
      return "neutral";
  }
}

export function getDefaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

export function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
