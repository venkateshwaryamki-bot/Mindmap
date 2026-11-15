import { useRef, useState } from "react";
import type { MindMap } from "@shared/model";
import { THEMES } from "../themes";
import type { EditorActions, EditorState } from "../useMapEditor";

interface Props {
  map: MindMap;
  state: EditorState;
  actions: EditorActions;
  isMobile: boolean;
  aiOpen: boolean;
  inspectorOpen: boolean;
  onOpenDrawer: () => void;
  onToggleAI: () => void;
  onToggleInspector: () => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
  onExport: (kind: "png" | "md" | "json" | "copy") => void;
}

export function Toolbar(props: Props) {
  const { map, state, actions, isMobile, aiOpen, inspectorOpen, onOpenDrawer, onToggleAI, onToggleInspector, onFit, onZoom, onExport } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const exportRef = useRef<HTMLDetailsElement>(null);
  const sel = state.selectedId;
  const isRoot = sel === map.root.id;

  const exportItem = (kind: "png" | "md" | "json" | "copy", label: string) => (
    <button
      type="button"
      onClick={() => {
        if (exportRef.current) exportRef.current.open = false;
        setMoreOpen(false);
        onExport(kind);
      }}
    >
      {label}
    </button>
  );

  const viewControls = (
    <>
      <div className="group">
        <select value={map.layout} onChange={(e) => actions.setLayout(e.target.value as MindMap["layout"])} title="Layout">
          <option value="mindmap">Mind map</option>
          <option value="right">Logic chart</option>
          <option value="down">Org chart</option>
        </select>
        <select value={map.theme} onChange={(e) => actions.setTheme(e.target.value)} title="Theme">
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="group">
        <button type="button" onClick={() => onZoom(1 / 1.2)} title="Zoom out">
          −
        </button>
        <button type="button" onClick={() => onZoom(1.2)} title="Zoom in">
          +
        </button>
        <button type="button" onClick={onFit} title="Fit to screen">
          Fit
        </button>
      </div>
      <div className="group">
        <details className="menu" ref={exportRef}>
          <summary>Export ▾</summary>
          <div className="menu-items">
            {exportItem("png", "PNG image")}
            {exportItem("md", "Markdown outline")}
            {exportItem("json", "JSON (.mindflow.json)")}
            {exportItem("copy", "Copy outline")}
          </div>
        </details>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className={`toolbar mobile${moreOpen ? " more-open" : ""}`}>
        <div className="toolbar-row">
          <button type="button" className="icon-btn" onClick={onOpenDrawer} aria-label="Open map list">
            ☰
          </button>
          <input
            className="title-input"
            value={map.title}
            onChange={(e) => actions.rename(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Map title"
          />
          <button type="button" className="icon-btn" disabled={!state.canUndo} onClick={actions.undo} aria-label="Undo">
            ↶
          </button>
          <button type="button" className="icon-btn" disabled={!state.canRedo} onClick={actions.redo} aria-label="Redo">
            ↷
          </button>
          <button type="button" className={`icon-btn${moreOpen ? " active" : ""}`} onClick={() => setMoreOpen((v) => !v)} aria-label="More">
            ⋯
          </button>
        </div>
        {moreOpen && <div className="toolbar-more">{viewControls}</div>}
      </div>
    );
  }

  return (
    <div className="toolbar">
      <input
        className="title-input"
        value={map.title}
        onChange={(e) => actions.rename(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Map title"
      />
      <span className={`save-state${state.saving ? " saving" : ""}`}>{state.saving ? "Saving…" : "Saved"}</span>

      <div className="group">
        <button type="button" disabled={!sel} onClick={() => sel && actions.addChild(sel)} title="Add child (Tab)">
          + Child
        </button>
        <button type="button" disabled={!sel || isRoot} onClick={() => sel && actions.addSibling(sel)} title="Add sibling (Enter)">
          + Sibling
        </button>
        <button type="button" disabled={!sel || isRoot} onClick={() => sel && actions.deleteNode(sel)} title="Delete (Del)">
          Delete
        </button>
      </div>

      <div className="group">
        <button type="button" disabled={!state.canUndo} onClick={actions.undo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button type="button" disabled={!state.canRedo} onClick={actions.redo} title="Redo (Ctrl+Y)">
          ↷
        </button>
      </div>

      {viewControls}

      <div className="spacer" />
      <button type="button" className={inspectorOpen ? "active" : ""} onClick={onToggleInspector} title="Node inspector">
        Inspector
      </button>
      <button type="button" className={`ai-toggle${aiOpen ? " active" : ""}`} onClick={onToggleAI} title="Claude assistant (Ctrl+K)">
        ✦ Claude
      </button>
    </div>
  );
}
