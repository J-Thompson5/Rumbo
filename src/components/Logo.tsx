import { Link } from "@tanstack/react-router";
import { Mountain } from "lucide-react";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2">
      <span
        className={
          inverted
            ? "grid size-8 place-items-center rounded-xl bg-card/15 text-navy-foreground"
            : "grid size-8 place-items-center rounded-xl bg-ocean text-navy-foreground"
        }
      >
        <Mountain className="size-4" />
      </span>
      <span
        className={
          inverted
            ? "font-display text-lg font-bold tracking-tight text-navy-foreground"
            : "font-display text-lg font-bold tracking-tight text-foreground"
        }
      >
        Rumbo
      </span>
    </Link>
  );
}
