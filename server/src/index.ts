import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  type LayoutMode,
  MapError,
  createMap,
  normalizeMap,
  parseOutline,
  toOutline,
} from "../../shared/src/model.ts";
import { MapStore, type StoreEvent } from "./store.ts";
import { createMcpServer } from "./mcp.ts";
import { MODEL, aiEnabled, runChat, type ChatRequest } from "./ai.ts";
import { tools } from "./tools.ts";
import { authEnabled, loginHandler, logoutHandler, requireMcpToken, requireSession, sessionStatus } from "./auth.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA_DIR = process.env.MINDFLOW_DATA_DIR ?? path.resolve(here, "../../data/maps");
const CLIENT_DIST = path.resolve(here, "../../client/dist");

const store = new MapStore(DATA_DIR);
await store.load();
store.watch();

if (store.list().length === 0) {
  await store.create(
    createMap("Welcome to MindFlow", {}, [
      {
        text: "Editing",
        children: [
          { text: "Tab adds a child" },
          { text: "Enter adds a sibling" },
          { text: "Double-click or F2 to rename" },
          { text: "Drag a node onto another to move it" },
          { text: "Ctrl+Z / Ctrl+Y undo & redo" },
        ],
      },
      {
        text: "Views",
        children: [
          { text: "Mind map, logic chart, org chart" },
          { text: "Scroll to pan, Ctrl+scroll to zoom" },
          { text: "Collapse branches with the dot" },
        ],
      },
      {
        text: "Claude assistant",
        marker: "✨",
        children: [
          { text: "Open the AI panel on the right" },
          { text: "Select a node and ask to expand it" },
          { text: "Ask for a critique or summary" },
        ],
      },
      {
        text: "MCP",
        marker: "🔌",
        children: [
          { text: "Point Claude Desktop or Claude Code at /mcp" },
          { text: "Edits appear here live" },
        ],
      },
    ]),
  );
}

const app = express();
app.use(cors());
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));
// sendBeacon (save on tab close) posts JSON as text/plain on some browsers
app.use(express.text({ type: "text/plain", limit: "10mb" }));

app.post("/api/login", loginHandler);
app.post("/api/logout", logoutHandler);
app.get("/api/session", (req, res) => res.json(sessionStatus(req)));
app.use("/api", (req, res, next) => (req.path === "/health" ? next() : requireSession(req, res, next)));

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ---------------------------------------------------------------------------
// REST API

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: aiEnabled(), model: MODEL, auth: authEnabled(), mcp: { http: "/mcp", tools: tools.map((t) => t.name) } });
});

app.get("/api/maps", (_req, res) => {
  res.json(store.list());
});

app.post(
  "/api/maps",
  asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as { title?: string; outline?: string; layout?: LayoutMode; theme?: string; map?: unknown };
    if (body.map) {
      const imported = normalizeMap(body.map);
      imported.id = createMap("x").id; // always a fresh id on import
      res.status(201).json(await store.create(imported));
      return;
    }
    const parsed = body.outline ? parseOutline(body.outline) : { title: undefined, nodes: [] };
    const title = body.title?.trim() || parsed.title || "Untitled map";
    const map = createMap(title, { layout: body.layout, theme: body.theme }, parsed.nodes);
    res.status(201).json(await store.create(map));
  }),
);

app.get("/api/maps/:id", (req, res) => {
  res.json(store.get(req.params.id));
});

app.get("/api/maps/:id/outline", (req, res) => {
  const map = store.get(req.params.id);
  res.type("text/markdown").send(toOutline(map.root, { withNotes: true }));
});

app.put(
  "/api/maps/:id",
  asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as { map?: unknown; expectedVersion?: number };
    if (!body.map) throw new MapError("Body must include `map`");
    const incoming = normalizeMap(body.map);
    const saved = await store.update(req.params.id, () => incoming, body.expectedVersion);
    res.json(saved);
  }),
);

