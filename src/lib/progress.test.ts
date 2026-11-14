import { describe, expect, it } from "vitest";

import {
  calculatePaceStatus,
  computeProgress,
  daysUntil,
  describeDaysLeft,
  expectedProgress,
  goalStatus,
} from "./progress";

describe("computeProgress", () => {
  it("is 0% when the main goal has no sub-goals yet", () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("counts completed sub-goals against all sub-goals", () => {
    const result = computeProgress([
      { completed: true },
      { completed: false },
      { completed: true },
      { completed: false },
    ]);
    expect(result).toEqual({ done: 2, total: 4, percent: 50 });
  });

  it("rounds to a whole percent", () => {
    expect(
      computeProgress([{ completed: true }, { completed: false }, { completed: false }]).percent,
    ).toBe(33);
  });

  it("reaches 100% only when every sub-goal is completed", () => {
    expect(computeProgress([{ completed: true }, { completed: true }]).percent).toBe(100);
  });
});

describe("days left", () => {
  const today = new Date(2026, 10, 2);

  it("counts calendar days to the target date", () => {
    expect(daysUntil("2026-11-09", today)).toBe(7);
  });

  it("is negative once the date has passed", () => {
    expect(daysUntil("2026-10-30", today)).toBe(-3);
    expect(describeDaysLeft(-3)).toBe("Venció hace 3 días");
  });
});

describe("goal status", () => {
  const today = new Date(2026, 10, 11); // Nov 11, 2026
  // Created Nov 1, target Nov 21 → half the time has passed → 50% expected.
  const base = { created_at: "2026-11-01T12:00:00", target_date: "2026-11-21" };
  const steps = (done: number, pending: number, due: string | null = null) => [
    ...Array.from({ length: done }, () => ({ completed: true, due_date: due })),
    ...Array.from({ length: pending }, () => ({ completed: false, due_date: due })),
  ];

  it("expects progress in proportion to the time elapsed", () => {
    expect(expectedProgress(base.created_at, base.target_date, today)).toBe(50);
  });

  it("is al día when real progress is within 10 points of expected", () => {
    expect(goalStatus({ ...base, milestones: steps(1, 1) }, today).status).toBe("al_dia");
    expect(goalStatus({ ...base, milestones: steps(55, 45) }, today).status).toBe("al_dia");
  });

  it("is adelantado when 10+ points ahead of expected", () => {
    expect(goalStatus({ ...base, milestones: steps(3, 2) }, today).status).toBe("adelantado");
  });

  it("is en riesgo when 10+ points behind expected", () => {
    expect(goalStatus({ ...base, milestones: steps(2, 3) }, today).status).toBe("en_riesgo");
  });

  it("is en riesgo when a pending step is overdue, even if ahead", () => {
    const milestones = [...steps(4, 0), { completed: false, due_date: "2026-11-10" }];
    expect(goalStatus({ ...base, milestones }, today)).toMatchObject({
      status: "en_riesgo",
      overdueSteps: 1,
    });
  });

  it("is en riesgo when the target date has passed without finishing", () => {
    const late = { created_at: "2026-10-01T12:00:00", target_date: "2026-11-10" };
    expect(goalStatus({ ...late, milestones: steps(9, 1) }, today).status).toBe("en_riesgo");
  });

  it("is logrado when every step is done, even past the date", () => {
    const late = { created_at: "2026-10-01T12:00:00", target_date: "2026-11-10" };
    expect(goalStatus({ ...late, milestones: steps(3, 0) }, today).status).toBe("logrado");
  });

  it("is al día without a target date when nothing is overdue", () => {
    const noDate = { created_at: base.created_at, target_date: null };
    expect(goalStatus({ ...noDate, milestones: steps(0, 3) }, today)).toMatchObject({
      status: "al_dia",
      expected: null,
    });
  });
});

describe("calculatePaceStatus", () => {
  it("returns completed when actual meets or exceeds target", () => {
    expect(calculatePaceStatus(8000000, 4000000, 8000000)).toBe("completed");
    expect(calculatePaceStatus(8500000, 4000000, 8000000)).toBe("completed");
  });

  it("returns on_track when expected is zero (period not started)", () => {
    expect(calculatePaceStatus(0, 0, 8000000)).toBe("on_track");
  });

  it("returns at_risk when deadline passed without completion", () => {
    const today = new Date("2026-11-15");
    expect(calculatePaceStatus(5000, 5000, 10000, "2026-11-10", today)).toBe("at_risk");
  });

  it("evaluates a 8.000.000 12-month goal scenario in month 2", () => {
    // 8,000,000 target over 12 months (~666,666.67 / month).
    // In month 2, month 1 is past and month 2 is halfway: expected ~ 1,000,000.
    const expected = 1000000;
    const target = 8000000;
    const deadline = "2027-10-01";
    const today = new Date("2026-11-15");

    // 1. Without contributions in month 2: at_risk
    expect(calculatePaceStatus(0, expected, target, deadline, today)).toBe("at_risk");

    // 2. Exact planned contribution: on_track
    expect(calculatePaceStatus(expected, expected, target, deadline, today)).toBe("on_track");

    // 3. 120% of planned: ahead
    expect(calculatePaceStatus(expected * 1.2, expected, target, deadline, today)).toBe("ahead");

    // 4. Boundary checks: 1.10 is ahead, 1.09 is on_track, 0.90 is on_track, 0.89 is at_risk
    expect(calculatePaceStatus(expected * 1.1, expected, target, deadline, today)).toBe("ahead");
    expect(calculatePaceStatus(expected * 1.09, expected, target, deadline, today)).toBe(
      "on_track",
    );
    expect(calculatePaceStatus(expected * 0.9, expected, target, deadline, today)).toBe("on_track");
    expect(calculatePaceStatus(expected * 0.89, expected, target, deadline, today)).toBe("at_risk");
  });
});
