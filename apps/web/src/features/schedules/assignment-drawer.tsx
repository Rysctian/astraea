import { zodResolver } from "@hookform/resolvers/zod";
import type {
  BatchAssignScheduleDto,
  EmployeeScheduleRecord,
  ScheduleRecord,
  UpdateEmployeeScheduleDto,
} from "@starter/shared";
import { Loader2, Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ApiEmployee } from "@/lib/api";
import { getTodayIso } from "./schedule-utils";

const assignFormSchema = z
  .object({
    scheduleId: z.string().min(1, "Schedule template is required"),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Effective start date is required"),
    effectiveTo: z
      .string()
      .optional()
      .default("")
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Must be YYYY-MM-DD"),
  })
  .refine((d) => !d.effectiveTo || d.effectiveTo >= d.effectiveFrom, {
    message: "Effective end date must be on or after start date",
    path: ["effectiveTo"],
  });

type AssignFormValues = z.infer<typeof assignFormSchema>;

export function ScheduleAssignmentDrawer({
  open,
  onOpenChange,
  editingAssignment,
  defaultEmployeeId,
  activeSchedules,
  employees,
  isPending,
  serverError,
  onBatchAssign,
  onUpdateAssignment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAssignment: EmployeeScheduleRecord | null;
  defaultEmployeeId: string | null;
  activeSchedules: ScheduleRecord[];
  employees: ApiEmployee[];
  isPending: boolean;
  serverError: string | null;
  onBatchAssign: (payload: BatchAssignScheduleDto) => void;
  onUpdateAssignment: (id: number, payload: UpdateEmployeeScheduleDto) => void;
}) {
  const isEdit = editingAssignment !== null;

  const initialValues = useMemo<AssignFormValues>(
    () => ({
      scheduleId: editingAssignment
        ? String(editingAssignment.scheduleId)
        : activeSchedules[0]
          ? String(activeSchedules[0].id)
          : "",
      effectiveFrom: editingAssignment?.effectiveFrom ?? getTodayIso(),
      effectiveTo: editingAssignment?.effectiveTo ?? "",
    }),
    [editingAssignment, activeSchedules],
  );

  const form = useForm<AssignFormValues>({
    values: initialValues,
    resolver: zodResolver(assignFormSchema) as never,
  });

  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>(() =>
    defaultEmployeeId ? [defaultEmployeeId] : [],
  );
  const [empSearch, setEmpSearch] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    const term = empSearch.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.employeeId.toLowerCase().includes(term) ||
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(term) ||
        (e.department ?? "").toLowerCase().includes(term),
    );
  }, [employees, empSearch]);

  const toggleEmployee = (empId: string) => {
    setEmpError(null);
    setSelectedEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    );
  };

  const onSubmit = form.handleSubmit((values) => {
    if (isEdit && editingAssignment) {
      onUpdateAssignment(editingAssignment.id, {
        effectiveTo: values.effectiveTo?.trim() ? values.effectiveTo.trim() : null,
      });
      return;
    }

    if (selectedEmpIds.length === 0) {
      setEmpError("Select at least one employee to assign.");
      return;
    }
    if (selectedEmpIds.length > 100) {
      setEmpError("At most 100 employees can be assigned in a single batch.");
      return;
    }

    onBatchAssign({
      scheduleId: Number(values.scheduleId),
      employeeIds: selectedEmpIds,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo?.trim() ? values.effectiveTo.trim() : null,
    });
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="md">
        <DrawerHeader>
          <DrawerTitle>
            {isEdit ? "Update Schedule Assignment" : "Assign Work Schedule"}
          </DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "End or extend an active/future assignment. Schedule template and start date are locked."
              : "Atomically assign an active 7-day template to 1–100 employees with overlap protection."}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {serverError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {serverError}
              </div>
            ) : null}

            {isEdit && editingAssignment ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <Lock
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">
                    {editingAssignment.employeeName} ({editingAssignment.employeeId})
                  </p>
                  <p className="text-muted-foreground">
                    Template:{" "}
                    <span className="text-foreground">{editingAssignment.scheduleName}</span> •
                    Starts {editingAssignment.effectiveFrom}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="assign-sched" className="text-xs font-medium text-foreground">
                Work Schedule Template <span className="text-destructive">*</span>
              </label>
              <Select id="assign-sched" disabled={isEdit} {...form.register("scheduleId")}>
                <option value="">Select active schedule...</option>
                {isEdit && editingAssignment ? (
                  <option value={String(editingAssignment.scheduleId)}>
                    {editingAssignment.scheduleName}
                  </option>
                ) : null}
                {activeSchedules.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} ({s.workingDaysCount}d/wk • {s.timezone})
                  </option>
                ))}
              </Select>
              {form.formState.errors.scheduleId ? (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.scheduleId.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="assign-from" className="text-xs font-medium text-foreground">
                  Effective From <span className="text-destructive">*</span>
                </label>
                <DatePicker
                  id="assign-from"
                  disabled={isEdit}
                  allowClear={false}
                  value={form.watch("effectiveFrom")}
                  onChange={(val) =>
                    form.setValue("effectiveFrom", val, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                {form.formState.errors.effectiveFrom ? (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.effectiveFrom.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="assign-to" className="text-xs font-medium text-foreground">
                  Effective To (optional)
                </label>
                <DatePicker
                  id="assign-to"
                  placeholder="Ongoing"
                  value={form.watch("effectiveTo") ?? ""}
                  onChange={(val) =>
                    form.setValue("effectiveTo", val, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <p className="text-[10px] text-muted-foreground">Leave blank for Ongoing</p>
                {form.formState.errors.effectiveTo ? (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.effectiveTo.message}
                  </p>
                ) : null}
              </div>
            </div>

            {!isEdit ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    Target Employees ({selectedEmpIds.length} selected)
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      className="cursor-pointer font-medium text-primary hover:underline"
                      onClick={() =>
                        setSelectedEmpIds(filteredEmployees.slice(0, 100).map((e) => e.employeeId))
                      }
                    >
                      Select visible
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedEmpIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Filter employees by ID, name, or department..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                {empError ? <p className="text-[11px] text-destructive">{empError}</p> : null}

                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {filteredEmployees.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No matching employees found.
                    </p>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const checked = selectedEmpIds.includes(emp.employeeId);
                      const checkboxId = `assign-emp-${emp.employeeId}`;
                      return (
                        <label
                          key={emp.employeeId}
                          htmlFor={checkboxId}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                            checked ? "bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={() => toggleEmployee(emp.employeeId)}
                            />
                            <span className="truncate font-medium text-foreground">
                              {emp.firstName} {emp.lastName}
                            </span>
                          </span>
                          <Badge variant="neutral" className="shrink-0 font-mono text-[10px]">
                            {emp.employeeId}
                          </Badge>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {isEdit ? "Save End Date" : `Assign (${selectedEmpIds.length})`}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
