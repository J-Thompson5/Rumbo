import { useCallback, useEffect, useState } from "react";

export type ThemeId = "oceano" | "bosque" | "atardecer" | "noche";
export type FontSizeId = "pequena" | "normal" | "grande" | "muy-grande";

export interface Preferences {
  theme: ThemeId;
  fontSize: FontSizeId;
}

export const DEFAULT_PREFERENCES: Preferences = { theme: "oceano", fontSize: "normal" };

export const STORAGE_KEY = "rumbo:preferences";

export const THEMES: { id: ThemeId; label: string; description: string; swatch: string[] }[] = [
  {
    id: "oceano",
    label: "Océano profundo",
    description: "Azules y turquesa",
    swatch: ["#0c2340", "#1a4a6e", "#2d8a9e", "#5cbdb9"],
  },
  {
    id: "bosque",
    label: "Bosque",
    description: "Verdes naturales",
    swatch: ["#13301f", "#2a5a3c", "#4f8f5a", "#9cc586"],
  },
  {
    id: "atardecer",
    label: "Atardecer",
    description: "Terracota y arena",
    swatch: ["#40180f", "#9c4128", "#d9733a", "#efbe7d"],
  },
  {
    id: "noche",
    label: "Noche",
    description: "Fondo oscuro, descansa la vista",
    swatch: ["#0f1626", "#1b2638", "#2d8a9e", "#5cbdb9"],
  },
];

export const FONT_SIZES: { id: FontSizeId; label: string; scale: string }[] = [
  { id: "pequena", label: "Pequeña", scale: "93.75%" },
  { id: "normal", label: "Normal", scale: "100%" },
  { id: "grande", label: "Grande", scale: "112.5%" },
  { id: "muy-grande", label: "Muy grande", scale: "125%" },
];

function isTheme(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}
function isFontSize(v: unknown): v is FontSizeId {
  return FONT_SIZES.some((f) => f.id === v);
}

export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<
      Record<keyof Preferences, unknown>
    >;
    return {
      theme: isTheme(raw["theme"]) ? raw["theme"] : DEFAULT_PREFERENCES.theme,
      fontSize: isFontSize(raw["fontSize"]) ? raw["fontSize"] : DEFAULT_PREFERENCES.fontSize,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function applyPreferences(prefs: Preferences) {
  const root = document.documentElement;
  root.dataset["theme"] = prefs.theme;
  root.dataset["fontSize"] = prefs.fontSize;
  root.classList.toggle("dark", prefs.theme === "noche");
}

/**
 * Inline script for <head>: applies saved preferences before the first paint so
 * the page never flashes the default colors or text size.
 */
export const preferencesBootScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"{}");var r=document.documentElement;if(p.theme){r.dataset.theme=p.theme;if(p.theme==="noche")r.classList.add("dark");}if(p.fontSize)r.dataset.fontSize=p.fontSize;}catch(e){}})();`;

/** Client-only hook; returns defaults until mounted. */
export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(readPreferences());
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      applyPreferences(next);
      return next;
    });
  }, []);

  return { prefs, update };
}
