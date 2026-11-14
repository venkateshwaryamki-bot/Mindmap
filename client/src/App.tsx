import { useCallback, useEffect, useRef, useState } from "react";
import type { MapSummary } from "@shared/model";
import { findParent } from "@shared/model";
import { api, type Health, subscribeEvents } from "./api";
import { Canvas, type CanvasHandle } from "./components/Canvas";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { Inspector } from "./components/Inspector";
import { AIPanel } from "./components/AIPanel";
import { NewMapDialog, type NewMapRequest } from "./components/NewMapDialog";
import { copyOutline, exportJson, exportMarkdown, exportPng } from "./export";
import { getTheme } from "./themes";
import { useMapEditor } from "./useMapEditor";

interface Toast {
  id: number;
  text: string;
}

const LAST_MAP_KEY = "mindflow:lastMap";

export default function App() {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(LAST_MAP_KEY));
  const [health, setHealth] = useState<Health | null>(null);
  const [connected, setConnected] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [autoPrompt, setAutoPrompt] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle | null>(null);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const { state, selectedNode, actions } = useMapEditor(currentId, toast);
  const map = state.map;
  const theme = getTheme(map?.theme ?? "aurora");

  const refreshMaps = useCallback(async () => {
    try {
      const list = await api.listMaps();
      setMaps(list);
      return list;
    } catch (e) {
      toast((e as Error).message);
      return [];
    }
  }, [toast]);

  // Initial load
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false, ai: false, model: "", mcp: { http: "/mcp", tools: [] } }));
    void refreshMaps().then((list) => {
      setCurrentId((cur) => (cur && list.some((m) => m.id === cur) ? cur : list[0]?.id ?? null));
    });
  }, [refreshMaps]);

  useEffect(() => {
    if (currentId) localStorage.setItem(LAST_MAP_KEY, currentId);
  }, [currentId]);

  // Live sync (edits from MCP clients / other tabs / the assistant)
  const applyRemote = actions.applyRemote;
  useEffect(() => {
    return subscribeEvents((event) => {
      if (event.type === "map.updated") {
        applyRemote(event.map);
        setMaps((prev) => {
          const summary: MapSummary = {
            id: event.map.id,
            title: event.map.title,
            nodeCount: countNodes(event.map.root),
            version: event.map.version,
            updatedAt: event.map.updatedAt,
          };
          const idx = prev.findIndex((m) => m.id === summary.id);
          const next = idx >= 0 ? prev.map((m) => (m.id === summary.id ? summary : m)) : [summary, ...prev];
          return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        });
      } else if (event.type === "map.created") {
        void refreshMaps();
      } else if (event.type === "map.deleted") {
        setMaps((prev) => prev.filter((m) => m.id !== event.id));
        setCurrentId((cur) => (cur === event.id ? null : cur));
      }
    }, setConnected);
  }, [applyRemote, refreshMaps]);

  // When the current map disappears, fall back to the first one.
  useEffect(() => {
    if (!currentId && maps.length) setCurrentId(maps[0].id);
  }, [currentId, maps]);

  // ---- keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (!map) return;
      const sel = state.selectedId;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        actions.redo();
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        canvasRef.current?.fit();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        canvasRef.current?.zoomBy(1.2);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        canvasRef.current?.zoomBy(1 / 1.2);
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiOpen((v) => !v);
        return;
      }
      if (!sel) {
        if (e.key === "Tab") {
          e.preventDefault();
          actions.select(map.root.id);
        }
        return;
      }
      const placed = canvasRef.current?.getLayout()?.byId.get(sel);
      switch (e.key) {
        case "Tab":
          e.preventDefault();
          actions.addChild(sel);
          break;
        case "Enter":
          e.preventDefault();
          if (sel === map.root.id) actions.addChild(sel);
          else actions.addSibling(sel);
          break;
        case "F2":
          e.preventDefault();
          actions.startEditing(sel);
          break;
        case " ":
          e.preventDefault();
          actions.toggleCollapse(sel);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (sel !== map.root.id) actions.deleteNode(sel);
          break;
        case "Escape":
          actions.select(null);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          e.preventDefault();
          if (mod) {
            actions.reorder(sel, e.key === "ArrowUp" ? -1 : 1);
            break;
          }
          const layout = canvasRef.current?.getLayout();
          if (!layout || !placed) break;
          // nearest node vertically in the same direction, preferring siblings
          const parent = findParent(map.root, sel);
          const siblings = parent ? parent.children.filter((c) => layout.byId.has(c.id)) : [];
          const idx = siblings.findIndex((c) => c.id === sel);
          const sib = e.key === "ArrowUp" ? siblings[idx - 1] : siblings[idx + 1];
          if (sib) {
            actions.select(sib.id);
            break;
          }
          const candidates = layout.nodes.filter((p) => (e.key === "ArrowUp" ? p.y + p.h <= placed.y : p.y >= placed.y + placed.h));
          const best = candidates.sort((a, b) => dist(a, placed) - dist(b, placed))[0];
          if (best) actions.select(best.id);
          break;
        }
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          if (!placed) break;
          const layout = canvasRef.current?.getLayout();
          if (!layout) break;
          const node = placed.node;
          const goingOut = (placed.side === "left" && e.key === "ArrowLeft") || (placed.side !== "left" && e.key === "ArrowRight");
          if (map.layout === "down") {
            const parent = findParent(map.root, sel);
            const siblings = parent?.children ?? [];
            const idx = siblings.findIndex((c) => c.id === sel);
            const sib = e.key === "ArrowLeft" ? siblings[idx - 1] : siblings[idx + 1];
            if (sib) actions.select(sib.id);
            break;
          }
          if (placed.depth === 0) {
            const side = e.key === "ArrowLeft" ? "left" : "right";
            const kids = layout.nodes.filter((p) => p.depth === 1 && p.side === side).sort((a, b) => a.y - b.y);
            const mid = kids[Math.floor(kids.length / 2)];
            if (mid) actions.select(mid.id);
            break;
          }
          if (goingOut) {
            if (node.collapsed) actions.toggleCollapse(sel);
            const kids = node.children;
            if (kids.length) actions.select(kids[Math.floor(kids.length / 2)].id);
          } else if (placed.parentId) {
            actions.select(placed.parentId);
          }
          break;
        }
        default:
          // Start typing to rename
          if (e.key.length === 1 && !mod && !e.altKey) {
            actions.startEditing(sel);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, state.selectedId, actions]);

  // ---- map management --------------------------------------------------------

  const createMap = async (req: NewMapRequest) => {
    setDialogOpen(false);
    try {
      const created = await api.createMap({ title: req.title, outline: req.generate ? "" : req.outline, layout: req.layout, theme: req.theme });
      await refreshMaps();
      setCurrentId(created.id);
      if (req.generate) {
        setAiOpen(true);
        setAutoPrompt(
          `Build a complete mind map about "${req.title}". ${req.brief ? `Brief: ${req.brief}. ` : ""}` +
            "Create 5-8 main branches with 3-5 specific sub-points each (use add_nodes with a nested outline, one call per branch or one call for all). " +
            "Add a short note to the 2-3 most important nodes. Finish with a two-sentence summary.",
        );
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const deleteMap = async (id: string) => {
    const target = maps.find((m) => m.id === id);
    if (!target || !window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteMap(id);
      const list = await refreshMaps();
      if (currentId === id) setCurrentId(list[0]?.id ?? null);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      let created;
      if (file.name.endsWith(".json")) {
        created = await api.createMap({ map: JSON.parse(text) });
      } else {
        created = await api.createMap({ outline: text, title: file.name.replace(/\.[^.]+$/, "") });
      }
      await refreshMaps();
      setCurrentId(created.id);
      toast(`Imported "${created.title}"`);
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`);
    }
  };

  const handleExport = async (kind: "png" | "md" | "json" | "copy") => {
    if (!map) return;
    try {
      if (kind === "md") exportMarkdown(map);
      else if (kind === "json") exportJson(map);
      else if (kind === "copy") {
        await copyOutline(map);
        toast("Outline copied to clipboard");
      } else {
        const layout = canvasRef.current?.getLayout();
        if (layout) exportPng(map, layout, theme);
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className={`app${theme.dark ? " dark-canvas" : ""}`}>
      <Sidebar
        maps={maps}
        currentId={currentId}
        connected={connected}
        onSelect={setCurrentId}
        onNew={() => setDialogOpen(true)}
        onDelete={(id) => void deleteMap(id)}
        onImport={(f) => void importFile(f)}
      />
      <main className="workspace">
        {map ? (
          <>
            <Toolbar
              map={map}
              state={state}
              actions={actions}
              aiOpen={aiOpen}
              inspectorOpen={inspectorOpen}
              onToggleAI={() => setAiOpen((v) => !v)}
              onToggleInspector={() => setInspectorOpen((v) => !v)}
              onFit={() => canvasRef.current?.fit()}
              onZoom={(f) => canvasRef.current?.zoomBy(f)}
              onExport={(k) => void handleExport(k)}
            />
            <div className="stage">
              <Canvas
                map={map}
                theme={theme}
                selectedId={state.selectedId}
                editingId={state.editingId}
                actions={actions}
                viewRef={canvasRef}
              />
              {inspectorOpen && selectedNode && (
                <Inspector map={map} node={selectedNode} theme={theme} actions={actions} onClose={() => setInspectorOpen(false)} />
              )}
              {aiOpen && (
                <AIPanel
                  map={map}
                  selectedNode={selectedNode}
                  actions={actions}
                  health={health}
                  onClose={() => setAiOpen(false)}
                  autoPrompt={autoPrompt}
                  onAutoPromptConsumed={() => setAutoPrompt(null)}
                />
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            {state.error ? (
              <p className="error">{state.error}</p>
            ) : (
              <>
                <h1>MindFlow</h1>
                <p>Create a map to get started, or connect an MCP client and ask Claude to build one.</p>
                <button type="button" className="primary" onClick={() => setDialogOpen(true)}>
                  + New map
                </button>
              </>
            )}
          </div>
        )}
      </main>
      <NewMapDialog open={dialogOpen} aiAvailable={health?.ai ?? false} onClose={() => setDialogOpen(false)} onCreate={(r) => void createMap(r)} />
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function dist(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot((ax - bx) * 0.6, ay - by);
}

function countNodes(node: { children: { children: unknown[] }[] }): number {
  let n = 1;
  for (const c of node.children) n += countNodes(c as { children: { children: unknown[] }[] });
  return n;
}
