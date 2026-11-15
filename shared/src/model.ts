/**
 * MindFlow shared mind-map model.
 *
 * Dependency-free and imported by the server (REST + MCP + Claude tools), the
 * browser client and the standalone mobile app, so every structural edit goes
 * through the same code whoever makes it.
 */

/** Map structures, as offered on the "Create from type" screen. */
export type LayoutMode =
  | "mindmap" // two-way: branches on both sides
  | "right" // one-way to the right (logic chart)
  | "left" // one-way to the left
  | "down" // organization chart
  | "tree" // indented tree chart
  | "timeline"
  | "fishbone"
  | "radial" // center divergence
  | "brace"; // brace map

export const LAYOUTS: LayoutMode[] = ["mindmap", "right", "left", "down", "tree", "timeline", "fishbone", "radial", "brace"];

export type LineStyle = "curve" | "elbow" | "straight";
export type NodeShape = "theme" | "rounded" | "pill" | "rect" | "underline";
export type Spacing = "compact" | "normal" | "loose";
export type TextSize = "s" | "m" | "l" | "xl";

/** Map-wide look, edited in the "Map style" panel. */
export interface MapStyle {
  line?: LineStyle;
  shape?: NodeShape;
  /** Give every main branch its own colour (default true). */
  rainbow?: boolean;
  spacing?: Spacing;
}

export interface NodeImage {
  /** data: URL (resized on the device) or https URL */
  src: string;
  w: number;
  h: number;
}

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  size?: TextSize;
  /** Text colour override */
  color?: string;
  /** Fill colour override */
  fill?: string;
}

export interface MindNode {
  id: string;
  text: string;
  /** Longer note (markdown) */
  note?: string;
  /** Branch colour override, inherited by descendants */
  color?: string;
  /** Emoji sticker shown before the text */
  marker?: string;
  /** Priority 1-9, shown as a numbered badge */
  priority?: number;
  /** Checkbox: undefined = no checkbox */
  task?: "todo" | "done";
  link?: string;
  image?: NodeImage;
  textStyle?: TextStyle;
  collapsed?: boolean;
  children: MindNode[];
}

export interface MindMap {
  id: string;
  title: string;
  root: MindNode;
  layout: LayoutMode;
  theme: string;
  style?: MapStyle;
  /** Subject folder shown in the library */
  folder?: string;
  favorite?: boolean;
  /** Monotonic version, bumped by the store on every write. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapPreview {
  root: string;
  branches: { text: string; color?: string; children: number }[];
}

export interface MapSummary {
  id: string;
  title: string;
  nodeCount: number;
  version: number;
  updatedAt: string;
  createdAt: string;
  layout: LayoutMode;
  theme: string;
  folder?: string;
  favorite?: boolean;
  preview: MapPreview;
  /** Lower-cased node text, for library search */
  searchText: string;
  progress?: { done: number; total: number };
}

/** Input shape for creating nodes in bulk (ids are assigned by the model). */
export interface NodeInput {
  text: string;
  note?: string;
  color?: string;
  marker?: string;
  priority?: number;
  task?: "todo" | "done";
  link?: string;
  bold?: boolean;
  children?: NodeInput[];
}

// ---------------------------------------------------------------------------
// ids

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function newId(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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

/** Checkbox progress of a subtree (the node itself included). */
export function taskProgress(node: MindNode): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const { node: n } of walk(node)) {
    if (n.task) {
      total++;
      if (n.task === "done") done++;
    }
  }
  return { done, total };
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
  if (input.priority && input.priority >= 1 && input.priority <= 9) node.priority = Math.round(input.priority);
  if (input.task === "todo" || input.task === "done") node.task = input.task;
  if (input.link) node.link = input.link;
  if (input.bold) node.textStyle = { bold: true };
  return node;
}

export function createMap(
  title: string,
  options: Partial<Pick<MindMap, "layout" | "theme" | "style" | "folder">> = {},
  rootChildren: NodeInput[] = [],
): MindMap {
  const now = new Date().toISOString();
  const map: MindMap = {
    id: newId(10),
    title: title.trim() || "Untitled map",
    root: { id: newId(), text: title.trim() || "Central topic", children: rootChildren.map(nodeFromInput) },
    layout: options.layout ?? "mindmap",
    theme: options.theme ?? "lavender",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (options.style) map.style = options.style;
  if (options.folder) map.folder = options.folder;
  return map;
}

// ---------------------------------------------------------------------------
// mutations (all return a *new* map, never mutating the input)

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MapError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "INVALID" = "INVALID",
  ) {
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
  delete parent.collapsed;
  return { map: next, created };
}