// Fire-and-forget save used by navigator.sendBeacon when a tab closes.
app.post(
  "/api/maps/:id/beacon",
  asyncRoute(async (req, res) => {
    const body = typeof req.body === "string" ? (JSON.parse(req.body) as { map?: unknown }) : (req.body as { map?: unknown });
    if (body?.map) {
      const incoming = normalizeMap(body.map);
      await store.update(req.params.id, () => incoming);
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/maps/:id",
  asyncRoute(async (req, res) => {
    await store.delete(req.params.id);
    res.status(204).end();
  }),
);

// Server-sent events: live updates for every connected browser tab.
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event: StoreEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  res.write(`event: ready\ndata: {}\n\n`);
  const unsubscribe = store.subscribe(send);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);
  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// Claude assistant (streams ChatEvents over SSE)

let anthropic: Anthropic | undefined;
function getClient(): Anthropic {
  anthropic ??= new Anthropic();
  return anthropic;
}

app.post("/api/ai/chat", (req, res) => {
  if (!aiEnabled()) {
    res.status(503).json({ error: "Claude is not configured. Set ANTHROPIC_API_KEY in .env (see README)." });
    return;
  }
  const body = (req.body ?? {}) as Partial<ChatRequest>;
  if (!body.mapId || typeof body.message !== "string") {
    res.status(400).json({ error: "mapId and message are required" });
    return;
  }
  if (!store.has(body.mapId)) {
    res.status(404).json({ error: "Map not found" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const controller = new AbortController();
  // Note: `req` fires "close" as soon as the body is consumed; `res` closes when the client disconnects.
  res.on("close", () => controller.abort());

  const request: ChatRequest = {
    mapId: body.mapId,
    message: body.message,
    selectedNodeId: typeof body.selectedNodeId === "string" ? body.selectedNodeId : undefined,
    history: Array.isArray(body.history)
      ? body.history
          .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
          .map((t) => ({ role: t.role, content: t.content }))
      : [],
  };

  let client: Anthropic;
  try {
    client = getClient();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`);
    res.end();
    return;
  }

  runChat(client, store, request, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`), controller.signal)
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      let message = "The assistant failed.";
      if (error instanceof Anthropic.AuthenticationError) message = "Claude rejected the API key. Check ANTHROPIC_API_KEY.";
      else if (error instanceof Anthropic.RateLimitError) message = "Claude is rate limited right now. Try again in a moment.";
      else if (error instanceof Anthropic.BadRequestError) message = `Claude rejected the request: ${error.message}`;
      else if (error instanceof Anthropic.APIError) message = `Claude API error ${error.status}: ${error.message}`;
      else if (error instanceof Error) message = error.message;
      console.error("[ai]", error);
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    })
    .finally(() => res.end());
});

// ---------------------------------------------------------------------------
// MCP over Streamable HTTP (stateless: a fresh server per request)

app.all(
  "/mcp",
  requireMcpToken,
  asyncRoute(async (req, res) => {
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }),
);

// ---------------------------------------------------------------------------
// Static client (production build)

if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api|\/mcp).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
}

// ---------------------------------------------------------------------------

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof MapError) {
    res.status(error.code === "NOT_FOUND" ? 404 : 400).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

app.listen(PORT, HOST, () => {
  console.log(`MindFlow server  http://localhost:${PORT}`);
  if (HOST === "0.0.0.0") {
    for (const ip of lanAddresses()) console.log(`  On your Wi-Fi  http://${ip}:${PORT}   (open this on your phone)`);
  }
  console.log(`  Password       ${authEnabled() ? "required (APP_PASSWORD is set)" : "off - set APP_PASSWORD before exposing to the internet"}`);
  console.log(`  REST API       http://localhost:${PORT}/api/maps`);
  console.log(`  MCP endpoint   http://localhost:${PORT}/mcp`);
  console.log(`  Claude         ${aiEnabled() ? `enabled (${MODEL})` : "disabled - set ANTHROPIC_API_KEY in .env"}`);
  console.log(`  Data dir       ${DATA_DIR}`);
});
