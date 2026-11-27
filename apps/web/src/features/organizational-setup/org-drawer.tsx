import {
  OFFICE_TYPES,
  type OrgActiveOptions,
  type OrgEntityType,
  type OrgRecord,
} from "@starter/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type ApiEmployee, api } from "@/lib/api";
import {
  buildOrgPayload,
  getOrgCreateSchema,
  ORG_TABS,
  type OrgFormValues,
  orgRecordToFormValues,
} from "./org-utils";

export function OrgEntityDrawer({
  entity,
  open,
  onOpenChange,
  editingRecord,
  options,
  employees,
}: {
  entity: OrgEntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRecord: OrgRecord | null;
  options: OrgActiveOptions | undefined;
  employees: ApiEmployee[];
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const tabMeta = ORG_TABS.find((t) => t.entity === entity) ?? ORG_TABS[0];

  const formValues = useMemo(() => orgRecordToFormValues(editingRecord), [editingRecord]);

  const form = useForm<OrgFormValues>({
    values: formValues,
  });

  const [selectedDepartmentId, selectedDivisionId, isActive] = useWatch({
    control: form.control,
    name: ["departmentId", "divisionId", "isActive"],
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      editingRecord
        ? api.updateOrgEntity(entity, editingRecord.id, payload)
        : api.createOrgEntity(entity, payload),
    onSuccess: async () => {
      setServerError(null);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const payload = buildOrgPayload(entity, values);
    const parsed = getOrgCreateSchema(entity).safeParse(payload);
    if (!parsed.success) {
      form.clearErrors();
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "") as keyof OrgFormValues;
        if (key) {
          form.setError(key, { message: issue.message });
        }
      }
      return;
    }
    saveMutation.mutate(parsed.data as Record<string, unknown>);
  });

  const officeOptions = (options?.offices ?? []).filter(
    (o) => !(entity === "offices" && editingRecord && o.id === editingRecord.id),
  );
  const departmentOptions = options?.departments ?? [];
  const divisionOptions = (options?.divisions ?? []).filter(
    (d) => !selectedDepartmentId || String(d.departmentId ?? "") === selectedDepartmentId,
  );
  const sectionOptions = (options?.sections ?? []).filter(
    (s) =>
      (!selectedDivisionId || String(s.divisionId ?? "") === selectedDivisionId) &&
      (!selectedDepartmentId || String(s.departmentId ?? "") === selectedDepartmentId),
  );
  const positionOptions = (options?.positions ?? []).filter(
    (p) => !(entity === "positions" && editingRecord && p.id === editingRecord.id),
  );

  const { errors } = form.formState;

  const sectionDepartmentField = form.register("departmentId", {
    onChange: (e) => {
      const nextDept = String(e.target.value ?? "");
      if (entity === "sections" && selectedDivisionId) {
        const div = (options?.divisions ?? []).find((d) => String(d.id) === selectedDivisionId);
        if (div?.departmentId && String(div.departmentId) !== nextDept) {
          form.setValue("divisionId", "");
        }
      }
      if (entity === "positions" || entity === "reports_items") {
        form.setValue("divisionId", "");
        form.setValue("sectionId", "");
      }
    },
  });

  const sectionDivisionField = form.register("divisionId", {
    onChange: (e) => {
      const nextDivId = String(e.target.value ?? "");
      if (nextDivId) {
        const div = (options?.divisions ?? []).find((d) => String(d.id) === nextDivId);
        if (div?.departmentId) {
          form.setValue("departmentId", String(div.departmentId));
        }
      }
      if (entity === "positions" || entity === "reports_items") {
        form.setValue("sectionId", "");
      }
    },
  });

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
      <DrawerContent className="max-w-lg">
        <DrawerHeader>
          <DrawerTitle>
            {editingRecord ? `Edit ${tabMeta?.singular}` : `Add ${tabMeta?.singular}`}
          </DrawerTitle>
          <DrawerDescription>{tabMeta?.description}</DrawerDescription>
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

            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="org-code">Code *</FieldLabel>
                  <Input
                    id="org-code"
                    placeholder="HR-001"
                    className="uppercase"
                    aria-invalid={Boolean(errors.code)}
                    {...form.register("code")}
                  />
                  <FieldError message={errors.code?.message} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="org-sort">Sort Order</FieldLabel>
                  <Input
                    id="org-sort"
                    type="number"
                    min={0}
                    aria-invalid={Boolean(errors.sortOrder)}
                    {...form.register("sortOrder", { valueAsNumber: true })}
                  />
                  <FieldError message={errors.sortOrder?.message} />
                </Field>
              </div>

              {entity === "positions" ? (
                <Field>
                  <FieldLabel htmlFor="org-title">Position Title *</FieldLabel>
                  <Input
                    id="org-title"
                    placeholder="Senior Software Engineer"
                    aria-invalid={Boolean(errors.title)}
                    {...form.register("title")}
                  />
                  <FieldError message={errors.title?.message} />
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="org-name">Name *</FieldLabel>
                  <Input
                    id="org-name"
                    placeholder={`Enter ${tabMeta?.singular.toLowerCase()} name`}
                    aria-invalid={Boolean(errors.name)}
                    {...form.register("name")}
                  />
                  <FieldError message={errors.name?.message} />
                </Field>
              )}

              {entity !== "positions" && entity !== "reports_items" ? (
                <Field>
                  <FieldLabel htmlFor="org-short-name">Short Name</FieldLabel>
                  <Input
                    id="org-short-name"
                    placeholder="Abbreviation"
                    {...form.register("shortName")}
                  />
                </Field>
              ) : null}

              {entity === "offices" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="org-office-type">Office Type</FieldLabel>
                    <Select id="org-office-type" {...form.register("type")}>
                      {OFFICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="org-parent-office">Parent Office</FieldLabel>
                    <Select id="org-parent-office" {...form.register("parentId")}>
                      <option value="">None (Root)</option>
                      {officeOptions.map((opt) => (
                        <option key={opt.id} value={String(opt.id)}>
                          {opt.code} — {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}

              {entity === "departments" || entity === "reports_items" ? (
                <Field>
                  <FieldLabel htmlFor="org-office-id">Office / College</FieldLabel>
                  <Select id="org-office-id" {...form.register("officeId")}>
                    <option value="">None</option>
                    {officeOptions.map((opt) => (
                      <option key={opt.id} value={String(opt.id)}>
                        {opt.code} — {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {entity === "divisions" ||
              entity === "sections" ||
              entity === "positions" ||
              entity === "reports_items" ? (
                <Field>
                  <FieldLabel htmlFor="org-dept-id">Department</FieldLabel>
                  <Select id="org-dept-id" {...sectionDepartmentField}>
                    <option value="">None</option>
                    {departmentOptions.map((opt) => (
                      <option key={opt.id} value={String(opt.id)}>
                        {opt.code} — {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {entity === "sections" || entity === "positions" || entity === "reports_items" ? (
                <Field>
                  <FieldLabel htmlFor="org-div-id">Division</FieldLabel>
                  <Select id="org-div-id" {...sectionDivisionField}>
                    <option value="">None</option>
                    {divisionOptions.map((opt) => (
                      <option key={opt.id} value={String(opt.id)}>
                        {opt.code} — {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {entity === "positions" || entity === "reports_items" ? (
                <Field>
                  <FieldLabel htmlFor="org-sec-id">Section / Unit</FieldLabel>
                  <Select id="org-sec-id" {...form.register("sectionId")}>
                    <option value="">None</option>
                    {sectionOptions.map((opt) => (
                      <option key={opt.id} value={String(opt.id)}>
                        {opt.code} — {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {entity === "positions" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="org-reports-pos">Reports To Position</FieldLabel>
                    <Select id="org-reports-pos" {...form.register("reportsToPositionId")}>
                      <option value="">None</option>
                      {positionOptions.map((opt) => (
                        <option key={opt.id} value={String(opt.id)}>
                          {opt.code} — {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="org-sg">Salary Grade</FieldLabel>
                      <Input id="org-sg" placeholder="SG-15" {...form.register("salaryGrade")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="org-level">Job Level</FieldLabel>
                      <Input
                        id="org-level"
                        placeholder="Supervisory"
                        {...form.register("jobLevel")}
                      />
                    </Field>
                  </div>
                </>
              ) : null}

              {entity === "reports_items" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="org-subject-pos">Subject Position</FieldLabel>
                    <Select id="org-subject-pos" {...form.register("positionId")}>
                      <option value="">None</option>
                      {(options?.positions ?? []).map((opt) => (
                        <option key={opt.id} value={String(opt.id)}>
                          {opt.code} — {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="org-sup-pos">Reports To Position</FieldLabel>
                    <Select
                      id="org-sup-pos"
                      aria-invalid={Boolean(errors.reportsToPositionId)}
                      {...form.register("reportsToPositionId")}
                    >
                      <option value="">None</option>
                      {(options?.positions ?? []).map((opt) => (
                        <option key={opt.id} value={String(opt.id)}>
                          {opt.code} — {opt.label}
                        </option>
                      ))}
                    </Select>
                    <FieldError message={errors.reportsToPositionId?.message} />
                  </Field>
                </div>
              ) : null}

              {entity !== "positions" ? (
                <Field>
                  <FieldLabel htmlFor="org-head-emp">
                    {entity === "reports_items" ? "Reports To Employee" : "Unit Head Employee"}
                  </FieldLabel>
                  <Select
                    id="org-head-emp"
                    {...form.register(
                      entity === "reports_items" ? "reportsToEmployeeId" : "headEmployeeId",
                    )}
                  >
                    <option value="">None</option>
                    {employees.map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.employeeId} — {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field>
                <FieldLabel htmlFor="org-desc">Description</FieldLabel>
                <Input
                  id="org-desc"
                  placeholder="Optional summary"
                  {...form.register("description")}
                />
              </Field>

              <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <Checkbox
                  id="org-active"
                  checked={Boolean(isActive)}
                  onCheckedChange={(checked) => form.setValue("isActive", checked)}
                />
                <label
                  htmlFor="org-active"
                  className="cursor-pointer select-none text-xs font-medium text-foreground"
                >
                  Active (visible in downstream selectors)
                </label>
              </div>
            </FieldGroup>
          </DrawerBody>

          <DrawerFooter className="justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Saving...</span>
                </>
              ) : editingRecord ? (
                "Save Changes"
              ) : (
                `Create ${tabMeta?.singular}`
              )}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
