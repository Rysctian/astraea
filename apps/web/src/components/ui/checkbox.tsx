import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className={cn(
          "peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-input bg-background transition-colors hover:border-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 checked:border-primary checked:bg-primary",
          className,
        )}
        {...props}
      />
      <Check
        className="pointer-events-none absolute h-3 w-3 stroke-[2.75] text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
        aria-hidden="true"
      />
    </span>
  );
}