export function addSibling(map: MindMap, siblingId: string, input: NodeInput, after = true): { map: MindMap; created: MindNode } {
  const parent = findParent(map.root, siblingId);
  if (!parent) throw new MapError("The central topic cannot have siblings");
  const index = parent.children.findIndex((c) => c.id === siblingId) + (after ? 1 : 0);
  const result = addChildren(map, parent.id, [input], index);
  return { map: result.map, created: result.created[0] };
}

/** Add a new parent between a node and its current parent. */
export function addParent(map: MindMap, nodeId: string, input: NodeInput): { map: MindMap; created: MindNode } {
  if (nodeId === map.root.id) throw new MapError("The central topic cannot get a parent");
  const next = clone(map);
  const parent = findParent(next.root, nodeId)!;
  const index = parent.children.findIndex((c) => c.id === nodeId);
  const created = nodeFromInput(input);
  created.children = [parent.children[index]];
  parent.children[index] = created;
  return { map: next, created };
}

export interface NodePatch {
  text?: string;
  note?: string | null;
  color?: string | null;
  marker?: string | null;
  link?: string | null;
  priority?: number | null;
  task?: "todo" | "done" | null;
  image?: NodeImage | null;
  /** Fields set to null, "" or false are removed. */
  textStyle?: { [K in keyof TextStyle]?: TextStyle[K] | null | "" } | null;
  collapsed?: boolean;
}

export function applyPatch(node: MindNode, patch: NodePatch): void {
  if (patch.text !== undefined) node.text = patch.text.trim() || node.text;
  for (const key of ["note", "color", "marker", "link"] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null || value === "") delete node[key];
    else node[key] = value;
  }
  if (patch.priority !== undefined) {
    if (!patch.priority) delete node.priority;
    else node.priority = Math.max(1, Math.min(9, Math.round(patch.priority)));
  }
  if (patch.task !== undefined) {
    if (patch.task === null) delete node.task;
    else node.task = patch.task;
  }
  if (patch.image !== undefined) {
    if (patch.image === null) delete node.image;
    else node.image = patch.image;
  }
  if (patch.textStyle !== undefined) {
    if (patch.textStyle === null) delete node.textStyle;
    else {
      const merged: TextStyle = { ...(node.textStyle ?? {}) };
      for (const [k, v] of Object.entries(patch.textStyle) as [keyof TextStyle, unknown][]) {
        if (v === undefined) continue;
        if (v === null || v === "" || v === false) delete merged[k];
        else (merged as Record<string, unknown>)[k] = v;
      }
      if (Object.keys(merged).length) node.textStyle = merged;
      else delete node.textStyle;
    }
  }
  if (patch.collapsed !== undefined) {
    if (patch.collapsed) node.collapsed = true;
    else delete node.collapsed;
  }
}

export function updateNode(map: MindMap, nodeId: string, patch: NodePatch): MindMap {
  const next = clone(map);
  const node = requireNode(next.root, nodeId);
  applyPatch(node, patch);
  if (nodeId === next.root.id && patch.text !== undefined) next.title = node.text;
  return next;
}

export function deleteNode(map: MindMap, nodeId: string): MindMap {
  if (nodeId === map.root.id) throw new MapError("The central topic cannot be deleted");
  const next = clone(map);
  const parent = findParent(next.root, nodeId);
  if (!parent) throw new MapError(`Node "${nodeId}" was not found`, "NOT_FOUND");
  parent.children = parent.children.filter((c) => c.id !== nodeId);
  return next;
}

export function moveNode(map: MindMap, nodeId: string, newParentId: string, index?: number): MindMap {
  if (nodeId === map.root.id) throw new MapError("The central topic cannot be moved");
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
  delete newParent.collapsed;
  return next;
}

/** Replace a node's children wholesale (used by "rewrite branch"). */
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

/** Outline editing: make a node the last child of its previous sibling. */
export function indentNode(map: MindMap, nodeId: string): MindMap {
  const parent = findParent(map.root, nodeId);
  if (!parent) return map;
  const index = parent.children.findIndex((c) => c.id === nodeId);
  if (index <= 0) return map;
  return moveNode(map, nodeId, parent.children[index - 1].id);
}

