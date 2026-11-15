import type { CreateMapRequest } from "@shared/create";
import { type LayoutMode, type MindMap, type MindNode, newId } from "@shared/model";
import { XMIND_TO_LAYOUT } from "./formats";
import { readZip } from "./zip";

/** File types the Import button accepts. */
export const IMPORT_ACCEPT = ".md,.markdown,.txt,.json,.opml,.xml,.xmind,.mm";

function baseName(name: string): string {
  return name.replace(/\.(mindflow\.json|[^.]+)$/i, "");
}

function makeMap(title: string, root: MindNode, layout: LayoutMode = "mindmap"): MindMap {
  const now = new Date().toISOString();
  return { id: newId(10), title, root, layout, theme: "classic", version: 1, createdAt: now, updatedAt: now };
}

// ---------------------------------------------------------------- XMind

interface XTopic {
  title?: string;
  children?: { attached?: XTopic[] };
  notes?: { plain?: { content?: string } };
  href?: string;
  markers?: { markerId?: string }[];
  structureClass?: string;
  branch?: string;
}

function fromXTopic(t: XTopic): MindNode {
  const n: MindNode = { id: newId(), text: (t.title ?? "").trim() || "Untitled", children: (t.children?.attached ?? []).map(fromXTopic) };
  const note = t.notes?.plain?.content;
  if (note) n.note = note;
  if (t.href && /^https?:/.test(t.href)) n.link = t.href;
  for (const m of t.markers ?? []) {
    const id = m.markerId ?? "";
    const prio = /^priority-(\d)/.exec(id);
    if (prio) n.priority = Number(prio[1]);
    if (id === "task-done") n.task = "done";
    else if (id.startsWith("task-")) n.task = "todo";
  }
  if (t.branch === "folded" && n.children.length) n.collapsed = true;
  return n;
}

function fromXmlTopic(el: Element): MindNode {
  const direct = (parent: Element, tag: string) => Array.from(parent.children).find((c) => c.localName === tag);
  const title = direct(el, "title")?.textContent ?? "";
  const n: MindNode = { id: newId(), text: title.trim() || "Untitled", children: [] };
  const childrenEl = direct(el, "children");
  if (childrenEl) {
    for (const topics of Array.from(childrenEl.children).filter((c) => c.localName === "topics")) {
      if (topics.getAttribute("type") && topics.getAttribute("type") !== "attached") continue;
      for (const t of Array.from(topics.children).filter((c) => c.localName === "topic")) n.children.push(fromXmlTopic(t));
    }
  }
  const plain = direct(el, "notes") && direct(direct(el, "notes")!, "plain");
  if (plain?.textContent) n.note = plain.textContent;
  const href = el.getAttribute("xlink:href");
  if (href && /^https?:/.test(href)) n.link = href;
  return n;
}

async function importXmind(file: File): Promise<CreateMapRequest[]> {
  const files = await readZip(await file.arrayBuffer());
  const json = files.get("content.json");
  if (json) {
    const sheets = JSON.parse(new TextDecoder().decode(json)) as { title?: string; rootTopic: XTopic }[];
    return sheets.map((sheet) => {
      const root = fromXTopic(sheet.rootTopic);
      const layout = XMIND_TO_LAYOUT[sheet.rootTopic.structureClass ?? ""] ?? "mindmap";
      return { map: makeMap(root.text || sheet.title || baseName(file.name), root, layout) };
    });
  }
  const xml = files.get("content.xml");
  if (!xml) throw new Error("This .xmind file has no content");
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  const sheets = Array.from(doc.getElementsByTagName("sheet"));
  return sheets.map((sheet) => {
    const topic = Array.from(sheet.children).find((c) => c.localName === "topic");
    const root = topic ? fromXmlTopic(topic) : { id: newId(), text: baseName(file.name), children: [] };
    return { map: makeMap(root.text, root) };
  });
}

// ---------------------------------------------------------------- OPML / FreeMind

function importOpml(text: string, name: string): CreateMapRequest[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const body = doc.getElementsByTagName("body")[0];
  if (!body) throw new Error("Not an OPML file");
  const conv = (el: Element): MindNode => {
    const n: MindNode = {
      id: newId(),
      text: (el.getAttribute("text") ?? el.getAttribute("title") ?? "").trim() || "Untitled",
      children: Array.from(el.children).filter((c) => c.localName === "outline").map(conv),
    };
    const note = el.getAttribute("_note");
    if (note) n.note = note;
    const complete = el.getAttribute("_complete");
    if (complete) n.task = complete === "true" ? "done" : "todo";
    const url = el.getAttribute("url") ?? el.getAttribute("htmlUrl");
    if (url && /^https?:/.test(url)) n.link = url;
    return n;
  };
  const tops = Array.from(body.children).filter((c) => c.localName === "outline").map(conv);
  const title = doc.getElementsByTagName("title")[0]?.textContent?.trim() || baseName(name);
  const root: MindNode = tops.length === 1 ? tops[0] : { id: newId(), text: title, children: tops };
  return [{ map: makeMap(root.text, root) }];
}

function importFreeMind(text: string, name: string): CreateMapRequest[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const top = Array.from(doc.documentElement.children).find((c) => c.localName === "node");
  if (!top) throw new Error("Not a FreeMind file");
  const conv = (el: Element): MindNode => ({
    id: newId(),
    text: (el.getAttribute("TEXT") ?? "").trim() || "Untitled",
    children: Array.from(el.children).filter((c) => c.localName === "node").map(conv),
  });
  const root = conv(top);
  return [{ map: makeMap(root.text || baseName(name), root) }];
}

// ---------------------------------------------------------------- entry point

/** Turn any supported file into one or more "create map" requests. */
export async function importFile(file: File, folder?: string): Promise<CreateMapRequest[]> {
  const lower = file.name.toLowerCase();
  let requests: CreateMapRequest[];
  if (lower.endsWith(".xmind")) requests = await importXmind(file);
  else {
    const text = await file.text();
    if (lower.endsWith(".json")) {
      const data = JSON.parse(text) as { maps?: unknown[] };
      requests = Array.isArray(data.maps) ? data.maps.map((m) => ({ map: m })) : [{ map: data }];
    } else if (lower.endsWith(".opml") || (lower.endsWith(".xml") && text.includes("<opml"))) requests = importOpml(text, file.name);
    else if (lower.endsWith(".mm")) requests = importFreeMind(text, file.name);
    else requests = [{ outline: text, title: undefined }];
    if (requests.length === 1 && requests[0].outline !== undefined && !/^\s*#\s/m.test(text)) {
      requests[0].title = baseName(file.name);
    }
  }
  if (folder) for (const r of requests) r.folder = folder;
  return requests;
}
