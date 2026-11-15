import { type LayoutMode, type MindMap, type MindNode, toOutline, walk } from "@shared/model";
import type { LayoutResult } from "../layout";
import type { Theme } from "../themes";
import { copyText, download, safeFileName } from "./download";
import { renderSvg } from "./svg";
import { createZip } from "./zip";

export type ExportFormat = "png" | "jpeg" | "pdf" | "svg" | "html" | "md" | "txt" | "opml" | "xmind" | "json";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; ext: string; hint: string; icon: string }[] = [
  { id: "png", label: "PNG image", ext: "png", hint: "Sharp image for slides & notes", icon: "🖼️" },
  { id: "jpeg", label: "JPEG image", ext: "jpg", hint: "Smaller image for chats", icon: "📷" },
  { id: "pdf", label: "PDF", ext: "pdf", hint: "Print or share, fits A4", icon: "📄" },
  { id: "svg", label: "SVG", ext: "svg", hint: "Vector, zoom without blur", icon: "✒️" },
  { id: "html", label: "Web page (HTML)", ext: "html", hint: "Map + collapsible outline", icon: "🌐" },
  { id: "md", label: "Markdown", ext: "md", hint: "Notion, Obsidian, GitHub", icon: "Ⓜ️" },
  { id: "txt", label: "Text outline", ext: "txt", hint: "Plain indented text", icon: "📝" },
  { id: "opml", label: "OPML", ext: "opml", hint: "Workflowy, outliners", icon: "🗂️" },
  { id: "xmind", label: "XMind", ext: "xmind", hint: "Open in XMind", icon: "🧠" },
  { id: "json", label: "MindFlow file", ext: "mindflow.json", hint: "Full backup of this map", icon: "💾" },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- images

/** Rasterise the map. Scale is capped so phones don't run out of canvas memory. */
export async function renderImage(map: MindMap, layout: LayoutResult, theme: Theme, type: "image/png" | "image/jpeg", scale = 2): Promise<{ blob: Blob; width: number; height: number }> {
  const { svg, width, height } = renderSvg(map, layout, theme, { background: true });
  const maxPixels = 24_000_000;
  const s = Math.max(0.25, Math.min(scale, 8192 / width, 8192 / height, Math.sqrt(maxPixels / (width * height))));
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render the image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * s);
    canvas.height = Math.round(height * s);
    const c = canvas.getContext("2d")!;
    c.fillStyle = theme.canvas;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image too large to export"))), type, 0.92),
    );
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- PDF

/** Single-page PDF (A4, orientation from the map's shape) embedding a JPEG of the map. */
export async function renderPdf(map: MindMap, layout: LayoutResult, theme: Theme): Promise<Blob> {
  const { blob, width, height } = await renderImage(map, layout, theme, "image/jpeg", 2.5);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const landscape = width > height;
  const pageW = landscape ? 842 : 595;
  const pageH = landscape ? 595 : 842;
  const margin = 24;
  const fit = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
  const dw = width * fit;
  const dh = height * fit;
  const dx = (pageW - dw) / 2;
  const dy = (pageH - dh) / 2;
  const [r, g, b] = hexRgb(theme.canvas);
  const content = `${r} ${g} ${b} rg 0 0 ${pageW} ${pageH} re f q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${pdfString(map.title)}) /Creator (MindFlow) /Producer (MindFlow) >>`);
  const xref = length;
  let table = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

function pdfString(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, "").replace(/([()\\])/g, "\\$1");
}

function hexRgb(hex: string): [string, string, string] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)) as [string, string, string];
}

// ---------------------------------------------------------------- text formats

export function toPlainText(map: MindMap): string {
  const lines: string[] = [];
  for (const { node, depth } of walk(map.root)) {
    const box = node.task ? (node.task === "done" ? "[x] " : "[ ] ") : "";
    lines.push(`${"    ".repeat(depth)}${box}${node.marker ? node.marker + " " : ""}${node.text}`);
    if (node.note) for (const l of node.note.split("\n")) lines.push(`${"    ".repeat(depth + 1)}// ${l}`);
  }
  return lines.join("\n");
}

