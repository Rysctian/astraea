import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PopoverRoot(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-black/[0.04] outline-hidden transition-[opacity,transform] duration-150 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 dark:ring-white/[0.06]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/**
 * Convenience wrapper used by filter & column popovers across the workspace,
 * powered by Radix UI Popover for accessible portals, collision detection, and Escape handling.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  align = "start",
  side = "bottom",
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  children: ReactNode;
}) {
  return (
    <PopoverRoot open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} side={side} className={cn("min-w-48 w-auto p-1.5", className)}>
        {children}
      </PopoverContent>
    </PopoverRoot>
  );
}

export function PopoverLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="popover-label"
      className={cn(
        "px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function PopoverSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="popover-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
      {...props}
    />
  );
}
