import { queryOptions } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import {
  calculatePaceStatus,
  daysUntil,
  expectedProgress,
  goalStatus,
  type GoalStatus,
  type PaceStatus,
  type Period,
} from "@/lib/progress";

export type { PaceStatus } from "@/lib/progress";

/**
 * Capa de adaptación entre el refactor (objetivos + hitos semanales/mensuales)
 * y el esquema que ya existe en la base de datos de Fractal.
 *
 * Mapeo de esquema:
 *   goals.deadline          -> target_date
 *   milestones.type         -> period (monthly/weekly -> mensual/semanal)
 *   milestones.period_end   -> due_date
 *   milestones.closed_at    -> completed / completed_at
 *
 * Además lee el estado de ritmo calculado (ahead / on_track / at_risk / completed)
 * desde las vistas `goal_status` y `milestone_status`, con respaldo en caliente.
 */

export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  description: string | null;
  period: Period;
  due_date: string | null;
  period_start?: string | null;
  start_date?: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  target_value?: number | null;
  expected?: number | null;
  actual?: number | null;
  ratio?: number | null;
  status: PaceStatus;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  created_at: string;
  target_value?: number | null;
  unit?: string | null;
  start_date?: string | null;
  progress_mode?: "amount" | "tasks";
  progress_percentage?: number;
  total_contributed?: number;
  remaining_value?: number | null;
  expected?: number | null;
  actual?: number | null;
  ratio?: number | null;
  status: PaceStatus;
  periods_remaining?: number | null;
  required_per_period?: number | null;
}

export interface GoalWithMilestones extends Goal {
  milestones: Milestone[];
}

type GoalRow = {
  id: number | string;
  title: string;
  description: string | null;
  deadline?: string | null;
  target_date?: string | null;
  created_at: string;
  target_value?: number | string | null;
  unit?: string | null;
  start_date?: string | null;
  progress_mode?: "amount" | "tasks" | null;
  progress_percentage?: number | string | null;
  total_contributed?: number | string | null;
  remaining_value?: number | string | null;
  expected?: number | string | null;
  actual?: number | string | null;
  ratio?: number | string | null;
  status?: PaceStatus | string | null;
  periods_remaining?: number | string | null;
  required_per_period?: number | string | null;
};

type MilestoneRow = {
  id: number | string;
  goal_id: number | string;
  title: string;
  type?: string | null;
  period?: string | null;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  completed?: boolean | null;
  completed_at?: string | null;
  closed_at?: string | null;
  progress_percentage?: number | string | null;
  total_tasks?: number | string | null;
  done_tasks?: number | string | null;
  target_value?: number | string | null;
  total_contributed?: number | string | null;
  remaining_value?: number | string | null;
  expected?: number | string | null;
  actual?: number | string | null;
  ratio?: number | string | null;
  status?: PaceStatus | string | null;
  created_at: string;
};

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function toPeriod(value: string | null | undefined): Period {
  const normalized = (value ?? "").toLowerCase();
  return normalized === "weekly" || normalized === "semanal" ? "semanal" : "mensual";
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function toPaceStatus(value: string | null | undefined): PaceStatus | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "completed" || v === "ahead" || v === "on_track" || v === "at_risk") {
    return v as PaceStatus;
  }
  if (v === "logrado") return "completed";
  if (v === "adelantado") return "ahead";
  if (v === "al_dia") return "on_track";
  if (v === "en_riesgo") return "at_risk";
  return null;
}

