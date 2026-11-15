import { useCallback, useEffect, useState } from "react";
import type { LayoutMode } from "@shared/model";

export interface Prefs {
  appearance: "dark" | "light" | "system";
  view: "grid" | "list";
  sort: "recent" | "name" | "created";
  defaultLayout: LayoutMode;
  defaultTheme: string;
  /** Empty folders the user created (folders with maps come from the maps). */
  folders: string[];
  /** Has seen the welcome tips */
  onboarded: boolean;
}

const KEY = "mindflow:prefs";
const DEFAULTS: Prefs = {
  appearance: "dark",
  view: "grid",
  sort: "recent",
  defaultLayout: "mindmap",
  defaultTheme: "classic",
  folders: [],
  onboarded: false,
};

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  // Apply light / dark app chrome.
  useEffect(() => {
    const apply = () => {
      const dark = prefs.appearance === "dark" || (prefs.appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#16181d" : "#ffffff");
    };
    apply();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [prefs.appearance]);

  return { prefs, update };
}
