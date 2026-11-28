import { formatTime12h } from "../overtime/overtime-utils";

export function formatSlotTime(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  return formatTime12h(raw);
}

export function formatAmPmSummary(row: {
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
}): { am: string; pm: string } {
  const am =
    row.amIn || row.amOut
      ? `AM: ${formatSlotTime(row.amIn)} – ${formatSlotTime(row.amOut)}`
      : "AM: —";
  const pm =
    row.pmIn || row.pmOut
      ? `PM: ${formatSlotTime(row.pmIn)} – ${formatSlotTime(row.pmOut)}`
      : "PM: —";
  return { am, pm };
}

export function toHHMM(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.slice(0, 5);
}
