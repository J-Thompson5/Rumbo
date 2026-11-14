import { describe, expect, it } from "vitest";

import { attachMilestones, type Goal, type Milestone, type ProgressEntryRow } from "./goals";

describe("attachMilestones calculation rules", () => {
  const baseGoal: Goal = {
    id: "g1",
    title: "Ahorro de emergencia",
    description: null,
    target_date: null,
    created_at: "2026-01-01T00:00:00Z",
    target_value: 50000,
    unit: "COP",
    status: "on_track",
  };

  const milestones: Milestone[] = [
    {
      id: "m1",
      goal_id: "g1",
      title: "Mes 1",
      period: "mensual",
      due_date: "2026-01-31",
      period_start: "2026-01-01",
      start_date: "2026-01-01",
      completed: false,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      target_value: 10000,
      status: "at_risk",
    },
    {
      id: "m2",
      goal_id: "g1",
      title: "Mes 2",
      period: "mensual",
      due_date: "2026-02-28",
      period_start: "2026-02-01",
      start_date: "2026-02-01",
      completed: false,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      target_value: 10000,
      status: "on_track",
    },
    {
      id: "m3",
      goal_id: "g1",
      title: "Mes 3",
      period: "mensual",
      due_date: "2026-03-31",
      period_start: "2026-03-01",
      start_date: "2026-03-01",
      completed: false,
      completed_at: null,
      created_at: "2026-01-01T00:00:00Z",
      target_value: 10000,
      status: "on_track",
    },
  ];

  it("Reflects milestone target_value in aporte acumulado when milestone is marked complete", () => {
    // Mes 1 is completed by user
    const updatedMilestones = milestones.map((m) =>
      m.id === "m1" ? { ...m, completed: true } : m,
    );

    const result = attachMilestones([baseGoal], updatedMilestones, [])[0]!;

    // Goal total contributed should reflect 10,000 from completed Mes 1
    expect(result.actual).toBe(10000);
    expect(result.total_contributed).toBe(10000);
    expect(result.remaining_value).toBe(40000);
    expect(result.milestones.find((m) => m.id === "m1")?.actual).toBe(10000);
  });

  it("Reflects partial custom amount in milestone and aporte acumulado (e.g. 1000 instead of 10000)", () => {
    const entries: ProgressEntryRow[] = [
      {
        id: "e1",
        goal_id: "g1",
        milestone_id: "m1",
        amount: 1000,
        entry_date: "2026-01-10",
      },
    ];

    const result = attachMilestones([baseGoal], milestones, entries)[0]!;

    const m1 = result.milestones.find((m) => m.id === "m1");
    // Milestone aportado should show 1000
    expect(m1?.actual).toBe(1000);
    // Goal aportes acumulados should show 1000
    expect(result.actual).toBe(1000);
    expect(result.total_contributed).toBe(1000);
    expect(result.remaining_value).toBe(49000);
  });

  it("Updates required_per_period and clears advice when risk quota is completed", () => {
    // Both Mes 1 and Mes 2 were overdue (past dates relative to Nov 2026)
    // Initially uncompleted, so goal is at_risk
    const initialResult = attachMilestones([baseGoal], milestones, [])[0]!;
    expect(initialResult.status).toBe("at_risk");
    expect(initialResult.required_per_period).toBeGreaterThan(0);

    // Marking all overdue milestones complete removes the at_risk status if on track
    const futureMilestones: Milestone[] = [
      {
        id: "m1",
        goal_id: "g1",
        title: "Mes 1",
        period: "mensual",
        due_date: "2026-11-01", // overdue relative to Nov 03 2026
        period_start: "2026-10-01",
        completed: false,
        completed_at: null,
        created_at: "2026-10-01T00:00:00Z",
        target_value: 10000,
        status: "at_risk",
      },
      {
        id: "m2",
        goal_id: "g1",
        title: "Mes 2",
        period: "mensual",
        due_date: "2026-12-01",
        period_start: "2026-11-02",
        completed: false,
        completed_at: null,
        created_at: "2026-10-01T00:00:00Z",
        target_value: 10000,
        status: "on_track",
      },
    ];

    const goal2: Goal = {
      ...baseGoal,
      target_value: 20000,
    };

    // Before completing m1: at_risk, required_per_period is present
    const before = attachMilestones([goal2], futureMilestones, [])[0]!;
    expect(before.status).toBe("at_risk");
    expect(before.required_per_period).toBeDefined();

    // After completing m1: m1 is done, goal is on track, required_per_period is null
    const completedM1 = futureMilestones.map((m) =>
      m.id === "m1" ? { ...m, completed: true } : m,
    );
    const after = attachMilestones([goal2], completedM1, [])[0]!;
    expect(after.actual).toBe(10000);
    expect(after.status).toBe("on_track");
    expect(after.required_per_period).toBeNull();
  });
});