function mapMilestone(row: MilestoneRow): Milestone {
  const progress = toNumber(row.progress_percentage);
  const totalTasks = toNumber(row.total_tasks);
  const doneTasks = toNumber(row.done_tasks);
  const closedAt = row.closed_at ?? null;

  const completed =
    typeof row.completed === "boolean"
      ? row.completed
      : closedAt !== null || progress >= 100 || (totalTasks > 0 && doneTasks >= totalTasks);

  const dueDate = dateOnly(row.due_date ?? row.period_end ?? row.end_date);
  const periodStart = dateOnly(row.period_start ?? row.start_date);
  const targetValue = toNullableNumber(row.target_value);
  const expected = toNullableNumber(row.expected);
  const actual = toNullableNumber(row.actual ?? row.total_contributed);
  const ratio = toNullableNumber(row.ratio);

  // Deriva el ritmo si la vista no lo calculó directamente
  const status =
    toPaceStatus(row.status) ??
    (completed
      ? "completed"
      : calculatePaceStatus(
          actual ?? 0,
          expected ?? (targetValue ? targetValue * 0.5 : 0),
          targetValue ?? 1,
          dueDate,
        ));

  return {
    id: String(row.id),
    goal_id: String(row.goal_id),
    title: row.title,
    description: (row as any).description ?? null,
    period: toPeriod(row.period ?? row.type),
    due_date: dueDate,
    period_start: periodStart,
    start_date: periodStart,
    completed,
    completed_at: row.completed_at ?? closedAt,
    created_at: row.created_at,
    target_value: targetValue,
    expected,
    actual,
    ratio,
    status,
  };
}

function mapGoal(row: GoalRow): Goal {
  const targetDate = dateOnly(row.target_date ?? row.deadline);
  const targetValue = toNullableNumber(row.target_value);
  const expected = toNullableNumber(row.expected);
  const actual = toNullableNumber(row.actual ?? row.total_contributed);
  const ratio = toNullableNumber(row.ratio);
  const remainingValue = toNullableNumber(row.remaining_value);
  const periodsRemaining = toNullableNumber(row.periods_remaining);
  const requiredPerPeriod = toNullableNumber(row.required_per_period);

  const status =
    toPaceStatus(row.status) ??
    calculatePaceStatus(actual ?? 0, expected ?? 0, targetValue, targetDate);

  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    target_date: targetDate,
    created_at: row.created_at,
    target_value: targetValue,
    unit: row.unit ?? null,
    start_date: dateOnly(row.start_date),
    progress_mode: row.progress_mode ?? (targetValue ? "amount" : "tasks"),
    progress_percentage: toNullableNumber(row.progress_percentage) ?? 0,
    total_contributed: actual ?? 0,
    remaining_value: remainingValue,
    expected,
    actual,
    ratio,
    status,
    periods_remaining: periodsRemaining,
    required_per_period: requiredPerPeriod,
  };
}

/**
 * Lectura de hitos con orden de preferencia:
 *   1. `milestone_status` (incluye expected, actual, ratio y status de ritmo).
 *   2. `milestone_cards` (respaldo de nombres simples del refactor).
 *   3. `milestones` (respaldo de tabla base).
 */
async function fetchMilestones(goalId?: string): Promise<Milestone[]> {
  // 1. Vista de estado con cálculo de ritmo
  let statusQuery = supabase
    .from("milestone_status")
    .select("*")
    .order("period_start", { ascending: true, nullsFirst: true });

  if (goalId !== undefined) statusQuery = statusQuery.eq("goal_id", goalId);

  const { data: statusData, error: statusError } = await statusQuery;
  if (!statusError && statusData) {
    return (statusData as MilestoneRow[]).map(mapMilestone);
  }

  // 2. Respaldo: milestone_cards
  let cardsQuery = supabase
    .from("milestone_cards")
    .select("*")
    .order("created_at", { ascending: true });

  if (goalId !== undefined) cardsQuery = cardsQuery.eq("goal_id", goalId);

  const { data: cards, error: cardsError } = await cardsQuery;
  if (!cardsError && cards) {
    return (cards as MilestoneRow[]).map(mapMilestone);
  }

  // 3. Respaldo directo en tabla milestones
  let fallback = supabase.from("milestones").select("*").order("created_at", { ascending: true });
  if (goalId !== undefined) fallback = fallback.eq("goal_id", goalId);

  const { data: fallbackData, error: fallbackError } = await fallback;
  if (fallbackError) throw fallbackError;

  return ((fallbackData ?? []) as MilestoneRow[]).map(mapMilestone);
}

export interface ProgressEntryRow {
  id: number | string;
  goal_id: number | string;
  milestone_id: number | string | null;
  amount: number | string;
  entry_date: string;
  note?: string | null;
}

