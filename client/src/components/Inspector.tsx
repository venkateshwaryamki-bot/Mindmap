import { useEffect, useState } from "react";
import type { MindMap, MindNode } from "@shared/model";
import { pathTo } from "@shared/model";
import type { Theme } from "../themes";
import type { EditorActions } from "../useMapEditor";

interface Props {
  map: MindMap;
  node: MindNode;
  theme: Theme;
  actions: EditorActions;
  onClose: () => void;
}

const MARKERS = ["", "⭐", "✅", "❗", "❓", "💡", "🔥", "🎯", "📌", "1️⃣", "2️⃣", "3️⃣", "👍", "👎", "⏳"];

export function Inspector({ map, node, theme, actions, onClose }: Props) {
  const [note, setNote] = useState(node.note ?? "");
  const [link, setLink] = useState(node.link ?? "");
  useEffect(() => {
    setNote(node.note ?? "");
    setLink(node.link ?? "");
  }, [node.id, node.note, node.link]);

  const isRoot = node.id === map.root.id;
  const crumbs = pathTo(map.root, node.id).map((n) => n.text);

  return (
    <aside className="inspector">
      <header>
        <h3>Node</h3>
        <button type="button" className="icon" onClick={onClose} title="Close">
          ×
        </button>
      </header>
      <div className="crumbs">{crumbs.join(" › ")}</div>

      <label>
        Text
        <input value={node.text} onChange={(e) => actions.updateNode(node.id, { text: e.target.value })} />
      </label>

      <label>
        Marker
        <div className="marker-grid">
          {MARKERS.map((m) => (
            <button
              key={m || "none"}
              type="button"
              className={`marker${(node.marker ?? "") === m ? " active" : ""}`}
              onClick={() => actions.updateNode(node.id, { marker: m })}
              title={m ? m : "No marker"}
            >
              {m || "∅"}
            </button>
          ))}
        </div>
      </label>

      <label>
        Branch colour
        <div className="swatches">
          <button
            type="button"
            className={`swatch none${!node.color ? " active" : ""}`}
            onClick={() => actions.updateNode(node.id, { color: "" })}
            title="Inherit"
          />
          {theme.palette.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${node.color === c ? " active" : ""}`}
              style={{ background: c }}
              onClick={() => actions.updateNode(node.id, { color: c })}
            />
          ))}
          <input
            type="color"
            value={node.color ?? "#6366f1"}
            onChange={(e) => actions.updateNode(node.id, { color: e.target.value })}
            title="Custom colour"
          />
        </div>
      </label>

      <label>
        Note
        <textarea
          rows={6}
          placeholder="Details, references, thoughts… (markdown)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (node.note ?? "") && actions.updateNode(node.id, { note })}
        />
      </label>

      <label>
        Link
        <input
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onBlur={() => link !== (node.link ?? "") && actions.updateNode(node.id, { link })}
        />
      </label>

      <div className="inspector-actions">
        <button type="button" onClick={() => actions.addChild(node.id)}>
          + Child
        </button>
        {!isRoot && (
          <button type="button" onClick={() => actions.addSibling(node.id)}>
            + Sibling
          </button>
        )}
        {node.children.length > 0 && (
          <button type="button" onClick={() => actions.toggleCollapse(node.id)}>
            {node.collapsed ? "Expand" : "Collapse"}
          </button>
        )}
        {!isRoot && (
          <>
            <button type="button" onClick={() => actions.reorder(node.id, -1)} title="Move up (Ctrl+↑)">
              ↑
            </button>
            <button type="button" onClick={() => actions.reorder(node.id, 1)} title="Move down (Ctrl+↓)">
              ↓
            </button>
            <button type="button" className="danger" onClick={() => actions.deleteNode(node.id)}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="hint">
        id <code>{node.id}</code>
      </div>
    </aside>
  );
}
