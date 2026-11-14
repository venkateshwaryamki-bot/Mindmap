export interface Theme {
  id: string;
  name: string;
  canvas: string;
  dots: string;
  root: string;
  rootText: string;
  palette: string[];
  /** Background of depth >= 2 nodes */
  leaf: string;
  leafText: string;
  dark: boolean;
}

export const THEMES: Theme[] = [
  {
    id: "aurora",
    name: "Aurora",
    canvas: "#f5f6fb",
    dots: "#d9dce8",
    root: "#1e293b",
    rootText: "#ffffff",
    palette: ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16"],
    leaf: "#ffffff",
    leafText: "#1f2937",
    dark: false,
  },
  {
    id: "sunset",
    name: "Sunset",
    canvas: "#fff7ed",
    dots: "#fde3c8",
    root: "#7c2d12",
    rootText: "#fff7ed",
    palette: ["#f97316", "#ef4444", "#eab308", "#db2777", "#a855f7", "#fb7185", "#0ea5e9"],
    leaf: "#ffffff",
    leafText: "#431407",
    dark: false,
  },
  {
    id: "forest",
    name: "Forest",
    canvas: "#f0fdf4",
    dots: "#cde9d6",
    root: "#14532d",
    rootText: "#f0fdf4",
    palette: ["#16a34a", "#0d9488", "#65a30d", "#059669", "#0891b2", "#ca8a04", "#4d7c0f"],
    leaf: "#ffffff",
    leafText: "#052e16",
    dark: false,
  },
  {
    id: "mono",
    name: "Mono",
    canvas: "#fafafa",
    dots: "#e5e5e5",
    root: "#111827",
    rootText: "#ffffff",
    palette: ["#374151", "#4b5563", "#6b7280", "#1f2937", "#52525b"],
    leaf: "#ffffff",
    leafText: "#111827",
    dark: false,
  },
  {
    id: "candy",
    name: "Candy",
    canvas: "#fdf2f8",
    dots: "#f9d7e8",
    root: "#831843",
    rootText: "#fdf2f8",
    palette: ["#ec4899", "#8b5cf6", "#06b6d4", "#f43f5e", "#22c55e", "#f59e0b", "#3b82f6"],
    leaf: "#ffffff",
    leafText: "#500724",
    dark: false,
  },
  {
    id: "night",
    name: "Night",
    canvas: "#0b1220",
    dots: "#1e293b",
    root: "#e2e8f0",
    rootText: "#0f172a",
    palette: ["#818cf8", "#f472b6", "#fbbf24", "#34d399", "#22d3ee", "#a78bfa", "#fb7185", "#a3e635"],
    leaf: "#1e293b",
    leafText: "#e2e8f0",
    dark: true,
  },
];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
