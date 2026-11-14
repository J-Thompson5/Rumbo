import { useEffect, useState, type FormEvent } from "react";
import { Calendar, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount, formatDate } from "@/lib/format";
import type { Goal } from "@/lib/goals";
import type { Period } from "@/lib/progress";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal;
  period: Period;
  onConfirm: (count: number, description?: string | null) => Promise<void>;
  loading?: boolean;
}

export function PlanPeriodsDialog({
  open,
  onOpenChange,
  goal,
  period,
  onConfirm,
  loading = false,
}: Props) {
  const isWeekly = period === "semanal";
  const periodName = isWeekly ? "semanas" : "meses";
  const singlePeriodName = isWeekly ? "semana" : "mes";

  const [count, setCount] = useState<number>(6);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setDescription("");
      if (goal.target_date) {
        // Estimar períodos aproximados hasta la fecha meta si existe
        const start = goal.start_date ? new Date(goal.start_date) : new Date(goal.created_at);
        const end = new Date(goal.target_date);
        const diffMs = end.getTime() - start.getTime();
        const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        const calculated = isWeekly
          ? Math.max(1, Math.round(diffDays / 7))
          : Math.max(1, Math.round(diffDays / 30.4375));
        setCount(calculated);
      } else {
        setCount(isWeekly ? 12 : 6);
      }
    }
  }, [open, goal.target_date, goal.start_date, goal.created_at, isWeekly]);

  const total = Number(goal.target_value ?? 0);
  const validCount = count > 0 ? count : 1;
  const quota = total > 0 ? Math.round((total / validCount) * 100) / 100 : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (count <= 0) return;
    await onConfirm(count, description.trim() || null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Planificar períodos</DialogTitle>
            <DialogDescription>
              Divide tu objetivo en metas {isWeekly ? "semanales" : "mensuales"} con montos
              calculados automáticamente.
            </DialogDescription>
          </DialogHeader>

          {goal.target_date ? (
            <div className="flex items-center gap-2 rounded-2xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <Calendar className="size-4 shrink-0 text-foreground" />
              <span>
                Fecha meta: <strong>{formatDate(goal.target_date)}</strong>
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-2xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <Layers className="mt-0.5 size-4 shrink-0 text-foreground" />
              <span>
                Este objetivo no tiene fecha límite fijada. Indica cuántos períodos deseas y no se
                modificará la fecha de tu objetivo.
              </span>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="periods-count">¿Cuántos {periodName} deseas planificar?</Label>
            <Input
              id="periods-count"
              type="number"
              min={1}
              max={120}
              value={count || ""}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 0))}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="shared-description">Descripción para todos los períodos (opcional)</Label>
            <Input
              id="shared-description"
              placeholder="Ej: Completar 2 capítulos de estudio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Resumen de la planificación
            </p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meta total:</span>
                <span className="font-semibold">
                  {formatAmount(total)} {goal.unit ?? ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Períodos:</span>
                <span className="font-semibold">
                  {validCount} {validCount === 1 ? singlePeriodName : periodName}
                </span>
              </div>
              <div className="flex justify-between border-t pt-1.5 text-base">
                <span className="font-medium">Cuota por {singlePeriodName}:</span>
                <span className="font-bold text-teal">
                  {formatAmount(quota)} {goal.unit ?? ""}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="hero"
              className="rounded-full"
              disabled={loading || count <= 0}
            >
              {loading ? "Planificando…" : "Planificar períodos"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
