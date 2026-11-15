import type { MindMap, MindNode } from "@shared/model";
import type { EditorActions } from "../useMapEditor";

interface Props {
  map: MindMap;
  node: MindNode | null;
  actions: EditorActions;
  onDetails: () => void;
  onClaude: () => void;
}

/** Thumb-reachable bar at the bottom of the screen on phones. */
export function NodeActionBar({ map, node, actions, onDetails, onClaude }: Props) {
  const isRoot = node?.id === map.root.id;
  return (
    <nav className="action-bar" aria-label="Node actions">
      <button type="button" disabled={!node} onClick={() => node && actions.addChild(node.id)}>
        <span>＋</span>Child
      </button>
      <button type="button" disabled={!node || isRoot} onClick={() => node && actions.addSibling(node.id)}>
        <span>⇣</span>Sibling
      </button>
      <button type="button" disabled={!node} onClick={() => node && actions.startEditing(node.id)}>
        <span>✎</span>Rename
      </button>
      <button type="button" disabled={!node} onClick={onDetails}>
        <span>≡</span>Details
      </button>
      <button type="button" disabled={!node || isRoot} onClick={() => node && actions.deleteNode(node.id)} className="danger">
        <span>🗑</span>Delete
      </button>
      <button type="button" className="claude" onClick={onClaude}>
        <span>✦</span>Claude
      </button>
    </nav>
  );
}
