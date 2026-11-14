import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { FONT_SIZES, THEMES, usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/preferencias")({
  head: () => ({
    meta: [
      { title: "Preferencias — Rumbo" },
      { name: "description", content: "Elige los colores de Rumbo y el tamaño de la letra." },
      { property: "og:title", content: "Preferencias — Rumbo" },
      { property: "og:description", content: "Personaliza colores y tamaño de letra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const { prefs, update } = usePreferences();

  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Preferencias</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Los cambios se aplican al instante y se guardan en este dispositivo.
      </p>

      <section className="mt-6 rounded-3xl border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-bold">Color de la app</h2>
        <div
          role="radiogroup"
          aria-label="Color de la app"
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          {THEMES.map((t) => {
            const selected = prefs.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ theme: t.id })}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition",
                  selected
                    ? "border-primary bg-secondary"
                    : "border-transparent bg-muted hover:border-border",
                )}
              >
                <span className="flex overflow-hidden rounded-xl" aria-hidden>
                  {t.swatch.map((c) => (
                    // Swatch shows the theme's own colors, independent of the active theme.
                    <span key={c} className="h-10 w-5" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
                {selected && <Check className="size-5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-bold">Tamaño de la letra</h2>
        <div
          role="radiogroup"
          aria-label="Tamaño de la letra"
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {FONT_SIZES.map((f) => {
            const selected = prefs.fontSize === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ fontSize: f.id })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-4 transition",
                  selected
                    ? "border-primary bg-secondary"
                    : "border-transparent bg-muted hover:border-border",
                )}
              >
                <span
                  className="font-display font-bold"
                  style={{ fontSize: `calc(1.25rem * ${parseFloat(f.scale) / 100})` }}
                >
                  Aa
                </span>
                <span className="text-xs font-medium">{f.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 rounded-2xl bg-muted p-4 text-sm">
          Así se ve el texto: <strong>“Cada paso pequeño te acerca a tu gran objetivo.”</strong>
        </p>
      </section>
    </div>
  );
}
