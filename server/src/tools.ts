/**
 * The single tool registry shared by:
 *   - the MCP server (so Claude Desktop / Claude Code / any MCP client can edit maps)
 *   - the in-app Claude assistant (Claude API tool use, same handlers)
 *
 * Every tool takes validated input (zod), mutates through the shared model and
 * returns a short, model-friendly text result plus the affected map.
 */
import { z } from "zod";
import {
  type MindMap,
  type LayoutMode,
  MapError,
  addChildren,
  createMap,
  deleteNode,
  findNode,
  moveNode,
  parseOutline,
  replaceChildren,
  toOutline,
  updateNode,
  walk,
  countNodes,
  pathTo,
} from "../../shared/src/model.ts";
import type { MapStore } from "./store.ts";

export interface ToolResult {
  text: string;
  map?: MindMap;
  isError?: boolean;
}

export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  schema: S;
  /** Tool changes data (used for MCP annotations + UI labelling). */
  mutating: boolean;
  /** Only exposed over MCP, not to the in-app assistant (which is scoped to one map). */
  mcpOnly?: boolean;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  store: MapStore;
}

const mapId = z.string().describe("The mind map id (from list_mindmaps or the UI).");
const nodeId = z.string().describe("A node id. Ids appear in get_mindmap output as {#id} tags.");
const outlineDoc =
  "A markdown bullet outline. Use `- ` bullets and indent children by two spaces. " +
  "An optional `> note` line directly under a bullet becomes that node's note. Example:\n" +
  "- Marketing\n  - Social media\n    > Focus on short video\n  - Email\n- Sales";

const colorField = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$|^$/, "Use a #rrggbb hex colour or an empty string to clear")
  .optional()
  .describe("Branch colour as #rrggbb, or empty string to clear.");

function define<S extends z.ZodObject>(def: ToolDefinition<S>): ToolDefinition<z.ZodObject> {
  return def as unknown as ToolDefinition<z.ZodObject>;
}

function describeMap(map: MindMap, withNotes = false): string {
  const header = `Map "${map.title}" (id: ${map.id}, ${countNodes(map.root)} nodes, layout: ${map.layout}, version: ${map.version})`;
  return `${header}\n\n${toOutline(map.root, { withIds: true, withNotes })}`;
}

