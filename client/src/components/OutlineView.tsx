import { useEffect, useMemo, useRef, useState } from "react";
import { type MindMap, type MindNode, findNode, mapFromOutline, toOutline } from "@shared/model";
import type { EditorActions } from "../useMapEditor";
import { Segmented } from "./ui";

interface Props {
  map: MindMap;
  selectedId: string | null;
  actions: EditorActions;
  isMobile: boolean;
}

interface Row {
  node: MindNode;
  depth: number;
}

function flatten(root: MindNode): Row[] {
  const rows: Row[] = [];
  const visit = (n: MindNode, d: number) => {
    rows.push({ node: n, depth: d });
    if (!n.collapsed) for (const c of n.children) visit(c, d + 1);
  };
  visit(root, 0);
  return rows;
}

/** Edit the map as an indented list (or raw Markdown). */
export function OutlineView({ map, selectedId, actions, isMobile }: Props) {
  const [mode, setMode] = useState<"list" | "markdown">("list");
  const [focusId, setFocusId] = useState<string | null>(selectedId);
  const rows = useMemo(() => flatten(map.root), [map.root]);
  const drafts = useRef(new Map<string, string>());
  const pendingFocus = useRef<{ id: string; caret: "end" | "start" } | null>(null);

  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    const el = document.getElementById(`ol-${p.id}`) as HTMLInputElement | null;
    if (el) {
      el.focus();
      const pos = p.caret === "end" ? el.value.length : 0;
      el.setSelectionRange(pos, pos);
      pendingFocus.current = null;
    }
  });

  const focusRow = (id: string, caret: "end" | "start" = "end") => {
    pendingFocus.current = { id, caret };
    setFocusId(id);
    actions.select(id);
  };

  const commit = (id: string) => {
    const draft = drafts.current.get(id);
    if (draft === undefined) return;
    drafts.current.delete(id);
    const node = findNode(map.root, id);
    if (node && draft.trim() && draft !== node.text) actions.updateNode(id, { text: draft });
  };

  const indexOf = (id: string) => rows.findIndex((r) => r.node.id === id);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: Row) => {
    const id = row.node.id;
    const isRoot = row.depth === 0;
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit(id);
      const created = isRoot || (row.node.children.length > 0 && !row.node.collapsed) ? actions.addChild(id) : actions.addSibling(id);
      actions.stopEditing();
      if (created) focusRow(created);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (isRoot) return;
      commit(id);
      if (e.shiftKey) actions.outdent(id);
      else actions.indent(id);
      focusRow(id);
    } else if (e.key === "Backspace" && (e.currentTarget.value === "" || e.currentTarget.value === "New idea") && !isRoot && row.node.children.length === 0) {
      e.preventDefault();
      const prev = rows[indexOf(id) - 1];
      drafts.current.delete(id);
      actions.deleteNode(id);
      if (prev) focusRow(prev.node.id);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(id);
      if (e.altKey || e.ctrlKey || e.metaKey) {
        actions.reorder(id, e.key === "ArrowUp" ? -1 : 1);
        focusRow(id);
        return;
      }
      const next = rows[indexOf(id) + (e.key === "ArrowUp" ? -1 : 1)];
      if (next) focusRow(next.node.id);
    }
  };

  const focused = focusId ? rows.find((r) => r.node.id === focusId) : undefined;

  return (
    <div className="outline-view">
      <div className="outline-head">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "list", label: "☰ List" },
            { value: "markdown", label: "Ⓜ Markdown" },
          ]}
        />
        {!isMobile && mode === "list" && <span className="muted small">Enter: new · Tab / Shift+Tab: indent · Alt+↑↓: move</span>}
      </div>
      {mode === "list" ? (
        <div className="outline-list">
          {rows.map((row) => {
            const n = row.node;
            return (
              <div key={n.id} className={`outline-row depth-${Math.min(row.depth, 3)}${n.id === focusId ? " focused" : ""}`} style={{ paddingLeft: 8 + row.depth * 22 }}>
                <button
                  type="button"
                  className={`ol-toggle${n.children.length ? "" : " leaf"}`}
                  onClick={() => n.children.length && actions.toggleCollapse(n.id)}
                  aria-label={n.collapsed ? "Expand" : "Collapse"}
                >
                  {n.children.length ? (n.collapsed ? "▸" : "▾") : "•"}
                </button>
                {n.task && (
                  <button type="button" className={`ol-check${n.task === "done" ? " on" : ""}`} onClick={() => actions.toggleTask(n.id)} aria-label="Toggle done">
                    {n.task === "done" ? "✓" : ""}
                  </button>
                )}
                {n.marker && <span className="ol-marker">{n.marker}</span>}
                <input
                  id={`ol-${n.id}`}
                  className={n.task === "done" ? "done" : ""}
                  defaultValue={n.text === "New idea" ? "" : n.text}
                  key={`${n.id}:${n.text}`}
                  placeholder={row.depth === 0 ? "Central topic" : "Topic"}
                  onFocus={() => {
                    setFocusId(n.id);
                    actions.select(n.id);
                  }}
                  onChange={(e) => drafts.current.set(n.id, e.target.value)}
                  onBlur={() => commit(n.id)}
                  onKeyDown={(e) => onKey(e, row)}
                />
                {n.collapsed && <span className="ol-count">{n.children.length}</span>}
              </div>
            );
          })}
          <div className="outline-pad" />
        </div>
      ) : (
        <MarkdownEditor map={map} actions={actions} />
      )}
      {mode === "list" && focused && focused.depth > 0 && (
        <div className="outline-tools" onPointerDown={(e) => e.preventDefault()}>
          <button type="button" onClick={() => (actions.outdent(focused.node.id), focusRow(focused.node.id))}>
            ⇤ Outdent
          </button>
          <button type="button" onClick={() => (actions.indent(focused.node.id), focusRow(focused.node.id))}>
            ⇥ Indent
          </button>
          <button type="button" onClick={() => (actions.reorder(focused.node.id, -1), focusRow(focused.node.id))}>
            ↑
          </button>
          <button type="button" onClick={() => (actions.reorder(focused.node.id, 1), focusRow(focused.node.id))}>
            ↓
          </button>
          <button type="button" onClick={() => actions.updateNode(focused.node.id, { task: focused.node.task ? null : "todo" })}>
            ☑
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              const prev = rows[indexOf(focused.node.id) - 1];
              actions.deleteNode(focused.node.id);
              if (prev) focusRow(prev.node.id);
            }}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

function MarkdownEditor({ map, actions }: { map: MindMap; actions: EditorActions }) {
  const original = useMemo(() => toOutline(map.root, { withNotes: true }), [map.root]);
  const [text, setText] = useState(original);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(original);
  }, [original, dirty]);
  return (
    <div className="outline-md">
      <textarea
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: s0, selectionEnd: s1 } = el;
            const next = text.slice(0, s0) + "  " + text.slice(s1);
            setText(next);
            setDirty(true);
            requestAnimationFrame(() => el.setSelectionRange(s0 + 2, s0 + 2));
          }
        }}
      />
      <div className="form-actions">
        <span className="muted small">Applying rebuilds the map from this text (images and custom colours are reset).</span>
        <button
          type="button"
          className="btn"
          disabled={!dirty}
          onClick={() => {
            setText(original);
            setDirty(false);
          }}
        >
          Undo edits
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!dirty}
          onClick={() => {
            const rebuilt = mapFromOutline(text, map.title);
            actions.replaceMap({ ...map, title: rebuilt.title, root: { ...rebuilt.root, id: map.root.id } });
            setDirty(false);
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
