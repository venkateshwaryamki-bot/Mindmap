import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type MindMap,
  type MindNode,
  type NodePatch,
  addChildren,
  addSibling,
  deleteNode,
  findNode,
  findParent,
  moveNode,
  reorderChild,
  updateNode,
} from "@shared/model";
import { api, ApiError } from "./api";

export interface EditorState {
  map: MindMap | null;
  selectedId: string | null;
  editingId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  error: string | null;
}

const MAX_HISTORY = 200;

/**
 * Owns the open map: local edits, undo/redo, debounced saving with optimistic
 * concurrency, and merging of remote changes (from MCP clients or the Claude
 * assistant) that arrive through server-sent events.
 */
export function useMapEditor(mapId: string | null, onToast: (message: string) => void) {
  const [map, setMap] = useState<MindMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLen, setHistoryLen] = useState(0);
  const [futureLen, setFutureLen] = useState(0);

  const mapRef = useRef<MindMap | null>(null);
  const history = useRef<MindMap[]>([]);
  const future = useRef<MindMap[]>([]);
  const serverVersion = useRef(0);
  const dirty = useRef(false);
  const inflight = useRef(false);
  const pendingRemote = useRef<MindMap | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const commit = useCallback((next: MindMap | null) => {
    mapRef.current = next;
    setMap(next);
  }, []);

  // Load when the id changes.
  useEffect(() => {
    history.current = [];
    future.current = [];
    setHistoryLen(0);
    setFutureLen(0);
    dirty.current = false;
    pendingRemote.current = null;
    setSelectedId(null);
    setEditingId(null);
    setError(null);
    if (!mapId) {
      commit(null);
      return;
    }
    let cancelled = false;
    api
      .getMap(mapId)
      .then((loaded) => {
        if (cancelled) return;
        serverVersion.current = loaded.version;
        commit(loaded);
        setSelectedId(loaded.root.id);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, commit]);

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const current = mapRef.current;
    if (!current || !dirty.current || inflight.current) return;
    dirty.current = false;
    inflight.current = true;
    setSaving(true);
    try {
      const saved = await api.saveMap({ ...current, version: serverVersion.current }, serverVersion.current);
      serverVersion.current = saved.version;
      // Keep the local tree (the user may have typed more since), just adopt the version.
      if (mapRef.current && mapRef.current.id === saved.id) {
        mapRef.current = { ...mapRef.current, version: saved.version, updatedAt: saved.updatedAt };
        setMap(mapRef.current);
      }
      const remote = pendingRemote.current;
      pendingRemote.current = null;
      if (remote && remote.version > saved.version && !dirty.current) {
        serverVersion.current = remote.version;
        commit(remote);
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 404) && mapRef.current) {
        // Version conflict: someone else (MCP / Claude) changed the map. Reload it.
        try {
          const fresh = await api.getMap(mapRef.current.id);
          serverVersion.current = fresh.version;
          commit(fresh);
          onToast("The map was changed elsewhere; reloaded the latest version.");
        } catch {
          setError(e.message);
        }
      } else {
        setError((e as Error).message);
      }
    } finally {
      inflight.current = false;
      setSaving(false);
      if (dirty.current) scheduleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, onToast]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 450);
  }, [flushSave]);

  /** Apply a local mutation (recorded in undo history, saved shortly after). */
  const apply = useCallback(
    (fn: (current: MindMap) => MindMap) => {
      const current = mapRef.current;
      if (!current) return;
      let next: MindMap;
      try {
        next = fn(current);
      } catch (e) {
        onToast((e as Error).message);
        return;
      }
      if (next === current) return;
      history.current.push(current);
      if (history.current.length > MAX_HISTORY) history.current.shift();
      future.current = [];
      setHistoryLen(history.current.length);
      setFutureLen(0);
      dirty.current = true;
      commit(next);
      scheduleSave();
    },
    [commit, onToast, scheduleSave],
  );

  /** Accept a newer version of the map coming from the server (SSE / assistant). */
  const applyRemote = useCallback(
    (remote: MindMap) => {
      const current = mapRef.current;
      if (!current || current.id !== remote.id) return;
      if (remote.version <= serverVersion.current) return;
      if (inflight.current) {
        pendingRemote.current = remote;
        return;
      }
      if (dirty.current) {
        // Local unsaved edits exist; let the save attempt resolve the conflict.
        pendingRemote.current = remote;
        void flushSave();
        return;
      }
      serverVersion.current = remote.version;
      history.current.push(current);
      setHistoryLen(history.current.length);
      commit(remote);
      setSelectedId((sel) => (sel && findNode(remote.root, sel) ? sel : remote.root.id));
      setEditingId((ed) => (ed && findNode(remote.root, ed) ? ed : null));
    },
    [commit, flushSave],
  );

  const undo = useCallback(() => {
    const current = mapRef.current;
    const previous = history.current.pop();
    if (!current || !previous) return;
    future.current.push(current);
    setHistoryLen(history.current.length);
    setFutureLen(future.current.length);
    dirty.current = true;
    commit(previous);
    setSelectedId((sel) => (sel && findNode(previous.root, sel) ? sel : previous.root.id));
    scheduleSave();
  }, [commit, scheduleSave]);

  const redo = useCallback(() => {
    const current = mapRef.current;
    const next = future.current.pop();
    if (!current || !next) return;
    history.current.push(current);
    setHistoryLen(history.current.length);
    setFutureLen(future.current.length);
    dirty.current = true;
    commit(next);
    setSelectedId((sel) => (sel && findNode(next.root, sel) ? sel : next.root.id));
    scheduleSave();
  }, [commit, scheduleSave]);

  // Flush on unload so quick edits are not lost.
  useEffect(() => {
    const handler = () => {
      if (dirty.current && mapRef.current) {
        navigator.sendBeacon?.(
          `/api/maps/${mapRef.current.id}/beacon`,
          new Blob([JSON.stringify({ map: mapRef.current })], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  // ---- high level actions ---------------------------------------------------

  const actions = useMemo(
    () => ({
      select: (id: string | null) => setSelectedId(id),
      startEditing: (id: string) => {
        setSelectedId(id);
        setEditingId(id);
      },
      stopEditing: () => setEditingId(null),
      addChild: (parentId: string, text = "New idea") => {
        let createdId: string | null = null;
        apply((m) => {
          const result = addChildren(m, parentId, [{ text }]);
          createdId = result.created[0].id;
          return result.map;
        });
        if (createdId) {
          setSelectedId(createdId);
          setEditingId(createdId);
        }
        return createdId;
      },
      addSibling: (siblingId: string, text = "New idea") => {
        let createdId: string | null = null;
        apply((m) => {
          const result = addSibling(m, siblingId, { text });
          createdId = result.created.id;
          return result.map;
        });
        if (createdId) {
          setSelectedId(createdId);
          setEditingId(createdId);
        }
        return createdId;
      },
      updateNode: (id: string, patch: NodePatch) => apply((m) => updateNode(m, id, patch)),
      deleteNode: (id: string) => {
        const current = mapRef.current;
        if (!current) return;
        const parent = findParent(current.root, id);
        apply((m) => deleteNode(m, id));
        setSelectedId(parent?.id ?? current.root.id);
        setEditingId(null);
      },
      moveNode: (id: string, newParentId: string, index?: number) => apply((m) => moveNode(m, id, newParentId, index)),
      reorder: (id: string, delta: number) => apply((m) => reorderChild(m, id, delta)),
      toggleCollapse: (id: string) =>
        apply((m) => {
          const node = findNode(m.root, id);
          if (!node || node.children.length === 0) return m;
          return updateNode(m, id, { collapsed: !node.collapsed });
        }),
      setLayout: (layout: MindMap["layout"]) => apply((m) => ({ ...m, layout })),
      setTheme: (theme: string) => apply((m) => ({ ...m, theme })),
      rename: (title: string) => apply((m) => updateNode({ ...m, title }, m.root.id, { text: title })),
      replaceMap: (next: MindMap) => apply(() => next),
      undo,
      redo,
      applyRemote,
      flushSave,
    }),
    [apply, undo, redo, applyRemote, flushSave],
  );

  const selectedNode: MindNode | null = useMemo(
    () => (map && selectedId ? findNode(map.root, selectedId) ?? null : null),
    [map, selectedId],
  );

  const state: EditorState = {
    map,
    selectedId,
    editingId,
    canUndo: historyLen > 0,
    canRedo: futureLen > 0,
    saving,
    error,
  };

  return { state, selectedNode, actions };
}

export type EditorActions = ReturnType<typeof useMapEditor>["actions"];
