import type { MindMap, MindNode } from "@shared/model";
import type { EditorActions } from "../useMapEditor";
import { Icon, type IconName } from "./Icon";

interface Props {
  map: MindMap;
  node: MindNode | null;
  actions: EditorActions;
  onSticker: () => void;
  onStyle: () => void;
  onMore: () => void;
}

/** Thumb-reachable topic toolbar for phones. */
export function NodeToolbar({ map, node, actions, onSticker, onStyle, onMore }: Props) {
  const isRoot = node?.id === map.root.id;
  const target = node ?? map.root;
  const btn = (icon: IconName, label: string, onClick: () => void, opts: { disabled?: boolean; active?: boolean } = {}) => (
    <button type="button" disabled={opts.disabled} className={opts.active ? "active" : ""} onClick={onClick} title={label}>
      <Icon name={icon} size={21} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="node-toolbar" aria-label="Topic tools" onPointerDown={(e) => e.preventDefault()}>
      {btn("subtopic", "Subtopic", () => actions.addChild(target.id))}
      {btn("topic", "Topic", () => node && actions.addSibling(node.id), { disabled: !node || isRoot })}
      {btn("palette", "Style", onStyle)}
      {btn("smile", "Sticker", onSticker, { disabled: !node })}
      {btn("task", "Checkbox", () => node && actions.updateNode(node.id, { task: node.task ? null : "todo" }), { disabled: !node, active: Boolean(node?.task) })}
      {btn("more", "More", onMore, { disabled: !node })}
    </nav>
  );
}
