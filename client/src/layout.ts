import type { LayoutMode, MindMap, MindNode } from "@shared/model";
import type { Theme } from "./themes";

export interface Size {
  w: number;
  h: number;
}

export type Side = "left" | "right" | "down";

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
  /** Number of descendants hidden by a collapsed state. */
  hidden: number;
}

export interface Edge {
  from: Placed;
  to: Placed;
  path: string;
  color: string;
}

export interface LayoutResult {
  nodes: Placed[];
  byId: Map<string, Placed>;
  edges: Edge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const H_GAP = 64;
const H_GAP_ROOT = 84;
const V_GAP = 14;
const V_GAP_ROOT = 22;
const DOWN_GAP = 56;
const DOWN_SIBLING_GAP = 26;

export function estimateSize(node: MindNode, depth: number): Size {
  const chars = node.text.length + (node.marker ? 2 : 0);
  const font = depth === 0 ? 10.5 : depth === 1 ? 8.6 : 8;
  const pad = depth === 0 ? 48 : depth === 1 ? 32 : 26;
  const maxW = 260;
  const w = Math.min(maxW, Math.max(60, chars * font + pad));
  const lines = Math.max(1, Math.ceil((chars * font) / (maxW - pad)));
  const lineH = depth === 0 ? 26 : depth === 1 ? 22 : 20;
  const h = lines * lineH + (depth === 0 ? 22 : depth === 1 ? 16 : 12);
  return { w, h };
}

function countDescendants(node: MindNode): number {
  let n = 0;
  for (const c of node.children) n += 1 + countDescendants(c);
  return n;
}

export function layoutMap(map: MindMap, sizes: Map<string, Size>, theme: Theme): LayoutResult {
  const placed: Placed[] = [];
  const byId = new Map<string, Placed>();
  const edges: Edge[] = [];
  const sizeOf = (node: MindNode, depth: number) => sizes.get(node.id) ?? estimateSize(node, depth);

  const register = (p: Placed) => {
    placed.push(p);
    byId.set(p.id, p);
  };

  const visibleChildren = (node: MindNode) => (node.collapsed ? [] : node.children);

  // ---- horizontal (left/right) -----------------------------------------
  const hHeight = new Map<string, number>();
  const measureH = (node: MindNode, depth: number): number => {
    const own = sizeOf(node, depth).h;
    const kids = visibleChildren(node);
    let total = 0;
    for (const k of kids) total += measureH(k, depth + 1);
    total += Math.max(0, kids.length - 1) * (depth === 0 ? V_GAP_ROOT : V_GAP);
    const h = kids.length ? Math.max(own, total) : own;
    hHeight.set(node.id, h);
    return h;
  };

  const placeH = (node: MindNode, depth: number, side: Side, x: number, cy: number, color: string, parentId?: string) => {
    const size = sizeOf(node, depth);
    const p: Placed = {
      id: node.id,
      node,
      parentId,
      depth,
      side,
      x: side === "left" ? x - size.w : x,
      y: cy - size.h / 2,
      w: size.w,
      h: size.h,
      color,
      hidden: node.collapsed ? countDescendants(node) : 0,
    };
    register(p);
    const kids = visibleChildren(node);
    if (!kids.length) return;
    const gap = depth === 0 ? V_GAP_ROOT : V_GAP;
    const total = kids.reduce((s, k) => s + (hHeight.get(k.id) ?? 0), 0) + (kids.length - 1) * gap;
    let cursor = cy - total / 2;
    const childX = side === "left" ? p.x - (depth === 0 ? H_GAP_ROOT : H_GAP) : p.x + p.w + (depth === 0 ? H_GAP_ROOT : H_GAP);
    kids.forEach((k, i) => {
      const kh = hHeight.get(k.id) ?? 0;
      const kColor = depth === 0 ? k.color ?? theme.palette[i % theme.palette.length] : k.color ?? color;
      placeH(k, depth + 1, side, childX, cursor + kh / 2, kColor, node.id);
      cursor += kh + gap;
    });
  };

  // ---- vertical (down) ----------------------------------------------------
  const vWidth = new Map<string, number>();
  const measureV = (node: MindNode, depth: number): number => {
    const own = sizeOf(node, depth).w;
    const kids = visibleChildren(node);
    let total = 0;
    for (const k of kids) total += measureV(k, depth + 1);
    total += Math.max(0, kids.length - 1) * DOWN_SIBLING_GAP;
    const w = kids.length ? Math.max(own, total) : own;
    vWidth.set(node.id, w);
    return w;
  };
  const placeV = (node: MindNode, depth: number, cx: number, y: number, color: string, parentId?: string) => {
    const size = sizeOf(node, depth);
    const p: Placed = {
      id: node.id,
      node,
      parentId,
      depth,
      side: "down",
      x: cx - size.w / 2,
      y,
      w: size.w,
      h: size.h,
      color,
      hidden: node.collapsed ? countDescendants(node) : 0,
    };
    register(p);
    const kids = visibleChildren(node);
    if (!kids.length) return;
    const total = kids.reduce((s, k) => s + (vWidth.get(k.id) ?? 0), 0) + (kids.length - 1) * DOWN_SIBLING_GAP;
    let cursor = cx - total / 2;
    kids.forEach((k, i) => {
      const kw = vWidth.get(k.id) ?? 0;
      const kColor = depth === 0 ? k.color ?? theme.palette[i % theme.palette.length] : k.color ?? color;
      placeV(k, depth + 1, cursor + kw / 2, y + size.h + DOWN_GAP, kColor, node.id);
      cursor += kw + DOWN_SIBLING_GAP;
    });
  };

  const root = map.root;
  const rootSize = sizeOf(root, 0);
  const rootColor = root.color ?? theme.root;
  const mode: LayoutMode = map.layout;

  if (mode === "down") {
    measureV(root, 0);
    placeV(root, 0, 0, 0, rootColor);
  } else {
    const kids = visibleChildren(root);
    const rightKids = mode === "right" ? kids : kids.slice(0, Math.ceil(kids.length / 2));
    const leftKids = mode === "right" ? [] : kids.slice(Math.ceil(kids.length / 2));
    for (const k of kids) measureH(k, 1);

    const rootP: Placed = {
      id: root.id,
      node: root,
      depth: 0,
      side: "right",
      x: -rootSize.w / 2,
      y: -rootSize.h / 2,
      w: rootSize.w,
      h: rootSize.h,
      color: rootColor,
      hidden: root.collapsed ? countDescendants(root) : 0,
    };
    register(rootP);

    const placeSide = (list: MindNode[], side: Side, colorOffset: number) => {
      const total = list.reduce((s, k) => s + (hHeight.get(k.id) ?? 0), 0) + Math.max(0, list.length - 1) * V_GAP_ROOT;
      let cursor = -total / 2;
      const x = side === "left" ? rootP.x - H_GAP_ROOT : rootP.x + rootP.w + H_GAP_ROOT;
      list.forEach((k, i) => {
        const kh = hHeight.get(k.id) ?? 0;
        const color = k.color ?? theme.palette[(i + colorOffset) % theme.palette.length];
        placeH(k, 1, side, x, cursor + kh / 2, color, root.id);
        cursor += kh + V_GAP_ROOT;
      });
    };
    placeSide(rightKids, "right", 0);
    placeSide(leftKids, "left", rightKids.length);
  }

  // ---- edges ------------------------------------------------------------
  for (const p of placed) {
    if (!p.parentId) continue;
    const parent = byId.get(p.parentId);
    if (!parent) continue;
    edges.push({ from: parent, to: p, color: p.color, path: edgePath(parent, p) });
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

  return { nodes: placed, byId, edges, bounds };
}

function edgePath(parent: Placed, child: Placed): string {
  if (child.side === "down") {
    const x1 = parent.x + parent.w / 2;
    const y1 = parent.y + parent.h;
    const x2 = child.x + child.w / 2;
    const y2 = child.y;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  }
  const fromCenter = parent.depth === 0;
  const y1 = parent.y + parent.h / 2;
  const y2 = child.y + child.h / 2;
  if (child.side === "right") {
    const x1 = fromCenter ? parent.x + parent.w * 0.5 : parent.x + parent.w;
    const x2 = child.x;
    const dx = Math.max(24, (x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = fromCenter ? parent.x + parent.w * 0.5 : parent.x;
  const x2 = child.x + child.w;
  const dx = Math.max(24, (x1 - x2) * 0.5);
  return `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
}
