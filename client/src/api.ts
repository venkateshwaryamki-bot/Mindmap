import type { MapSummary, MindMap } from "@shared/model";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export interface Health {
  ok: boolean;
  ai: boolean;
  model: string;
  mcp: { http: string; tools: string[] };
}

export const api = {
  health: () => fetch("/api/health").then((r) => json<Health>(r)),
  listMaps: () => fetch("/api/maps").then((r) => json<MapSummary[]>(r)),
  getMap: (id: string) => fetch(`/api/maps/${id}`).then((r) => json<MindMap>(r)),
  createMap: (body: { title?: string; outline?: string; layout?: string; theme?: string; map?: unknown }) =>
    fetch("/api/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
      json<MindMap>(r),
    ),
  saveMap: (map: MindMap, expectedVersion?: number) =>
    fetch(`/api/maps/${map.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map, expectedVersion }),
    }).then((r) => json<MindMap>(r)),
  deleteMap: (id: string) => fetch(`/api/maps/${id}`, { method: "DELETE" }).then((r) => json<void>(r)),
};

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; text: string; isError: boolean }
  | { type: "map"; map: MindMap }
  | { type: "done"; stopReason: string | null; usage: { input: number; output: number } }
  | { type: "error"; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** POST a chat message and stream back ChatEvents (server-sent events over fetch). */
export async function streamChat(
  body: { mapId: string; message: string; history: ChatTurn[]; selectedNodeId?: string },
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent);
        } catch {
          /* ignore malformed line */
        }
      }
    }
  }
}

export type StoreEvent =
  | { type: "map.created"; map: MindMap }
  | { type: "map.updated"; map: MindMap }
  | { type: "map.deleted"; id: string };

/** Subscribe to live store events. Returns an unsubscribe function. */
export function subscribeEvents(onEvent: (event: StoreEvent) => void, onStatus?: (connected: boolean) => void): () => void {
  const source = new EventSource("/api/events");
  const handler = (e: MessageEvent) => {
    try {
      onEvent(JSON.parse(e.data) as StoreEvent);
    } catch {
      /* ignore */
    }
  };
  source.addEventListener("map.created", handler);
  source.addEventListener("map.updated", handler);
  source.addEventListener("map.deleted", handler);
  source.addEventListener("ready", () => onStatus?.(true));
  source.onerror = () => onStatus?.(false);
  return () => source.close();
}
