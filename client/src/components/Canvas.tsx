import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MindMap } from "@shared/model";
import { findNode, isDescendant } from "@shared/model";
import { layoutMap, type LayoutResult, type Size } from "../layout";
import type { Theme } from "../themes";
import type { EditorActions } from "../useMapEditor";
import { NodeView } from "./NodeView";

interface Props {
  map: MindMap;
  theme: Theme;
  selectedId: string | null;
  editingId: string | null;
  actions: EditorActions;
  onLayout?: (layout: LayoutResult) => void;
  viewRef: React.MutableRefObject<CanvasHandle | null>;
}

export interface CanvasHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
  center: () => void;
  getLayout: () => LayoutResult | null;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

export function Canvas({ map, theme, selectedId, editingId, actions, onLayout, viewRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Map<string, Size>>(new Map());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const viewState = useRef(view);
  viewState.current = view;
  const fittedFor = useRef<string | null>(null);

  const layout = useMemo(() => layoutMap(map, sizes, theme), [map, sizes, theme]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    onLayout?.(layout);
  }, [layout, onLayout]);

  const onMeasure = useCallback((id: string, w: number, h: number) => {
    setSizes((prev) => {
      const old = prev.get(id);
      if (old && Math.abs(old.w - w) < 0.5 && Math.abs(old.h - h) < 0.5) return prev;
      const next = new Map(prev);
      next.set(id, { w, h });
      return next;
    });
  }, []);

  const fit = useCallback(() => {
    const el = containerRef.current;
    const l = layoutRef.current;
    if (!el || !isFinite(l.bounds.minX)) return;
    const pad = 80;
    const bw = l.bounds.maxX - l.bounds.minX + pad * 2;
    const bh = l.bounds.maxY - l.bounds.minY + pad * 2;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(el.clientWidth / bw, el.clientHeight / bh, 1.4)));
    const cx = (l.bounds.minX + l.bounds.maxX) / 2;
    const cy = (l.bounds.minY + l.bounds.maxY) / 2;
    setView({ x: el.clientWidth / 2 - cx * scale, y: el.clientHeight / 2 - cy * scale, scale });
  }, []);

  const center = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setView((v) => ({ ...v, x: el.clientWidth / 2, y: el.clientHeight / 2 }));
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    viewRef.current = { fit, zoomBy, center, getLayout: () => layoutRef.current };
  }, [fit, zoomBy, center, viewRef]);

  // Fit once per map after the first measured layout.
  useEffect(() => {
    if (fittedFor.current === map.id) return;
    if (sizes.size === 0) return;
    const t = window.setTimeout(() => {
      fittedFor.current = map.id;
      fit();
    }, 30);
    return () => window.clearTimeout(t);
  }, [map.id, sizes, fit]);

  // Re-fit when the layout mode changes (the shape of the map changes completely).
  const lastLayoutMode = useRef(map.layout);
  useEffect(() => {
    if (lastLayoutMode.current === map.layout) return;
    lastLayoutMode.current = map.layout;
    const t = window.setTimeout(fit, 60);
    return () => window.clearTimeout(t);
  }, [map.layout, fit]);

  // Keep the selected node in view when it would be off-screen (e.g. keyboard navigation).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !selectedId) return;
    const p = layout.byId.get(selectedId);
    if (!p) return;
    const v = viewState.current;
    const sx = p.x * v.scale + v.x;
    const sy = p.y * v.scale + v.y;
    const sw = p.w * v.scale;
    const sh = p.h * v.scale;
    const margin = 24;
    let dx = 0;
    let dy = 0;
    if (sx < margin) dx = margin - sx;
    else if (sx + sw > el.clientWidth - margin) dx = el.clientWidth - margin - (sx + sw);
    if (sy < margin) dy = margin - sy;
    else if (sy + sh > el.clientHeight - margin) dy = el.clientHeight - margin - (sy + sh);
    if (dx || dy) setView((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
  }, [selectedId, layout]);

  // ---- wheel: pan, ctrl+wheel: zoom -------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        setView((v) => {
          const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
          const k = scale / v.scale;
          return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
        });
      } else {
        const mult = e.deltaMode === 1 ? 16 : 1;
        setView((v) => ({ ...v, x: v.x - e.deltaX * mult, y: v.y - e.deltaY * mult }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- pointer: pan background / drag node --------------------------------
  const pointer = useRef<{
    kind: "pan" | "node";
    id?: string;
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
    moved: boolean;
  } | null>(null);

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest("[data-node-id]")) return;
    pointer.current = { kind: "pan", startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    actions.select(id);
    if (editingId && editingId !== id) actions.stopEditing();
    pointer.current = { kind: "node", id, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y, moved: false };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (p.kind === "pan") {
      if (Math.abs(dx) + Math.abs(dy) > 2) p.moved = true;
      setView((v) => ({ ...v, x: p.viewX + dx, y: p.viewY + dy }));
      return;
    }
    if (!p.moved && Math.abs(dx) + Math.abs(dy) > 6) {
      if (p.id === map.root.id) return; // root cannot be moved
      p.moved = true;
    }
    if (p.moved && p.id) {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]") as HTMLElement | null;
      let target = under?.dataset.nodeId ?? null;
      if (target && (target === p.id || isDescendant(map.root, p.id, target))) target = null;
      setDrag({ id: p.id, x: e.clientX, y: e.clientY, target });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!p) return;
    if (p.kind === "pan") {
      if (!p.moved) {
        actions.select(null);
        if (editingId) actions.stopEditing();
      }
      return;
    }
    if (p.moved && drag?.target && p.id) {
      actions.moveNode(p.id, drag.target);
    }
    setDrag(null);
  };

  const dragNode = drag ? findNode(map.root, drag.id) : null;

  return (
    <div
      ref={containerRef}
      className={`canvas${theme.dark ? " dark" : ""}${drag ? " dragging" : ""}`}
      style={{ background: theme.canvas, backgroundImage: `radial-gradient(${theme.dots} 1px, transparent 1px)`, backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-node-id]")) return;
        fit();
      }}
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg className="edges" width="1" height="1" style={{ overflow: "visible" }}>
          {layout.edges.map((edge) => (
            <path
              key={edge.to.id}
              d={edge.path}
              stroke={edge.color}
              strokeWidth={edge.to.depth === 1 ? 3 : 2}
              fill="none"
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
        </svg>
        {layout.nodes.map((placed) => (
          <NodeView
            key={placed.id}
            placed={placed}
            theme={theme}
            selected={placed.id === selectedId}
            editing={placed.id === editingId}
            dropTarget={drag?.target === placed.id}
            dragging={drag?.id === placed.id}
            onMeasure={onMeasure}
            onPointerDown={onNodePointerDown}
            onDoubleClick={(id) => actions.startEditing(id)}
            onCommitText={(id, text) => {
              actions.updateNode(id, { text });
              actions.stopEditing();
            }}
            onCancelEdit={() => actions.stopEditing()}
            onToggleCollapse={(id) => actions.toggleCollapse(id)}
          />
        ))}
      </div>
      {drag && dragNode && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {dragNode.text}
          <small>{drag.target ? "Drop to move here" : "Drag onto a node"}</small>
        </div>
      )}
      <div className="zoom-badge">{Math.round(view.scale * 100)}%</div>
    </div>
  );
}
