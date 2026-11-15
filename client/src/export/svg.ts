import { type MindMap, taskProgress } from "@shared/model";
import { type LayoutResult, maxWidthFor } from "../layout";
import type { Theme } from "../themes";
import { wrapText } from "../measure";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SvgOptions {
  padding?: number;
  /** Fill the background with the theme canvas colour (default true). */
  background?: boolean;
}

/** Render a laid-out map to a standalone SVG document. */
export function renderSvg(map: MindMap, layout: LayoutResult, theme: Theme, options: SvgOptions = {}): { svg: string; width: number; height: number } {
  const pad = options.padding ?? 48;
  const { minX, minY, maxX, maxY } = layout.bounds;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  out.push(`<title>${esc(map.title)}</title>`);
  if (options.background !== false) out.push(`<rect width="100%" height="100%" fill="${theme.canvas}"/>`);
  out.push(`<g transform="translate(${pad - minX} ${pad - minY})">`);

  for (const e of layout.edges) {
    out.push(`<path d="${e.path}" stroke="${e.color}" stroke-width="${e.width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`);
  }

  for (const p of layout.nodes) {
    const v = p.visual;
    const n = p.node;
    const bw = v.underline ? 0 : v.borderWidth;
    const r = Math.min(v.radius, p.h / 2, p.w / 2);
    if (!v.underline) {
      out.push(
        `<rect x="${p.x + bw / 2}" y="${p.y + bw / 2}" width="${p.w - bw}" height="${p.h - bw}" rx="${r}" fill="${v.fill}" stroke="${v.border}" stroke-width="${bw}"/>`,
      );
    } else {
      const uw = p.depth === 1 ? 3 : 2;
      out.push(`<line x1="${p.x}" y1="${p.y + p.h - uw / 2}" x2="${p.x + p.w}" y2="${p.y + p.h - uw / 2}" stroke="${v.border}" stroke-width="${uw}" stroke-linecap="round"/>`);
    }
    let top = p.y + bw + v.padY;
    const innerLeft = p.x + bw + v.padX;
    const innerWidth = p.w - (bw + v.padX) * 2;
    if (n.image) {
      const iw = Math.min(n.image.w, maxWidthFor(p.depth) - v.padX * 2);
      const ih = Math.round((n.image.h * iw) / n.image.w);
      out.push(`<image href="${esc(n.image.src)}" x="${p.x + (p.w - iw) / 2}" y="${top}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid meet"/>`);
      top += ih + 6;
    }
    const font = `${v.italic ? "italic " : ""}${v.fontWeight} ${v.fontSize}px ${v.font}`;
    const lineH = v.fontSize * 1.35;
    // prefix items: checkbox, priority, sticker
    let x = innerLeft;
    const icon = v.fontSize * 1.05;
    const rowBottom = p.y + p.h - bw - v.padY;
    const rowMid = (top + rowBottom) / 2;
    if (n.task) {
      const done = n.task === "done";
      out.push(
        `<rect x="${x}" y="${rowMid - icon / 2}" width="${icon}" height="${icon}" rx="4" fill="${done ? "#16a34a" : "none"}" stroke="${done ? "#16a34a" : v.text}" stroke-width="1.6"/>`,
      );
      if (done)
        out.push(
          `<path d="M ${x + icon * 0.25} ${rowMid} L ${x + icon * 0.43} ${rowMid + icon * 0.2} L ${x + icon * 0.77} ${rowMid - icon * 0.22}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      x += icon + 6;
    }
    if (n.priority) {
      const onFill = p.depth === 1 && v.fill === p.color;
      out.push(`<circle cx="${x + icon / 2}" cy="${rowMid}" r="${icon / 2}" fill="${onFill ? "#ffffff" : p.color}"/>`);
      out.push(
        `<text x="${x + icon / 2}" y="${rowMid}" font-family="${esc(v.font)}" font-size="${icon * 0.68}" font-weight="700" fill="${onFill ? p.color : "#fff"}" text-anchor="middle" dominant-baseline="central">${n.priority}</text>`,
      );
      x += icon + 6;
    }
    if (n.marker) {
      out.push(`<text x="${x}" y="${rowMid}" font-size="${v.fontSize * 1.05}" dominant-baseline="central">${esc(n.marker)}</text>`);
      x += v.fontSize * 1.35 + 4;
    }
    const prog = n.children.length ? taskProgress(n) : { done: 0, total: 0 };
    const pct = prog.total ? `${Math.round((prog.done / prog.total) * 100)}%` : "";
    const pctW = pct ? pct.length * v.fontSize * 0.5 + 14 : 0;
    const textWidth = Math.max(20, innerWidth - (x - innerLeft) - pctW);
    const lines = wrapText(n.text, font, textWidth + 3);
    const textTop = rowMid - (lines.length * lineH) / 2;
    lines.forEach((ln, i) => {
      out.push(
        `<text x="${x}" y="${textTop + i * lineH + lineH / 2}" font-family="${esc(v.font)}" font-size="${v.fontSize}" font-weight="${v.fontWeight}"${
          v.italic ? ' font-style="italic"' : ""
        } fill="${v.text}" dominant-baseline="central"${n.task === "done" ? ' opacity="0.65"' : ""}>${esc(ln)}</text>`,
      );
    });
    if (pct) {
      const px = innerLeft + innerWidth - pctW + 4;
      out.push(`<rect x="${px}" y="${rowMid - v.fontSize * 0.6}" width="${pctW - 4}" height="${v.fontSize * 1.2}" rx="${v.fontSize * 0.6}" fill="#16a34a" opacity="0.9"/>`);
      out.push(
        `<text x="${px + (pctW - 4) / 2}" y="${rowMid}" font-family="${esc(v.font)}" font-size="${v.fontSize * 0.7}" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${pct}</text>`,
      );
    }
  }
  out.push("</g></svg>");
  return { svg: out.join(""), width, height };
}
