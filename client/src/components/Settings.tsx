import { useState } from "react";
import { LAYOUTS, type LayoutMode } from "@shared/model";
import { type Health, STANDALONE } from "../api";
import { getApiKey, setApiKey } from "../backend/local";
import type { Prefs } from "../prefs";
import { THEMES } from "../themes";
import { LAYOUT_LABELS } from "./MarkdownDialog";
import { Segmented } from "./ui";
import { useInstallPrompt } from "../useInstallPrompt";

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
  ["Tab", "Add child topic"],
  ["Enter", "Add sibling topic"],
  ["Ctrl + Enter", "Add parent topic"],
  ["F2 / type", "Rename topic"],
  ["Space", "Collapse / expand"],
  ["Delete", "Delete topic"],
  ["Arrow keys", "Move between topics"],
  ["Ctrl + ↑ / ↓", "Reorder topic"],
  ["Ctrl + 1…6", "Set priority"],
  ["Ctrl + B / I", "Bold / italic"],
  ["Ctrl + C / X / V", "Copy, cut, paste branch or Markdown"],
  ["Ctrl + Z / Y", "Undo / redo"],
  ["Ctrl + Shift + O", "Outline mode"],
  ["Ctrl + E", "Export"],
  ["Ctrl + K", "Claude assistant"],
  ["Ctrl + 0", "Fit to screen"],
];

export function Settings({ prefs, update, health, mapCount, onBackupAll, onImport, onHealthChange, onSignOut }: Props) {
  const [key, setKey] = useState(getApiKey());
  const install = useInstallPrompt();
  const [saved, setSaved] = useState(false);
  return (
    <div className="page settings">
      <header className="lib-header">
        <h1>Settings</h1>
      </header>
      <div className="lib-scroll">
        <section className="settings-card">
          <h3>Appearance</h3>
          <Segmented
            value={prefs.appearance}
            onChange={(appearance) => update({ appearance })}
            options={[
              { value: "dark", label: "🌙 Dark" },
              { value: "light", label: "☀️ Light" },
              { value: "system", label: "Auto" },
            ]}
          />
        </section>

        {!STANDALONE && (install.canInstall || install.iosHint) && (
          <section className="settings-card">
            <h3>Install MindFlow</h3>
            {install.canInstall ? (
              <button type="button" className="btn primary" onClick={install.onInstall}>
                ⬇ Install app on this device
              </button>
            ) : (
              <p className="muted small">On iPhone / iPad: tap Share, then “Add to Home Screen”.</p>
            )}
          </section>
        )}

        <section className="settings-card">
          <h3>New maps</h3>
          <label className="field-label">Default structure</label>
          <select value={prefs.defaultLayout} onChange={(e) => update({ defaultLayout: e.target.value as LayoutMode })}>
            {LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {LAYOUT_LABELS[l]}
              </option>
            ))}
          </select>
          <label className="field-label">Default theme</label>
          <select value={prefs.defaultTheme} onChange={(e) => update({ defaultTheme: e.target.value })}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </section>

        <section className="settings-card">
          <h3>✨ Claude assistant</h3>
          {STANDALONE ? (
            <>
              <p className="muted small">
                Claude builds, expands and explains your maps. Paste an Anthropic API key from platform.claude.com. It is stored only on this device.
              </p>
              <input type="password" value={key} placeholder="sk-ant-…" onChange={(e) => (setKey(e.target.value), setSaved(false))} />
              <div className="form-actions">
                {getApiKey() && (
                  <button type="button" className="btn" onClick={() => (setApiKey(""), setKey(""), onHealthChange())}>
                    Remove
                  </button>
                )}
                <button type="button" className="btn primary" disabled={!key.trim()} onClick={() => (setApiKey(key), setSaved(true), onHealthChange())}>
                  {saved ? "Saved ✓" : "Save key"}
                </button>
              </div>
            </>
          ) : (
            <p className="muted small">
              {health?.ai ? `Connected through the MindFlow server (${health.model}).` : "Not configured: set ANTHROPIC_API_KEY on the server."}
              {health?.mcp.http ? " MCP endpoint: /mcp" : ""}
            </p>
          )}
        </section>

        <section className="settings-card">
          <h3>Your data</h3>
          <p className="muted small">
            {mapCount} map{mapCount === 1 ? "" : "s"} {STANDALONE ? "saved on this device" : "saved on the MindFlow server"}. Back up regularly; a backup restores with Import.
          </p>
          <div className="row-wrap">
            <button type="button" className="btn" onClick={onBackupAll}>
              💾 Back up all maps
            </button>
            <button type="button" className="btn" onClick={onImport}>
              📥 Import / restore
            </button>
          </div>
          <p className="muted small">Import understands MindFlow backups, XMind (.xmind), OPML, FreeMind (.mm), Markdown and text.</p>
        </section>

        <section className="settings-card desktop-only">
          <h3>Keyboard shortcuts</h3>
          <div className="shortcut-list">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <h3>About</h3>
          <p className="muted small">MindFlow 3.0 · Mind maps for students, with Claude built in. No ads, no watermarks, every export free.</p>
          {onSignOut && (
            <button type="button" className="btn" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
