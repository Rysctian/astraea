import type { PaginationMeta } from "@starter/shared";
import {
  type ColumnDef,
  type ColumnVisibilityState,
  columnVisibilityFeature,
  type OnChangeFn,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverLabel, PopoverSeparator } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const serverTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  rowPaginationFeature,
});

export type ServerTableFeatures = typeof serverTableFeatures;
export type ServerColumnDef<TData extends RowData> = ColumnDef<ServerTableFeatures, TData, unknown>;

export interface ColumnToggleOption {
  id: string;
  label: string;
}

export function ColumnVisibilityPopover({
  open,
  onOpenChange,
  options,
  columnVisibility,
  onToggle,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ColumnToggleOption[];
  columnVisibility: ColumnVisibilityState;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      className="w-48"
      trigger={
        <Button
          type="button"
          variant={open ? "secondary" : "ghost"}
          size="sm"
          className={
            open
              ? "h-8 gap-1.5 px-2.5 text-xs font-medium text-foreground"
              : "h-8 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
          }
          onClick={() => onOpenChange(!open)}
        >
          <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Columns</span>
        </Button>
      }
    >
      <PopoverLabel>Visible columns</PopoverLabel>
      <div className="flex flex-col gap-0.5 py-0.5">
        {options.map((col) => {
          const isVisible = columnVisibility[col.id] !== false;
          return (
            <div
              key={col.id}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
            >
              <Checkbox
                id={`col-${col.id}`}
                checked={isVisible}
                onCheckedChange={() => onToggle(col.id)}
                aria-label={`Toggle ${col.label} column`}
              />
              <label
                htmlFor={`col-${col.id}`}
                className="flex-1 cursor-pointer select-none text-foreground"
              >
                {col.label}
              </label>
            </div>
          );
        })}
      </div>
      <PopoverSeparator />
      <button
        type="button"
        onClick={onReset}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Reset columns</span>
      </button>
    </Popover>
  );
}

export function ServerDataTable<TData extends RowData>({
  columns,
  data,
  meta,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  onPageChange,
  onPageSizeChange,
  isPending = false,
  isFetching = false,
  emptyState,
}: {
  columns: ServerColumnDef<TData>[];
  data: TData[];
  meta: PaginationMeta;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnVisibility: ColumnVisibilityState;
  onColumnVisibilityChange: OnChangeFn<ColumnVisibilityState>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  isPending?: boolean;
  isFetching?: boolean;
  emptyState?: ReactNode;
}) {
  const paginationState = useMemo(
    () => ({
      pageIndex: Math.max(0, meta.page - 1),
      pageSize: meta.pageSize,
    }),
    [meta.page, meta.pageSize],
  );

  const table = useTable({
    features: serverTableFeatures,
    data,
    columns,
    rowCount: meta.total,
    manualPagination: true,
    manualSorting: true,
    state: {
      sorting,
      columnVisibility,
      pagination: paginationState,
    },
    onSortingChange,
    onColumnVisibilityChange,
  });

  const rows = table.getRowModel().rows;

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-border py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Loading records...</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-t border-border py-16 text-center">
        {emptyState ?? (
          <p className="text-sm text-muted-foreground">No records match the current filters.</p>
        )}
      </div>
    );
  }

  const startItem = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const endItem = Math.min(meta.total, meta.page * meta.pageSize);

  return (
    <div className="flex flex-col">
      <div className={isFetching ? "opacity-75 transition-opacity" : undefined}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header, idx) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={
                        idx === 0
                          ? "pl-6"
                          : idx === headerGroup.headers.length - 1
                            ? "pr-6"
                            : undefined
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <span>
                            <table.FlexRender header={header} />
                          </span>
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3 text-primary" aria-hidden="true" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3 text-primary" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown
                              className="h-3 w-3 text-muted-foreground/50"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="group">
                {row.getVisibleCells().map((cell, idx) => (
                  <TableCell
                    key={cell.id}
                    className={
                      idx === 0
                        ? "pl-6"
                        : idx === row.getVisibleCells().length - 1
                          ? "pr-6"
                          : undefined
                    }
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-6 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 tabular-nums">
          <span>
            Showing <strong className="font-medium text-foreground">{startItem}</strong>–
            <strong className="font-medium text-foreground">{endItem}</strong> of{" "}
            <strong className="font-medium text-foreground">{meta.total}</strong>
          </span>
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <label htmlFor="table-page-size" className="text-xs text-muted-foreground">
              Rows
            </label>
            <select
              id="table-page-size"
              value={meta.pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <span className="tabular-nums">
            Page <strong className="font-medium text-foreground">{meta.page}</strong> of{" "}
            <strong className="font-medium text-foreground">{meta.totalPages}</strong>
          </span>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Previous page"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Next page"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