export const tools: ToolDefinition[] = [
  define({
    name: "list_mindmaps",
    title: "List mind maps",
    description: "List every mind map with its id, title, node count and last update time.",
    schema: z.object({}),
    mutating: false,
    async run(_input, { store }) {
      const maps = store.list();
      if (maps.length === 0) return { text: "There are no mind maps yet. Use create_mindmap to start one." };
      const lines = maps.map((m) => `- ${m.title} (id: ${m.id}, ${m.nodeCount} nodes, updated ${m.updatedAt})`);
      return { text: lines.join("\n") };
    },
  }),

  define({
    name: "get_mindmap",
    title: "Read a mind map",
    description:
      "Return a mind map as an indented markdown outline. Every node ends with a {#id} tag that other tools accept as nodeId/parentId. " +
      "Pass include_notes to also see node notes.",
    schema: z.object({
      mapId,
      include_notes: z.boolean().optional().describe("Include node notes as quoted lines (default false)."),
    }),
    mutating: false,
    async run(input, { store }) {
      const map = store.get(input.mapId);
      return { text: describeMap(map, input.include_notes ?? false), map };
    },
  }),

  define({
    name: "create_mindmap",
    title: "Create a mind map",
    description:
      "Create a new mind map. Optionally seed it from a markdown outline (the outline's top-level bullets become the main branches). " +
      "Returns the new map with node ids.",
    schema: z.object({
      title: z.string().min(1).max(200).describe("Central topic / map title."),
      outline: z.string().optional().describe(outlineDoc),
      layout: z.enum(["mindmap", "right", "down"]).optional().describe("mindmap = balanced both sides (default), right = logic chart, down = org chart."),
    }),
    mutating: true,
    async run(input, { store }) {
      const parsed = input.outline ? parseOutline(input.outline) : { nodes: [] };
      const map = await store.create(createMap(input.title, { layout: input.layout as LayoutMode | undefined }, parsed.nodes));
      return { text: `Created mind map.\n\n${describeMap(map)}`, map };
    },
  }),

  define({
    name: "add_nodes",
    title: "Add nodes",
    description:
      "Add one or more nodes (with nested children) under a parent node, from a markdown outline. " +
      "Use this to expand a topic, brainstorm sub-ideas, or build a whole branch at once. Returns the updated map with ids.",
    schema: z.object({
      mapId,
      parentId: nodeId.describe("Id of the node to add children to. Use the root id to add a main branch."),
      outline: z.string().min(1).describe(outlineDoc),
      index: z.number().int().min(0).optional().describe("Insert position among existing children (default: append)."),
    }),
    mutating: true,
    async run(input, { store }) {
      const { nodes } = parseOutline(input.outline);
      if (nodes.length === 0) return { text: "The outline contained no items.", isError: true };
      let createdCount = 0;
      const map = await store.update(input.mapId, (current) => {
        const result = addChildren(current, input.parentId, nodes, input.index);
        createdCount = result.created.reduce((n, c) => n + countNodes(c), 0);
        return result.map;
      });
      const parent = findNode(map.root, input.parentId)!;
      return {
        text: `Added ${createdCount} node(s) under "${parent.text}".\n\n${describeMap(map)}`,
        map,
      };
    },
  }),

  define({
    name: "update_node",
    title: "Update a node",
    description:
      "Change a node's text, note, marker (emoji), colour, link or collapsed state. Only the fields you pass are changed; pass an empty string to clear note/marker/link/colour.",
    schema: z.object({
      mapId,
      nodeId,
      text: z.string().min(1).max(2000).optional().describe("New label."),
      note: z.string().max(20000).optional().describe("Markdown note attached to the node."),
      marker: z.string().max(8).optional().describe("Emoji shown before the label, e.g. ⭐ ✅ ❗ 1️⃣."),
      color: colorField,
      link: z.string().max(2000).optional().describe("URL attached to the node."),
      collapsed: z.boolean().optional().describe("Collapse or expand the node's children."),
    }),
    mutating: true,
    async run(input, { store }) {
      const { mapId: id, nodeId: nid, ...patch } = input;
      const map = await store.update(id, (current) => updateNode(current, nid, patch));
      const node = findNode(map.root, nid)!;
      return { text: `Updated node "${node.text}" (#${node.id}).`, map };
    },
  }),

  define({
    name: "delete_nodes",
    title: "Delete nodes",
    description: "Delete one or more nodes and all of their descendants. The root node cannot be deleted.",
    schema: z.object({
      mapId,
      nodeIds: z.array(nodeId).min(1).max(200),
    }),
    mutating: true,
    async run(input, { store }) {
      let removed = 0;
      const map = await store.update(input.mapId, (current) => {
        let next = current;
        for (const id of input.nodeIds) {
          const node = findNode(next.root, id);
          if (!node) continue; // may already be gone as part of an ancestor
          removed += countNodes(node);
          next = deleteNode(next, id);
        }
        return next;
      });
      return { text: `Deleted ${removed} node(s).\n\n${describeMap(map)}`, map };
    },
  }),

  define({
    name: "move_node",
    title: "Move a node",
    description: "Re-parent a node (and its subtree) under another node, optionally at a specific position. Use it to reorganise or regroup ideas.",
    schema: z.object({
      mapId,
      nodeId,
      newParentId: nodeId.describe("The node that should become the parent."),
      index: z.number().int().min(0).optional().describe("Position among the new parent's children (default: last)."),
    }),
    mutating: true,
    async run(input, { store }) {
      const map = await store.update(input.mapId, (current) => moveNode(current, input.nodeId, input.newParentId, input.index));
      const node = findNode(map.root, input.nodeId)!;
      const parent = findNode(map.root, input.newParentId)!;
      return { text: `Moved "${node.text}" under "${parent.text}".\n\n${describeMap(map)}`, map };
    },
  }),

  define({
    name: "replace_branch",
    title: "Replace a branch",
    description:
      "Replace ALL children of a node with a new outline. Use it to rewrite or restructure a branch in one step. The node itself is kept.",
    schema: z.object({
      mapId,
      nodeId: nodeId.describe("The node whose children are replaced."),
      outline: z.string().describe(outlineDoc + "\n\nAn empty outline removes all children."),
    }),
    mutating: true,
    async run(input, { store }) {
      const { nodes } = parseOutline(input.outline);
      const map = await store.update(input.mapId, (current) => replaceChildren(current, input.nodeId, nodes));
      const node = findNode(map.root, input.nodeId)!;
      return { text: `Replaced the children of "${node.text}" with ${node.children.length} new branch(es).\n\n${describeMap(map)}`, map };
    },
  }),

  define({
    name: "search_nodes",
    title: "Search nodes",
    description: "Find nodes whose text or note contains a phrase (case-insensitive). Returns each match with its id and path from the root.",
    schema: z.object({
      mapId,
      query: z.string().min(1).max(200),
    }),
    mutating: false,
    async run(input, { store }) {
      const map = store.get(input.mapId);
      const q = input.query.toLowerCase();
      const hits: string[] = [];
      for (const { node } of walk(map.root)) {
        if (node.text.toLowerCase().includes(q) || node.note?.toLowerCase().includes(q)) {
          const crumbs = pathTo(map.root, node.id).map((n) => n.text).join(" > ");
          hits.push(`- ${crumbs} {#${node.id}}`);
        }
      }
      return { text: hits.length ? `${hits.length} match(es):\n${hits.join("\n")}` : "No nodes matched." };
    },
  }),

  define({
    name: "set_map_options",
    title: "Set map options",
    description: "Rename a map or change its layout (mindmap / right / down) or colour theme.",
    schema: z.object({
      mapId,
      title: z.string().min(1).max(200).optional(),
      layout: z.enum(["mindmap", "right", "down"]).optional(),
      theme: z.enum(["aurora", "sunset", "forest", "mono", "candy", "night"]).optional(),
    }),
    mutating: true,
    async run(input, { store }) {
      const map = await store.update(input.mapId, (current) => {
        const next = { ...current };
        if (input.title) {
          next.title = input.title;
          next.root = { ...next.root, text: input.title };
        }
        if (input.layout) next.layout = input.layout as LayoutMode;
        if (input.theme) next.theme = input.theme;
        return next;
      });
      return { text: `Map options updated: title="${map.title}", layout=${map.layout}, theme=${map.theme}.`, map };
    },
  }),

  define({
    name: "delete_mindmap",
    title: "Delete a mind map",
    description: "Permanently delete an entire mind map. Ask the user to confirm before calling this.",
    schema: z.object({ mapId }),
    mutating: true,
    mcpOnly: true,
    async run(input, { store }) {
      const map = store.get(input.mapId);
      await store.delete(input.mapId);
      return { text: `Deleted mind map "${map.title}" (${input.mapId}).` };
    },
  }),
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/** Convert a zod schema to the JSON Schema shape the Claude API expects. */
export function toInputSchema(schema: z.ZodObject): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  json.type = "object";
  if (!json.properties) json.properties = {};
  return json;
}

/** Run a tool with validation and friendly error reporting. */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) return { text: `Unknown tool "${name}".`, isError: true };
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; ");
    return { text: `Invalid input for ${name}: ${issues}`, isError: true };
  }
  try {
    return await tool.run(parsed.data, ctx);
  } catch (error) {
    if (error instanceof MapError) return { text: error.message, isError: true };
    console.error(`[tools] ${name} failed:`, error);
    return { text: `The tool failed unexpectedly: ${(error as Error).message}`, isError: true };
  }
}
