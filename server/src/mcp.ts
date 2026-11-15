/**
 * MCP (Model Context Protocol) server exposing MindFlow mind maps to any MCP
 * client - Claude Desktop, Claude Code, Cursor, the Claude API's MCP connector...
 *
 * Transports:
 *   - Streamable HTTP at POST /mcp (see index.ts) - stateless, one server per request
 *   - stdio via `npm run mcp` (see mcp-stdio.ts)
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toOutline } from "../../shared/src/model.ts";
import type { MapStore } from "./store.ts";
import { runTool, tools } from "../../shared/src/tools.ts";

export const MCP_SERVER_INFO = { name: "mindflow", version: "0.1.0" } as const;

export function createMcpServer(store: MapStore): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions:
      "MindFlow is a mind-mapping app. Maps are trees of nodes; get_mindmap returns an outline where every node " +
      "ends with a {#id} tag. Use those ids as nodeId / parentId. Prefer add_nodes with a nested markdown outline to " +
      "build whole branches in one call. Changes appear live in the user's browser.",
  });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema.shape,
        annotations: {
          readOnlyHint: !tool.mutating,
          destructiveHint: tool.name.startsWith("delete") || tool.name === "replace_branch",
          idempotentHint: !tool.mutating,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        const result = await runTool(tool.name, args, { store });
        return {
          content: [{ type: "text" as const, text: result.text }],
          isError: result.isError ?? false,
        };
      },
    );
  }

  server.registerResource(
    "mindmap",
    new ResourceTemplate("mindmap://{mapId}", {
      list: async () => ({
        resources: store.list().map((m) => ({
          uri: `mindmap://${m.id}`,
          name: m.title,
          description: `${m.nodeCount} nodes, updated ${m.updatedAt}`,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "Mind map outline", description: "A mind map rendered as a markdown outline with node ids.", mimeType: "text/markdown" },
    async (uri, variables) => {
      const id = String(variables.mapId);
      const map = store.get(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: toOutline(map.root, { withIds: true, withNotes: true }),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "brainstorm",
    {
      title: "Brainstorm a mind map",
      description: "Create a rich, well-structured mind map about a topic.",
      argsSchema: {
        topic: z.string().describe("What the map should be about"),
        depth: z.string().optional().describe("How deep to go: 'quick' (2 levels) or 'deep' (3-4 levels). Default deep."),
      },
    },
    ({ topic, depth }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Create a mind map about "${topic}" using the MindFlow tools. ` +
              `First call create_mindmap with a concise title and a ${depth === "quick" ? "two" : "three or four"}-level markdown outline ` +
              "of 5-8 main branches with specific, non-generic sub-points. Then review the result with get_mindmap and refine " +
              "weak branches with add_nodes or replace_branch. Finish by telling me the map id and a two-sentence summary.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "review-map",
    {
      title: "Review and improve a mind map",
      description: "Critique an existing mind map and fill in gaps.",
      argsSchema: { mapId: z.string().describe("The map id") },
    },
    ({ mapId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Read mind map ${mapId} with get_mindmap (include_notes true). Identify missing branches, duplicated ideas and ` +
              "vague labels. Then improve it: add the missing sub-topics with add_nodes, merge duplicates with move_node / delete_nodes, " +
              "and sharpen vague labels with update_node. Report what you changed.",
          },
        },
      ],
    }),
  );

  return server;
}
