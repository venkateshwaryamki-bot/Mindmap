import { useRef } from "react";
import type { MapSummary } from "@shared/model";

interface Props {
  maps: MapSummary[];
  currentId: string | null;
  connected: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onImport: (file: File) => void;
}

export function Sidebar({ maps, currentId, connected, onSelect, onNew, onDelete, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" />
        <span>MindFlow</span>
        <span className={`live-dot${connected ? " on" : ""}`} title={connected ? "Live sync connected" : "Live sync offline"} />
      </div>
      <div className="sidebar-actions">
        <button type="button" className="primary" onClick={onNew}>
          + New map
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} title="Import .md outline or .json">
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,.markdown,.json,.opml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
      </div>
      <ul className="map-list">
        {maps.map((m) => (
          <li key={m.id} className={m.id === currentId ? "active" : ""}>
            <button type="button" className="map-item" onClick={() => onSelect(m.id)}>
              <span className="map-title">{m.title}</span>
              <span className="map-meta">
                {m.nodeCount} nodes · {timeAgo(m.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              className="icon danger"
              title="Delete map"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(m.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
        {maps.length === 0 && <li className="empty">No maps yet</li>}
      </ul>
      <div className="sidebar-foot">
        <a href="/mcp" onClick={(e) => e.preventDefault()} title="MCP endpoint for Claude Desktop / Claude Code">
          MCP: <code>/mcp</code>
        </a>
      </div>
    </aside>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