/** Outline editing: move a node out to follow its parent. */
export function outdentNode(map: MindMap, nodeId: string): MindMap {
  const parent = findParent(map.root, nodeId);
  if (!parent || parent.id === map.root.id) return map;
  const grand = findParent(map.root, parent.id)!;
  const index = grand.children.findIndex((c) => c.id === parent.id);
  return moveNode(map, nodeId, grand.id, index + 1);
}

/** Deep copy of a subtree with fresh ids (copy / paste / duplicate). */
export function cloneSubtree(node: MindNode): MindNode {
  const copy = clone(node);
  for (const { node: n } of walk(copy)) n.id = newId();
  return copy;
}

export function pasteSubtree(map: MindMap, parentId: string, subtree: MindNode): { map: MindMap; created: MindNode } {
  const next = clone(map);
  const parent = requireNode(next.root, parentId);
  const created = cloneSubtree(subtree);
  parent.children.push(created);
  delete parent.collapsed;
  return { map: next, created };
}

// ---------------------------------------------------------------------------
// markdown / outline import and export

export interface OutlineOptions {
  /** Include node ids as trailing `{#id}` tags so a model can reference them. */
  withIds?: boolean;
  /** Include notes as quoted lines. */
  withNotes?: boolean;
}

export function toOutline(root: MindNode, options: OutlineOptions = {}): string {
  const lines: string[] = [];
  const visit = (node: MindNode, depth: number) => {
    const indent = "  ".repeat(Math.max(0, depth - 1));
    const box = node.task ? (node.task === "done" ? "[x] " : "[ ] ") : "";
    const marker = node.marker ? `${node.marker} ` : "";
    const prio = node.priority ? `(P${node.priority}) ` : "";
    const text = node.textStyle?.bold ? `**${node.text}**` : node.text;
    const linked = node.link ? `[${text}](${node.link})` : text;
    const id = options.withIds ? ` {#${node.id}}` : "";
    const collapsed = options.withIds && node.collapsed && node.children.length ? " (collapsed)" : "";
    if (depth === 0) lines.push(`# ${marker}${linked}${id}`);
    else lines.push(`${indent}- ${box}${prio}${marker}${linked}${id}${collapsed}`);
    if (options.withNotes && node.note) {
      const noteIndent = depth === 0 ? "" : `${indent}  `;
      for (const noteLine of node.note.split("\n")) lines.push(`${noteIndent}> ${noteLine}`);
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return lines.join("\n");
}

const EMOJI_START = /^(\p{Extended_Pictographic}(?:️|⃣)?(?:‍\p{Extended_Pictographic}️?)*)\s+/u;

/** Turn one line of markdown into node fields (checkbox, bold, link, emoji, priority). */
function parseItemText(raw: string): NodeInput {
  let text = raw.trim();
  const node: NodeInput = { text: "" };
  const box = /^\[( |x|X)\]\s+/.exec(text);
  if (box) {
    node.task = box[1] === " " ? "todo" : "done";
    text = text.slice(box[0].length);
  }
  const prio = /^\(P([1-9])\)\s+/.exec(text);
  if (prio) {
    node.priority = Number(prio[1]);
    text = text.slice(prio[0].length);
  }
  const emoji = EMOJI_START.exec(text);
  if (emoji) {
    node.marker = emoji[1];
    text = text.slice(emoji[0].length);
  }
  const whole = /^\[([^\]]+)\]\((\S+?)\)$/.exec(text);
  if (whole) {
    text = whole[1];
    node.link = whole[2];
  } else {
    text = text.replace(/\[([^\]]+)\]\((\S+?)\)/g, (_m, label: string, url: string) => {
      node.link ??= url;
      return label;
    });
  }
  const bold = /^(\*\*|__)(.+)\1$/.exec(text);
  if (bold) {
    node.bold = true;
    text = bold[2];
  }
  text = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*\{#[^}]+\}\s*$/, "")
    .replace(/\s*\(collapsed\)\s*$/, "")
    .trim();
  node.text = text;
  return node;
}

/**
 * Parse Markdown (or plain indented text) into a tree. Understands:
 *   # Title                         -> central topic
 *   ## Heading / ### Sub-heading    -> branches by heading level
 *   - item, * item, + item, 1. item -> nested by indentation (2 or 4 spaces, tabs)
 *   - [ ] task / - [x] done         -> checkboxes
 *   **bold**, [text](url), leading emoji, (P1) priority
 *   > quote, or a paragraph          -> note on the item above
 * Plain text with no bullets or headings becomes one node per line, nested by indentation.
 */
export function parseOutline(text: string): { title?: string; note?: string; nodes: NodeInput[] } {
  const rawLines = text.replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
  // Drop fenced code blocks and front matter.
  const lines: string[] = [];
  let inFence = false;
  for (const line of rawLines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) lines.push(line);
  }
  const structured = lines.some((l) => /^\s*(#{1,6}\s|[-*+•]\s|\d+[.)]\s)/.test(l));

  // Indentation unit: the smallest non-zero indent used by list items.
  let unit = 2;
  const indents = lines
    .map((l) => /^(\s*)(?:[-*+•]|\d+[.)])\s/.exec(l)?.[1].length ?? (structured ? 0 : /^(\s*)\S/.exec(l)?.[1].length ?? 0))
    .filter((n) => n > 0);
  if (indents.length) unit = Math.max(1, Math.min(...indents));

  let title: string | undefined;
  let rootNote: string | undefined;
  const roots: NodeInput[] = [];
  /** Stack of open containers: level is a comparable depth key. */
  const stack: { level: number; node: NodeInput }[] = [];
  let last: NodeInput | undefined;
  let headingLevel = 0; // depth contributed by the current heading

  const attach = (node: NodeInput, level: number) => {
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else (stack[stack.length - 1].node.children ??= []).push(node);
    stack.push({ level, node });
    last = node;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) continue; // horizontal rule
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = parseItemText(heading[2]);
      if (!content.text) continue;
      if (title === undefined && level === 1 && roots.length === 0 && stack.length === 0) {
        title = content.text;
        last = undefined;
        continue;
      }
      // "#" headings after the title behave like "##".
      const depth = Math.max(1, level - 1) * 100;
      attach(content, depth);
      headingLevel = depth;
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      if (last) last.note = last.note ? `${last.note}\n${quote[1]}` : quote[1];
      else if (title !== undefined) rootNote = rootNote ? `${rootNote}\n${quote[1]}` : quote[1];
      continue;
    }
    const item = /^(\s*)(?:[-*+•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item || !structured) {
      const indent = item ? item[1].length : (/^(\s*)/.exec(line)?.[1].length ?? 0);
      const content = parseItemText(item ? item[2] : line);
      if (!content.text) continue;
      attach(content, headingLevel + 1 + Math.round(indent / unit));
      continue;
    }
    // A paragraph inside structured markdown: note for the item above.
    const para = line.trim();
    if (last) last.note = last.note ? `${last.note}\n${para}` : para;
    else if (title === undefined) title = parseItemText(para).text;
    else rootNote = rootNote ? `${rootNote}\n${para}` : para;
  }
  // A single top-level item with children is the central topic.
  if (title === undefined && roots.length === 1 && roots[0].children?.length) {
    title = roots[0].text;
    rootNote = roots[0].note;
    return { title, note: rootNote, nodes: roots[0].children };
  }
  return { title, note: rootNote, nodes: roots };
}

