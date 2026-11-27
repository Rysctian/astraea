import { zodResolver } from "@hookform/resolvers/zod";
import { HRIS_REFERENCES, updateEmployeeSchema } from "@starter/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, Pencil, UserCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { LinkedAccountCard, ScheduleLeaveSummaryTab } from "./employee-detail-tabs";
import { EmployeeFormSections } from "./employee-form-sections";
import {
  createEmptyEmployeeForm,
  type EmployeeFormTab,
  type EmployeeFormValues,
  employeeToFormValues,
  getFirstEmployeeErrorTab,
  hasEmployeeTabErrors,
  normalizeEmployeePayload,
} from "./employee-utils";

type DetailTab = EmployeeFormTab | "schedule";

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "personal", label: "Personal Info" },
  { id: "education", label: "Education & Languages" },
  { id: "employment", label: "Employment & Org" },
  { id: "statutory", label: "Government & Account" },
  { id: "schedule", label: "Schedule & Leave" },
];

export function EmployeeDetailPage({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<DetailTab>("personal");
  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["employees", employeeId],
    queryFn: () => api.getEmployee(employeeId),
    enabled: Boolean(employeeId),
  });

  const directoryQuery = useQuery({
    queryKey: ["employees", "supervisor-options"],
    queryFn: () => api.listEmployees({ page: 1, pageSize: 100 }),
    enabled: isEditing,
  });

  const serverFormValues = useMemo(
    () =>
      detailQuery.data?.employee
        ? employeeToFormValues(detailQuery.data.employee)
        : createEmptyEmployeeForm(),
    [detailQuery.data?.employee],
  );

  const form = useForm<EmployeeFormValues>({
    values: serverFormValues,
    resetOptions: { keepDirtyValues: isEditing },
    resolver: zodResolver(updateEmployeeSchema) as never,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof normalizeEmployeePayload>) =>
      api.updateEmployee(employeeId, payload),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["employees", employeeId], updated);
      form.reset(employeeToFormValues(updated.employee));
      setIsEditing(false);
      setServerError(null);
      setSavedNotice("Profile and linked user account synchronized.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
      ]);
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerError(null);
      setSavedNotice(null);
      updateMutation.mutate(normalizeEmployeePayload(values));
    },
    (errors) => {
      const errorTab = getFirstEmployeeErrorTab(errors);
      if (errorTab) {
        setActiveTab(errorTab);
      }
    },
  );

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Loading Employee 201 profile...</span>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="p-6">
        <Link
          to="/employees"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Employee 201</span>
        </Link>
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {detailQuery.error?.message ?? "Employee record not found."}
        </div>
      </div>
    );
  }

  const { employee, supervisor, account } = detailQuery.data;
  const fullName = [
    employee.firstName,
    employee.middleName,
    employee.lastName,
    employee.nameExtension,
  ]
    .filter(Boolean)
    .join(" ");
  const initials = `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase();
  const statusLabel =
    HRIS_REFERENCES.employmentStatuses.find((s) => s.code === employee.employmentStatus)?.label ??
    employee.employmentStatus;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-muted/20 px-6 py-5">
        <Link
          to="/employees"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Employee 201 Directory</span>
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary ring-1 ring-primary/20">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{fullName}</h1>
                <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                  {employee.employeeId}
                </span>
                <Badge
                  variant={employee.employmentStatus === "ACTIVE" ? "emerald" : "amber"}
                  dotColor={
                    employee.employmentStatus === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
                  }
                >
                  {statusLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[employee.position, employee.department, employee.office]
                  .filter(Boolean)
                  .join(" · ") || "No organizational assignment yet"}
                {supervisor ? (
                  <>
                    {" · "}Reports to{" "}
                    <Link
                      to="/employees/$employeeId"
                      params={{ employeeId: supervisor.employeeId }}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {supervisor.firstName} {supervisor.lastName}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setServerError(null);
                    form.reset(serverFormValues);
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cancel</span>
                </Button>
                <Button
                  type="submit"
                  form="employee-detail-form"
                  size="sm"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>Save Changes</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSavedNotice(null);
                  setIsEditing(true);
                  if (activeTab === "schedule") {
                    setActiveTab("personal");
                  }
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit Profile</span>
              </Button>
            )}
          </div>
        </div>

        <TabsList aria-label="Employee 201 sections" className="mt-5">
          {DETAIL_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            const errored =
              tab.id !== "schedule" && hasEmployeeTabErrors(tab.id, form.formState.errors);
            return (
              <TabsTrigger key={tab.id} active={selected} onClick={() => setActiveTab(tab.id)}>
                <span>{tab.label}</span>
                {errored ? (
                  <span
                    role="img"
                    className="h-2 w-2 rounded-full bg-destructive"
                    aria-label={`${tab.label} has errors`}
                  />
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        {serverError ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
          >
            {serverError}
          </div>
        ) : null}

        {savedNotice ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{savedNotice}</span>
          </div>
        ) : null}

        {activeTab === "schedule" ? (
          <ScheduleLeaveSummaryTab employeeId={employee.employeeId} />
        ) : (
          <form id="employee-detail-form" onSubmit={onSubmit} noValidate className="space-y-6">
            <EmployeeFormSections
              tab={activeTab}
              form={form}
              disabled={!isEditing}
              supervisors={directoryQuery.data?.data ?? []}
              excludeEmployeeId={employee.employeeId}
            />

            {activeTab === "statutory" ? (
              <LinkedAccountCard employee={employee} account={account} />
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