export async function fetchProgressEntries(goalId?: string): Promise<ProgressEntryRow[]> {
  try {
    let query = supabase.from("progress_entries").select("*");
    if (goalId !== undefined) {
      query = query.eq("goal_id", goalId);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data as ProgressEntryRow[];
  } catch {
    return [];
  }
}

export function attachMilestones(
  goals: Goal[],
  milestones: Milestone[],
  entries: ProgressEntryRow[] = [],
): GoalWithMilestones[] {
  const byGoalMilestones = new Map<string, Milestone[]>();
  for (const milestone of milestones) {
    const list = byGoalMilestones.get(milestone.goal_id) ?? [];
    list.push(milestone);
    byGoalMilestones.set(milestone.goal_id, list);
  }

  const byGoalEntries = new Map<string, ProgressEntryRow[]>();
  for (const entry of entries) {
    const gid = String(entry.goal_id);
    const list = byGoalEntries.get(gid) ?? [];
    list.push(entry);
    byGoalEntries.set(gid, list);
  }

  const today = new Date();

  return goals.map((goal) => {
    const rawMilestones = byGoalMilestones.get(goal.id) ?? [];
    const goalEntries = byGoalEntries.get(goal.id) ?? [];

    // 1. Recalcular cada hito incorporando sus aportes y completitud
    const updatedMilestones: Milestone[] = rawMilestones.map((m) => {
      const directEntries = goalEntries.filter(
        (e) => e.milestone_id !== null && String(e.milestone_id) === String(m.id),
      );
      const entrySum = directEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const targetValue = m.target_value ?? null;

      let actual = m.actual;
      if (m.completed) {
        actual = targetValue !== null ? Math.max(targetValue, entrySum) : (entrySum > 0 ? entrySum : 1);
      } else {
        actual = entrySum > 0 ? entrySum : (m.actual ?? 0);
      }

      // Expected para este hito
      let expected = m.expected;
      const startStr = m.period_start || m.start_date;
      const endStr = m.due_date;
      if (startStr && endStr && targetValue) {
        const start = parseISO(startStr);
        const end = parseISO(endStr);
        let fraction = 0;
        if (today >= end) {
          fraction = 1;
        } else if (today < start) {
          fraction = 0;
        } else {
          const totalDays = differenceInCalendarDays(end, start) + 1;
          const elapsed = differenceInCalendarDays(today, start) + 1;
          fraction = Math.min(1, Math.max(0, elapsed / totalDays));
        }
        expected = Math.round(targetValue * fraction * 100) / 100;
      }

      let status: PaceStatus;
      if (m.completed) {
        status = "completed";
      } else if (m.due_date && daysUntil(m.due_date, today) < 0) {
        status = "at_risk";
      } else if (targetValue !== null && targetValue > 0) {
        status = calculatePaceStatus(actual ?? 0, expected ?? 0, targetValue, m.due_date, today);
      } else {
        status = "on_track";
      }

      return {
        ...m,
        actual,
        expected: expected ?? null,
        status,
      };
    });

    const goalMilestones = updatedMilestones.sort((a, b) => {
      if (a.period !== b.period) return a.period === "semanal" ? -1 : 1;
      return (a.due_date ?? "").localeCompare(b.due_date ?? "");
    });

    // 2. Aportes libres (sin hito asignado)
    const milestoneIds = new Set(goalMilestones.map((m) => m.id));
    const unassignedEntries = goalEntries.filter(
      (e) => !e.milestone_id || !milestoneIds.has(String(e.milestone_id)),
    );
    const unassignedSum = unassignedEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const isMeasurable = typeof goal.target_value === "number" && goal.target_value > 0;

    let actual = goal.actual ?? goal.total_contributed ?? 0;
    let expected = goal.expected ?? null;
    let status = goal.status;
    let remainingValue = goal.remaining_value ?? null;
    let progressPercentage = goal.progress_percentage ?? 0;
    let periodsRemaining = goal.periods_remaining ?? null;
    let requiredPerPeriod = goal.required_per_period ?? null;

    if (isMeasurable && goal.target_value) {
      const targetValue = goal.target_value;

      if (goalMilestones.length > 0) {
        const milestonesContribution = goalMilestones.reduce((sum, m) => sum + (m.actual ?? 0), 0);
        actual = milestonesContribution + unassignedSum;
      } else if (unassignedSum > 0) {
        actual = unassignedSum;
      }

      remainingValue = Math.max(0, targetValue - actual);
      progressPercentage = Math.min(100, Math.round((actual / targetValue) * 100));

      // Progreso esperado
      if (goalMilestones.length > 0 && goalMilestones.some((m) => m.target_value)) {
        expected = goalMilestones.reduce((sum, m) => sum + (m.expected ?? 0), 0);
      } else if (goal.target_date) {
        const fraction = expectedProgress(goal.created_at, goal.target_date, today) / 100;
        expected = Math.round(targetValue * fraction * 100) / 100;
      } else {
        expected = 0;
      }

      // Ritmo de la meta
      if (actual >= targetValue) {
        status = "completed";
      } else {
        const hasOverdueUncompleted = goalMilestones.some(
          (m) => !m.completed && m.due_date && daysUntil(m.due_date, today) < 0,
        );
        const isDeadlinePassed = goal.target_date ? daysUntil(goal.target_date, today) < 0 : false;

        if (hasOverdueUncompleted || isDeadlinePassed) {
          status = "at_risk";
        } else if (expected !== null && expected > 0) {
          status = calculatePaceStatus(actual, expected, targetValue, goal.target_date, today);
        } else {
          status = "on_track";
        }
      }

      // Períodos restantes y cuota para volver al plan
      const uncompletedMilestones = goalMilestones.filter((m) => !m.completed);

      // Rebalanceo dinámico: Ajustar el target_value de los hitos futuros
      // basándose en el saldo restante real.
      if (isMeasurable && goal.target_value && uncompletedMilestones.length > 0) {
        const perPeriod = Math.round((remainingValue / uncompletedMilestones.length) * 100) / 100;
        const lastCorrection = Math.round((remainingValue - (perPeriod * (uncompletedMilestones.length - 1))) * 100) / 100;
        
        uncompletedMilestones.forEach((m, i) => {
          m.target_value = i === uncompletedMilestones.length - 1 ? lastCorrection : perPeriod;
        });
      }

      const futureMilestones = uncompletedMilestones.filter(
        (m) => !m.due_date || daysUntil(m.due_date, today) >= 0,
      );

      const availablePeriodsCount =
        futureMilestones.length > 0 ? futureMilestones.length : uncompletedMilestones.length;

      if (status === "at_risk" && remainingValue > 0) {
        if (availablePeriodsCount > 0) {
          periodsRemaining = availablePeriodsCount;
          requiredPerPeriod = Math.round((remainingValue / availablePeriodsCount) * 100) / 100;
        } else {
          periodsRemaining = 0;
          requiredPerPeriod = remainingValue;
        }
      } else {
        periodsRemaining = uncompletedMilestones.length;
        requiredPerPeriod = null;
      }
    } else {
      const goalStatusRes = goalStatus(
        {
          created_at: goal.created_at,
          target_date: goal.target_date,
          milestones: goalMilestones,
        },
        today,
      );
      const paceMap: Record<GoalStatus, PaceStatus> = {
        logrado: "completed",
        adelantado: "ahead",
        al_dia: "on_track",
        en_riesgo: "at_risk",
      };
      status = paceMap[goalStatusRes.status];
      periodsRemaining = goalMilestones.filter((m) => !m.completed).length;
      requiredPerPeriod = null;
    }

    return {
      ...goal,
      actual,
      total_contributed: actual,
      remaining_value: remainingValue,
      progress_percentage: progressPercentage,
      expected,
      status,
      periods_remaining: periodsRemaining,
      required_per_period: requiredPerPeriod,
      milestones: goalMilestones,
    };
  });
}

export const goalsQueryOptions = queryOptions({
  queryKey: ["goals"],
  queryFn: async (): Promise<GoalWithMilestones[]> => {
    // 1. Intenta leer desde goal_status (ritmo y aportes calculados)
    let goalsResult = await supabase
      .from("goal_status")
      .select("*")
      .order("created_at", { ascending: false });

    // 2. Respaldo directo en tabla goals si la vista no estuviese disponible
    if (goalsResult.error) {
      goalsResult = await supabase
        .from("goals")
        .select("id,title,description,deadline,created_at,target_value,unit,start_date")
        .order("created_at", { ascending: false });
    }

    if (goalsResult.error) throw goalsResult.error;

    const [milestones, entries] = await Promise.all([
      fetchMilestones(),
      fetchProgressEntries(),
    ]);

    return attachMilestones(
      ((goalsResult.data ?? []) as GoalRow[]).map(mapGoal),
      milestones,
      entries,
    );
  },
});

export const goalQueryOptions = (goalId: string) =>
  queryOptions({
    queryKey: ["goals", goalId],
    queryFn: async (): Promise<GoalWithMilestones | null> => {
      let goalResult = await supabase
        .from("goal_status")
        .select("*")
        .eq("id", goalId)
        .maybeSingle();

      if (goalResult.error || !goalResult.data) {
        goalResult = await supabase
          .from("goals")
          .select("id,title,description,deadline,created_at,target_value,unit,start_date")
          .eq("id", goalId)
          .maybeSingle();
      }

      if (goalResult.error) throw goalResult.error;
      if (!goalResult.data) return null;

      const [milestones, entries] = await Promise.all([
        fetchMilestones(goalId),
        fetchProgressEntries(goalId),
      ]);

      return attachMilestones(
        [mapGoal(goalResult.data as GoalRow)],
        milestones,
        entries,
      )[0] ?? null;
    },
  });

export interface GoalInput {
  title: string;
  description: string | null;
  target_date: string | null;
  target_value?: number | null | undefined;
  unit?: string | null | undefined;
}

export async function createGoal(input: GoalInput) {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      title: input.title,
      description: input.description,
      deadline: input.target_date,
      target_value: input.target_value ?? null,
      unit: input.unit ?? null,
    })
    .select("id,title,description,deadline,created_at,target_value,unit")
    .single();

  if (error) throw error;
  return mapGoal(data as GoalRow);
}

