import type { MindMap } from "@shared/model";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export interface Health {
  ok: boolean;
  ai: boolean;
  auth?: boolean;
  model: string;
  mcp: { http: string; tools: string[] };
}

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
export type StoreEvent =
  | { type: "map.created"; map: MindMap }
  | { type: "map.updated"; map: MindMap }
  | { type: "map.deleted"; id: string };

/** Subscribe to live store events. Returns an unsubscribe function. */
