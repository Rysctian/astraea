import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateEmployeeDto, createEmployeeSchema } from "@starter/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { type ApiEmployee, api } from "@/lib/api";
import { EmployeeFormSections } from "./employee-form-sections";
import {
  createEmptyEmployeeForm,
  EMPLOYEE_FORM_TABS,
  type EmployeeFormTab,
  type EmployeeFormValues,
  getFirstEmployeeErrorTab,
  hasEmployeeTabErrors,
  normalizeEmployeePayload,
} from "./employee-utils";

export function EmployeeCreateDrawer({
  open,
  onOpenChange,
  supervisors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisors: ApiEmployee[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<EmployeeFormTab>("personal");
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<EmployeeFormValues>({
    defaultValues: createEmptyEmployeeForm(),
    resolver: zodResolver(createEmployeeSchema) as never,
  });

  const createMutation = useMutation({
    mutationFn: api.createEmployee,
    onSuccess: async (detail) => {
      onOpenChange(false);
      form.reset(createEmptyEmployeeForm());
      setServerError(null);
      setActiveTab("personal");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
      ]);
      await navigate({
        to: "/employees/$employeeId",
        params: { employeeId: detail.employee.employeeId },
      });
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerError(null);
      createMutation.mutate(normalizeEmployeePayload(values) as CreateEmployeeDto);
    },
    (errors) => {
      const firstErrorTab = getFirstEmployeeErrorTab(errors);
      if (firstErrorTab) {
        setActiveTab(firstErrorTab);
      }
    },
  );

  const activeTabIndex = EMPLOYEE_FORM_TABS.findIndex((t) => t.id === activeTab);

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setServerError(null);
          form.clearErrors();
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Employee (201 Onboarding)</DrawerTitle>
          <DrawerDescription>
            Generates a unique EMP-YYYYNNNN ID and atomically provisions a linked login account.
          </DrawerDescription>

          <div role="tablist" aria-label="Onboarding steps" className="mt-4 flex flex-wrap gap-1.5">
            {EMPLOYEE_FORM_TABS.map((tab) => {
              const selected = activeTab === tab.id;
              const errored = hasEmployeeTabErrors(tab.id, form.formState.errors);
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{tab.label}</span>
                  {errored ? (
                    <span
                      role="img"
                      className="h-2 w-2 rounded-full bg-destructive"
                      aria-label={`${tab.label} has errors`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DrawerBody>
            {serverError ? (
              <div
                role="alert"
                className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {serverError}
              </div>
            ) : null}

            <EmployeeFormSections tab={activeTab} form={form} supervisors={supervisors} />
          </DrawerBody>

          <DrawerFooter>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activeTabIndex <= 0}
                onClick={() => {
                  const prev = EMPLOYEE_FORM_TABS[activeTabIndex - 1];
                  if (prev) {
                    setActiveTab(prev.id);
                  }
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activeTabIndex >= EMPLOYEE_FORM_TABS.length - 1}
                onClick={() => {
                  const next = EMPLOYEE_FORM_TABS[activeTabIndex + 1];
                  if (next) {
                    setActiveTab(next.id);
                  }
                }}
              >
                Next
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Saving...</span>
                  </>
                ) : (
                  "Save Employee"
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