export async function updateGoal(id: string, input: GoalInput) {
  const { error } = await supabase
    .from("goals")
    .update({
      title: input.title,
      description: input.description,
      deadline: input.target_date,
      target_value: input.target_value ?? null,
      unit: input.unit ?? null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw error;
}

export async function createMilestone(input: {
  goal_id: string;
  title: string;
  description?: string | null;
  period: Period;
  due_date: string | null;
  target_value?: number | null;
}) {
  const dueDate = input.due_date || null;
  const type = input.period === "semanal" ? "weekly" : "monthly";

  const payload: Record<string, unknown> = {
    goal_id: input.goal_id,
    title: input.title,
    type,
    start_date: dueDate,
    end_date: dueDate,
    period_start: dueDate,
    period_end: dueDate,
    target_value: input.target_value ?? null,
  };

  if (input.description?.trim()) {
    payload.description = input.description.trim();
  }

  const { error } = await supabase.from("milestones").insert(payload);

  if (error) throw error;
}

export async function setMilestoneCompleted(id: string, completed: boolean) {
  const completedAt = completed ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("milestones")
    .update({
      completed,
      completed_at: completedAt,
      closed_at: completedAt,
    })
    .eq("id", id);

  if (error && /completed/i.test(error.message)) {
    const { error: fallbackError } = await supabase
      .from("milestones")
      .update({ closed_at: completedAt })
      .eq("id", id);
    if (fallbackError) throw fallbackError;
    return;
  }

  if (error) throw error;
}

export async function deleteMilestone(id: string) {
  const { error } = await supabase.from("milestones").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllMilestones(goalId: string, type?: "weekly" | "monthly") {
  let query = supabase.from("milestones").delete().eq("goal_id", goalId);
  if (type) query = query.eq("type", type);
  const { error } = await query;
  if (error) throw error;
}

export interface ProgressEntryInput {
  goal_id: string;
  milestone_id?: string | null;
  amount: number;
  entry_date?: string | null;
  note?: string | null;
}

export async function addProgressEntry(input: ProgressEntryInput) {
  const { error } = await supabase.from("progress_entries").insert({
    goal_id: input.goal_id,
    milestone_id: input.milestone_id ? input.milestone_id : null,
    amount: input.amount,
    entry_date: input.entry_date || new Date().toISOString().slice(0, 10),
    note: input.note || null,
  });

  if (error) throw error;
}

export async function generateGoalMilestones(
  goalId: string,
  periodicity: "monthly" | "weekly" = "monthly",
  customPeriodCount?: number,
  sharedDescription?: string | null,
) {
  // 1. Obtener la información de la meta
  const { data: goalData, error: goalError } = await supabase
    .from("goals")
    .select("id, start_date, created_at, deadline, target_value")
    .eq("id", goalId)
    .single();

  if (goalError || !goalData) {
    throw new Error("No se pudo obtener la información de la meta para planificar.");
  }

  const today = new Date();
  const startStr =
    goalData.start_date ||
    (goalData.created_at ? goalData.created_at.slice(0, 10) : format(today, "yyyy-MM-dd"));
  const startDate = parseISO(startStr);

  const deadlineStr = goalData.deadline;
  const deadlineDate = deadlineStr ? parseISO(deadlineStr) : null;
  const hasDeadline = Boolean(deadlineDate && deadlineDate > startDate);

  // 2. Determinar cantidad de períodos
  let periodCount = 0;
  if (customPeriodCount && customPeriodCount > 0) {
    periodCount = customPeriodCount;
  } else if (hasDeadline && deadlineDate) {
    let cursor = startDate;
    while (cursor < deadlineDate) {
      periodCount++;
      cursor =
        periodicity === "monthly"
          ? addMonths(startDate, periodCount)
          : addWeeks(startDate, periodCount);
      if (periodCount >= 120) break;
    }
  } else {
    periodCount = periodicity === "monthly" ? 6 : 12;
  }

  if (periodCount <= 0) periodCount = 1;

  // IMPORTANTE: NO actualizar goals.deadline si la meta no tenía fecha límite.
  // Permanece sin fecha límite tal como el usuario la configuró.

  const totalTarget = Number(goalData.target_value ?? 0);
  const baseAmount = totalTarget > 0 ? Math.floor((totalTarget / periodCount) * 100) / 100 : null;
  const lastAmount =
    totalTarget > 0 && baseAmount !== null
      ? Math.round((totalTarget - baseAmount * (periodCount - 1)) * 100) / 100
      : null;

  const rows = [];
  for (let i = 1; i <= periodCount; i++) {
    const periodStart =
      periodicity === "monthly" ? addMonths(startDate, i - 1) : addWeeks(startDate, i - 1);
    const nextStart = periodicity === "monthly" ? addMonths(startDate, i) : addWeeks(startDate, i);
    const periodEnd =
      hasDeadline && i === periodCount && deadlineDate ? deadlineDate : addDays(nextStart, -1);
    const title = periodicity === "monthly" ? `Mes ${i}` : `Semana ${i}`;
    const amount = i === periodCount ? lastAmount : baseAmount;

    const row: Record<string, any> = {
      goal_id: goalId,
      title,
      type: periodicity === "monthly" ? "monthly" : "weekly",
      start_date: format(periodStart, "yyyy-MM-dd"),
      end_date: format(periodEnd, "yyyy-MM-dd"),
      period_start: format(periodStart, "yyyy-MM-dd"),
      period_end: format(periodEnd, "yyyy-MM-dd"),
      target_value: amount,
      is_necessary: true,
      completed: false,
    };

    if (sharedDescription?.trim()) {
      row.description = sharedDescription.trim();
    }

    rows.push(row);
  }

  const { error: insertError } = await supabase.from("milestones").insert(rows);
  if (insertError) throw insertError;
}
