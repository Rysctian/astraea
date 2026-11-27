import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border/80 bg-muted/60 text-foreground",
        blue: "border-blue-200/80 bg-blue-50/70 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300",
        emerald:
          "border-emerald-200/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
        amber:
          "border-amber-200/80 bg-amber-50/70 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
        purple:
          "border-purple-200/80 bg-purple-50/70 text-purple-700 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export function Badge({
  className,
  variant,
  dotColor,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    dotColor?: string;
  }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dotColor ? (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor)} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}
