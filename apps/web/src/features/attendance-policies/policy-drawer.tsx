import { zodResolver } from "@hookform/resolvers/zod";
import type { AttendancePolicyRecord, CreateAttendancePolicyDto } from "@starter/shared";
import { Loader2, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
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
import {
  createDefaultPolicyForm,
  type PolicyFormValues,
  policyDrawerFormSchema,
  policyFormToPayload,
  policyToFormValues,
} from "./policy-utils";

export type PolicyDrawerMode = "create" | "edit" | "view";

export function AttendancePolicyDrawer({
  open,
  onOpenChange,
  mode,
  policy,
  isPending,
  serverError,
  onSubmitPayload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PolicyDrawerMode;
  policy: AttendancePolicyRecord | null;
  isPending: boolean;
  serverError: string | null;
  onSubmitPayload: (payload: CreateAttendancePolicyDto) => void;
}) {
  const isView = mode === "view";
  const initialValues = useMemo<PolicyFormValues>(
    () => (policy ? policyToFormValues(policy) : createDefaultPolicyForm()),
    [policy],
  );

  const form = useForm<PolicyFormValues>({
    values: initialValues,
    resolver: zodResolver(policyDrawerFormSchema) as never,
  });

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = form;

  const isDefault = watch("isDefault");
  const tardyCountFrom = watch("tardyCountFrom");

  const submitForm = handleSubmit((values) => {
    onSubmitPayload(policyFormToPayload(values));
  });

  const title =
    mode === "create"
      ? "New Attendance Policy"
      : mode === "edit"
        ? `Edit ${policy?.name ?? "Policy"}`
        : (policy?.name ?? "Policy Details");

  const description =
    mode === "view"
      ? "Read-only summary of grace periods, late-to-absent cutoffs, and biometric tap windows."
      : "Configure reusable tardy, undertime, and biometric punch window rules for work schedules.";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>

        <form onSubmit={submitForm} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {serverError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            ) : null}

            {/* Section 1: Policy Details */}
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                1. Policy Details
              </h3>

              <div className="space-y-1.5">
                <label htmlFor="pol-name" className="text-xs font-medium text-foreground">
                  Policy Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="pol-name"
                  placeholder="e.g. Standard Office Policy"
                  disabled={isView}
                  {...register("name")}
                />
                {errors.name ? (
                  <p className="text-[11px] text-destructive">{errors.name.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pol-desc" className="text-xs font-medium text-foreground">
                  Description
                </label>
                <Input
                  id="pol-desc"
                  placeholder="Optional summary of when this policy applies"
                  disabled={isView}
                  {...register("description")}
                />
                {errors.description ? (
                  <p className="text-[11px] text-destructive">{errors.description.message}</p>
                ) : null}
              </div>

              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <label
                  htmlFor="pol-is-default"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-xs"
                >
                  <Checkbox
                    id="pol-is-default"
                    checked={isDefault}
                    disabled={isView}
                    onCheckedChange={(checked) => {
                      setValue("isDefault", checked, { shouldDirty: true });
                      if (checked) {
                        setValue("isActive", true, { shouldDirty: true });
                      }
                    }}
                  />
                  <span>
                    <span className="block font-medium text-foreground">System default policy</span>
                    <span className="text-[11px] text-muted-foreground">
                      Fallback when no policy is linked
                    </span>
                  </span>
                </label>

                <label
                  htmlFor="pol-is-active"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-xs"
                >
                  <Checkbox
                    id="pol-is-active"
                    checked={isDefault ? true : watch("isActive")}
                    disabled={isView || isDefault}
                    onCheckedChange={(checked) =>
                      setValue("isActive", checked, { shouldDirty: true })
                    }
                  />
                  <span>
                    <span className="block font-medium text-foreground">Active policy</span>
                    <span className="text-[11px] text-muted-foreground">
                      {isDefault
                        ? "Locked active while system default"
                        : "Selectable for new schedules"}
                    </span>
                  </span>
                </label>
              </div>
              {errors.isDefault ? (
                <p className="text-[11px] text-destructive">{errors.isDefault.message}</p>
              ) : null}
            </section>

            {/* Section 2: Tardy, Absent & Undertime Rules */}
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2. Tardy, Absent &amp; Undertime Rules
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="pol-tardy-grace" className="text-xs font-medium text-foreground">
                    Tardy Grace (minutes)
                  </label>
                  <Input
                    id="pol-tardy-grace"
                    type="number"
                    min={0}
                    max={720}
                    disabled={isView}
                    {...register("tardyGraceMinutes")}
                  />
                  {errors.tardyGraceMinutes ? (
                    <p className="text-[11px] text-destructive">
                      {errors.tardyGraceMinutes.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pol-count-from" className="text-xs font-medium text-foreground">
                    Count Tardy From
                  </label>
                  <Select id="pol-count-from" disabled={isView} {...register("tardyCountFrom")}>
                    <option value="schedule_start">Schedule start</option>
                    <option value="after_grace">After grace</option>
                  </Select>
                </div>
              </div>

              <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                {tardyCountFrom === "after_grace"
                  ? "After grace: once tardy grace is exceeded, only minutes past the grace cutoff accrue as tardiness."
                  : "Schedule start: once tardy grace is exceeded, full lateness is counted from the scheduled shift start."}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="pol-absent-after" className="text-xs font-medium text-foreground">
                    Mark Absent After Late (minutes)
                  </label>
                  <Input
                    id="pol-absent-after"
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="Blank to disable"
                    disabled={isView}
                    {...register("absentAfterLateMinutes")}
                  />
                  {errors.absentAfterLateMinutes ? (
                    <p className="text-[11px] text-destructive">
                      {errors.absentAfterLateMinutes.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pol-ut-grace" className="text-xs font-medium text-foreground">
                    Undertime Grace (minutes)
                  </label>
                  <Input
                    id="pol-ut-grace"
                    type="number"
                    min={0}
                    max={720}
                    disabled={isView}
                    {...register("undertimeGraceMinutes")}
                  />
                  {errors.undertimeGraceMinutes ? (
                    <p className="text-[11px] text-destructive">
                      {errors.undertimeGraceMinutes.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Section 3: Biometric Log Windows */}
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                3. Biometric Log Windows
              </h3>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="pol-early-in" className="text-xs font-medium text-foreground">
                    Early-In (min)
                  </label>
                  <Input
                    id="pol-early-in"
                    type="number"
                    min={0}
                    max={720}
                    disabled={isView}
                    {...register("earlyInWindowMinutes")}
                  />
                  {errors.earlyInWindowMinutes ? (
                    <p className="text-[11px] text-destructive">
                      {errors.earlyInWindowMinutes.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pol-late-out" className="text-xs font-medium text-foreground">
                    Late-Out (min)
                  </label>
                  <Input
                    id="pol-late-out"
                    type="number"
                    min={0}
                    max={720}
                    disabled={isView}
                    {...register("lateOutWindowMinutes")}
                  />
                  {errors.lateOutWindowMinutes ? (
                    <p className="text-[11px] text-destructive">
                      {errors.lateOutWindowMinutes.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pol-dup-tap" className="text-xs font-medium text-foreground">
                    Duplicate Tap (sec)
                  </label>
                  <Input
                    id="pol-dup-tap"
                    type="number"
                    min={0}
                    max={3600}
                    disabled={isView}
                    {...register("duplicateTapWindowSeconds")}
                  />
                  {errors.duplicateTapWindowSeconds ? (
                    <p className="text-[11px] text-destructive">
                      {errors.duplicateTapWindowSeconds.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {isView ? "Close" : "Cancel"}
            </Button>
            {!isView ? (
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {mode === "create" ? "Create Policy" : "Save Changes"}
              </Button>
            ) : null}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