export function toOpml(map: MindMap): string {
  const visit = (n: MindNode, indent: string): string => {
    const attrs = [`text="${esc(n.text)}"`];
    if (n.note) attrs.push(`_note="${esc(n.note)}"`);
    if (n.task) attrs.push(`_complete="${n.task === "done"}"`);
    if (n.link) attrs.push(`url="${esc(n.link)}"`);
    if (!n.children.length) return `${indent}<outline ${attrs.join(" ")}/>`;
    return `${indent}<outline ${attrs.join(" ")}>\n${n.children.map((c) => visit(c, indent + "  ")).join("\n")}\n${indent}</outline>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${esc(map.title)}</title></head>\n  <body>\n${visit(map.root, "    ")}\n  </body>\n</opml>\n`;
}

const XMIND_STRUCTURE: Record<LayoutMode, string> = {
  mindmap: "org.xmind.ui.map.unbalanced",
  right: "org.xmind.ui.logic.right",
  left: "org.xmind.ui.logic.left",
  down: "org.xmind.ui.org-chart.down",
  tree: "org.xmind.ui.tree.right",
  timeline: "org.xmind.ui.timeline.horizontal",
  fishbone: "org.xmind.ui.fishbone.leftHeaded",
  radial: "org.xmind.ui.map.clockwise",
  brace: "org.xmind.ui.brace.right",
};
export const XMIND_TO_LAYOUT: Record<string, LayoutMode> = Object.fromEntries(
  Object.entries(XMIND_STRUCTURE).map(([k, v]) => [v, k as LayoutMode]),
);

export function toXmind(map: MindMap): Blob {
  const topic = (n: MindNode): Record<string, unknown> => {
    const t: Record<string, unknown> = { id: n.id, class: "topic", title: n.text };
    if (n.children.length) t.children = { attached: n.children.map(topic) };
    if (n.note) t.notes = { plain: { content: n.note } };
    if (n.link) t.href = n.link;
    const markers: { markerId: string }[] = [];
    if (n.priority) markers.push({ markerId: `priority-${n.priority}` });
    if (n.task) markers.push({ markerId: n.task === "done" ? "task-done" : "task-start" });
    if (markers.length) t.markers = markers;
    if (n.collapsed) t.branch = "folded";
    return t;
  };
  const root = topic(map.root);
  root.structureClass = XMIND_STRUCTURE[map.layout];
  const content = [{ id: map.id, class: "sheet", title: map.title, rootTopic: root, topicPositioning: "fixed" }];
  return createZip([
    { name: "content.json", data: JSON.stringify(content) },
    { name: "metadata.json", data: JSON.stringify({ creator: { name: "MindFlow", version: "2.0" } }) },
    { name: "manifest.json", data: JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {} } }) },
  ]);
}

export function toHtml(map: MindMap, layout: LayoutResult, theme: Theme): string {
  const { svg } = renderSvg(map, layout, theme, { background: true });
  const outline = (n: MindNode): string => {
    const box = n.task ? `<input type="checkbox" disabled ${n.task === "done" ? "checked" : ""}> ` : "";
    const label = `${box}${n.marker ? esc(n.marker) + " " : ""}${n.link ? `<a href="${esc(n.link)}">${esc(n.text)}</a>` : esc(n.text)}`;
    const note = n.note ? `<div class="note">${esc(n.note).replace(/\n/g, "<br>")}</div>` : "";
    if (!n.children.length) return `<li><span>${label}</span>${note}</li>`;
    return `<li><details open><summary>${label}</summary>${note}<ul>${n.children.map(outline).join("")}</ul></details></li>`;
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(map.title)}</title>
<style>
body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7fb;color:#1f2937}
header{padding:20px 24px 8px}h1{margin:0;font-size:24px}p.meta{color:#6b7280;margin:4px 0 0;font-size:13px}
.map{margin:12px 24px;background:#fff;border-radius:14px;box-shadow:0 2px 16px #0001;overflow:auto;max-height:80vh}
.map svg{display:block;max-width:100%;height:auto}
.outline{margin:12px 24px 40px;background:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 2px 16px #0001}
.outline ul{list-style:none;padding-left:18px;margin:2px 0}.outline>ul{padding-left:0}
summary{cursor:pointer;font-weight:600;padding:3px 0}li>span{display:inline-block;padding:3px 0}
.note{color:#4b5563;font-size:13px;background:#f3f4f6;border-left:3px solid #d1d5db;padding:6px 10px;margin:4px 0 6px;border-radius:6px}
@media print{.map{max-height:none;box-shadow:none}.outline{box-shadow:none}details>summary{list-style:none}}
</style></head><body>
<header><h1>${esc(map.title)}</h1><p class="meta">Made with MindFlow · ${new Date(map.updatedAt).toLocaleDateString()}</p></header>
<div class="map">${svg}</div>
<section class="outline"><ul>${outline(map.root)}</ul></section>
</body></html>`;
}

// ---------------------------------------------------------------- entry point

export async function exportMap(format: ExportFormat, map: MindMap, layout: LayoutResult, theme: Theme): Promise<string> {
  const base = safeFileName(map.title);
  switch (format) {
    case "png": {
      const { blob } = await renderImage(map, layout, theme, "image/png", 2);
      download(`${base}.png`, blob);
      break;
    }
    case "jpeg": {
      const { blob } = await renderImage(map, layout, theme, "image/jpeg", 2);
      download(`${base}.jpg`, blob);
      break;
    }
    case "pdf":
      download(`${base}.pdf`, await renderPdf(map, layout, theme));
      break;
    case "svg":
      download(`${base}.svg`, renderSvg(map, layout, theme).svg, "image/svg+xml");
      break;
    case "html":
      download(`${base}.html`, toHtml(map, layout, theme), "text/html");
      break;
    case "md":
      download(`${base}.md`, toOutline(map.root, { withNotes: true }) + "\n", "text/markdown");
      break;
    case "txt":
      download(`${base}.txt`, toPlainText(map) + "\n", "text/plain");
      break;
    case "opml":
      download(`${base}.opml`, toOpml(map), "text/x-opml");
      break;
    case "xmind":
      download(`${base}.xmind`, toXmind(map));
      break;
    case "json":
      download(`${base}.mindflow.json`, JSON.stringify(map, null, 2), "application/json");
      break;
  }
  return EXPORT_FORMATS.find((f) => f.id === format)!.label;
}

export async function copyAsMarkdown(map: MindMap): Promise<void> {
  await copyText(toOutline(map.root, { withNotes: true }));
}
