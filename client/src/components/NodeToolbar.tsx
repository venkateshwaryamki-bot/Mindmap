import type { MindMap, MindNode } from "@shared/model";
import type { EditorActions } from "../useMapEditor";

interface Props {
  map: MindMap;
  node: MindNode | null;
  actions: EditorActions;
  onSticker: () => void;
  onStyle: () => void;
  onImage: () => void;
  onNote: () => void;
  onMore: () => void;
  onClaude: () => void;
}

/** Thumb-reachable topic toolbar, NiceMind style. Scrolls sideways on small phones. */
export function NodeToolbar({ map, node, actions, onSticker, onStyle, onImage, onNote, onMore, onClaude }: Props) {
  const isRoot = node?.id === map.root.id;
  const btn = (icon: string, label: string, onClick: () => void, opts: { disabled?: boolean; cls?: string; active?: boolean } = {}) => (
    <button type="button" disabled={opts.disabled} className={`${opts.cls ?? ""}${opts.active ? " active" : ""}`} onClick={onClick} title={label}>
      <span className="tb-icon">{icon}</span>
      <span className="tb-label">{label}</span>
    </button>
  );
  return (
    <nav className="node-toolbar" aria-label="Topic tools" onPointerDown={(e) => e.preventDefault()}>
      {btn("＋", "Child", () => node && actions.addChild(node.id), { disabled: !node })}
      {btn("⇣", "Sibling", () => node && actions.addSibling(node.id), { disabled: !node || isRoot })}
      {btn("✎", "Rename", () => node && actions.startEditing(node.id), { disabled: !node })}
      {btn("☑", "Checkbox", () => node && actions.updateNode(node.id, { task: node.task ? null : "todo" }), { disabled: !node, active: Boolean(node?.task) })}
      {btn("😀", "Sticker", onSticker, { disabled: !node })}
      {btn("🎨", "Style", onStyle, { disabled: !node })}
      {btn("🖼", "Image", onImage, { disabled: !node })}
      {btn("📝", "Note", onNote, { disabled: !node })}
      {btn("✦", "Claude", onClaude, { cls: "claude" })}
      {btn("⋯", "More", onMore, { disabled: !node })}
    </nav>
  );
}
