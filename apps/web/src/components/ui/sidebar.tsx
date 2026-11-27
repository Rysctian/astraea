import { PanelLeft } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}

export function SidebarProvider({
  defaultOpen = true,
  className,
  children,
}: {
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen((prev) => !prev);
      return;
    }
    setOpen((prev) => !prev);
  }

  return (
    <SidebarContext.Provider value={{ open, setOpen, mobileOpen, setMobileOpen, toggleSidebar }}>
      <div className={cn("flex min-h-svh w-full bg-background text-foreground", className)}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  const { open, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out md:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col overflow-hidden border-r border-sidebar-border/80 bg-sidebar/95 text-sidebar-foreground backdrop-blur-md transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:static md:z-auto md:transition-[width,border-color] md:duration-300 md:ease-[cubic-bezier(0.22,1,0.36,1)]",
          mobileOpen
            ? "translate-x-0 shadow-2xl md:shadow-none"
            : "-translate-x-full md:translate-x-0",
          open ? "md:w-[248px]" : "md:w-0 md:border-r-transparent",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex h-full w-[248px] flex-col transition-opacity duration-200 ease-out",
            open ? "opacity-100" : "md:opacity-0",
          )}
        >
          {children}
        </div>
      </aside>
    </>
  );
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-13 shrink-0 items-center justify-between gap-2 px-3", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-2.5", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-auto shrink-0 border-t border-sidebar-border/80 p-2.5", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-2.5 pb-1 pt-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground/75 uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex flex-col gap-0.5", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

export function sidebarMenuButtonClasses(isActive = false, disabled = false): string {
  return cn(
    "group relative flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    disabled
      ? "cursor-default text-muted-foreground/55"
      : isActive
        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-sidebar-border/80"
        : "cursor-pointer text-sidebar-foreground/85 hover:bg-black/[0.04] hover:text-foreground active:scale-[0.99] dark:hover:bg-white/[0.06]",
  );
}

export function SidebarMenuButton({
  isActive = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }) {
  return (
    <button
      type="button"
      data-active={isActive}
      className={cn(sidebarMenuButtonClasses(isActive, props.disabled), className)}
      {...props}
    />
  );
}

export function SidebarTrigger({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn(
        "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <PanelLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function SidebarInset({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-w-0 flex-1 flex-col bg-background", className)} {...props} />;
}