/** Build a complete map from Markdown / indented text. */
export function mapFromOutline(
  text: string,
  fallbackTitle = "Untitled map",
  options: Partial<Pick<MindMap, "layout" | "theme" | "style" | "folder">> = {},
): MindMap {
  const parsed = parseOutline(text);
  const map = createMap(parsed.title || fallbackTitle, options, parsed.nodes);
  if (parsed.note) map.root.note = parsed.note;
  return map;
}

// ---------------------------------------------------------------------------
// summaries for the library

export function summarize(map: MindMap): MapSummary {
  const words: string[] = [];
  let size = 0;
  for (const { node } of walk(map.root)) {
    if (size > 4000) break;
    words.push(node.text);
    size += node.text.length + 1;
  }
  const progress = taskProgress(map.root);
  const summary: MapSummary = {
    id: map.id,
    title: map.title,
    nodeCount: countNodes(map.root),
    version: map.version,
    updatedAt: map.updatedAt,
    createdAt: map.createdAt,
    layout: map.layout,
    theme: map.theme,
    preview: {
      root: map.root.text.slice(0, 60),
      branches: map.root.children.slice(0, 8).map((c) => ({ text: c.text.slice(0, 40), color: c.color, children: c.children.length })),
    },
    searchText: words.join(" ").toLowerCase(),
  };
  if (map.folder) summary.folder = map.folder;
  if (map.favorite) summary.favorite = true;
  if (progress.total) summary.progress = progress;
  return summary;
}

