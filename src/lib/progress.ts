import { differenceInCalendarDays, parseISO } from "date-fns";

export type Period = "semanal" | "mensual";

export interface ProgressSummary {
  done: number;
  total: number;
  percent: number;
}

/** Progress of a main goal = completed sub-goals / all sub-goals, rounded to whole %. */
export function computeProgress(milestones: { completed: boolean }[]): ProgressSummary {
  const total = milestones.length;
  const done = milestones.filter((m) => m.completed).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

/** Days left until a YYYY-MM-DD date, relative to `today`. Negative means overdue. */
export function daysUntil(date: string, today: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(date), today);
}

export function describeDaysLeft(days: number): string {
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Queda 1 día";
  if (days > 1) return `Quedan ${days} días`;
  if (days === -1) return "Venció hace 1 día";
  return `Venció hace ${Math.abs(days)} días`;
}

/** Dashboard status of a main goal. */
export type GoalStatus = "en_riesgo" | "al_dia" | "adelantado" | "logrado";

/** Pace status for goals and milestones. */
export type PaceStatus = "completed" | "ahead" | "on_track" | "at_risk";

export const PACE_THRESHOLD_AHEAD = 1.1;
export const PACE_THRESHOLD_ON_TRACK = 0.9;

/**
 * Calculates the pace status of a goal or milestone based on actual progress,
 * expected progress, target value, and optional deadline.
 *
 * Rules (in order):
 * 1. completed: actual >= target
 * 2. expected <= 0 (period hasn't started): on_track
 * 3. deadline passed without completion: at_risk
 * 4. ratio >= 1.10: ahead
 * 5. 0.90 <= ratio < 1.10: on_track
 * 6. ratio < 0.90: at_risk
 */
export function calculatePaceStatus(
  actual: number,
  expected: number,
  target: number | null,
  deadline: string | null = null,
  today: Date = new Date(),
): PaceStatus {
  if (target !== null && target > 0 && actual >= target) {
    return "completed";
  }

  if (deadline && daysUntil(deadline, today) < 0) {
    return "at_risk";
  }

  if (expected <= 0) {
    return "on_track";
  }

  const ratio = actual / expected;
  if (ratio >= PACE_THRESHOLD_AHEAD) {
    return "ahead";
  }
  if (ratio >= PACE_THRESHOLD_ON_TRACK) {
    return "on_track";
  }
  return "at_risk";
}

/** Percentage points of difference between real and expected progress before a goal counts as ahead or at risk. */
export const STATUS_TOLERANCE = 10;

/**
 * Expected progress (0–100) if the goal advanced evenly from the day it was created
 * until its target date.
 */
export function expectedProgress(
  createdAt: string,
  targetDate: string,
  today: Date = new Date(),
): number {
  const start = parseISO(createdAt);
  const totalDays = differenceInCalendarDays(parseISO(targetDate), start);
  if (totalDays <= 0) return 100;
  const elapsed = differenceInCalendarDays(today, start);
  return Math.round(Math.min(100, Math.max(0, (elapsed / totalDays) * 100)));
}

export interface GoalStatusInput {
  created_at: string;
  target_date: string | null;
  milestones: { completed: boolean; due_date: string | null }[];
}

export interface GoalStatusResult {
  status: GoalStatus;
  actual: number;
  /** null when the goal has no target date. */
  expected: number | null;
  overdueSteps: number;
}

/**
 * - logrado: every sub-goal is done.
 * - en_riesgo: a pending sub-goal is overdue, the target date passed, or real progress
 *   is STATUS_TOLERANCE+ points behind the expected progress.
 * - adelantado: real progress is STATUS_TOLERANCE+ points ahead of the expected progress.
 * - al_dia: anything else (including goals without a target date and nothing overdue).
 */
export function goalStatus(goal: GoalStatusInput, today: Date = new Date()): GoalStatusResult {
  const { percent: actual, total } = computeProgress(goal.milestones);
  const overdueSteps = goal.milestones.filter(
    (m) => !m.completed && m.due_date !== null && daysUntil(m.due_date, today) < 0,
  ).length;
  const expected = goal.target_date
    ? expectedProgress(goal.created_at, goal.target_date, today)
    : null;

  if (total > 0 && actual === 100) return { status: "logrado", actual, expected, overdueSteps };
  if (overdueSteps > 0) return { status: "en_riesgo", actual, expected, overdueSteps };
  if (goal.target_date && daysUntil(goal.target_date, today) < 0) {
    return { status: "en_riesgo", actual, expected, overdueSteps };
  }
  if (expected === null) return { status: "al_dia", actual, expected, overdueSteps };

  const diff = actual - expected;
  if (diff >= STATUS_TOLERANCE) return { status: "adelantado", actual, expected, overdueSteps };
  if (diff <= -STATUS_TOLERANCE) return { status: "en_riesgo", actual, expected, overdueSteps };
  return { status: "al_dia", actual, expected, overdueSteps };
}
