/**
 * MindFlow shared mind-map model.
 *
 * This module is dependency-free and is imported by both the server (REST + MCP
 * tools + Claude tools) and the browser client, so every structural edit goes
 * through the same code path regardless of who makes it: a person on the canvas,
 * Claude through the in-app assistant, or any MCP client (Claude Desktop, Claude
 * Code, ...).
 */

export type LayoutMode = "mindmap" | "right" | "down";

export interface MindNode {
  id: string;
  text: string;
  /** Optional longer note (markdown) shown in the inspector. */
  note?: string;
  /** Branch colour override as a CSS colour. Inherited by descendants if unset. */
  color?: string;
  /** Emoji / marker shown before the text (e.g. "⭐", "✅", "1️⃣"). */
  marker?: string;
  /** Optional hyperlink. */
  link?: string;
  collapsed?: boolean;
  children: MindNode[];
}

export interface MindMap {
  id: string;
  title: string;
  root: MindNode;
  layout: LayoutMode;
  theme: string;
  /** Monotonic version, bumped by the server on every write. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapSummary {
  id: string;
  title: string;
  nodeCount: number;
  version: number;
  updatedAt: string;
}

/** Input shape for creating nodes in bulk (ids are assigned by the model). */
export interface NodeInput {
  text: string;
  note?: string;
  color?: string;
  marker?: string;
  link?: string;
  children?: NodeInput[];
}

// ---------------------------------------------------------------------------
// ids

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function newId(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// traversal helpers

export function findNode(root: MindNode, id: string): MindNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return undefined;
}

export function findParent(root: MindNode, id: string): MindNode | undefined {
  for (const child of root.children) {
    if (child.id === id) return root;
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return undefined;
}

export function* walk(node: MindNode, depth = 0): Generator<{ node: MindNode; depth: number }> {
  yield { node, depth };
  for (const child of node.children) yield* walk(child, depth + 1);
}

export function countNodes(node: MindNode): number {
  let n = 1;
  for (const child of node.children) n += countNodes(child);
  return n;
}

export function isDescendant(root: MindNode, ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(root, ancestorId);
  if (!ancestor) return false;
  return findNode(ancestor, nodeId) !== undefined;
}

export function pathTo(root: MindNode, id: string): MindNode[] {
  const path: MindNode[] = [];
  const visit = (node: MindNode): boolean => {
    path.push(node);
    if (node.id === id) return true;
    for (const child of node.children) if (visit(child)) return true;
    path.pop();
    return false;
  };
  visit(root);
  return path;
}

// ---------------------------------------------------------------------------
// construction

export function nodeFromInput(input: NodeInput): MindNode {
  const node: MindNode = {
    id: newId(),
    text: (input.text ?? "").trim() || "Untitled",
    children: (input.children ?? []).map(nodeFromInput),
  };
  if (input.note) node.note = input.note;
  if (input.color) node.color = input.color;
  if (input.marker) node.marker = input.marker;
  if (input.link) node.link = input.link;
  return node;
}

export function createMap(title: string, options: Partial<Pick<MindMap, "layout" | "theme">> = {}, rootChildren: NodeInput[] = []): MindMap {
  const now = new Date().toISOString();
  return {
    id: newId(10),
    title: title.trim() || "Untitled map",
    root: {
      id: newId(),
      text: title.trim() || "Central topic",
      children: rootChildren.map(nodeFromInput),
    },
    layout: options.layout ?? "mindmap",
    theme: options.theme ?? "aurora",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// mutations (all return a *new* map, never mutating the input)

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MapError extends Error {
  constructor(message: string, public readonly code: "NOT_FOUND" | "INVALID" = "INVALID") {
    super(message);
  }
}

function requireNode(root: MindNode, id: string): MindNode {
  const node = findNode(root, id);
  if (!node) throw new MapError(`Node "${id}" was not found`, "NOT_FOUND");
  return node;
}

export function addChildren(map: MindMap, parentId: string, inputs: NodeInput[], index?: number): { map: MindMap; created: MindNode[] } {
  const next = clone(map);
  const parent = requireNode(next.root, parentId);
  const created = inputs.map(nodeFromInput);
  const at = index === undefined ? parent.children.length : Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(at, 0, ...created);
  parent.collapsed = false;
  return { map: next, created };
}

export function addSibling(map: MindMap, siblingId: string, input: NodeInput, after = true): { map: MindMap; created: MindNode } {
  const parent = findParent(map.root, siblingId);
  if (!parent) throw new MapError("The root node cannot have siblings");
  const index = parent.children.findIndex((c) => c.id === siblingId) + (after ? 1 : 0);
  const result = addChildren(map, parent.id, [input], index);
  return { map: result.map, created: result.created[0] };
}

export type NodePatch = Partial<Pick<MindNode, "text" | "note" | "color" | "marker" | "link" | "collapsed">>;

export function updateNode(map: MindMap, nodeId: string, patch: NodePatch): MindMap {
  const next = clone(map);
  const node = requireNode(next.root, nodeId);
  if (patch.text !== undefined) node.text = patch.text.trim() || node.text;
  for (const key of ["note", "color", "marker", "link"] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key];
    if (value === null || value === "") delete node[key];
    else node[key] = value;
  }
  if (patch.collapsed !== undefined) {
    if (patch.collapsed) node.collapsed = true;
    else delete node.collapsed;
  }
  if (nodeId === next.root.id && patch.text !== undefined) next.title = node.text;
  return next;
}

export function deleteNode(map: MindMap, nodeId: string): MindMap {
  if (nodeId === map.root.id) throw new MapError("The root node cannot be deleted");
  const next = clone(map);
  const parent = findParent(next.root, nodeId);
  if (!parent) throw new MapError(`Node "${nodeId}" was not found`, "NOT_FOUND");
  parent.children = parent.children.filter((c) => c.id !== nodeId);
  return next;
}

export function moveNode(map: MindMap, nodeId: string, newParentId: string, index?: number): MindMap {
  if (nodeId === map.root.id) throw new MapError("The root node cannot be moved");
  if (nodeId === newParentId) throw new MapError("A node cannot be its own parent");
  if (isDescendant(map.root, nodeId, newParentId)) throw new MapError("A node cannot be moved under its own descendant");
  const next = clone(map);
  const oldParent = findParent(next.root, nodeId);
  if (!oldParent) throw new MapError(`Node "${nodeId}" was not found`, "NOT_FOUND");
  const newParent = requireNode(next.root, newParentId);
  const oldIndex = oldParent.children.findIndex((c) => c.id === nodeId);
  const [node] = oldParent.children.splice(oldIndex, 1);
  let at = index === undefined ? newParent.children.length : index;
  if (oldParent.id === newParent.id && index !== undefined && index > oldIndex) at -= 1;
  at = Math.max(0, Math.min(at, newParent.children.length));
  newParent.children.splice(at, 0, node);
  newParent.collapsed = false;
  return next;
}

/** Replace a node's children wholesale (used by "regenerate branch"). */
export function replaceChildren(map: MindMap, nodeId: string, inputs: NodeInput[]): MindMap {
  const next = clone(map);
  const node = requireNode(next.root, nodeId);
  node.children = inputs.map(nodeFromInput);
  delete node.collapsed;
  return next;
}

export function reorderChild(map: MindMap, nodeId: string, delta: number): MindMap {
  const parent = findParent(map.root, nodeId);
  if (!parent) return map;
  const index = parent.children.findIndex((c) => c.id === nodeId);
  const target = index + delta;
  if (target < 0 || target >= parent.children.length) return map;
  return moveNode(map, nodeId, parent.id, target > index ? target + 1 : target);
}

// ---------------------------------------------------------------------------
// outline (markdown) import / export - the lingua franca for Claude and MCP

export interface OutlineOptions {
  /** Include node ids as trailing `{#id}` tags so a model can reference them. */
  withIds?: boolean;
  /** Include notes as indented quote blocks. */
  withNotes?: boolean;
}

export function toOutline(root: MindNode, options: OutlineOptions = {}): string {
  const lines: string[] = [];
  const visit = (node: MindNode, depth: number) => {
    const indent = "  ".repeat(Math.max(0, depth - 1));
    const marker = node.marker ? `${node.marker} ` : "";
    const id = options.withIds ? ` {#${node.id}}` : "";
    const collapsed = node.collapsed && node.children.length ? " (collapsed)" : "";
    if (depth === 0) lines.push(`# ${marker}${node.text}${id}`);
    else lines.push(`${indent}- ${marker}${node.text}${id}${collapsed}`);
    if (options.withNotes && node.note) {
      for (const noteLine of node.note.split("\n")) lines.push(`${indent}  > ${noteLine}`);
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return lines.join("\n");
}

/**
 * Parse a markdown-style outline into node inputs. Accepts:
 *   # Title            (optional, becomes the root text when `title` is returned)
 *   - item / * item / 1. item with 2-space or tab indentation
 *   > note lines attached to the previous item
 */
export function parseOutline(text: string): { title?: string; nodes: NodeInput[] } {
  const lines = text.replace(/\r/g, "").split("\n");
  let title: string | undefined;
  const stack: { depth: number; node: NodeInput }[] = [];
  const roots: NodeInput[] = [];
  let last: NodeInput | undefined;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    if (heading && title === undefined && stack.length === 0) {
      title = heading[1].replace(/\s*\{#[^}]+\}\s*$/, "").trim();
      continue;
    }
    const note = /^\s*>\s?(.*)$/.exec(raw);
    if (note && last) {
      last.note = last.note ? `${last.note}\n${note[1]}` : note[1];
      continue;
    }
    const item = /^(\s*)(?:[-*+•]|\d+[.)])\s+(.*)$/.exec(raw);
    let depth: number;
    let content: string;
    if (item) {
      const indent = item[1].replace(/\t/g, "  ").length;
      depth = Math.floor(indent / 2);
      content = item[2];
    } else {
      // Plain line: treat indentation as depth too.
      const indent = (/^(\s*)/.exec(raw)?.[1] ?? "").replace(/\t/g, "  ").length;
      depth = Math.floor(indent / 2);
      content = raw.trim();
    }
    content = content.replace(/\s*\{#[^}]+\}\s*$/, "").replace(/\s*\(collapsed\)\s*$/, "").trim();
    if (!content) continue;
    const node: NodeInput = { text: content };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length === 0) roots.push(node);
    else (stack[stack.length - 1].node.children ??= []).push(node);
    stack.push({ depth, node });
    last = node;
  }
  return { title, nodes: roots };
}

export function summarize(map: MindMap): MapSummary {
  return {
    id: map.id,
    title: map.title,
    nodeCount: countNodes(map.root),
    version: map.version,
    updatedAt: map.updatedAt,
  };
}

/** Defensive validation for data coming over the wire or from disk. */
export function normalizeMap(input: unknown): MindMap {
  if (!input || typeof input !== "object") throw new MapError("Map must be an object");
  const raw = input as Partial<MindMap>;
  if (!raw.root || typeof raw.root !== "object") throw new MapError("Map is missing a root node");
  const seen = new Set<string>();
  const normalizeNode = (node: Partial<MindNode>, depth: number): MindNode => {
    if (depth > 200) throw new MapError("Map nesting is too deep");
    let id = typeof node.id === "string" && node.id ? node.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    const out: MindNode = {
      id,
      text: typeof node.text === "string" && node.text.trim() ? node.text.slice(0, 2000) : "Untitled",
      children: Array.isArray(node.children) ? node.children.map((c) => normalizeNode(c ?? {}, depth + 1)) : [],
    };
    if (typeof node.note === "string" && node.note) out.note = node.note.slice(0, 20000);
    if (typeof node.color === "string" && node.color) out.color = node.color.slice(0, 40);
    if (typeof node.marker === "string" && node.marker) out.marker = node.marker.slice(0, 8);
    if (typeof node.link === "string" && node.link) out.link = node.link.slice(0, 2000);
    if (node.collapsed) out.collapsed = true;
    return out;
  };
  const now = new Date().toISOString();
  const layout: LayoutMode = raw.layout === "right" || raw.layout === "down" ? raw.layout : "mindmap";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(10),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.slice(0, 200) : "Untitled map",
    root: normalizeNode(raw.root, 0),
    layout,
    theme: typeof raw.theme === "string" ? raw.theme : "aurora",
    version: typeof raw.version === "number" ? raw.version : 1,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}
