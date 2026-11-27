import { createContext, type ReactNode, useContext, useMemo, useRef } from "react";

interface WorkspaceActionsContextValue {
  registerCreateHandler: (fn: (() => void) | null) => void;
  registerSearchFocusHandler: (fn: (() => void) | null) => void;
  triggerCreate: () => void;
  triggerSearchFocus: () => void;
}

const noop = () => {};

const WorkspaceActionsContext = createContext<WorkspaceActionsContextValue>({
  registerCreateHandler: noop,
  registerSearchFocusHandler: noop,
  triggerCreate: noop,
  triggerSearchFocus: noop,
});

export function WorkspaceActionsProvider({ children }: { children: ReactNode }) {
  const createRef = useRef<(() => void) | null>(null);
  const searchRef = useRef<(() => void) | null>(null);

  const value = useMemo<WorkspaceActionsContextValue>(
    () => ({
      registerCreateHandler: (fn) => {
        createRef.current = fn;
      },
      registerSearchFocusHandler: (fn) => {
        searchRef.current = fn;
      },
      triggerCreate: () => {
        createRef.current?.();
      },
      triggerSearchFocus: () => {
        searchRef.current?.();
      },
    }),
    [],
  );

  return (
    <WorkspaceActionsContext.Provider value={value}>{children}</WorkspaceActionsContext.Provider>
  );
}

export function useWorkspaceActions(): WorkspaceActionsContextValue {
  return useContext(WorkspaceActionsContext);
}
