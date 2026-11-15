import { memo, useLayoutEffect, useRef } from "react";
import { taskProgress } from "@shared/model";
import { maxWidthFor, type Placed } from "../layout";
import type { Theme } from "../themes";

export type StudyState = "normal" | "masked" | "hidden" | "dimmed";

interface Props {
  placed: Placed;
  theme: Theme;
  selected: boolean;
  editing: boolean;
  dropTarget: boolean;
  dragging: boolean;
  study: StudyState;
  onMeasure: (id: string, w: number, h: number) => void;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onDoubleClick: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onToggleCollapse: (id: string) => void;
  onToggleTask: (id: string) => void;
  onReveal?: (id: string) => void;
}

function NodeViewImpl({
  placed,
  theme,
  selected,
  editing,
  dropTarget,
  dragging,
  study,
  onMeasure,
  onPointerDown,
  onDoubleClick,
  onCommitText,
  onCancelEdit,
  onToggleCollapse,
  onToggleTask,
  onReveal,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const { node, depth, color, side, visual: v } = placed;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(node.id, el.offsetWidth, el.offsetHeight);
  });

  // Focus inside the tap/click gesture so the phone keyboard opens.
  useLayoutEffect(() => {
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
    background: v.fill,
    color: v.text,
    fontSize: v.fontSize,
    fontWeight: v.fontWeight,
    fontStyle: v.italic ? "italic" : undefined,
    fontFamily: v.font,
    padding: `${v.padY}px ${v.padX}px`,
    borderRadius: v.radius,
    maxWidth: maxWidthFor(depth),
  };
  if (v.underline) {
    style.border = "none";
    style.borderBottom = `${depth === 1 ? 3 : 2}px solid ${v.border}`;
  } else {
    style.border = `${v.borderWidth}px solid ${v.border}`;
  }
  const ring = theme.dark ? "#93c5fd" : "#2563eb";
  if (selected) style.boxShadow = `0 0 0 2px ${theme.canvas}, 0 0 0 4px ${ring}`;
  if (dropTarget) style.boxShadow = `0 0 0 3px #22c55e`;
  if (dragging) style.opacity = 0.4;

  const progress = node.children.length ? taskProgress(node) : { done: 0, total: 0 };
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : null;

  const hasChildren = node.children.length > 0;
  const togglePos: React.CSSProperties =
    side === "down" || side === "radial"
      ? { left: "50%", bottom: -11, transform: "translateX(-50%)" }
      : side === "up"
        ? { left: "50%", top: -11, transform: "translateX(-50%)" }
        : side === "left"
          ? { left: -11, top: "50%", transform: "translateY(-50%)" }
          : { right: -11, top: "50%", transform: "translateY(-50%)" };

  const imgMax = maxWidthFor(depth) - v.padX * 2;
  const imgW = node.image ? Math.min(node.image.w, imgMax) : 0;
  const imgH = node.image ? Math.round((node.image.h * imgW) / node.image.w) : 0;

  return (
    <div
      ref={ref}
      className={`node depth-${Math.min(depth, 2)}${selected ? " selected" : ""}${editing ? " editing" : ""}${
        study !== "normal" ? ` study-${study}` : ""
      }${node.task === "done" ? " done" : ""}`}
      style={style}
      data-node-id={node.id}
      onPointerDown={(e) => {
        if (editing) return;
        if (study === "masked") {
          e.stopPropagation();
          onReveal?.(node.id);
          return;
        }
        onPointerDown(e, node.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (study === "normal") onDoubleClick(node.id);
      }}
    >
      {node.image && (
        <img className="node-image" src={node.image.src} width={imgW} height={imgH} alt="" draggable={false} />
      )}
      <div className="node-row">
        {node.task && (
          <button
            type="button"
            className={`node-check${node.task === "done" ? " on" : ""}`}
            style={{ borderColor: node.task === "done" ? "#16a34a" : "currentColor" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleTask(node.id);
            }}
            aria-label={node.task === "done" ? "Mark as not done" : "Mark as done"}
          >
            {node.task === "done" ? "✓" : ""}
          </button>
        )}
        {node.priority && (
          <span className="node-prio" style={{ background: depth === 1 && v.fill === color ? "#ffffff" : color, color: depth === 1 && v.fill === color ? color : "#fff" }}>
            {node.priority}
          </span>
        )}
        {node.marker && <span className="node-marker">{node.marker}</span>}
        {editing ? (
          <div
            ref={editRef}
            className="node-edit"
            contentEditable
            suppressContentEditableWarning
            spellCheck
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
        {pct !== null && !editing && (
          <span className="node-progress" title={`${progress.done} of ${progress.total} done`}>
            {pct}%
          </span>
        )}
        {(node.note || node.link) && !editing && (
          <span className="node-badges">
            {node.note && <span title={node.note}>📝</span>}
            {node.link && (
              <a href={node.link} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} title={node.link}>
                🔗
              </a>
            )}
          </span>
        )}
      </div>
      {hasChildren && study === "normal" && (
        <button
          type="button"
          className={`collapse-toggle${node.collapsed ? " collapsed" : ""}`}
          style={{ ...togglePos, borderColor: depth === 0 ? theme.palette[0] : color, color: depth === 0 ? theme.palette[0] : color, background: theme.canvas }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(node.id);
          }}
          title={node.collapsed ? `Show ${placed.hidden} hidden` : "Collapse"}
        >
          {node.collapsed ? placed.hidden : "–"}
        </button>
      )}
    </div>
  );
}

export const NodeView = memo(NodeViewImpl);
