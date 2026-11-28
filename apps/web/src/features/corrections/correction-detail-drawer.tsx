import type { CorrectionApplicationRecord } from "@starter/shared";
import { useMutation } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatShortTimestamp, getInitials } from "../approver-setup/approver-setup-utils";
import { APPROVAL_STATUS_META, formatDateShort } from "../overtime/overtime-utils";
import { formatSlotTime } from "./corrections-utils";

export function CorrectionDetailDrawer({
  open,
  onOpenChange,
  application,
  onMutated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: CorrectionApplicationRecord | null;
  onMutated: (updated: CorrectionApplicationRecord, message: string) => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      api.approveCorrectionApplication(id, { remarks: remarks.trim() || undefined }),
    onSuccess: (updated) => {
      setRemarks("");
      setActionError(null);
      onMutated(
        updated,
        updated.status === "approved"
          ? `Correction #${updated.id} approved and synced to attendance logs.`
          : `Correction #${updated.id} step approved.`,
      );
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Approval failed"),
  });

  const disapproveMutation = useMutation({
    mutationFn: (id: number) =>
      api.disapproveCorrectionApplication(id, { remarks: remarks.trim() || undefined }),
    onSuccess: (updated) => {
      setRemarks("");
      setActionError(null);
      onMutated(updated, `Correction #${updated.id} disapproved.`);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Disapproval failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      api.cancelCorrectionApplication(id, { remarks: remarks.trim() || undefined }),
    onSuccess: (updated) => {
      setRemarks("");
      setActionError(null);
      onMutated(updated, `Correction #${updated.id} cancelled.`);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Cancellation failed"),
  });

  const isBusy =
    approveMutation.isPending || disapproveMutation.isPending || cancelMutation.isPending;

  if (!application) return null;

  const statusMeta = APPROVAL_STATUS_META[application.status];
  const hasAnyAction = application.canApprove || application.canDisapprove || application.canCancel;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="lg">
        <DrawerHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DrawerTitle>Attendance Correction #{application.id}</DrawerTitle>
            <Badge variant={statusMeta.variant} dotColor={statusMeta.dotColor}>
              {statusMeta.label}
            </Badge>
            {application.autoApproved ? <Badge variant="purple">Auto-Approved</Badge> : null}
          </div>
          <DrawerDescription>
            Submitted {formatShortTimestamp(application.submittedAt)}
            {application.filedByName ? ` · Filed by ${application.filedByName}` : ""}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          {actionError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
            >
              {actionError}
            </div>
          ) : null}

          {/* Applicant Summary */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {getInitials(application.employeeName)}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{application.employeeName}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{application.employeeId}</span>
                {application.employeeDepartment ? ` · ${application.employeeDepartment}` : ""}
              </p>
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Reason</p>
            <div className="rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
              {application.reason}
            </div>
          </div>

          {/* Two-Row-Per-Date Old vs New Comparison Table */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Before vs After Punch Comparison ({application.details.length}{" "}
              {application.details.length === 1 ? "date" : "dates"})
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Snapshot</TableHead>
                    <TableHead>AM In</TableHead>
                    <TableHead>AM Out</TableHead>
                    <TableHead>PM In</TableHead>
                    <TableHead>PM Out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {application.details.map((row) => (
                    <Fragment key={row.id}>
                      {/* Muted Old Row */}
                      <TableRow className="bg-muted/25 text-muted-foreground">
                        <TableCell
                          rowSpan={2}
                          className="align-middle text-xs font-semibold text-foreground"
                        >
                          {formatDateShort(row.date)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral" className="text-[10px]">
                            Old
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatSlotTime(row.oldAmIn)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatSlotTime(row.oldAmOut)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatSlotTime(row.oldPmIn)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatSlotTime(row.oldPmOut)}
                        </TableCell>
                      </TableRow>
                      {/* Highlighted New Row */}
                      <TableRow className="bg-primary/[0.03]">
                        <TableCell>
                          <Badge variant="blue" className="text-[10px]">
                            New
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tabular-nums text-xs",
                            row.amIn !== row.oldAmIn
                              ? "font-semibold text-primary"
                              : "text-foreground",
                          )}
                        >
                          {formatSlotTime(row.amIn)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tabular-nums text-xs",
                            row.amOut !== row.oldAmOut
                              ? "font-semibold text-primary"
                              : "text-foreground",
                          )}
                        >
                          {formatSlotTime(row.amOut)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tabular-nums text-xs",
                            row.pmIn !== row.oldPmIn
                              ? "font-semibold text-primary"
                              : "text-foreground",
                          )}
                        >
                          {formatSlotTime(row.pmIn)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tabular-nums text-xs",
                            row.pmOut !== row.oldPmOut
                              ? "font-semibold text-primary"
                              : "text-foreground",
                          )}
                        >
                          {formatSlotTime(row.pmOut)}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Approval Pipeline */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Approval Pipeline</p>
            {application.approvals.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-purple-500" aria-hidden="true" />
                <span>Auto-approved upon submission and synced to raw attendance logs.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {application.approvals.map((step) => {
                  const meta = APPROVAL_STATUS_META[step.status];
                  return (
                    <div
                      key={step.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                          {step.sequence}
                        </span>
                        <div>
                          <p className="text-xs font-medium text-foreground">{step.approverName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {step.approverId}
                          </p>
                          {step.remarks ? (
                            <p className="mt-1 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-foreground">
                              &ldquo;{step.remarks}&rdquo;
                            </p>
                          ) : null}
                          {step.actedAt ? (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                              {formatShortTimestamp(step.actedAt)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Badge variant={meta.variant} dotColor={meta.dotColor}>
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hasAnyAction ? (
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="corr-detail-remarks"
                  className="text-xs font-semibold text-foreground"
                >
                  Decision Remarks (Optional)
                </label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {remarks.length} / 5,000
                </span>
              </div>
              <textarea
                id="corr-detail-remarks"
                rows={2}
                maxLength={5000}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional approval, disapproval, or cancellation note..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : null}
        </DrawerBody>

        <DrawerFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {application.canCancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => cancelMutation.mutate(application.id)}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                Cancel Request
              </Button>
            ) : null}

            {application.canDisapprove ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isBusy}
                onClick={() => disapproveMutation.mutate(application.id)}
              >
                {disapproveMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {application.status === "approved" ? "Override Disapprove" : "Disapprove"}
              </Button>
            ) : null}

            {application.canApprove ? (
              <Button
                type="button"
                size="sm"
                disabled={isBusy}
                onClick={() => approveMutation.mutate(application.id)}
              >
                {approveMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                Approve
              </Button>
            ) : null}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
