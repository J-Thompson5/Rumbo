import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GoalInput } from "@/lib/goals";

interface Props {
  trigger: ReactNode;
  title: string;
  submitLabel: string;
  initial?: GoalInput;
  onSubmit: (input: GoalInput) => Promise<unknown>;
}

export function GoalFormDialog({ trigger, title, submitLabel, initial, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.title ?? "");
      setDescription(initial?.description ?? "");
      setTargetDate(initial?.target_date ?? "");
      setTargetValue(initial?.target_value ? String(initial.target_value) : "");
      setUnit(initial?.unit ?? "");
    }
  }, [open, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        title: name.trim(),
        description: description.trim() || null,
        target_date: targetDate || null,
        target_value: targetValue ? Number(targetValue) : null,
        unit: unit.trim() || null,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
            <DialogDescription>Lo grande que quieres lograr.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="goal-title">Objetivo</Label>
            <Input
              id="goal-title"
              placeholder="Ej. Correr mi primer maratón"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="goal-description">¿Por qué es importante? (opcional)</Label>
            <Textarea
              id="goal-description"
              placeholder="Tu motivación, en una o dos frases"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="goal-date">Fecha meta (opcional)</Label>
            <Input
              id="goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="rounded-2xl border bg-muted/30 p-3.5">
            <p className="text-xs font-semibold text-foreground">
              ¿Es un objetivo medible? (opcional)
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Si defines un valor, podrás registrar aportes y seguir el ritmo (adelantado / al día /
              en riesgo).
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div className="grid gap-1">
                <Label htmlFor="goal-value" className="text-xs">
                  Monto / meta
                </Label>
                <Input
                  id="goal-value"
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="Ej. 8000000"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="goal-unit" className="text-xs">
                  Unidad
                </Label>
                <Input
                  id="goal-unit"
                  placeholder="Ej. COP, $, km"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  maxLength={20}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" variant="hero" className="w-full sm:w-auto" disabled={saving}>
              {saving ? "Guardando…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
