import { useEffect, useLayoutEffect, useRef } from "react";
import type { Placed } from "../layout";
import type { Theme } from "../themes";

interface Props {
  placed: Placed;
  theme: Theme;
  selected: boolean;
  editing: boolean;
  dropTarget: boolean;
  dragging: boolean;
  onMeasure: (id: string, w: number, h: number) => void;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onDoubleClick: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onToggleCollapse: (id: string) => void;
}

export function NodeView({
  placed,
  theme,
  selected,
  editing,
  dropTarget,
  dragging,
  onMeasure,
  onPointerDown,
  onDoubleClick,
  onCommitText,
  onCancelEdit,
  onToggleCollapse,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const { node, depth, color, side } = placed;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = { w: el.offsetWidth, h: el.offsetHeight };
    onMeasure(node.id, rect.w, rect.h);
  });

  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.textContent = node.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    const text = editRef.current?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    onCommitText(node.id, text || node.text);
  };

  const style: React.CSSProperties = {
    transform: `translate(${placed.x}px, ${placed.y}px)`,
  };
  if (depth === 0) {
    style.background = color;
    style.color = theme.rootText;
  } else if (depth === 1) {
    style.background = color;
    style.color = "#fff";
  } else {
    style.background = theme.leaf;
    style.color = theme.leafText;
    style.borderColor = color;
  }
  if (selected) style.boxShadow = `0 0 0 2px ${theme.canvas}, 0 0 0 4px #3b82f6`;
  if (dropTarget) style.boxShadow = `0 0 0 3px #22c55e`;
  if (dragging) style.opacity = 0.45;

  const hasChildren = node.children.length > 0;
  const togglePos: React.CSSProperties =
    side === "down"
      ? { left: "50%", bottom: -10, transform: "translateX(-50%)" }
      : side === "left"
        ? { left: -10, top: "50%", transform: "translateY(-50%)" }
        : { right: -10, top: "50%", transform: "translateY(-50%)" };

  return (
    <div
      ref={ref}
      className={`node depth-${Math.min(depth, 2)}${selected ? " selected" : ""}${editing ? " editing" : ""}`}
      style={style}
      data-node-id={node.id}
      onPointerDown={(e) => {
        if (editing) return;
        onPointerDown(e, node.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(node.id);
      }}
      title={node.note ? node.note : undefined}
    >
      {node.marker && <span className="node-marker">{node.marker}</span>}
      {editing ? (
        <div
          ref={editRef}
          className="node-edit"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelEdit();
            } else if (e.key === "Tab") {
              e.preventDefault();
              commit();
            }
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="node-text">{node.text}</span>
      )}
      {(node.note || node.link) && !editing && (
        <span className="node-badges">
          {node.note && <span title="Has a note">≡</span>}
          {node.link && (
            <a href={node.link} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} title={node.link}>
              ↗
            </a>
          )}
        </span>
      )}
      {hasChildren && (
        <button
          type="button"
          className={`collapse-toggle${node.collapsed ? " collapsed" : ""}`}
          style={{ ...togglePos, borderColor: depth === 0 ? theme.palette[0] : color, color: depth === 0 ? theme.palette[0] : color }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(node.id);
          }}
          title={node.collapsed ? `Expand ${placed.hidden} hidden` : "Collapse"}
        >
          {node.collapsed ? placed.hidden : "–"}
        </button>
      )}
    </div>
  );
}
