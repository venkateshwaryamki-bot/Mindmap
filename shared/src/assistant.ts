/**
 * Claude assistant: a streaming tool-use loop over the shared map tools, scoped to
 * the map the user has open. Runs on the server (web app) and on the phone
 * (standalone mobile app).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { MindMap } from "./model.ts";
import { toOutline, findNode, pathTo } from "./model.ts";
import type { MapRepository } from "./repository.ts";
import { runTool, toInputSchema, tools } from "./tools.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AssistantConfig {
  model: string;
  effort: Effort;
  /** Server-side refusal fallbacks (beta). */
  fallbacks: boolean;
}

const MAX_ITERATIONS = 16;

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

export interface ChatRequest {
  mapId: string;
  history: ChatTurn[];
  message: string;
  selectedNodeId?: string;
}

const SYSTEM_PROMPT = `You are the MindFlow assistant, embedded in a mind-mapping app similar to XMind.
You help the user think: brainstorm, structure, expand, summarise, critique and reorganise their mind map.

You see the user's current map as a markdown outline where every node ends with a {#id} tag.
Use the provided tools to change the map directly; the user watches changes appear live on the canvas.

Guidelines
- Act, don't ask: when the user wants content added, add it with add_nodes (nested outline) in one call per branch rather than many tiny calls.
- Keep labels short (2-6 words) like a real mind map; put detail into the node's note when needed.
- Prefer concrete, specific sub-points over generic filler. Aim for 3-7 children per node.
- When the user has a node selected and the request is ambiguous, work on that node.
- Use replace_branch only when asked to rewrite or restructure; otherwise preserve the user's existing nodes.
- Never delete nodes unless the user clearly asks.
- After editing, reply with a brief summary (1-3 sentences). Do not repeat the whole outline in prose.
- If the user asks a question about the map (summary, gaps, critique), answer in plain text without editing unless they ask you to.`;

const assistantTools = tools.filter((t) => !t.mcpOnly);

const toolParams: Anthropic.Beta.BetaTool[] = assistantTools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: toInputSchema(t.schema) as Anthropic.Beta.BetaTool.InputSchema,
  eager_input_streaming: true,
}));

function mapContext(map: MindMap, selectedNodeId?: string): string {
  const outline = toOutline(map.root, { withIds: true, withNotes: true });
  let selection = "No node is selected.";
  if (selectedNodeId) {
    const node = findNode(map.root, selectedNodeId);
    if (node) {
      const crumbs = pathTo(map.root, node.id).map((n) => n.text).join(" > ");
      selection = `Selected node: "${node.text}" {#${node.id}} (path: ${crumbs}).`;
    }
  }
  return `<current_map id="${map.id}" title="${map.title}" layout="${map.layout}" version="${map.version}">\n${outline}\n</current_map>\n${selection}`;
}

export async function runChat(
  client: Anthropic,
  store: MapRepository,
  request: ChatRequest,
  emit: (event: ChatEvent) => void,
  signal: AbortSignal | undefined,
  config: AssistantConfig,
): Promise<void> {
  const map = store.get(request.mapId);

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of request.history.slice(-30)) {
    if (!turn.content.trim()) continue;
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({
    role: "user",
    content: [
      { type: "text", text: mapContext(map, request.selectedNodeId) },
      { type: "text", text: request.message },
    ],
  });

  let usage = { input: 0, output: 0 };
  let jsonRetries = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return;

    const params: Parameters<typeof client.beta.messages.stream>[0] = {
      model: config.model,
      max_tokens: 32000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
      tools: toolParams,
      output_config: { effort: config.effort },
    };
    if (config.fallbacks) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }

    const stream = client.beta.messages.stream(params, { signal });
    stream.on("text", (delta) => emit({ type: "text", text: delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (error) {
      if (error instanceof Anthropic.APIError || jsonRetries++ >= 2) throw error;
      // eager_input_streaming: a tool input could not be parsed - re-issue the turn
      continue;
    }

    usage = {
      input: usage.input + message.usage.input_tokens,
      output: usage.output + message.usage.output_tokens,
    };

    if (message.stop_reason === "refusal") {
      emit({ type: "text", text: "\n\nI can't help with that request." });
      emit({ type: "done", stopReason: "refusal", usage });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (message.stop_reason === "max_tokens") {
        emit({ type: "text", text: "\n\n(Response was cut off - ask me to continue.)" });
      }
      emit({ type: "done", stopReason: message.stop_reason, usage });
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      emit({ type: "tool_start", id: use.id, name: use.name, input: use.input });
      // The assistant is scoped to the open map: fill in mapId if the model left it out.
      const raw = use.input && typeof use.input === "object" ? (use.input as Record<string, unknown>) : {};
      const input = "mapId" in raw && raw.mapId ? raw : { mapId: request.mapId, ...raw };
      // runTool validates the (eagerly streamed, therefore unvalidated) input with zod.
      const result = await runTool(use.name, input, { store });
      if (result.map) emit({ type: "map", map: result.map });
      emit({ type: "tool_result", id: use.id, name: use.name, text: result.text.split("\n")[0], isError: result.isError ?? false });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.text,
        is_error: result.isError ?? false,
      });
    }
    messages.push({ role: "user", content: results });
  }

  emit({ type: "text", text: "\n\nI stopped after many steps - tell me how you'd like to continue." });
  emit({ type: "done", stopReason: "max_iterations", usage });
}
