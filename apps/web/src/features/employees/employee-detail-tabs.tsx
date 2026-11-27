import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { type ApiEmployee, type ApiUser, api } from "@/lib/api";

export function LinkedAccountCard({
  employee,
  account,
}: {
  employee: ApiEmployee;
  account: ApiUser | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-foreground">
            Linked System User Account (Read-Only)
          </h3>
        </div>
        <Badge variant="blue" dotColor="bg-blue-500">
          Synced on Save
        </Badge>
      </div>

      {account ? (
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Account Name</dt>
            <dd className="mt-0.5 font-medium text-foreground">{account.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Login Email</dt>
            <dd className="mt-0.5 font-medium text-foreground">{account.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Linked Business Key</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {account.employeeId ?? employee.employeeId}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No linked system login account found for this employee.
        </p>
      )}
    </div>
  );
}

export function ScheduleLeaveSummaryTab({ employeeId }: { employeeId: string }) {
  const [leaveYear, setLeaveYear] = useState(String(new Date().getFullYear()));
  const schedulesQuery = useQuery({
    queryKey: ["schedules", "assignments", "employee-profile", employeeId],
    queryFn: () => api.listEmployeeSchedules({ employeeId, page: 1, pageSize: 10 }),
    enabled: Boolean(employeeId),
  });

  const assignments = schedulesQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Schedule &amp; Leave Summary</h2>
          <p className="text-xs text-muted-foreground">
            Read-only downstream schedule assignments and annual leave balances.
          </p>
        </div>
        <div className="w-28">
          <Select
            aria-label="Leave year"
            className="h-8 text-xs"
            value={leaveYear}
            onChange={(e) => setLeaveYear(e.target.value)}
          >
            {[2026, 2025, 2024].map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Assigned Schedule History</span>
            </div>
            <Link
              to="/attendance/schedules"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Manage schedules
            </Link>
          </div>
          {schedulesQuery.isPending ? (
            <p className="mt-3 text-xs text-muted-foreground">Loading schedule assignments...</p>
          ) : assignments.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No shift schedule assignments recorded yet for{" "}
              <span className="font-mono text-foreground">{employeeId}</span>.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {assignments.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.scheduleName}</p>
                    <p className="tabular-nums text-[11px] text-muted-foreground">
                      {item.effectiveFrom} → {item.effectiveTo ?? "Ongoing"} (
                      {item.scheduleTimezone})
                    </p>
                  </div>
                  {item.isCurrent ? (
                    <Badge variant="emerald" dotColor="bg-emerald-500">
                      Current
                    </Badge>
                  ) : item.isFuture ? (
                    <Badge variant="blue">Upcoming</Badge>
                  ) : (
                    <Badge variant="neutral">History</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span>Leave Balances ({leaveYear})</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Leave ledger balances will appear automatically once the Leave Management module is
            enabled.
          </p>
        </div>
      </div>
    </div>
  );
}
