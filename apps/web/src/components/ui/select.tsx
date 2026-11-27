import { Check, ChevronDown } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative flex w-full items-center">
      <select
        data-slot="select"
        className={cn(
          "flex h-9 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-input bg-background py-1 pr-8 pl-3 text-xs font-medium text-foreground shadow-2xs transition-[color,box-shadow,border-color] hover:bg-accent/35 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export interface SelectMenuOption {
  value: string;
  label: string;
}

export function SelectMenu({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled = false,
  align = "start",
  className,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.value === value);

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          className={cn(
            "inline-flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background px-3 py-1.5 text-left text-xs font-medium text-foreground shadow-2xs transition-all duration-150 hover:bg-accent/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            open
              ? "border-primary ring-3 ring-primary/20"
              : "border-input focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "font-normal text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              open && "rotate-180 text-foreground",
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className="max-h-72 min-w-[var(--radix-popover-trigger-width)] w-auto overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 shadow-lg ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
      >
        <div role="listbox" className="flex flex-col gap-0.5">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                  isSelected
                    ? "bg-accent/60 font-medium text-foreground"
                    : "text-foreground/85 hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-foreground/80" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
