import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { GoalFormDialog } from "@/components/goals/GoalFormDialog";
import { PaceAdvice, PaceBadge } from "@/components/goals/PaceBadge";
import { PlanPeriodsDialog } from "@/components/goals/PlanPeriodsDialog";
import { ProgressEntryDialog } from "@/components/goals/ProgressEntryDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  attachMilestones,
  createMilestone,
  deleteAllMilestones,
  deleteGoal,
  deleteMilestone,
  generateGoalMilestones,
  goalQueryOptions,
  setMilestoneCompleted,
  updateGoal,
  type GoalWithMilestones,
  type Milestone,
} from "@/lib/goals";
import { formatAmount, formatDate, formatShortDate } from "@/lib/format";
import { computeProgress, daysUntil, describeDaysLeft, type Period } from "@/lib/progress";

export const Route = createFileRoute("/_authenticated/objetivos/$goalId")({
  loader: async ({ context, params }) => {
    const goal = await context.queryClient.ensureQueryData(goalQueryOptions(params.goalId));
    if (!goal) throw notFound();
    return { title: goal.title };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} — Rumbo` : "Objetivo — Rumbo" },
      {
        name: "description",
        content: "Tu objetivo principal dividido en metas semanales y mensuales.",
      },
      {
        property: "og:title",
        content: loaderData ? `${loaderData.title} — Rumbo` : "Objetivo — Rumbo",
      },
      { property: "og:description", content: "Metas semanales y mensuales hacia tu objetivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  notFoundComponent: GoalNotFound,
  component: GoalDetailPage,
});

function GoalNotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">No encontramos este objetivo</h1>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/objetivos">Volver a mis objetivos</Link>
      </Button>
    </div>
  );
}

const periodLabels: Record<Period, { tab: string; placeholder: string; empty: string }> = {
  semanal: {
    tab: "Semanales",
    placeholder: "Nueva meta para esta semana…",
    empty: "Agrega pasos pequeños que puedas cumplir esta semana.",
  },
  mensual: {
    tab: "Mensuales",
    placeholder: "Nueva meta para este mes…",
    empty: "Agrega metas más grandes que quieras lograr este mes.",
  },
};

function GoalDetailPage() {
  const { goalId } = Route.useParams();
  const { data } = useSuspenseQuery(goalQueryOptions(goalId));
  // The goal can become null after a refetch (deleted, or no longer visible).
  if (!data) return <GoalNotFound />;
  return <GoalDetail goal={data} />;
}

function GoalDetail({ goal }: { goal: GoalWithMilestones }) {
  const goalId = goal.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("semanal");
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

  const isMeasurable = typeof goal.target_value === "number" && goal.target_value > 0;
  const progress = computeProgress(goal.milestones);
  const displayPercent = isMeasurable
    ? goal.progress_percentage ??
      Math.min(100, Math.round(((goal.actual ?? 0) / (goal.target_value ?? 1)) * 100))
    : progress.percent;
  const achieved = isMeasurable
    ? (goal.target_value ? (goal.actual ?? 0) >= goal.target_value : false)
    : progress.total > 0 && progress.percent === 100;
  const key = goalQueryOptions(goalId).queryKey;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["goals"] });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof updateGoal>[1]) => updateGoal(goalId, input),
    onSuccess: () => {
      refresh();
      toast.success("Objetivo actualizado.");
    },
    onError: () => toast.error("No pudimos guardar los cambios."),
  });

  const remove = useMutation({
    mutationFn: () => deleteGoal(goalId),
    onSuccess: async () => {
      toast.success("Objetivo eliminado.");
      await navigate({ to: "/objetivos", replace: true });
      queryClient.removeQueries({ queryKey: key, exact: true });
      queryClient.invalidateQueries({ queryKey: ["goals"], exact: true });
    },
    onError: () => toast.error("No pudimos eliminar el objetivo."),
  });

  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      setMilestoneCompleted(id, completed),
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GoalWithMilestones>(key);
      if (previous) {
        const updatedMilestones = previous.milestones.map((m) =>
          m.id === id ? { ...m, completed } : m,
        );
        const attached = attachMilestones([previous], updatedMilestones, []);
        queryClient.setQueryData(key, attached[0] ?? previous);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("No pudimos actualizar la meta.");
    },
    onSettled: refresh,
  });

  const removeMilestone = useMutation({
    mutationFn: deleteMilestone,
    onSuccess: refresh,
    onError: () => toast.error("No pudimos eliminar la meta."),
  });

  const removeAllMilestones = useMutation({
    mutationFn: ({ period }: { period: Period }) =>
      deleteAllMilestones(goalId, period === "semanal" ? "weekly" : "monthly"),
    onSuccess: (_e, { period }) => {
      refresh();
      toast.success(
        period === "semanal"
          ? "Períodos semanales eliminados."
          : "Períodos mensuales eliminados.",
      );
    },
    onError: () => toast.error("No pudimos eliminar los períodos planificados."),
  });

  const planMilestones = useMutation({
    mutationFn: ({ count, description }: { count?: number; description?: string | null }) =>
      generateGoalMilestones(
        goalId,
        period === "semanal" ? "weekly" : "monthly",
        count,
        description,
      ),
    onSuccess: () => {
      setPlanDialogOpen(false);
      refresh();
      toast.success("Períodos planificados automáticamente.");
    },
    onError: (err: any) => {
      const msg =
        err?.message || "No se pudieron generar los períodos automáticamente.";
      toast.error(msg);
    },
  });

  const byPeriod = (p: Period) => goal.milestones.filter((m) => m.period === p);

  return (
    <div className="animate-rise">
      <Link
        to="/objetivos"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Mis objetivos
      </Link>

      <section className="mt-4 rounded-3xl bg-ocean p-6 text-navy-foreground shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
            Objetivo principal
          </p>
          <div className="-mr-2 -mt-2 flex">
            <GoalFormDialog
              trigger={
                <button
                  type="button"
                  aria-label="Editar objetivo"
                  className="grid size-9 place-items-center rounded-full opacity-80 transition hover:bg-card/15 hover:opacity-100"
                >
                  <Pencil className="size-4" />
                </button>
              }
              title="Editar objetivo"
              submitLabel="Guardar cambios"
              initial={{
                title: goal.title,
                description: goal.description,
                target_date: goal.target_date,
                target_value: goal.target_value,
                unit: goal.unit,
              }}
              onSubmit={(input) => update.mutateAsync(input)}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  aria-label="Eliminar objetivo"
                  className="grid size-9 place-items-center rounded-full opacity-80 transition hover:bg-card/15 hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este objetivo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    También se borrarán sus metas semanales y mensuales. No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => remove.mutate()}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{goal.title}</h1>
        {goal.description && <p className="mt-2 text-sm opacity-85">{goal.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PaceBadge
            status={goal.status}
            className="border-card/25 bg-card/20 text-navy-foreground"
          />
          {goal.target_date && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-card/15 px-3 py-1 text-xs font-medium">
              <CalendarDays className="size-3.5" />
              {formatDate(goal.target_date)}
              {!achieved && <> · {describeDaysLeft(daysUntil(goal.target_date))}</>}
            </p>
          )}
        </div>

        {isMeasurable && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card/15 p-3.5">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-75">Aportes acumulados</p>
              <p className="mt-0.5 font-display text-lg font-bold">
                {formatAmount(goal.actual ?? goal.total_contributed ?? 0)} /{" "}
                {formatAmount(goal.target_value ?? 0)}{" "}
                <span className="text-sm font-normal opacity-85">{goal.unit ?? ""}</span>
              </p>
            </div>
            <ProgressEntryDialog
              goalId={goalId}
              unit={goal.unit}
              milestones={goal.milestones}
              onSuccess={refresh}
            />
          </div>
        )}

        <div className="mt-5 flex items-end justify-between">
          <span className="font-display text-5xl font-extrabold">{displayPercent}%</span>
          <span className="pb-1 text-sm opacity-85">
            {isMeasurable
              ? `${formatAmount(goal.actual ?? 0)} ${goal.unit ?? ""} aportados`
              : `${progress.done} de ${progress.total} pasos`}
          </span>
        </div>
        <Progress value={displayPercent} className="mt-3 h-3 bg-card/20" />

        {goal.status === "at_risk" && goal.required_per_period && (
          <PaceAdvice
            status={goal.status}
            requiredPerPeriod={goal.required_per_period}
            periodsRemaining={goal.periods_remaining}
            unit={goal.unit}
            className="mt-4 border-card/30 bg-card/20 text-navy-foreground [&_svg]:text-amber-300"
          />
        )}

        {achieved && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-card/15 px-4 py-3 text-sm font-semibold">
            <Trophy className="size-4" /> ¡Lo lograste! Cumpliste todos los pasos.
          </p>
        )}
      </section>

      <PlanPeriodsDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        goal={goal}
        period={period}
        onConfirm={async (count, description) => {
          await planMilestones.mutateAsync({ count, description });
        }}
        loading={planMilestones.isPending}
      />

      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mt-8">
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-full p-1">
          {(Object.keys(periodLabels) as Period[]).map((p) => {
            const items = byPeriod(p);
            const done = items.filter((m) => m.completed).length;
            return (
              <TabsTrigger key={p} value={p} className="h-full rounded-full font-semibold">
                {periodLabels[p].tab}
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                  {done}/{items.length}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(periodLabels) as Period[]).map((p) => (
          <TabsContent key={p} value={p} className="mt-4">
            {byPeriod(p).length > 0 && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border bg-card p-3 shadow-soft">
                <p className="text-xs text-muted-foreground">
                  {byPeriod(p).length} {p === "semanal" ? "semanas" : "meses"} planificados
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={removeAllMilestones.isPending}
                    >
                      <Trash2 className="size-4" />
                      Borrar períodos planificados
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-3xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        ¿Borrar todos los períodos {p === "semanal" ? "semanales" : "mensuales"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminarán los {byPeriod(p).length}{" "}
                        {p === "semanal" ? "semanas" : "meses"} planificados de este objetivo. No se
                        puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => removeAllMilestones.mutate({ period: p })}
                      >
                        Borrar todos
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            {byPeriod(p).length === 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-3 shadow-soft">
                <div className="text-xs">
                  <p className="font-semibold">¿Quieres dividir automáticamente tu objetivo?</p>
                  <p className="text-muted-foreground">
                    {isMeasurable
                      ? "Genera los períodos distribuyendo el saldo pendiente entre las cuotas que elijas."
                      : "Genera los períodos para estructurar tu avance en el tiempo."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPlanDialogOpen(true)}
                  disabled={planMilestones.isPending}
                >
                  Planificar períodos
                </Button>
              </div>
            )}
            <AddMilestoneForm
              goalId={goalId}
              period={p}
              isMeasurable={isMeasurable}
              unit={goal.unit}
              onAdded={refresh}
            />
            <MilestoneList
              goal={goal}
              items={byPeriod(p)}
              emptyText={periodLabels[p].empty}
              onToggle={(id, completed) => toggle.mutate({ id, completed })}
              onDelete={(id) => removeMilestone.mutate(id)}
              onRefresh={refresh}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function AddMilestoneForm({
  goalId,
  period,
  isMeasurable,
  unit,
  onAdded,
}: {
  goalId: string;
  period: Period;
  isMeasurable: boolean;
  unit?: string | null | undefined;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createMilestone({
        goal_id: goalId,
        title: title.trim(),
        description: description.trim() || null,
        period,
        due_date: dueDate || null,
        target_value: targetValue ? Number(targetValue) : null,
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      setTargetValue("");
      onAdded();
    } catch {
      toast.error("No pudimos agregar la meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border bg-card p-3 shadow-soft">
      <Input
        aria-label={periodLabels[period].placeholder}
        placeholder={periodLabels[period].placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={160}
        className="h-11 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
      />
      <Input
        aria-label="Descripción (opcional)"
        placeholder="Descripción (opcional)…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="h-9 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 -mt-1"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          type="date"
          aria-label="Fecha límite (opcional)"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-9 flex-1 min-w-[130px] rounded-full bg-muted text-sm"
        />
        {isMeasurable && (
          <Input
            type="number"
            step="any"
            min="0.01"
            placeholder={`Meta ${unit ? `(${unit})` : "(opcional)"}`}
            aria-label="Meta del período"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className="h-9 w-36 rounded-full bg-muted text-sm"
          />
        )}
        <Button type="submit" size="sm" className="h-9" disabled={saving || !title.trim()}>
          <Plus /> Agregar
        </Button>
      </div>
    </form>
  );
}

function MilestoneList({
  goal,
  items,
  emptyText,
  onToggle,
  onDelete,
  onRefresh,
}: {
  goal: GoalWithMilestones;
  items: Milestone[];
  emptyText: string;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  if (items.length === 0) {
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  const isMeasurable = typeof goal.target_value === "number" && goal.target_value > 0;
  const sorted = [...items].sort((a, b) => Number(a.completed) - Number(b.completed));

  return (
    <ul className="mt-3 grid gap-2">
      {sorted.map((m) => {
        const overdue = !m.completed && m.due_date && daysUntil(m.due_date) < 0;
        return (
          <li
            key={m.id}
            className="group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors data-[done=true]:bg-muted/60"
            data-done={m.completed}
          >
            <Checkbox
              id={`m-${m.id}`}
              checked={m.completed}
              onCheckedChange={(v) => onToggle(m.id, v === true)}
              className="size-6 rounded-full border-2 border-teal data-[state=checked]:border-success data-[state=checked]:bg-success [&_svg]:size-3.5"
            />
            <label htmlFor={`m-${m.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span
                className={
                  m.completed
                    ? "block text-sm text-muted-foreground line-through"
                    : "block text-sm font-medium"
                }
              >
                {m.title}
              </span>
              {m.description && (
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {m.description}
                </span>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {m.due_date && (
                  <span
                    className={
                      overdue
                        ? "text-xs font-medium text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {overdue ? "Vencida · " : "Para el "}
                    {formatShortDate(m.due_date)}
                  </span>
                )}
                {isMeasurable && (
                  <span className="text-xs text-muted-foreground">
                    Aportado: <strong>{formatAmount(m.actual ?? 0)}</strong>
                    {m.target_value ? ` / ${formatAmount(m.target_value)}` : ""} {goal.unit ?? ""}
                  </span>
                )}
                <PaceBadge status={m.status} className="scale-90 origin-left" />
              </div>
            </label>
            {isMeasurable && (
              <ProgressEntryDialog
                goalId={goal.id}
                unit={goal.unit}
                milestones={goal.milestones}
                defaultMilestoneId={m.id}
                onSuccess={onRefresh}
                trigger={
                  <button
                    type="button"
                    aria-label={`Registrar aporte a ${m.title}`}
                    title="Registrar aporte a este período"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-teal/15 hover:text-teal"
                  >
                    <Plus className="size-4" />
                  </button>
                }
              />
            )}
            <button
              type="button"
              aria-label={`Eliminar ${m.title}`}
              onClick={() => onDelete(m.id)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
