/**
 * Server configuration for the shared Claude assistant (shared/src/assistant.ts).
 */
import { DEFAULT_MODEL, type Effort } from "../../shared/src/assistant.ts";

export { runChat, type ChatEvent, type ChatRequest, type ChatTurn } from "../../shared/src/assistant.ts";

export const MODEL = process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;

export const assistantConfig = {
  model: MODEL,
  effort: (process.env.CLAUDE_EFFORT ?? "medium") as Effort,
  fallbacks: (process.env.CLAUDE_FALLBACKS ?? "on") !== "off",
};

/**
 * Whether the server has Claude credentials. The SDK also reads an `ant auth login`
 * profile from disk; set CLAUDE_ASSUME_CONFIGURED=1 to enable the assistant in that case.
 */
export function aiEnabled(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_PROFILE ||
      process.env.CLAUDE_ASSUME_CONFIGURED,
  );
}
