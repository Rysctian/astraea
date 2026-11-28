import { describe, expect, it } from "vitest";
import { computeCorrectionLogDiff, pairPunchesToFourSlots } from "./correction-pairing.js";

describe("correction-pairing 4-slot heuristic", () => {
  it("handles 0, 1, 2, 3, and 4+ punch cases per Module 14 spec", () => {
    expect(pairPunchesToFourSlots([])).toEqual({
      amIn: null,
      amOut: null,
      pmIn: null,
      pmOut: null,
    });

    // 1 punch cases
    expect(pairPunchesToFourSlots(["08:05:00"])).toEqual({
      amIn: "08:05:00",
      amOut: null,
      pmIn: null,
      pmOut: null,
    });
    expect(pairPunchesToFourSlots(["13:00:00"])).toEqual({
      amIn: null,
      amOut: null,
      pmIn: "13:00:00",
      pmOut: null,
    });
    expect(pairPunchesToFourSlots(["17:10:00"])).toEqual({
      amIn: null,
      amOut: null,
      pmIn: null,
      pmOut: "17:10:00",
    });

    // 2 punch cases
    expect(pairPunchesToFourSlots(["08:00:00", "12:00:00"])).toEqual({
      amIn: "08:00:00",
      amOut: "12:00:00",
      pmIn: null,
      pmOut: null,
    });
    expect(pairPunchesToFourSlots(["08:00:00", "17:00:00"])).toEqual({
      amIn: "08:00:00",
      amOut: null,
      pmIn: null,
      pmOut: "17:00:00",
    });
    expect(pairPunchesToFourSlots(["13:00:00", "17:00:00"])).toEqual({
      amIn: null,
      amOut: null,
      pmIn: "13:00:00",
      pmOut: "17:00:00",
    });

    // 3 punch cases
    expect(pairPunchesToFourSlots(["08:00:00", "12:15:00", "17:00:00"])).toEqual({
      amIn: "08:00:00",
      amOut: "12:15:00",
      pmIn: null,
      pmOut: "17:00:00",
    });
    expect(pairPunchesToFourSlots(["08:00:00", "13:05:00", "17:00:00"])).toEqual({
      amIn: "08:00:00",
      amOut: null,
      pmIn: "13:05:00",
      pmOut: "17:00:00",
    });
    expect(pairPunchesToFourSlots(["12:30:00", "14:00:00", "17:30:00"])).toEqual({
      amIn: null,
      amOut: null,
      pmIn: "12:30:00",
      pmOut: "17:30:00",
    });

    // 4+ punch case (first, second, second-to-last, last)
    expect(
      pairPunchesToFourSlots(["08:00:00", "12:00:00", "12:30:00", "13:00:00", "17:00:00"]),
    ).toEqual({
      amIn: "08:00:00",
      amOut: "12:00:00",
      pmIn: "13:00:00",
      pmOut: "17:00:00",
    });
  });

  it("computes replaced vs requested sync diff cleanly", () => {
    const diff = computeCorrectionLogDiff(
      { amIn: "08:30:00", amOut: null, pmIn: null, pmOut: "17:00:00" },
      { amIn: "08:00:00", amOut: null, pmIn: null, pmOut: "17:00:00" },
    );
    expect(diff).toEqual({
      replacedTimes: ["08:30:00"],
      requestedTimes: ["08:00:00", "17:00:00"],
    });
  });
});
