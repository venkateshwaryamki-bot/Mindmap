import type { LineStyle, MindMap, MindNode } from "@shared/model";
import { type NodeVisual, type Theme, branchColor, lineStyleFor, nodeVisual, spacingFactor } from "./themes";
import { textWidth, wrapText } from "./measure";

export interface Size {
  w: number;
  h: number;
}

export type Side = "left" | "right" | "down" | "up" | "radial";

export interface Placed {
  id: string;
  node: MindNode;
  parentId?: string;
  depth: number;
  side: Side;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  visual: NodeVisual;
  /** Number of descendants hidden by a collapsed state. */
  hidden: number;
}

export interface Edge {
  key: string;
  path: string;
  color: string;
  width: number;
  /** Node this edge leads to (hidden together with it in presentation mode). */
  toId?: string;
  dashed?: boolean;
}

export interface LayoutResult {
  nodes: Placed[];
  byId: Map<string, Placed>;
  edges: Edge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const MAX_W = 280;
const MAX_W_ROOT = 340;

export function maxWidthFor(depth: number): number {
  return depth === 0 ? MAX_W_ROOT : MAX_W;
}

/** Size of a topic before the DOM has measured it (also used for previews). */
export function estimateSize(node: MindNode, depth: number, v: NodeVisual): Size {
  const font = `${v.italic ? "italic " : ""}${v.fontWeight} ${v.fontSize}px ${v.font}`;
  const icon = v.fontSize * 1.05 + 6;
  const prefix = (node.task ? icon : 0) + (node.priority ? icon : 0) + (node.marker ? v.fontSize * 1.35 + 4 : 0);
  const bw = v.underline ? 0 : v.borderWidth;
  const maxText = maxWidthFor(depth) - (v.padX + bw) * 2 - prefix;
  const lines = wrapText(node.text, font, maxText);
  const widest = Math.max(...lines.map((l) => textWidth(l, font)));
  let w = Math.min(maxWidthFor(depth), Math.max(40, widest + prefix + (v.padX + bw) * 2 + 2));
  let h = lines.length * v.fontSize * 1.35 + (v.padY + bw) * 2;
  if (node.image) {
    const iw = Math.min(node.image.w, maxWidthFor(depth) - v.padX * 2);
    w = Math.max(w, iw + (v.padX + bw) * 2);
    h += Math.round((node.image.h * iw) / node.image.w) + 6;
  }
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

function countDescendants(node: MindNode): number {
  let n = 0;
  for (const c of node.children) n += 1 + countDescendants(c);
  return n;
}

const kids = (n: MindNode) => (n.collapsed ? [] : n.children);

// ---------------------------------------------------------------- paths

function roundedElbowH(x1: number, y1: number, x2: number, y2: number, mx: number): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const r = Math.min(10, Math.abs(dy) / 2, Math.abs(mx - x1), Math.abs(x2 - mx));
  const sy = Math.sign(dy);
  const sx1 = Math.sign(mx - x1) || 1;
  const sx2 = Math.sign(x2 - mx) || 1;
  return `M ${x1} ${y1} L ${mx - sx1 * r} ${y1} Q ${mx} ${y1} ${mx} ${y1 + sy * r} L ${mx} ${y2 - sy * r} Q ${mx} ${y2} ${mx + sx2 * r} ${y2} L ${x2} ${y2}`;
}

function roundedElbowV(x1: number, y1: number, x2: number, y2: number, my: number): string {
  const dx = x2 - x1;
  if (Math.abs(dx) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const r = Math.min(10, Math.abs(dx) / 2, Math.abs(my - y1), Math.abs(y2 - my));
  const sx = Math.sign(dx);
  const sy1 = Math.sign(my - y1) || 1;
  const sy2 = Math.sign(y2 - my) || 1;
  return `M ${x1} ${y1} L ${x1} ${my - sy1 * r} Q ${x1} ${my} ${x1 + sx * r} ${my} L ${x2 - sx * r} ${my} Q ${x2} ${my} ${x2} ${my + sy2 * r} L ${x2} ${y2}`;
}

function pathH(x1: number, y1: number, x2: number, y2: number, line: LineStyle): string {
  if (line === "straight") return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (line === "elbow") return roundedElbowH(x1, y1, x2, y2, x1 + (x2 - x1) * 0.45);
  const dx = (x2 - x1) * 0.55;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function pathV(x1: number, y1: number, x2: number, y2: number, line: LineStyle): string {
  if (line === "straight") return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (line === "elbow") return roundedElbowV(x1, y1, x2, y2, y1 + (y2 - y1) * 0.5);
  const dy = (y2 - y1) * 0.55;
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

/** Vertical curly brace from y1 to y2 at x, with its tip pointing left to (tipX, ty). */
function bracePath(x: number, y1: number, y2: number, tipX: number, ty: number): string {
  const q = Math.min(10, (y2 - y1) / 4);
  const ym = Math.max(y1 + 2 * q, Math.min(y2 - 2 * q, ty));
  return [
    `M ${x + q} ${y1}`,
    `Q ${x} ${y1} ${x} ${y1 + q}`,
    `L ${x} ${ym - q}`,
    `Q ${x} ${ym} ${tipX} ${ym}`,
    `Q ${x} ${ym} ${x} ${ym + q}`,
    `L ${x} ${y2 - q}`,
    `Q ${x} ${y2} ${x + q} ${y2}`,
  ].join(" ");
}

// ---------------------------------------------------------------- engine

export function layoutMap(map: MindMap, sizes: Map<string, Size>, theme: Theme): LayoutResult {
  const style = map.style;
  const s = spacingFactor(style?.spacing);
  const line = lineStyleFor(theme, style);
  const placed: Placed[] = [];
  const byId = new Map<string, Placed>();
  const edges: Edge[] = [];
  const visuals = new Map<string, NodeVisual>();
  const colors = new Map<string, string>();

  // Colours and visuals for every visible node.
  const prepare = (node: MindNode, depth: number, color: string) => {
    colors.set(node.id, color);
    visuals.set(node.id, nodeVisual(theme, style, node, depth, color));
    kids(node).forEach((c, i) => prepare(c, depth + 1, c.color ?? (depth === 0 ? branchColor(theme, style, i) : color)));
  };
  prepare(map.root, 0, map.root.color ?? theme.root.fill);

  const depthOf = new Map<string, number>();
  const parentOf = new Map<string, string>();
  const nodeById = new Map<string, MindNode>();
  const index = (n: MindNode, d: number) => {
    depthOf.set(n.id, d);
    nodeById.set(n.id, n);
    for (const c of kids(n)) {
      parentOf.set(c.id, n.id);
      index(c, d + 1);
    }
  };
  index(map.root, 0);

  const sizeOf = (n: MindNode): Size => {
    const d = depthOf.get(n.id) ?? 0;
    return sizes.get(n.id) ?? estimateSize(n, d, visuals.get(n.id)!);
  };

  const place = (n: MindNode, x: number, y: number, side: Side): Placed => {
    const size = sizeOf(n);
    const p: Placed = {
      id: n.id,
      node: n,
      parentId: parentOf.get(n.id),
      depth: depthOf.get(n.id) ?? 0,
      side,
      x,
      y,
      w: size.w,
      h: size.h,
      color: colors.get(n.id)!,
      visual: visuals.get(n.id)!,
      hidden: n.collapsed ? countDescendants(n) : 0,
    };
    placed.push(p);
    byId.set(p.id, p);
    return p;
  };

  const anchorY = (p: Placed) => (p.visual.underline ? p.y + p.h : p.y + p.h / 2);
  const edgeWidth = (child: Placed) => (child.depth === 1 ? 3 : 2);
  const addEdge = (from: Placed, to: Placed, path: string) =>
    edges.push({ key: `${from.id}>${to.id}`, path, color: to.color, width: edgeWidth(to), toId: to.id });

  const root = map.root;
  const rootSize = sizeOf(root);

  // ---- horizontal family: mindmap / right / left / brace ------------------
  const hGapRoot = 78 * s;
  const vGapRoot = 22 * s;
  const vGap = 12 * s;
  const hHeight = new Map<string, number>();
  const measureH = (n: MindNode): number => {
    const own = sizeOf(n).h;
    const c = kids(n);
    let total = 0;
    for (const k of c) total += measureH(k);
    total += Math.max(0, c.length - 1) * vGap;
    const h = c.length ? Math.max(own, total) : own;
    hHeight.set(n.id, h);
    return h;
  };
  const placeH = (n: MindNode, side: "left" | "right", x: number, cy: number, hGap: number): Placed => {
    const size = sizeOf(n);
    const p = place(n, side === "left" ? x - size.w : x, cy - size.h / 2, side);
    const c = kids(n);
    if (!c.length) return p;
    const total = c.reduce((sum, k) => sum + (hHeight.get(k.id) ?? 0), 0) + (c.length - 1) * vGap;
    let cursor = cy - total / 2;
    const childX = side === "left" ? p.x - hGap : p.x + p.w + hGap;
    for (const k of c) {
      const kh = hHeight.get(k.id) ?? 0;
      placeH(k, side, childX, cursor + kh / 2, hGap);
      cursor += kh + vGap;
    }
    return p;
  };

  const layoutHorizontal = (mode: "mindmap" | "right" | "left" | "brace") => {
    const c = kids(root);
    c.forEach(measureH);
    const rp = place(root, -rootSize.w / 2, -rootSize.h / 2, "right");
    let right: MindNode[] = c;
    let left: MindNode[] = [];
    if (mode === "left") {
      right = [];
      left = c;
    } else if (mode === "mindmap" && c.length > 1) {
      const heights = c.map((k) => hHeight.get(k.id) ?? 0);
      const total = heights.reduce((a, b) => a + b, 0);
      let acc = 0;
      let split = 1;
      let best = Infinity;
      for (let i = 1; i < c.length; i++) {
        acc += heights[i - 1];
        const diff = Math.abs(acc - (total - acc));
        if (diff < best) {
          best = diff;
          split = i;
        }
      }
      right = c.slice(0, split);
      left = c.slice(split).reverse(); // clockwise reading order
    }
    const hGap = mode === "brace" ? 66 * s : 54 * s;
    const placeSide = (list: MindNode[], side: "left" | "right") => {
      const total = list.reduce((sum, k) => sum + (hHeight.get(k.id) ?? 0), 0) + Math.max(0, list.length - 1) * vGapRoot;
      let cursor = -total / 2;
      const x = side === "left" ? rp.x - hGapRoot : rp.x + rp.w + hGapRoot;
      for (const k of list) {
        const kh = hHeight.get(k.id) ?? 0;
        placeH(k, side, x, cursor + kh / 2, hGap);
        cursor += kh + vGapRoot;
      }
    };
    placeSide(right, "right");
    placeSide(left, "left");

    for (const p of placed) {
      if (!p.parentId) continue;
      const parent = byId.get(p.parentId)!;
      if (mode === "brace") continue; // drawn per parent below
      const fromCenter = parent.depth === 0 && line === "curve" && mode === "mindmap";
      const y1 = anchorY(parent);
      const y2 = anchorY(p);
      if (p.side === "right") {
        const x1 = fromCenter ? parent.x + parent.w / 2 : parent.x + parent.w;
        addEdge(parent, p, pathH(x1, y1, p.x, y2, line));
      } else {
        const x1 = fromCenter ? parent.x + parent.w / 2 : parent.x;
        addEdge(parent, p, pathH(x1, y1, p.x + p.w, y2, line));
      }
    }
    if (mode === "brace") {
      for (const parent of placed) {
        const c = kids(parent.node).map((k) => byId.get(k.id)!).filter(Boolean);
        if (!c.length) continue;
        const x0 = parent.x + parent.w;
        const py = parent.y + parent.h / 2;
        if (c.length === 1) {
          addEdge(parent, c[0], `M ${x0} ${py} L ${c[0].x} ${c[0].y + c[0].h / 2}`);
          continue;
        }
        const y1 = c[0].y + c[0].h / 2;
        const y2 = c[c.length - 1].y + c[c.length - 1].h / 2;
        const bx = x0 + (c[0].x - x0) * 0.55;
        const tip = x0 + 6;
        edges.push({
          key: `brace:${parent.id}`,
          path: bracePath(bx, y1, y2, tip, py),
          color: parent.depth === 0 ? c[0].color : parent.color,
          width: parent.depth === 0 ? 2.5 : 2,
          toId: c[0].id,
        });
      }
    }
  };

  // ---- org chart (down) ---------------------------------------------------
  const layoutDown = () => {
    const vWidth = new Map<string, number>();
    const sibGap = 24 * s;
    const levelGap = 56 * s;
    const measureV = (n: MindNode): number => {
      const own = sizeOf(n).w;
      const c = kids(n);
      let total = 0;
      for (const k of c) total += measureV(k);
      total += Math.max(0, c.length - 1) * sibGap;
      const w = c.length ? Math.max(own, total) : own;
      vWidth.set(n.id, w);
      return w;
    };
    const placeV = (n: MindNode, cx: number, y: number) => {
      const size = sizeOf(n);
      const p = place(n, cx - size.w / 2, y, "down");
      const c = kids(n);
      const total = c.reduce((sum, k) => sum + (vWidth.get(k.id) ?? 0), 0) + Math.max(0, c.length - 1) * sibGap;
      let cursor = cx - total / 2;
      for (const k of c) {
        const kw = vWidth.get(k.id) ?? 0;
        const child = placeV(k, cursor + kw / 2, y + size.h + levelGap);
        addEdge(p, child, pathV(p.x + p.w / 2, p.y + p.h, child.x + child.w / 2, child.y, line === "curve" ? "curve" : line));
        cursor += kw + sibGap;
      }
      return p;
    };
    measureV(root);
    placeV(root, 0, -rootSize.h / 2);
  };

  // ---- tree chart (indented) ----------------------------------------------
  /** Places n's descendants as an indented list below (dir 1) or above (dir -1) the node. */
  const treeIndent = 34 * s;
  const treeGap = 10 * s;
  const placeTreeChildren = (p: Placed, dir: 1 | -1) => {
    let cursor = dir === 1 ? p.y + p.h + treeGap : p.y - treeGap;
    const x = p.x + treeIndent;
    const placeSub = (n: MindNode, nx: number): Placed => {
      const size = sizeOf(n);
      const y = dir === 1 ? cursor : cursor - size.h;
      const child = place(n, nx, y, dir === 1 ? "down" : "up");
      cursor = dir === 1 ? y + size.h + treeGap : y - treeGap;
      for (const k of kids(n)) {
        const grand = placeSub(k, nx + treeIndent);
        treeEdge(child, grand, dir);
      }
      return child;
    };
    for (const k of kids(p.node)) {
      const child = placeSub(k, x);
      treeEdge(p, child, dir);
    }
  };
  const treeEdge = (parent: Placed, child: Placed, dir: 1 | -1) => {
    const x1 = parent.x + Math.min(18, parent.w / 3);
    const y1 = dir === 1 ? parent.y + parent.h : parent.y;
    const y2 = anchorY(child);
    const x2 = child.x;
    const r = Math.min(8, Math.abs(y2 - y1) / 2, (x2 - x1) / 2);
    const path =
      line === "straight"
        ? `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`
        : `M ${x1} ${y1} L ${x1} ${y2 - dir * r} Q ${x1} ${y2} ${x1 + r} ${y2} L ${x2} ${y2}`;
    addEdge(parent, child, path);
  };

  const layoutTree = () => {
    const rp = place(root, 0, 0, "down");
    placeTreeChildren(rp, 1);
  };

  // ---- timeline -------------------------------------------------------------
  const layoutTimeline = () => {
    const rp = place(root, -rootSize.w, -rootSize.h / 2, "right");
    let x = rp.x + rp.w + 60 * s;
    const c = kids(root);
    let lastRight = rp.x + rp.w;
    c.forEach((k, i) => {
      const size = sizeOf(k);
      const p = place(k, x, -size.h / 2, "right");
      const before = placed.length;
      placeTreeChildren(p, i % 2 === 0 ? 1 : -1);
      let right = p.x + p.w;
      for (let j = before; j < placed.length; j++) right = Math.max(right, placed[j].x + placed[j].w);
      edges.push({ key: `axis:${k.id}`, path: `M ${lastRight} 0 L ${p.x} 0`, color: p.color, width: 3.5, toId: k.id });
      lastRight = p.x + p.w;
      x = right + 44 * s;
    });
    if (c.length) {
      const end = lastRight + 28;
      edges.push({ key: "axis:end", path: `M ${lastRight} 0 L ${end} 0 M ${end - 9} -7 L ${end} 0 L ${end - 9} 7`, color: byId.get(c[c.length - 1].id)!.color, width: 3.5 });
    }
  };

  // ---- fishbone ---------------------------------------------------------------
  const layoutFishbone = () => {
    const rp = place(root, 0, -rootSize.h / 2, "right"); // the head, on the right
    const c = kids(root);
    const spineGap = 28 * s;
    let rightLimit = rp.x - 48 * s;
    let leftmost = rightLimit;
    for (let slot = 0; slot * 2 < c.length; slot++) {
      const pair = c.slice(slot * 2, slot * 2 + 2);
      // Lay out each bone's children as an indented list in local coordinates first.
      const blocks = pair.map((m, j) => {
        const dir: 1 | -1 = j === 0 ? -1 : 1; // top bone first, then bottom
        const items: { n: MindNode; dx: number; h: number; w: number; parent?: string }[] = [];
        let hTotal = 0;
        let wMax = 0;
        const visit = (n: MindNode, dx: number, parent?: string) => {
          const size = sizeOf(n);
          items.push({ n, dx, h: size.h, w: size.w, parent });
          hTotal += size.h + 8 * s;
          wMax = Math.max(wMax, dx + size.w);
          for (const k of kids(n)) visit(k, dx + 28 * s, n.id);
        };
        for (const k of kids(m)) visit(k, 0);
        return { m, dir, items, hTotal: Math.max(hTotal, 20), wMax, mSize: sizeOf(m) };
      });
      const extentRight = 18 + Math.max(0, ...blocks.map((b) => b.wMax));
      const bx1 = rightLimit - extentRight; // where this slot's bones meet the spine
      let slotLeft = bx1;
      for (const b of blocks) {
        const height = spineGap + b.hTotal + 12;
        const slant = height * 0.5;
        const bx0 = bx1 - slant; // bone end at the main topic
        const mainY = b.dir === -1 ? -(height + b.mSize.h) : height;
        const mp = place(b.m, bx0 - b.mSize.w / 2, mainY, b.dir === -1 ? "up" : "down");
        const by0 = b.dir === -1 ? mainY + b.mSize.h : mainY;
        edges.push({ key: `bone:${b.m.id}`, path: `M ${bx0} ${by0} L ${bx1} 0`, color: mp.color, width: 3, toId: b.m.id });
        const boneX = (y: number) => bx0 + ((y - by0) / (0 - by0)) * slant;
        // Children stacked along the bone, between the main topic and the spine.
        let cursor = b.dir === -1 ? by0 + 10 : by0 - 10;
        const order = b.dir === -1 ? b.items : b.items; // same reading order top-down for top bones
        for (const it of order) {
          const y = b.dir === -1 ? cursor : cursor - it.h;
          const cy = y + it.h / 2;
          const x = boneX(cy) + 16 + it.dx;
          const cp = place(it.n, x, y, "right");
          if (it.parent === undefined) {
            addEdge(mp, cp, `M ${boneX(cy)} ${cy} L ${x} ${cy}`);
          } else {
            const parent = byId.get(it.parent)!;
            const px = parent.x + 12;
            addEdge(parent, cp, `M ${px} ${b.dir === -1 ? parent.y + parent.h : parent.y} L ${px} ${cy} L ${x} ${cy}`);
          }
          cursor = b.dir === -1 ? y + it.h + 8 * s : y - 8 * s;
        }
        slotLeft = Math.min(slotLeft, mp.x, bx0 - 10);
      }
      leftmost = Math.min(leftmost, slotLeft);
      rightLimit = slotLeft - 40 * s;
    }
    const tail = leftmost - 30;
    const spineColor = theme.dark ? "#cbd5e1" : "#334155";
    edges.push({
      key: "spine",
      path: `M ${tail} 0 L ${rp.x} 0 M ${tail} 0 L ${tail - 26} -22 M ${tail} 0 L ${tail - 26} 22`,
      color: spineColor,
      width: 4,
    });
  };

  // ---- radial (center divergence) -------------------------------------------
  const layoutRadial = () => {
    const leafWeight = new Map<string, number>();
    const weigh = (n: MindNode): number => {
      const c = kids(n);
      const w = c.length ? c.reduce((sum, k) => sum + weigh(k), 0) : 1;
      leafWeight.set(n.id, w);
      return w;
    };
    weigh(root);
    // Ring radius per depth, large enough for the topics on that ring.
    const widthAtDepth: number[] = [];
    const maxAtDepth: number[] = [];
    for (const [id, d] of depthOf) {
      const n = nodeById.get(id);
      if (!n) continue;
      const size = sizeOf(n);
      widthAtDepth[d] = (widthAtDepth[d] ?? 0) + Math.max(size.w, size.h) + 18;
      maxAtDepth[d] = Math.max(maxAtDepth[d] ?? 0, Math.max(size.w, size.h));
    }
    const radius: number[] = [0];
    for (let d = 1; d < widthAtDepth.length; d++) {
      const fromPrev = radius[d - 1] + ((maxAtDepth[d - 1] ?? 0) + (maxAtDepth[d] ?? 0)) / 2 + 60 * s;
      radius[d] = Math.max(fromPrev, ((widthAtDepth[d] ?? 0) / (2 * Math.PI)) * 1.08);
    }
    const placeR = (n: MindNode, depth: number, a0: number, a1: number): Placed => {
      const size = sizeOf(n);
      const mid = (a0 + a1) / 2;
      const r = radius[depth] ?? 0;
      const cx = depth === 0 ? 0 : Math.cos(mid) * r;
      const cy = depth === 0 ? 0 : Math.sin(mid) * r;
      const p = place(n, cx - size.w / 2, cy - size.h / 2, "radial");
      const c = kids(n);
      const total = c.reduce((sum, k) => sum + (leafWeight.get(k.id) ?? 1), 0) || 1;
      let a = a0;
      for (const k of c) {
        const span = ((a1 - a0) * (leafWeight.get(k.id) ?? 1)) / total;
        const child = placeR(k, depth + 1, a, a + span);
        const x1 = p.x + p.w / 2;
        const y1 = p.y + p.h / 2;
        const x2 = child.x + child.w / 2;
        const y2 = child.y + child.h / 2;
        const path =
          line === "curve" && depth > 0
            ? `M ${x1} ${y1} Q ${(x1 + x2) / 2 + (y2 - y1) * 0.12} ${(y1 + y2) / 2 - (x2 - x1) * 0.12} ${x2} ${y2}`
            : `M ${x1} ${y1} L ${x2} ${y2}`;
        addEdge(p, child, path);
        a += span;
      }
      return p;
    };
    placeR(root, 0, -Math.PI / 2, (Math.PI * 3) / 2);
  };

  switch (map.layout) {
    case "down":
      layoutDown();
      break;
    case "tree":
      layoutTree();
      break;
    case "timeline":
      layoutTimeline();
      break;
    case "fishbone":
      layoutFishbone();
      break;
    case "radial":
      layoutRadial();
      break;
    case "right":
    case "left":
    case "brace":
    case "mindmap":
    default:
      layoutHorizontal(map.layout === "right" || map.layout === "left" || map.layout === "brace" ? map.layout : "mindmap");
  }

  const bounds = placed.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x + p.w),
      maxY: Math.max(b.maxY, p.y + p.h),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  if (map.layout === "fishbone" || map.layout === "timeline") {
    // include spine / axis decorations
    bounds.minX -= 70;
    bounds.maxX += 40;
  }
  return { nodes: placed, byId, edges, bounds };
}
