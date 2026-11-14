import { useEffect, useRef, useState } from "react";
import type { MindMap, MindNode } from "@shared/model";
import { type ChatTurn, type Health, streamChat } from "../api";
import type { EditorActions } from "../useMapEditor";

interface ToolCall {
  id: string;
  name: string;
  summary?: string;
  isError?: boolean;
  done: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  tools: ToolCall[];
  error?: string;
}

interface Props {
  map: MindMap;
  selectedNode: MindNode | null;
  actions: EditorActions;
  health: Health | null;
  onClose: () => void;
  /** A message to send as soon as the panel mounts (used by "generate with Claude"). */
  autoPrompt?: string | null;
  onAutoPromptConsumed?: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  get_mindmap: "Reading the map",
  add_nodes: "Adding nodes",
  update_node: "Updating a node",
  delete_nodes: "Deleting nodes",
  move_node: "Moving a node",
  replace_branch: "Rewriting a branch",
  search_nodes: "Searching",
  set_map_options: "Changing map options",
  create_mindmap: "Creating a map",
  list_mindmaps: "Listing maps",
};

export function AIPanel({ map, selectedNode, actions, health, onClose, autoPrompt, onAutoPromptConsumed }: Props) {
  const [messagesByMap, setMessagesByMap] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = messagesByMap[map.id] ?? [];

  const setMessages = (updater: (prev: Message[]) => Message[]) =>
    setMessagesByMap((all) => ({ ...all, [map.id]: updater(all[map.id] ?? []) }));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    await actions.flushSave();
    const history: ChatTurn[] = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message, tools: [] }, { role: "assistant", content: "", tools: [] }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const patchLast = (fn: (m: Message) => Message) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });

    try {
      await streamChat(
        { mapId: map.id, message, history, selectedNodeId: selectedNode?.id },
        (event) => {
          switch (event.type) {
            case "text":
              patchLast((m) => ({ ...m, content: m.content + event.text }));
              break;
            case "tool_start":
              patchLast((m) => ({ ...m, tools: [...m.tools, { id: event.id, name: event.name, done: false }] }));
              break;
            case "tool_result":
              patchLast((m) => ({
                ...m,
                tools: m.tools.map((t) => (t.id === event.id ? { ...t, done: true, summary: event.text, isError: event.isError } : t)),
              }));
              break;
            case "map":
              actions.applyRemote(event.map);
              break;
            case "error":
              patchLast((m) => ({ ...m, error: event.message }));
              break;
            case "done":
              break;
          }
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) patchLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (autoPrompt && !busy) {
      onAutoPromptConsumed?.();
      void send(autoPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt]);

  const quick = selectedNode && selectedNode.id !== map.root.id
    ? [
        { label: "Expand this node", prompt: `Expand the selected node "${selectedNode.text}" with 4-6 specific sub-ideas.` },
        { label: "Add a note", prompt: `Write a concise, useful note (3-5 sentences) for the selected node "${selectedNode.text}" and save it with update_node.` },
        { label: "Rewrite branch", prompt: `Rewrite the branch under "${selectedNode.text}" so it is sharper and better organised, keeping the good ideas.` },
      ]
    : [
        { label: "Brainstorm branches", prompt: "Add 4-6 new main branches that this map is missing, each with 3-4 sub-points." },
        { label: "Find gaps", prompt: "Critique this map: what important topics are missing, what is vague, what overlaps? Answer in a short list; do not edit yet." },
        { label: "Summarise", prompt: "Summarise this mind map in one paragraph, then list the three most important takeaways." },
        { label: "Reorganise", prompt: "Reorganise the map: group related ideas under clearer parents, merge duplicates and sharpen vague labels." },
      ];

  const aiOff = health !== null && !health.ai;

  return (
    <aside className="ai-panel">
      <header>
        <h3>
          <span className="sparkle">✦</span> Claude
          {health?.model && <small title="Model">{health.model}</small>}
        </h3>
        <button type="button" className="icon" onClick={onClose} title="Close">
          ×
        </button>
      </header>

      {aiOff && (
        <div className="notice">
          Claude is not configured on the server. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart. MCP editing still
          works.
        </div>
      )}

      <div className="chat" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask Claude to brainstorm, expand, critique or restructure this map. It edits the canvas directly.</p>
            <p className="dim">{selectedNode ? `Selected: “${selectedNode.text}”` : "Tip: select a node to focus the assistant on it."}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.tools.length > 0 && (
              <div className="tool-calls">
                {m.tools.map((t) => (
                  <span key={t.id} className={`tool-chip${t.done ? " done" : ""}${t.isError ? " error" : ""}`} title={t.summary}>
                    {t.done ? (t.isError ? "⚠" : "✓") : <span className="spinner" />} {TOOL_LABELS[t.name] ?? t.name}
                  </span>
                ))}
              </div>
            )}
            {m.content && <div className="bubble">{m.content}</div>}
            {m.error && <div className="bubble error">{m.error}</div>}
            {m.role === "assistant" && !m.content && !m.error && busy && i === messages.length - 1 && m.tools.every((t) => t.done) && (
              <div className="bubble thinking">
                <span className="spinner" /> Thinking…
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="quick">
        {quick.map((q) => (
          <button key={q.label} type="button" disabled={busy || aiOff} onClick={() => void send(q.prompt)}>
            {q.label}
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          rows={2}
          value={input}
          disabled={aiOff}
          placeholder={selectedNode ? `Ask about “${selectedNode.text}”…` : "Ask Claude to build or improve the map…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
            e.stopPropagation();
          }}
        />
        {busy ? (
          <button type="button" className="danger" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!input.trim() || aiOff}>
            Send
          </button>
        )}
      </form>
    </aside>
  );
}
