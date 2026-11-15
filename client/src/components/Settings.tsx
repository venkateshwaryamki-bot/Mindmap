import { type ReactNode, useState } from "react";
import { LAYOUTS, type LayoutMode } from "@shared/model";
import { type Health, STANDALONE } from "../api";
import { getApiKey, setApiKey } from "../backend/local";
import type { Prefs } from "../prefs";
import { THEMES } from "../themes";
import { useInstallPrompt } from "../useInstallPrompt";
import { Icon, type IconName } from "./Icon";
import { LAYOUT_LABELS } from "./MarkdownDialog";
import { Segmented, Sheet } from "./ui";

interface Props {
  prefs: Prefs;
  update: (patch: Partial<Prefs>) => void;
  health: Health | null;
  mapCount: number;
  onBackupAll: () => void;
  onImport: () => void;
  onHealthChange: () => void;
  onSignOut?: () => void;
}

const SHORTCUTS: [string, string][] = [
  ["Tab", "Add subtopic"],
  ["Enter", "Add topic (sibling)"],
  ["Ctrl + Enter", "Add parent topic"],
  ["F2 / start typing", "Rename topic"],
  ["Space", "Collapse / expand"],
  ["Delete", "Delete topic"],
  ["Arrow keys", "Move between topics"],
  ["Ctrl + ↑ / ↓", "Reorder topic"],
  ["Ctrl + 1…6", "Set priority"],
  ["Ctrl + B / I", "Bold / italic"],
  ["Ctrl + C / X / V", "Copy, cut, paste branch or Markdown"],
  ["Ctrl + Z / Y", "Undo / redo"],
  ["Ctrl + Shift + O", "Outline view"],
  ["Ctrl + E", "Export & share"],
  ["Ctrl + K", "Claude assistant"],
  ["Ctrl + 0", "Fit to screen"],
];

const TIPS: [string, string][] = [
  ["Paste Markdown", "Copy notes or an outline from ChatGPT, Notion or Obsidian and paste them on the canvas — they become topics under the selected one."],
  ["Outline view", "Type fast as a list: Enter adds a topic, Tab indents, Shift+Tab outdents. Switch back to see it as a map."],
  ["Revise actively", "Use Quiz to hide topics and recall them, or Flashcards to drill each branch. Present walks through the map step by step."],
  ["Track your syllabus", "Add checkboxes to topics. Each branch shows a % and the Progress filter lists maps you're working through."],
  ["Phone gestures", "Pinch to zoom, drag to pan, double-tap to rename, press and hold to move a topic."],
  ["Back up", "Settings → Back up all maps saves everything to one file; Import restores it on any device."],
];

function Row({ icon, label, detail, onClick, children }: { icon: IconName; label: string; detail?: ReactNode; onClick?: () => void; children?: ReactNode }) {
  const body = (
    <>
      <span className="row-icon">
        <Icon name={icon} size={19} />
      </span>
      <span className="row-label">{label}</span>
      {detail && <span className="row-detail">{detail}</span>}
      {children}
      {onClick && <Icon name="chevronRight" size={16} className="row-chevron" />}
    </>
  );
  return onClick ? (
    <button type="button" className="set-row" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="set-row">{body}</div>
  );
}

export function Settings({ prefs, update, health, mapCount, onBackupAll, onImport, onHealthChange, onSignOut }: Props) {
  const [key, setKey] = useState(getApiKey());
  const [keyOpen, setKeyOpen] = useState(false);
  const [sheet, setSheet] = useState<"shortcuts" | "tips" | null>(null);
  const install = useInstallPrompt();
  const aiReady = STANDALONE ? Boolean(getApiKey()) : Boolean(health?.ai);

  return (
    <div className="page settings">
      <header className="lib-header">
        <h1>Settings</h1>
      </header>
      <div className="lib-scroll">
        <div className="profile-card">
          <span className="brand-mark big" aria-hidden />
          <div>
            <div className="profile-name">My MindFlow</div>
            <div className="profile-meta">
              {mapCount} map{mapCount === 1 ? "" : "s"} · {STANDALONE ? "saved on this phone" : "saved on your MindFlow server"}
            </div>
          </div>
        </div>

        <div className="set-group">
          <Row icon={prefs.appearance === "dark" ? "moon" : "sun"} label="Appearance">
            <Segmented
              value={prefs.appearance}
              onChange={(appearance) => update({ appearance })}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "Auto" },
              ]}
            />
          </Row>
          <Row icon="layout" label="New map structure">
            <select value={prefs.defaultLayout} onChange={(e) => update({ defaultLayout: e.target.value as LayoutMode })}>
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {LAYOUT_LABELS[l]}
                </option>
              ))}
            </select>
          </Row>
          <Row icon="theme" label="New map theme">
            <select value={prefs.defaultTheme} onChange={(e) => update({ defaultTheme: e.target.value })}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Row>
        </div>

        <div className="set-group">
          {STANDALONE ? (
            <Row icon="sparkles" label="Claude AI" detail={aiReady ? "Connected" : "Add key"} onClick={() => setKeyOpen((v) => !v)} />
          ) : (
            <Row icon="sparkles" label="Claude AI" detail={aiReady ? `Ready · ${health?.model}` : "Server key not set"} />
          )}
          {STANDALONE && keyOpen && (
            <div className="set-expand">
              <p className="muted small">Paste an Anthropic API key from platform.claude.com. It stays on this phone and is only sent to Claude.</p>
              <input type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} />
              <div className="form-actions">
                {getApiKey() && (
                  <button type="button" className="btn" onClick={() => (setApiKey(""), setKey(""), onHealthChange())}>
                    Remove
                  </button>
                )}
                <button type="button" className="btn primary" disabled={!key.trim()} onClick={() => (setApiKey(key), onHealthChange(), setKeyOpen(false))}>
                  Save key
                </button>
              </div>
            </div>
          )}
          {!STANDALONE && health?.mcp.http && <Row icon="link" label="MCP endpoint" detail="/mcp" />}
        </div>

        <div className="set-group">
          <Row icon="backup" label="Back up all maps" onClick={onBackupAll} />
          <Row icon="upload" label="Import / restore" detail="XMind · OPML · MD" onClick={onImport} />
          {!STANDALONE && install.canInstall && <Row icon="download" label="Install app on this device" onClick={install.onInstall} />}
          {!STANDALONE && install.iosHint && <Row icon="download" label="Install on iPhone" detail="Share → Add to Home Screen" />}
        </div>

        <div className="set-group">
          <Row icon="help" label="Tips for studying with MindFlow" onClick={() => setSheet("tips")} />
          {!STANDALONE && <Row icon="key" label="Keyboard shortcuts" onClick={() => setSheet("shortcuts")} />}
          <Row icon="info" label="About MindFlow" detail="Version 3.1" />
          {onSignOut && <Row icon="user" label="Sign out" onClick={onSignOut} />}
        </div>
        <p className="muted small center">No ads · no watermarks · every export free</p>
      </div>

      <Sheet open={sheet === "shortcuts"} onClose={() => setSheet(null)} title="Keyboard shortcuts">
        <div className="shortcut-list">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === "tips"} onClose={() => setSheet(null)} title="Tips">
        <div className="tips">
          {TIPS.map(([t, d]) => (
            <div key={t} className="tip">
              <strong>{t}</strong>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
