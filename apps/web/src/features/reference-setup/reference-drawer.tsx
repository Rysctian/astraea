import {
  createReferenceItemSchema,
  type ReferenceActiveOption,
  type ReferenceCategorySummary,
  type ReferenceGroupKey,
  type ReferenceItemRecord,
  updateReferenceItemSchema,
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { type ReferenceFormValues, referenceRecordToFormValues } from "./reference-utils";

export function ReferenceItemDrawer({
  group,
  category,
  open,
  onOpenChange,
  editingRecord,
  parentOptions,
}: {
  group: ReferenceGroupKey;
  category: ReferenceCategorySummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRecord: ReferenceItemRecord | null;
  parentOptions: ReferenceActiveOption[];
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const formValues = useMemo(() => referenceRecordToFormValues(editingRecord), [editingRecord]);

  const form = useForm<ReferenceFormValues>({
    values: formValues,
  });

  const [isActive, isDefault] = useWatch({
    control: form.control,
    name: ["isActive", "isDefault"],
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ReferenceFormValues) => {
      const parentId =
        category.parentCategory && values.parentId.trim() !== "" ? Number(values.parentId) : null;
      const base = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        description: values.description.trim() === "" ? null : values.description.trim(),
        parentId,
        sortOrder: Number(values.sortOrder) || 0,
        isDefault: values.isActive ? values.isDefault : false,
        isActive: values.isActive,
      };
      if (editingRecord) {
        return api.updateReferenceItem(group, editingRecord.id, base);
      }
      return api.createReferenceItem(group, {
        ...base,
        category: category.category,
      });
    },
    onSuccess: async () => {
      setServerError(null);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["reference-setup"] });
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    const parentId =
      category.parentCategory && values.parentId.trim() !== "" ? Number(values.parentId) : null;
    const candidate = {
      category: category.category,
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      description: values.description.trim() === "" ? null : values.description.trim(),
      parentId,
      sortOrder: Number(values.sortOrder) || 0,
      isDefault: values.isDefault,
      isActive: values.isActive,
    };

    const schema = editingRecord ? updateReferenceItemSchema : createReferenceItemSchema;
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      form.clearErrors();
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "") as keyof ReferenceFormValues;
        if (key) {
          form.setError(key, { message: issue.message });
        }
      }
      return;
    }

    saveMutation.mutate(values);
  });

  const { errors } = form.formState;

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
      <DrawerContent className="max-w-md">
        <DrawerHeader>
          <DrawerTitle>
            {editingRecord ? `Edit ${category.label} Item` : `Add ${category.label} Item`}
          </DrawerTitle>
          <DrawerDescription>
            Category: <span className="font-mono text-foreground">{category.category}</span>
          </DrawerDescription>
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
                  <FieldLabel htmlFor="ref-code">Code *</FieldLabel>
                  <Input
                    id="ref-code"
                    placeholder="ACTIVE"
                    className="uppercase"
                    aria-invalid={Boolean(errors.code)}
                    {...form.register("code")}
                  />
                  <FieldError message={errors.code?.message} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="ref-sort">Sort Order</FieldLabel>
                  <Input
                    id="ref-sort"
                    type="number"
                    min={0}
                    aria-invalid={Boolean(errors.sortOrder)}
                    {...form.register("sortOrder", { valueAsNumber: true })}
                  />
                  <FieldError message={errors.sortOrder?.message} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="ref-name">Display Name *</FieldLabel>
                <Input
                  id="ref-name"
                  placeholder="Enter display label"
                  aria-invalid={Boolean(errors.name)}
                  {...form.register("name")}
                />
                <FieldError message={errors.name?.message} />
              </Field>

              <Field>
                <FieldLabel htmlFor="ref-desc">Description</FieldLabel>
                <Input
                  id="ref-desc"
                  placeholder="Optional explanatory note"
                  {...form.register("description")}
                />
              </Field>

              {category.parentCategory ? (
                <Field>
                  <FieldLabel htmlFor="ref-parent">
                    Parent ({category.parentCategory.replaceAll("_", " ")})
                  </FieldLabel>
                  <Select id="ref-parent" {...form.register("parentId")}>
                    <option value="">None</option>
                    {parentOptions.map((opt) => (
                      <option key={opt.id} value={String(opt.id)}>
                        {opt.code} — {opt.name}
                      </option>
                    ))}
                  </Select>
                  <FieldDescription>
                    Links this item to an active parent item for cascading dropdowns.
                  </FieldDescription>
                </Field>
              ) : null}

              <div className="space-y-2.5 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="ref-active"
                    checked={Boolean(isActive)}
                    onCheckedChange={(checked) => {
                      form.setValue("isActive", checked);
                      if (!checked) {
                        form.setValue("isDefault", false);
                      }
                    }}
                  />
                  <label
                    htmlFor="ref-active"
                    className="cursor-pointer select-none text-xs font-medium text-foreground"
                  >
                    Active (available in dropdowns)
                  </label>
                </div>

                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="ref-default"
                    checked={Boolean(isDefault)}
                    disabled={!isActive}
                    onCheckedChange={(checked) => form.setValue("isDefault", checked)}
                  />
                  <label
                    htmlFor="ref-default"
                    className={`select-none text-xs font-medium ${
                      isActive
                        ? "cursor-pointer text-foreground"
                        : "cursor-not-allowed text-muted-foreground"
                    }`}
                  >
                    Mark as category default (clears previous default)
                  </label>
                </div>
                <FieldError message={errors.isDefault?.message} />
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
                "Create Item"
              )}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
