import type { LineStyle, MapStyle, MindNode, NodeShape, Spacing } from "@shared/model";

/** How a level of topics is drawn. */
export type TopicStyle = "filled" | "soft" | "tint" | "tint-light" | "outline" | "plain" | "underline";

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  canvas: string;
  /** Dot grid colour, or null for a clean canvas */
  dots: string | null;
  root: { fill: string; text: string; border?: string };
  palette: string[];
  /** Main topics (depth 1) */
  branch: TopicStyle;
  /** Sub topics (depth 2+) */
  leaf: TopicStyle;
  /** Background for outline / plain topics */
  surface: string;
  /** Text for outline / plain / underline topics */
  ink: string;
  line: LineStyle;
  shape: Exclude<NodeShape, "theme">;
  font?: string;
}

export const THEMES: Theme[] = [
  {
    id: "lavender",
    name: "Lavender",
    dark: false,
    canvas: "#fbfaff",
    dots: "#e6e2f6",
    root: { fill: "#6b4eff", text: "#ffffff" },
    palette: ["#3b82f6", "#22a35a", "#e8930c", "#e0458e", "#8b5cf6", "#0ea5a4"],
    branch: "tint",
    leaf: "tint-light",
    surface: "#ffffff",
    ink: "#2b2840",
    line: "curve",
    shape: "pill",
  },
  {
    id: "lavender-night",
    name: "Lavender Night",
    dark: true,
    canvas: "#15132a",
    dots: "#25223f",
    root: { fill: "#7c5cff", text: "#ffffff" },
    palette: ["#60a5fa", "#4ade80", "#fbbf24", "#f472b6", "#a78bfa", "#2dd4bf"],
    branch: "tint",
    leaf: "tint-light",
    surface: "#1d1a36",
    ink: "#ece9ff",
    line: "curve",
    shape: "pill",
  },
  {
    id: "classic",
    name: "Classic",
    dark: false,
    canvas: "#f6f7fb",
    dots: "#dfe2ec",
    root: { fill: "#f26a2e", text: "#ffffff" },
    palette: ["#e8930c", "#5f9e1f", "#0a8acb", "#d6407d", "#7b53d6", "#e0452f", "#0f9d8f"],
    branch: "soft",
    leaf: "outline",
    surface: "#ffffff",
    ink: "#26303f",
    line: "curve",
    shape: "rounded",
  },
  {
    id: "charcoal",
    name: "Charcoal",
    dark: true,
    canvas: "#323232",
    dots: null,
    root: { fill: "#f26a2e", text: "#ffffff" },
    palette: ["#e8a33d", "#7fb34a", "#29a3e0", "#e86aa0", "#9c7ef0", "#f06a50", "#2fc0b0"],
    branch: "soft",
    leaf: "plain",
    surface: "#3d3d3d",
    ink: "#eeeeee",
    line: "elbow",
    shape: "rounded",
  },
  {
    id: "ocean",
    name: "Ocean",
    dark: false,
    canvas: "#f2f8fc",
    dots: "#d4e6f2",
    root: { fill: "#0b4f6c", text: "#ffffff" },
    palette: ["#0a7bbd", "#01a2a6", "#2563eb", "#0e7490", "#4f46e5", "#0891b2"],
    branch: "filled",
    leaf: "underline",
    surface: "#ffffff",
    ink: "#0f2a3a",
    line: "elbow",
    shape: "rounded",
  },
  {
    id: "forest",
    name: "Forest",
    dark: false,
    canvas: "#f3f8f1",
    dots: "#d9e8d3",
    root: { fill: "#1f4d2b", text: "#f3f8f1" },
    palette: ["#2f8f46", "#6b8e23", "#0f766e", "#a16207", "#3f6212", "#15803d"],
    branch: "soft",
    leaf: "plain",
    surface: "#ffffff",
    ink: "#1d2b1f",
    line: "curve",
    shape: "pill",
  },
  {
    id: "sunset",
    name: "Sunset",
    dark: false,
    canvas: "#fff8f1",
    dots: "#f7e1cc",
    root: { fill: "#9a3412", text: "#fff7ed" },
    palette: ["#f97316", "#ef4444", "#eab308", "#db2777", "#a855f7", "#f43f5e"],
    branch: "filled",
    leaf: "outline",
    surface: "#ffffff",
    ink: "#431407",
    line: "curve",
    shape: "rounded",
  },
  {
    id: "candy",
    name: "Candy",
    dark: false,
    canvas: "#fdf4fa",
    dots: "#f6dbea",
    root: { fill: "#be185d", text: "#ffffff" },
    palette: ["#ec4899", "#8b5cf6", "#06b6d4", "#f43f5e", "#22c55e", "#f59e0b", "#3b82f6"],
    branch: "filled",
    leaf: "soft",
    surface: "#ffffff",
    ink: "#4a0d2e",
    line: "curve",
    shape: "pill",
  },
  {
    id: "pastel",
    name: "Pastel",
    dark: false,
    canvas: "#fbfbff",
    dots: "#e7e7f5",
    root: { fill: "#6d5dfc", text: "#ffffff" },
    palette: ["#7c6cf6", "#f472b6", "#38bdf8", "#34d399", "#fbbf24", "#fb7185"],
    branch: "soft",
    leaf: "soft",
    surface: "#ffffff",
    ink: "#2e2a4f",
    line: "curve",
    shape: "pill",
  },
  {
    id: "bold",
    name: "Bold",
    dark: false,
    canvas: "#ffffff",
    dots: null,
    root: { fill: "#111111", text: "#ffffff" },
    palette: ["#ef3b2c", "#f6c419", "#2ec27e", "#1e64f0", "#9b3df0", "#ff7a00"],
    branch: "filled",
    leaf: "outline",
    surface: "#ffffff",
    ink: "#111111",
    line: "elbow",
    shape: "rect",
  },
  {
    id: "mono",
    name: "Mono",
    dark: false,
    canvas: "#fafafa",
    dots: "#e6e6e6",
    root: { fill: "#18181b", text: "#ffffff" },
    palette: ["#3f3f46", "#52525b", "#27272a", "#71717a"],
    branch: "outline",
    leaf: "underline",
    surface: "#ffffff",
    ink: "#18181b",
    line: "straight",
    shape: "rect",
  },
  {
    id: "paper",
    name: "Notebook",
    dark: false,
    canvas: "#fbf7ee",
    dots: "#ece3cf",
    root: { fill: "#fffdf7", text: "#2d2a26", border: "#2d2a26" },
    palette: ["#c2410c", "#1d4ed8", "#15803d", "#a21caf", "#b45309", "#0f766e"],
    branch: "underline",
    leaf: "underline",
    surface: "#fffdf7",
    ink: "#2d2a26",
    line: "curve",
    shape: "rounded",
    font: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    dark: true,
    canvas: "#0d2b4e",
    dots: "#1d4776",
    root: { fill: "#0d2b4e", text: "#e0f2fe", border: "#7dd3fc" },
    palette: ["#7dd3fc", "#a5b4fc", "#5eead4", "#fde68a", "#f9a8d4"],
    branch: "outline",
    leaf: "plain",
    surface: "#0f3360",
    ink: "#e0f2fe",
    line: "elbow",
    shape: "rect",
  },
  {
    id: "night",
    name: "Night",
    dark: true,
    canvas: "#0b1220",
    dots: "#1a2436",
    root: { fill: "#e2e8f0", text: "#0f172a" },
    palette: ["#818cf8", "#f472b6", "#fbbf24", "#34d399", "#22d3ee", "#a78bfa", "#fb7185"],
    branch: "filled",
    leaf: "outline",
    surface: "#172033",
    ink: "#e2e8f0",
    line: "curve",
    shape: "rounded",
  },
  {
    id: "neon",
    name: "Neon",
    dark: true,
    canvas: "#0a0a14",
    dots: null,
    root: { fill: "#a855f7", text: "#ffffff" },
    palette: ["#22d3ee", "#f472b6", "#a3e635", "#facc15", "#fb923c", "#60a5fa"],
    branch: "outline",
    leaf: "plain",
    surface: "#12121f",
    ink: "#f1f5f9",
    line: "curve",
    shape: "pill",
  },
];

