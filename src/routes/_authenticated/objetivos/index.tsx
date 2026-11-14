import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";

import heroImage from "@/assets/camino-objetivo.jpg";
import { GoalFormDialog } from "@/components/goals/GoalFormDialog";
import { PaceAdvice, PaceBadge } from "@/components/goals/PaceBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createGoal, goalsQueryOptions, type GoalWithMilestones } from "@/lib/goals";
import { formatAmount, formatDate } from "@/lib/format";
import { computeProgress, daysUntil, describeDaysLeft } from "@/lib/progress";

export const Route = createFileRoute("/_authenticated/objetivos/")({
  head: () => ({
    meta: [
      { title: "Mis objetivos — Rumbo" },
      { name: "description", content: "Tus objetivos principales y su avance." },
      { property: "og:title", content: "Mis objetivos — Rumbo" },
      { property: "og:description", content: "Tus objetivos principales y su avance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(goalsQueryOptions),
  component: GoalsPage,
});

function GoalsPage() {
  const { data: goals } = useSuspenseQuery(goalsQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: createGoal,
    onSuccess: (goal) => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Objetivo creado. Ahora divídelo en pasos.");
      navigate({ to: "/objetivos/$goalId", params: { goalId: goal.id } });
    },
    onError: () => toast.error("No pudimos guardar el objetivo."),
  });

  const newGoalButton = (
    <Button variant="hero">
      <Plus />
      Nuevo objetivo
    </Button>
  );

  return (
    <div className="animate-rise">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Mis objetivos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {goals.length === 0
              ? "Empieza por lo grande."
              : `${goals.length} ${goals.length === 1 ? "objetivo en marcha" : "objetivos en marcha"}`}
          </p>
        </div>
        {goals.length > 0 && (
          <GoalFormDialog
            trigger={newGoalButton}
            title="Nuevo objetivo"
            submitLabel="Crear objetivo"
            onSubmit={(input) => create.mutateAsync(input)}
          />
        )}
      </div>

      {goals.length === 0 ? (
        <div className="mt-8 overflow-hidden rounded-3xl border bg-card shadow-soft">
          <img
            src={heroImage}
            alt=""
            width={1024}
            height={1280}
            loading="lazy"
            className="h-44 w-full object-cover object-[center_70%]"
          />
          <div className="p-6 text-center">
            <h2 className="text-xl font-bold">¿Cuál es tu gran objetivo?</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Escríbelo y luego lo dividimos en metas semanales y mensuales.
            </p>
            <div className="mt-5">
              <GoalFormDialog
                trigger={newGoalButton}
                title="Nuevo objetivo"
                submitLabel="Crear objetivo"
                onSubmit={(input) => create.mutateAsync(input)}
              />
            </div>
          </div>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalWithMilestones }) {
  const isMeasurable = typeof goal.target_value === "number" && goal.target_value > 0;
  const progress = computeProgress(goal.milestones);
  const displayPercent = isMeasurable
    ? goal.progress_percentage ??
      Math.min(100, Math.round(((goal.actual ?? 0) / (goal.target_value ?? 1)) * 100))
    : progress.percent;
  const done = isMeasurable
    ? (goal.target_value ? (goal.actual ?? 0) >= goal.target_value : false)
    : progress.total > 0 && progress.percent === 100;

  return (
    <li>
      <Link
        to="/objetivos/$goalId"
        params={{ goalId: goal.id }}
        className="group block rounded-3xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{goal.title}</h2>
            {goal.target_date && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                {formatDate(goal.target_date)}
                {!done && <> · {describeDaysLeft(daysUntil(goal.target_date))}</>}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaceBadge status={goal.status} />
            <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={displayPercent} className="h-2.5" />
          <span className="w-10 text-right font-display text-sm font-bold">
            {displayPercent}%
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isMeasurable
            ? `${formatAmount(goal.actual ?? 0)} / ${formatAmount(goal.target_value ?? 0)} ${goal.unit ?? ""}`
            : progress.total === 0
              ? "Sin pasos todavía"
              : `${progress.done} de ${progress.total} pasos cumplidos`}
        </p>
        {goal.status === "at_risk" && goal.required_per_period && (
          <PaceAdvice
            status={goal.status}
            requiredPerPeriod={goal.required_per_period}
            periodsRemaining={goal.periods_remaining}
            unit={goal.unit}
            className="mt-3"
          />
        )}
      </Link>
    </li>
  );
}
