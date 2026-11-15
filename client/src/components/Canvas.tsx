import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MindMap } from "@shared/model";
import { findNode, isDescendant } from "@shared/model";
import { layoutMap, type LayoutResult, type Size } from "../layout";
import type { Theme } from "../themes";
import type { EditorActions } from "../useMapEditor";
import { NodeView } from "./NodeView";
import { Icon } from "./Icon";
import { renderSvg } from "../export/svg";

interface Props {
  map: MindMap;
  theme: Theme;
  selectedId: string | null;
  editingId: string | null;
  actions: EditorActions;
  onLayout?: (layout: LayoutResult) => void;
  viewRef: React.MutableRefObject<CanvasHandle | null>;
  /** Study modes: quiz masks topics until tapped, present hides them until shown. */
  study?: { mode: "quiz" | "present"; visible: Set<string>; onReveal?: (id: string) => void } | null;
  /** Floating zoom controls (and a map overview on large screens). */
  controls?: "desktop" | "mobile" | null;
  onClaude?: () => void;
}

export interface CanvasHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
  center: () => void;
  getLayout: () => LayoutResult | null;
  /** Animate the camera to fit these topics. */
  focusOn: (ids: string[], maxScale?: number) => void;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

export function Canvas({ map, theme, selectedId, editingId, actions, onLayout, viewRef, study, controls, onClaude }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Map<string, Size>>(new Map());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [animating, setAnimating] = useState(false);
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
    const focusOn = (ids: string[], maxScale = 1.2) => {
      const el = containerRef.current;
      const l = layoutRef.current;
      if (!el) return;
      const ps = ids.map((id) => l.byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      if (!ps.length) return;
      const minX = Math.min(...ps.map((p) => p.x));
      const minY = Math.min(...ps.map((p) => p.y));
      const maxX = Math.max(...ps.map((p) => p.x + p.w));
      const maxY = Math.max(...ps.map((p) => p.y + p.h));
      const pad = 70;
      const scale = Math.min(maxScale, Math.max(MIN_SCALE, Math.min(el.clientWidth / (maxX - minX + pad * 2), el.clientHeight / (maxY - minY + pad * 2))));
      setAnimating(true);
      setView({ scale, x: el.clientWidth / 2 - ((minX + maxX) / 2) * scale, y: el.clientHeight / 2 - ((minY + maxY) / 2) * scale });
      window.setTimeout(() => setAnimating(false), 420);
    };
    viewRef.current = { fit, zoomBy, center, getLayout: () => layoutRef.current, focusOn };
  }, [fit, zoomBy, center, viewRef]);

  // Fit once per map after the first measured layout.
  useEffect(() => {
    if (fittedFor.current === map.id) return;
    if (sizes.size === 0) return;
    const t = window.setTimeout(() => {
      fittedFor.current = map.id;
      fit();
      // Small screens: never open a map too small to read; centre the central topic instead.
      window.setTimeout(() => {
        const el = containerRef.current;
        const root = layoutRef.current.byId.get(map.root.id);
        if (el && root && el.clientWidth < 700 && viewState.current.scale < 0.5) {
          const scale = 0.65;
          setView({ scale, x: el.clientWidth / 2 - (root.x + root.w / 2) * scale, y: el.clientHeight * 0.42 - (root.y + root.h / 2) * scale });
        }
      }, 40);
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

  // ---- pointer: pan background / drag node / pinch zoom -------------------
  //
  // Mouse: drag background to pan, drag a node onto another to move it.
  // Touch: one finger pans (also when it starts on a node), two fingers pinch-zoom,
  //        double-tap a node to rename, long-press a node then drag to move it.
  const pointer = useRef<{
    kind: "pan" | "node";
    id?: string;
    touch: boolean;
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
    moved: boolean;
    /** Touch only: long-press elapsed, node drag is armed. */
    armed: boolean;
  } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; midX: number; midY: number; view: View } | null>(null);
  const longPress = useRef<number | undefined>(undefined);
  const lastTap = useRef<{ id: string; time: number } | null>(null);

  const clearLongPress = () => {
    window.clearTimeout(longPress.current);
    longPress.current = undefined;
  };

  const startPinch = () => {
    const pts = [...touches.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const rect = containerRef.current!.getBoundingClientRect();
    pinch.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
      view: viewState.current,
    };
    // A second finger cancels any pan / node drag in progress.
    pointer.current = null;
    clearLongPress();
    setDrag(null);
  };

  const onPointerDownCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) startPinch();
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (pinch.current) return;
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest("[data-node-id]")) return;
    pointer.current = {
      kind: "pan",
      touch: e.pointerType === "touch",
      startX: e.clientX,
      startY: e.clientY,
      viewX: view.x,
      viewY: view.y,
      moved: false,
      armed: false,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (pinch.current) return;
    actions.select(id);
    if (editingId && editingId !== id) actions.stopEditing();
    const touch = e.pointerType === "touch";
    pointer.current = { kind: "node", id, touch, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y, moved: false, armed: !touch };
    containerRef.current?.setPointerCapture(e.pointerId);
    if (touch && id !== map.root.id) {
      clearLongPress();
      longPress.current = window.setTimeout(() => {
        const p = pointer.current;
        if (!p || p.id !== id || p.moved) return;
        p.armed = true;
        navigator.vibrate?.(15);
        setDrag({ id, x: p.startX, y: p.startY, target: null });
      }, 420);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pz = pinch.current;
      if (pz && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const rect = containerRef.current!.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const midX = (a.x + b.x) / 2 - rect.left;
        const midY = (a.y + b.y) / 2 - rect.top;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pz.view.scale * (dist / pz.dist)));
        // Keep the world point that was under the starting midpoint under the fingers.
        const wx = (pz.midX - pz.view.x) / pz.view.scale;
        const wy = (pz.midY - pz.view.y) / pz.view.scale;
        setView({ scale, x: midX - wx * scale, y: midY - wy * scale });
        return;
      }
    }
    const p = pointer.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    const distance = Math.abs(dx) + Math.abs(dy);

    // Touch on a node without a long-press: treat the gesture as a pan.
    if (p.kind === "node" && p.touch && !p.armed && distance > 8) {
      clearLongPress();
      p.kind = "pan";
    }
    if (p.kind === "pan") {
      if (distance > 3) p.moved = true;
      setView((v) => ({ ...v, x: p.viewX + dx, y: p.viewY + dy }));
      return;
    }
    if (!p.moved && distance > 6) {
      if (p.id === map.root.id) return; // root cannot be moved
      p.moved = true;
    }
    if (p.id && p.armed && (p.moved || p.touch)) {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]") as HTMLElement | null;
      let target = under?.dataset.nodeId ?? null;
      if (target && (target === p.id || isDescendant(map.root, p.id, target))) target = null;
      setDrag({ id: p.id, x: e.clientX, y: e.clientY, target });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
    }
    clearLongPress();
    const p = pointer.current;
    pointer.current = null;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
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
    } else if (p.touch && !p.moved && !p.armed && p.id) {
      // Double-tap to rename (browsers do not reliably fire dblclick for touch).
      const now = Date.now();
      if (lastTap.current && lastTap.current.id === p.id && now - lastTap.current.time < 350) {
        lastTap.current = null;
        actions.startEditing(p.id);
      } else {
        lastTap.current = { id: p.id, time: now };
      }
    }
    setDrag(null);
  };

  const dragNode = drag ? findNode(map.root, drag.id) : null;
  // Stable handler so memoised topics don't re-render on every pan frame.
  const nodeDownRef = useRef(onNodePointerDown);
  nodeDownRef.current = onNodePointerDown;
  const stableNodeDown = useCallback((e: React.PointerEvent, id: string) => nodeDownRef.current(e, id), []);
  const commitText = useCallback(
    (id: string, text: string) => {
      actions.updateNode(id, { text });
      actions.stopEditing();
    },
    [actions],
  );

  return (
    <div
      ref={containerRef}
      className={`canvas${theme.dark ? " dark" : ""}${drag ? " dragging" : ""}${animating ? " animating" : ""}`}
      style={{
        backgroundColor: theme.canvas,
        backgroundImage: theme.dots ? `radial-gradient(${theme.dots} 1.2px, transparent 1.2px)` : "none",
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDownCapture={onPointerDownCapture}
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
          {layout.edges.map((edge) =>
            study?.mode === "present" && edge.toId && !study.visible.has(edge.toId) ? null : (
              <path
                key={edge.key}
                d={edge.path}
                stroke={edge.color}
                strokeWidth={edge.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
            ),
          )}
        </svg>
        {layout.nodes.map((placed) => (
          <NodeView
            key={placed.id}
            placed={placed}
            theme={theme}
            selected={placed.id === selectedId && !study}
            editing={placed.id === editingId}
            dropTarget={drag?.target === placed.id}
            dragging={drag?.id === placed.id}
            study={
              !study || placed.depth === 0 || study.visible.has(placed.id)
                ? "normal"
                : study.mode === "quiz"
                  ? "masked"
                  : "hidden"
            }
            onMeasure={onMeasure}
            onPointerDown={stableNodeDown}
            onDoubleClick={actions.startEditing}
            onCommitText={commitText}
            onCancelEdit={actions.stopEditing}
            onToggleCollapse={actions.toggleCollapse}
            onToggleTask={actions.toggleTask}
            onReveal={study?.onReveal}
          />
        ))}
      </div>
      {drag && dragNode && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {dragNode.text}
          <small>{drag.target ? "Drop to move here" : "Drag onto a node"}</small>
        </div>
      )}
      {controls === "desktop" && <Overview map={map} theme={theme} layout={layout} view={view} containerRef={containerRef} onFit={fit} />}
      {controls && (
        <div className={`zoom-controls ${controls}`} onPointerDown={(e) => e.stopPropagation()}>
          {onClaude && (
            <button type="button" className="zc-ai" onClick={onClaude} aria-label="Claude assistant" title="Claude assistant (Ctrl+K)">
              <Icon name="sparkles" size={controls === "mobile" ? 22 : 18} />
            </button>
          )}
          <button type="button" onClick={fit} aria-label="Fit to screen" title="Fit to screen (Ctrl+0)">
            <Icon name="fit" size={18} />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out">
            <Icon name="zoomOut" size={18} />
          </button>
          {controls === "desktop" && <span className="zc-pct">{Math.round(view.scale * 100)}%</span>}
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">
            <Icon name="zoomIn" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Small overview of the whole map with the visible area outlined (large screens). */
function Overview({
  map,
  theme,
  layout,
  view,
  containerRef,
  onFit,
}: {
  map: MindMap;
  theme: Theme;
  layout: LayoutResult;
  view: View;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onFit: () => void;
}) {
  const W = 180;
  const H = 110;
  const pad = 30;
  const { svg, width, height } = useMemo(() => renderSvg(map, layout, theme, { padding: pad }), [map, layout, theme]);
  const el = containerRef.current;
  if (!el || !isFinite(layout.bounds.minX)) return null;
  const s = Math.min(W / width, H / height);
  const ox = (W - width * s) / 2;
  const oy = (H - height * s) / 2;
  const toX = (wx: number) => ox + (wx - layout.bounds.minX + pad) * s;
  const toY = (wy: number) => oy + (wy - layout.bounds.minY + pad) * s;
  const vx = toX(-view.x / view.scale);
  const vy = toY(-view.y / view.scale);
  const vw = (el.clientWidth / view.scale) * s;
  const vh = (el.clientHeight / view.scale) * s;
  return (
    <button type="button" className="overview" onPointerDown={(e) => e.stopPropagation()} onClick={onFit} title="Fit to screen">
      <div className="overview-map" style={{ width: width * s, height: height * s, left: ox, top: oy }} dangerouslySetInnerHTML={{ __html: svg.replace(/^<svg /, '<svg width="100%" height="100%" preserveAspectRatio="none" ') }} />
      <span className="overview-view" style={{ left: Math.max(0, vx), top: Math.max(0, vy), width: Math.min(W, vw), height: Math.min(H, vh) }} />
    </button>
  );
}
