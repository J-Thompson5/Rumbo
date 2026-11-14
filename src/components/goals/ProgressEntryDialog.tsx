import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addProgressEntry, type Milestone } from "@/lib/goals";

interface Props {
  goalId: string;
  unit?: string | null | undefined;
  milestones?: Milestone[] | undefined;
  defaultMilestoneId?: string | undefined;
  trigger?: ReactNode | undefined;
  onSuccess?: (() => void) | undefined;
}

export function ProgressEntryDialog({
  goalId,
  unit,
  milestones = [],
  defaultMilestoneId,
  trigger,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [milestoneId, setMilestoneId] = useState<string>(defaultMilestoneId ?? "none");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setMilestoneId(defaultMilestoneId ?? "none");
      setEntryDate(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [open, defaultMilestoneId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("El monto debe ser un número positivo.");
      return;
    }

    setSaving(true);
    try {
      await addProgressEntry({
        goal_id: goalId,
        milestone_id: milestoneId !== "none" ? milestoneId : null,
        amount: parsedAmount,
        entry_date: entryDate,
        note: note.trim() || null,
      });

      toast.success("Aporte registrado exitosamente.");
      setAmount("");
      setNote("");
      setOpen(false);
      onSuccess?.();
    } catch {
      toast.error("No se pudo registrar el aporte.");
    } finally {
      setSaving(false);
    }
  }

  const defaultTrigger = (
    <Button size="sm" variant="hero" className="rounded-full shadow-sm">
      <Plus className="size-4" /> Registrar aporte
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Registrar aporte</DialogTitle>
            <DialogDescription>
              Agrega un avance real hacia tu meta. El progreso y el ritmo se recalculan al instante.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-amount">Cantidad {unit ? `(${unit})` : ""}</Label>
            <Input
              id="entry-amount"
              type="number"
              step="any"
              min="0.01"
              placeholder="Ej. 1000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-date">Fecha del aporte</Label>
            <Input
              id="entry-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
            />
          </div>

          {milestones.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="entry-milestone">Asociar a un período (opcional)</Label>
              <Select value={milestoneId} onValueChange={setMilestoneId}>
                <SelectTrigger id="entry-milestone">
                  <SelectValue placeholder="Selecciona un período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aporte general a la meta</SelectItem>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="entry-note">Nota (opcional)</Label>
            <Input
              id="entry-note"
              placeholder="Ej. Ahorro de la primera quincena"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={150}
            />
          </div>

          <DialogFooter className="mt-2">
            <Button type="submit" variant="hero" disabled={saving}>
              {saving ? "Registrando…" : "Guardar aporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
