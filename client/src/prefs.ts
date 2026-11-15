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
  /** Design version the prefs were saved with (2 = violet redesign). */
  uiVersion?: number;
}

const KEY = "mindflow:prefs";
const DEFAULTS: Prefs = {
  appearance: "light",
  view: "grid",
  sort: "recent",
  defaultLayout: "mindmap",
  defaultTheme: "lavender",
  folders: [],
  onboarded: false,
  uiVersion: 2,
};

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    // Moving to the redesign: adopt the new light look and Lavender theme once.
    if (!saved.uiVersion) {
      delete saved.appearance;
      if (!saved.defaultTheme || saved.defaultTheme === "classic") delete saved.defaultTheme;
    }
    return { ...DEFAULTS, ...saved, uiVersion: 2 };
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
      const bar = dark ? "#16152a" : "#ffffff";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bar);
      // Android app: colour the status / navigation bars to match.
      (window as unknown as { MindFlowAndroid?: { setSystemBars?: (color: string, darkIcons: boolean) => void } }).MindFlowAndroid?.setSystemBars?.(bar, !dark);
    };
    apply();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [prefs.appearance]);

  return { prefs, update };
}