// ---------------------------------------------------------------------------
// validation for data coming over the wire or from disk

const LINE_STYLES: LineStyle[] = ["curve", "elbow", "straight"];
const SHAPES: NodeShape[] = ["theme", "rounded", "pill", "rect", "underline"];
const SPACINGS: Spacing[] = ["compact", "normal", "loose"];
const SIZES: TextSize[] = ["s", "m", "l", "xl"];
const COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$/;

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value ? value.slice(0, max) : undefined;
}

export function normalizeMap(input: unknown): MindMap {
  if (!input || typeof input !== "object") throw new MapError("Map must be an object");
  const raw = input as Partial<MindMap>;
  if (!raw.root || typeof raw.root !== "object") throw new MapError("Map is missing a central topic");
  const seen = new Set<string>();
  let count = 0;
  const normalizeNode = (node: Partial<MindNode>, depth: number): MindNode => {
    if (depth > 200) throw new MapError("Map nesting is too deep");
    if (++count > 20000) throw new MapError("Map has too many nodes");
    let id = typeof node.id === "string" && node.id ? node.id.slice(0, 40) : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    const out: MindNode = {
      id,
      text: typeof node.text === "string" && node.text.trim() ? node.text.slice(0, 2000) : "Untitled",
      children: Array.isArray(node.children) ? node.children.map((c) => normalizeNode(c ?? {}, depth + 1)) : [],
    };
    const note = str(node.note, 50000);
    if (note) out.note = note;
    const color = str(node.color, 40);
    if (color && COLOR.test(color)) out.color = color;
    const marker = str(node.marker, 16);
    if (marker) out.marker = marker;
    const link = str(node.link, 2000);
    if (link) out.link = link;
    if (typeof node.priority === "number" && node.priority >= 1 && node.priority <= 9) out.priority = Math.round(node.priority);
    if (node.task === "todo" || node.task === "done") out.task = node.task;
    const img = node.image;
    if (img && typeof img === "object" && typeof img.src === "string" && /^(data:image\/|https:\/\/)/.test(img.src) && img.src.length < 4_000_000) {
      out.image = { src: img.src, w: Math.max(16, Math.min(600, Number(img.w) || 160)), h: Math.max(16, Math.min(600, Number(img.h) || 120)) };
    }
    const ts = node.textStyle;
    if (ts && typeof ts === "object") {
      const t: TextStyle = {};
      if (ts.bold) t.bold = true;
      if (ts.italic) t.italic = true;
      if (ts.size && SIZES.includes(ts.size)) t.size = ts.size;
      const tc = str(ts.color, 40);
      if (tc && COLOR.test(tc)) t.color = tc;
      const tf = str(ts.fill, 40);
      if (tf && COLOR.test(tf)) t.fill = tf;
      if (Object.keys(t).length) out.textStyle = t;
    }
    if (node.collapsed && out.children.length) out.collapsed = true;
    return out;
  };
  const now = new Date().toISOString();
  const layout: LayoutMode = LAYOUTS.includes(raw.layout as LayoutMode) ? (raw.layout as LayoutMode) : "mindmap";
  const map: MindMap = {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : newId(10),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.slice(0, 200) : "Untitled map",
    root: normalizeNode(raw.root, 0),
    layout,
    theme: typeof raw.theme === "string" && raw.theme ? raw.theme.slice(0, 40) : "lavender",
    version: typeof raw.version === "number" ? raw.version : 1,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
  const st = raw.style;
  if (st && typeof st === "object") {
    const s: MapStyle = {};
    if (LINE_STYLES.includes(st.line as LineStyle)) s.line = st.line;
    if (SHAPES.includes(st.shape as NodeShape)) s.shape = st.shape;
    if (typeof st.rainbow === "boolean") s.rainbow = st.rainbow;
    if (SPACINGS.includes(st.spacing as Spacing)) s.spacing = st.spacing;
    if (Object.keys(s).length) map.style = s;
  }
  const folder = str(raw.folder, 80);
  if (folder?.trim()) map.folder = folder.trim();
  if (raw.favorite) map.favorite = true;
  return map;
}
