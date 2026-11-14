import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Rocket,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { goalsQueryOptions, type PaceStatus } from "@/lib/goals";
import {
  computeProgress,
  goalStatus,
  STATUS_TOLERANCE,
  type GoalStatus,
  type GoalStatusResult,
} from "@/lib/progress";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({
    meta: [
      { title: "Panel general — Rumbo" },
      {
        name: "description",
        content: "El avance de todos tus objetivos y cuáles van en riesgo, al día o adelantados.",
      },
      { property: "og:title", content: "Panel general — Rumbo" },
      { property: "og:description", content: "Mira de un vistazo cómo van todos tus objetivos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(goalsQueryOptions),
  component: DashboardPage,
});

const statusInfo: Record<
  GoalStatus,
  { label: string; icon: LucideIcon; chip: string; tile: string }
> = {
  en_riesgo: {
    label: "En riesgo",
    icon: AlertTriangle,
    chip: "bg-destructive/10 text-destructive",
    tile: "text-destructive",
  },
  al_dia: {
    label: "Al día",
    icon: CheckCircle2,
    chip: "bg-secondary text-secondary-foreground",
    tile: "text-primary",
  },
  adelantado: {
    label: "Adelantado",
    icon: Rocket,
    chip: "bg-success/15 text-success",
    tile: "text-success",
  },
  logrado: {
    label: "Logrado",
    icon: Trophy,
    chip: "bg-accent text-accent-foreground",
    tile: "text-accent-foreground",
  },
};

const statusOrder: GoalStatus[] = ["en_riesgo", "al_dia", "adelantado", "logrado"];

function DashboardPage() {
  const { data: goals } = useSuspenseQuery(goalsQueryOptions);

  const paceToGoalStatus: Record<PaceStatus, GoalStatus> = {
    completed: "logrado",
    ahead: "adelantado",
    on_track: "al_dia",
    at_risk: "en_riesgo",
  };

  const rows = goals
    .map((goal) => {
      const result = goalStatus(goal);
      const isMeasurable = typeof goal.target_value === "number" && goal.target_value > 0;
      return {
        goal,
        result: {
          ...result,
          status: paceToGoalStatus[goal.status] ?? result.status,
          actual: isMeasurable
            ? goal.progress_percentage ??
              Math.min(100, Math.round(((goal.actual ?? 0) / (goal.target_value ?? 1)) * 100))
            : result.actual,
        },
      };
    })
    .sort((a, b) => statusOrder.indexOf(a.result.status) - statusOrder.indexOf(b.result.status));
  const overall = computeProgress(goals.flatMap((g) => g.milestones));
  const counts = Object.fromEntries(
    statusOrder.map((s) => [s, rows.filter((r) => r.result.status === s).length]),
  ) as Record<GoalStatus, number>;

  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Panel general</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cómo van todos tus objetivos hoy.</p>

      {goals.length === 0 ? (
        <div className="mt-8 rounded-3xl border bg-card p-8 text-center shadow-soft">
          <h2 className="text-xl font-bold">Aún no tienes objetivos</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Crea tu primer objetivo y aquí verás su avance.
          </p>
          <Button asChild variant="hero" className="mt-5">
            <Link to="/objetivos">Crear un objetivo</Link>
          </Button>
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-3xl bg-ocean p-6 text-navy-foreground shadow-lift">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
              Progreso general
            </p>
            <div className="mt-3 flex items-end justify-between">
              <span className="font-display text-5xl font-extrabold">{overall.percent}%</span>
              <span className="pb-1 text-sm opacity-85">
                {overall.done} de {overall.total} pasos · {goals.length}{" "}
                {goals.length === 1 ? "objetivo" : "objetivos"}
              </span>
            </div>
            <Progress value={overall.percent} className="mt-3 h-3 bg-card/20" />
          </section>

          <section
            aria-label="Resumen por estado"
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {statusOrder.map((s) => {
              const info = statusInfo[s];
              return (
                <div key={s} className="rounded-2xl border bg-card p-4 shadow-soft">
                  <info.icon className={`size-5 ${info.tile}`} />
                  <p className="mt-2 font-display text-3xl font-extrabold">{counts[s]}</p>
                  <p className="text-sm text-muted-foreground">{info.label}</p>
                </div>
              );
            })}
          </section>

          <h2 className="mt-8 text-xl font-bold">Tus objetivos</h2>
          <ul className="mt-3 grid gap-3">
            {rows.map(({ goal, result }) => (
              <li key={goal.id}>
                <Link
                  to="/objetivos/$goalId"
                  params={{ goalId: goal.id }}
                  className="group block rounded-3xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 truncate text-lg font-bold">{goal.title}</h3>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusChip status={result.status} />
                      <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={result.actual} className="h-2.5" />
                    <span className="w-10 text-right font-display text-sm font-bold">
                      {result.actual}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{explain(result)}</p>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 flex gap-2 rounded-2xl bg-card/60 p-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Comparamos tu avance con el tiempo que ha pasado desde que creaste el objetivo hasta
              su fecha meta. Vas <strong>adelantado</strong> si llevas {STATUS_TOLERANCE} puntos o
              más de ventaja. Está <strong>en riesgo</strong> si vas {STATUS_TOLERANCE} puntos o más
              atrasado, si tienes una meta vencida o si ya pasó la fecha meta.
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: GoalStatus }) {
  const info = statusInfo[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${info.chip}`}
    >
      <info.icon className="size-3.5" /> {info.label}
    </span>
  );
}

function explain(r: GoalStatusResult): string {
  if (r.status === "logrado") return "Cumpliste todos los pasos.";
  if (r.overdueSteps > 0) {
    return r.overdueSteps === 1
      ? "Tienes 1 meta vencida."
      : `Tienes ${r.overdueSteps} metas vencidas.`;
  }
  if (r.expected === null) return "Sin fecha meta: ponle una fecha para medir si vas a tiempo.";
  if (r.expected >= 100 && r.status === "en_riesgo") return "La fecha meta ya pasó.";
  return `A esta altura deberías ir en ${r.expected}%.`;
}
