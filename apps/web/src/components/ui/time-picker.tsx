import { Clock, X } from "lucide-react";
import { useState } from "react";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PRESETS = ["07:00", "08:00", "09:00", "12:00", "17:00", "18:00", "22:00"];

function formatDisplayTime(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h) || !mStr) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${mStr.slice(0, 2)} ${suffix}`;
}

export function TimePicker({
  id,
  value,
  onChange,
  placeholder = "Select time",
  disabled = false,
  allowClear = false,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [curH, curM] = value ? value.split(":") : ["09", "00"];
  const selectedHour = curH?.padStart(2, "0") ?? "09";
  const selectedMinute = curM?.slice(0, 2).padStart(2, "0") ?? "00";

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <PopoverRoot open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-left text-xs shadow-2xs transition-[color,box-shadow] hover:bg-accent/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
              allowClear && value && !disabled && "pr-7",
              !value && "text-muted-foreground",
            )}
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate tabular-nums">
              {value ? formatDisplayTime(value) : placeholder}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-60 p-2.5">
          <div className="mb-2 flex flex-wrap gap-1 border-b border-border pb-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
                className={cn(
                  "cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
                  value === preset
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Hour
              </p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onChange(`${h}:${selectedMinute}`)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded px-2 py-1 text-xs tabular-nums transition-colors",
                      selectedHour === h && value
                        ? "bg-primary font-medium text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span>{h}</span>
                    <span className="text-[10px] opacity-70">{Number(h) >= 12 ? "PM" : "AM"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Minute
              </p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(`${selectedHour}:${m}`);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-center rounded px-2 py-1 text-xs tabular-nums transition-colors",
                      selectedMinute === m && value
                        ? "bg-primary font-medium text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    :{m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </PopoverRoot>
      {allowClear && value && !disabled ? (
        <button
          type="button"
          aria-label="Clear time"
          onClick={() => onChange("")}
          className="absolute right-2 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