/** Older theme names from earlier versions. */
const ALIASES: Record<string, string> = { aurora: "lavender" };

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === (ALIASES[id] ?? id)) ?? THEMES[0];
}

// ---------------------------------------------------------------- colours

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mix colour a toward b by t (0..1). Non-hex colours are returned unchanged. */
export function mix(a: string, b: string, t: number): string {
  if (!a.startsWith("#") || !b.startsWith("#")) return a;
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function luminance(hex: string): number {
  if (!hex.startsWith("#")) return 0.5;
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(fill: string): string {
  return luminance(fill) > 0.45 ? "#1f2430" : "#ffffff";
}

// ---------------------------------------------------------------- topic look

export interface NodeVisual {
  fill: string;
  text: string;
  border: string;
  borderWidth: number;
  radius: number;
  underline: boolean;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  padX: number;
  padY: number;
  font: string;
}

const SIZE_SCALE = { s: 0.86, m: 1, l: 1.25, xl: 1.6 } as const;
export const BASE_FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** The single source of truth for how a topic looks, used on screen and in exports. */
export function nodeVisual(theme: Theme, style: MapStyle | undefined, node: MindNode, depth: number, color: string): NodeVisual {
  const shape = style?.shape && style.shape !== "theme" ? style.shape : theme.shape;
  const level: TopicStyle | "root" = depth === 0 ? "root" : depth === 1 ? theme.branch : theme.leaf;
  const ts = node.textStyle ?? {};
  const scale = SIZE_SCALE[ts.size ?? "m"];
  const baseSize = depth === 0 ? 20 : depth === 1 ? 16 : 14;
  const v: NodeVisual = {
    fill: theme.surface,
    text: theme.ink,
    border: "transparent",
    borderWidth: 2,
    radius: 10,
    underline: false,
    fontSize: Math.round(baseSize * scale),
    fontWeight: depth === 0 ? 700 : depth === 1 ? 600 : 500,
    italic: Boolean(ts.italic),
    padX: depth === 0 ? 22 : depth === 1 ? 16 : 12,
    padY: depth === 0 ? 12 : depth === 1 ? 8 : 6,
    font: theme.font ?? BASE_FONT,
  };
  const soft = theme.dark ? mix(color, theme.canvas, 0.72) : mix(color, "#ffffff", 0.8);
  const softText = theme.dark ? mix(color, "#ffffff", 0.35) : mix(color, "#000000", 0.35);
  switch (level) {
    case "root":
      v.fill = node.color ?? theme.root.fill;
      v.text = node.color ? readableOn(node.color) : theme.root.text;
      v.border = theme.root.border ?? v.fill;
      break;
    case "filled":
      v.fill = color;
      v.text = readableOn(color);
      v.border = color;
      break;
    case "tint":
      v.fill = theme.dark ? mix(color, theme.canvas, 0.78) : mix(color, "#ffffff", 0.86);
      v.text = theme.dark ? mix(color, "#ffffff", 0.45) : mix(color, "#000000", 0.42);
      v.border = theme.dark ? mix(color, theme.canvas, 0.35) : mix(color, "#ffffff", 0.35);
      v.borderWidth = 1.8;
      break;
    case "tint-light":
      v.fill = theme.dark ? mix(color, theme.canvas, 0.86) : mix(color, "#ffffff", 0.92);
      v.text = theme.ink;
      v.border = theme.dark ? mix(color, theme.canvas, 0.45) : mix(color, "#ffffff", 0.5);
      v.borderWidth = 1.5;
      break;
    case "soft":
      v.fill = soft;
      v.text = softText;
      v.border = soft;
      break;
    case "outline":
      v.fill = theme.surface;
      v.text = theme.ink;
      v.border = color;
      break;
    case "plain":
      v.fill = theme.dark ? mix(theme.surface, "#ffffff", 0.04) : theme.surface;
      v.text = theme.ink;
      v.border = theme.dark ? mix(theme.surface, "#ffffff", 0.12) : mix(color, "#ffffff", 0.7);
      v.borderWidth = 1;
      break;
    case "underline":
      v.fill = "transparent";
      v.text = theme.ink;
      v.border = color;
      v.underline = true;
      break;
  }
  if (depth > 0 && shape === "underline") {
    v.fill = "transparent";
    v.text = level === "filled" || level === "soft" || level === "tint" ? (theme.dark ? mix(color, "#ffffff", 0.4) : mix(color, "#000000", 0.25)) : theme.ink;
    v.border = color;
    v.underline = true;
  }
  if (v.underline) {
    v.padX = depth === 1 ? 6 : 4;
    v.padY = depth === 1 ? 6 : 4;
    v.radius = 0;
  } else {
    v.radius = shape === "pill" ? (depth === 0 ? 16 : depth === 1 && level === "tint" ? 14 : 999) : shape === "rect" ? 3 : depth === 0 ? 14 : 10;
  }
  if (ts.fill) {
    v.fill = ts.fill;
    v.text = readableOn(ts.fill);
    if (!v.underline) v.border = ts.fill;
  }
  if (ts.color) v.text = ts.color;
  if (ts.bold) v.fontWeight = 800;
  return v;
}

export function lineStyleFor(theme: Theme, style: MapStyle | undefined): LineStyle {
  return style?.line ?? theme.line;
}

export function spacingFactor(spacing: Spacing | undefined): number {
  return spacing === "compact" ? 0.7 : spacing === "loose" ? 1.45 : 1;
}

/** Colour of a main branch. */
export function branchColor(theme: Theme, style: MapStyle | undefined, index: number): string {
  const rainbow = style?.rainbow ?? true;
  return theme.palette[(rainbow ? index : 0) % theme.palette.length];
}
