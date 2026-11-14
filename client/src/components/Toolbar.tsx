import type { MindMap } from "@shared/model";
import { THEMES } from "../themes";
import type { EditorActions, EditorState } from "../useMapEditor";

interface Props {
  map: MindMap;
  state: EditorState;
  actions: EditorActions;
  aiOpen: boolean;
  inspectorOpen: boolean;
  onToggleAI: () => void;
  onToggleInspector: () => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
  onExport: (kind: "png" | "md" | "json" | "copy") => void;
}

export function Toolbar({ map, state, actions, aiOpen, inspectorOpen, onToggleAI, onToggleInspector, onFit, onZoom, onExport }: Props) {
  const sel = state.selectedId;
  const isRoot = sel === map.root.id;
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
        <button type="button" onClick={onFit} title="Fit to screen (double-click canvas)">
          Fit
        </button>
      </div>

      <div className="group">
        <div className="menu">
          <button type="button">Export ▾</button>
          <div className="menu-items">
            <button type="button" onClick={() => onExport("png")}>
              PNG image
            </button>
            <button type="button" onClick={() => onExport("md")}>
              Markdown outline
            </button>
            <button type="button" onClick={() => onExport("json")}>
              JSON (.mindflow.json)
            </button>
            <button type="button" onClick={() => onExport("copy")}>
              Copy outline
            </button>
          </div>
        </div>
      </div>

      <div className="spacer" />
      <button type="button" className={inspectorOpen ? "active" : ""} onClick={onToggleInspector} title="Node inspector">
        Inspector
      </button>
      <button type="button" className={`ai-toggle${aiOpen ? " active" : ""}`} onClick={onToggleAI} title="Claude assistant">
        ✦ Claude
      </button>
    </div>
  );
}
