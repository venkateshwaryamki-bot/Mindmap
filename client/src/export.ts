import type { MindMap } from "@shared/model";
import { toOutline } from "@shared/model";
import type { LayoutResult } from "./layout";
import type { Theme } from "./themes";

interface AndroidBridge {
  saveFile: (name: string, base64: string, mime: string) => void;
  copyText: (text: string) => void;
}

/** Present when running inside the MindFlow Android app. */
export function androidBridge(): AndroidBridge | undefined {
  return (window as unknown as { MindFlowAndroid?: AndroidBridge }).MindFlowAndroid;
}

export function download(filename: string, data: Blob | string, type = "text/plain") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const android = androidBridge();
  if (android) {
    // Android WebView cannot follow blob: download links, so hand the bytes to the app.
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      android.saveFile(filename, result.slice(result.indexOf(",") + 1), blob.type || type);
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(title: string) {
  return title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "mindmap";
}

export function exportMarkdown(map: MindMap) {
  download(`${safeName(map.title)}.md`, toOutline(map.root, { withNotes: true }), "text/markdown");
}

export function exportJson(map: MindMap) {
  download(`${safeName(map.title)}.mindflow.json`, JSON.stringify(map, null, 2), "application/json");
}

export async function copyOutline(map: MindMap) {
  const text = toOutline(map.root, { withNotes: true });
  const android = androidBridge();
  if (android) android.copyText(text);
  else await navigator.clipboard.writeText(text);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Rasterise the current layout to a PNG (2x) and download it. */
export function exportPng(map: MindMap, layout: LayoutResult, theme: Theme) {
  const pad = 60;
  const scale = 2;
  const w = layout.bounds.maxX - layout.bounds.minX + pad * 2;
  const h = layout.bounds.maxY - layout.bounds.minY + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = theme.canvas;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(pad - layout.bounds.minX, pad - layout.bounds.minY);

  for (const edge of layout.edges) {
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = edge.to.depth === 1 ? 3 : 2;
    ctx.lineCap = "round";
    ctx.stroke(new Path2D(edge.path));
  }

  for (const p of layout.nodes) {
    const radius = p.depth === 0 ? 14 : p.depth === 1 ? 10 : 8;
    if (p.depth <= 1) {
      ctx.fillStyle = p.color;
      roundRect(ctx, p.x, p.y, p.w, p.h, radius);
      ctx.fill();
      ctx.fillStyle = p.depth === 0 ? theme.rootText : "#ffffff";
    } else {
      ctx.fillStyle = theme.leaf;
      roundRect(ctx, p.x, p.y, p.w, p.h, radius);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = theme.leafText;
    }
    const fontSize = p.depth === 0 ? 18 : p.depth === 1 ? 15 : 14;
    const weight = p.depth === 0 ? 700 : p.depth === 1 ? 600 : 500;
    ctx.font = `${weight} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const label = `${p.node.marker ? p.node.marker + " " : ""}${p.node.text}`;
    const lines = wrapText(ctx, label, p.w - 24);
    const lineH = fontSize * 1.35;
    const startY = p.y + p.h / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, p.x + p.w / 2, startY + i * lineH));
  }

  canvas.toBlob((blob) => {
    if (blob) download(`${safeName(map.title)}.png`, blob);
  }, "image/png");
}
