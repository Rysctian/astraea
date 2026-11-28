import { describe, expect, it } from "vitest";
import {
  type EvalPolicyRules,
  type EvalScheduleAssignment,
  evaluateDtr,
  localDateTimeToUtcDate,
} from "./dtr-evaluator.js";

const TZ = "Asia/Manila";

const stdPolicy: EvalPolicyRules = {
  tardyGraceSeconds: 900, // 15m
  tardyCountFrom: "schedule_start",
  absentAfterLateSeconds: 3600, // 60m
  undertimeGraceSeconds: 600, // 10m
  earlyInWindowSeconds: 14400,
  lateOutWindowSeconds: 14400,
  duplicateTapWindowSeconds: 120,
};

const regularAssignment: EvalScheduleAssignment = {
  scheduleId: 1,
  scheduleName: "Regular 8-5",
  timezone: TZ,
  attendancePolicyId: 1,
  effectiveFrom: "2026-10-01",
  effectiveTo: null,
  details: [
    {
      dayOfWeek: 1,
      isRestDay: false,
      startTime: "08:00:00",
      endTime: "17:00:00",
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
    {
      dayOfWeek: 2,
      isRestDay: false,
      startTime: "08:00:00",
      endTime: "17:00:00",
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
    {
      dayOfWeek: 3,
      isRestDay: false,
      startTime: "08:00:00",
      endTime: "17:00:00",
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
    {
      dayOfWeek: 4,
      isRestDay: false,
      startTime: "08:00:00",
      endTime: "17:00:00",
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
    {
      dayOfWeek: 5,
      isRestDay: false,
      startTime: "08:00:00",
      endTime: "17:00:00",
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
    {
      dayOfWeek: 6,
      isRestDay: true,
      startTime: null,
      endTime: null,
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
    {
      dayOfWeek: 7,
      isRestDay: true,
      startTime: null,
      endTime: null,
      tardyStart: null,
      undertimeStart: null,
      earlyDismissalStart: null,
    },
  ],
};

describe("evaluateDtr engine", () => {
  it("applies grace period, schedule_start vs after_grace, and undertime grace", () => {
    // 2026-10-05 is Monday
    const punchIn = localDateTimeToUtcDate("2026-10-05", "08:20:00", TZ);
    const punchOut = localDateTimeToUtcDate("2026-10-05", "16:55:00", TZ);

    const res1 = evaluateDtr({
      from: "2026-10-05",
      to: "2026-10-05",
      assignments: [regularAssignment],
      policiesById: new Map([[1, stdPolicy]]),
      defaultPolicy: null,
      logs: [punchIn, punchOut],
    });
    expect(res1.rows[0]?.tardySeconds).toBe(1200); // 20m from 08:00
    expect(res1.rows[0]?.undertimeSeconds).toBe(0); // within 10m undertime grace
    expect(res1.rows[0]?.absent).toBe(false);

    const afterGracePolicy: EvalPolicyRules = { ...stdPolicy, tardyCountFrom: "after_grace" };
    const res2 = evaluateDtr({
      from: "2026-10-05",
      to: "2026-10-05",
      assignments: [regularAssignment],
      policiesById: new Map([[1, afterGracePolicy]]),
      defaultPolicy: null,
      logs: [punchIn, punchOut],
    });
    expect(res2.rows[0]?.tardySeconds).toBe(300); // 5m past 08:15 cutoff
  });

  it("marks absent on late-to-absent cutoff while retaining recorded punches", () => {
    const punchIn = localDateTimeToUtcDate("2026-10-05", "09:05:00", TZ);
    const punchOut = localDateTimeToUtcDate("2026-10-05", "17:00:00", TZ);

    const res = evaluateDtr({
      from: "2026-10-05",
      to: "2026-10-05",
      assignments: [regularAssignment],
      policiesById: new Map([[1, stdPolicy]]),
      defaultPolicy: null,
      logs: [punchIn, punchOut],
    });

    expect(res.rows[0]?.absent).toBe(true);
    expect(res.rows[0]?.renderedSeconds).toBe(0);
    expect(res.rows[0]?.tardySeconds).toBe(0);
    expect(res.rows[0]?.undertimeSeconds).toBe(32400);
    expect(res.rows[0]?.timeIn).toBe("09:05:00");
    expect(res.rows[0]?.timeOut).toBe("17:00:00");
    expect(res.summary.absentDays).toBe(1);
  });

  it("emits rest day and no schedule zeroed rows and clamps early/late punches", () => {
    // 2026-10-02 Fri (present with early in 07:30, late out 18:00), 2026-10-03 Sat (rest day)
    const earlyIn = localDateTimeToUtcDate("2026-10-02", "07:30:00", TZ);
    const lateOut = localDateTimeToUtcDate("2026-10-02", "18:00:00", TZ);

    const res = evaluateDtr({
      from: "2026-10-02",
      to: "2026-10-03",
      assignments: [regularAssignment],
      policiesById: new Map([[1, stdPolicy]]),
      defaultPolicy: null,
      logs: [earlyIn, lateOut],
    });

    expect(res.rows[0]?.renderedSeconds).toBe(32400); // clamped to 08:00-17:00 (9h)
    expect(res.rows[1]?.status).toBe("rest_day");
    expect(res.rows[1]?.remarks).toBe("Rest day");
    expect(res.summary.presentDays).toBe(1);
    expect(res.summary.absentDays).toBe(0);
  });
});
