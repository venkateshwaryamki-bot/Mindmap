/**
 * stdio entry point for MCP clients that launch servers as a subprocess
 * (Claude Desktop, Claude Code `claude mcp add`, etc.).
 *
 *   npm run mcp            # from the repo root
 *
 * Shares the same data directory as the web app, so edits made here appear in
 * the browser (the web server watches the store for changes).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MapStore } from "./store.ts";
import { createMcpServer } from "./mcp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

const dataDir = process.env.MINDFLOW_DATA_DIR ?? path.resolve(here, "../../data/maps");
const store = new MapStore(dataDir);
await store.load();

const server = createMcpServer(store);
const transport = new StdioServerTransport();
await server.connect(transport);
// Never write to stdout here: it is the JSON-RPC channel.
console.error(`[mindflow-mcp] ready on stdio, data dir: ${dataDir}`);
