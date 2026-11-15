import type { MapSummary, MindMap } from "@shared/model";
import type { CreateMapRequest } from "@shared/create";
import { ApiError, type ChatEvent, type ChatTurn, type Health, type StoreEvent } from "./apiTypes";
import { localApi, localStreamChat, localSubscribeEvents } from "./backend/local";

export { ApiError, type ChatEvent, type ChatTurn, type Health, type StoreEvent } from "./apiTypes";

/** Built with `npm run build:mobile`: everything runs on the device, no server. */
export const STANDALONE = import.meta.env.VITE_STANDALONE === "1";

/** Fired when the server says the user must sign in (APP_PASSWORD is set). */
export const AUTH_REQUIRED_EVENT = "mindflow:auth-required";

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
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

const remoteApi = {
  session: () => fetch("/api/session").then((r) => json<{ required: boolean; signedIn: boolean }>(r)),
  login: (password: string) =>
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).then(
      (r) => json<{ ok: boolean }>(r),
    ),
  logout: () => fetch("/api/logout", { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),
  health: () => fetch("/api/health").then((r) => json<Health>(r)),
  listMaps: () => fetch("/api/maps").then((r) => json<MapSummary[]>(r)),
  getMap: (id: string) => fetch(`/api/maps/${id}`).then((r) => json<MindMap>(r)),
  createMap: (body: CreateMapRequest) =>
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

async function remoteStreamChat(
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
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
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

function remoteSubscribeEvents(onEvent: (event: StoreEvent) => void, onStatus?: (connected: boolean) => void): () => void {
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

export type Api = typeof remoteApi;

export const api: Api = STANDALONE ? localApi : remoteApi;
export const streamChat: typeof remoteStreamChat = STANDALONE ? localStreamChat : remoteStreamChat;
export const subscribeEvents: typeof remoteSubscribeEvents = STANDALONE ? localSubscribeEvents : remoteSubscribeEvents;
