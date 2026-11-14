import { AlertTriangle, CheckCircle2, Rocket, Trophy, type LucideIcon } from "lucide-react";

import { formatAmount } from "@/lib/format";
import type { PaceStatus } from "@/lib/progress";
import { cn } from "@/lib/utils";

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
}

const statusConfig: Record<PaceStatus, StatusConfig> = {
  completed: {
    label: "Logrado",
    icon: Trophy,
    badgeClass: "bg-muted text-muted-foreground border-border/50",
  },
  ahead: {
    label: "Adelantado",
    icon: Rocket,
    badgeClass: "bg-teal/15 text-teal border-teal/30 dark:bg-teal/20",
  },
  on_track: {
    label: "Al día",
    icon: CheckCircle2,
    badgeClass: "bg-success/15 text-success border-success/30 dark:bg-success/20",
  },
  at_risk: {
    label: "En riesgo",
    icon: AlertTriangle,
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30 dark:bg-destructive/20",
  },
};

export interface PaceBadgeProps {
  status?: PaceStatus | null | undefined;
  className?: string | undefined;
  showIcon?: boolean | undefined;
}

export function PaceBadge({ status, className, showIcon = true }: PaceBadgeProps) {
  if (!status) return null;
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        config.badgeClass,
        className,
      )}
    >
      {showIcon && <Icon className="size-3.5 shrink-0" />}
      <span>{config.label}</span>
    </span>
  );
}

export interface PaceAdviceProps {
  status?: PaceStatus | null | undefined;
  requiredPerPeriod?: number | null | undefined;
  periodsRemaining?: number | null | undefined;
  unit?: string | null | undefined;
  className?: string | undefined;
}

/**
 * Reusable advice block for measurable goals that are at risk.
 * Displays the required contribution per remaining period to get back on track.
 */
export function PaceAdvice({
  status,
  requiredPerPeriod,
  periodsRemaining,
  unit,
  className,
}: PaceAdviceProps) {
  if (status !== "at_risk" || !requiredPerPeriod || requiredPerPeriod <= 0) {
    return null;
  }

  const unitSuffix = unit ? ` ${unit}` : "";
  const periodText =
    periodsRemaining && periodsRemaining > 1
      ? `en cada uno de los ${periodsRemaining} períodos restantes`
      : "en el período restante";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive dark:bg-destructive/15",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">Para volver al plan:</p>
        <p className="mt-0.5 opacity-90">
          Aporta{" "}
          <strong>
            {formatAmount(requiredPerPeriod)}
            {unitSuffix}
          </strong>{" "}
          {periodText}.
        </p>
      </div>
    </div>
  );
}
