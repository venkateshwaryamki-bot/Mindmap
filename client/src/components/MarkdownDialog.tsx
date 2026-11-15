import { useEffect, useMemo, useState } from "react";
import { type LayoutMode, LAYOUTS, countNodes, mapFromOutline } from "@shared/model";
import { THEMES } from "../themes";
import { MiniMap } from "./MiniMap";
import { Sheet } from "./ui";

export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  mindmap: "Two-way",
  right: "One-way →",
  left: "One-way ←",
  down: "Org chart",
  tree: "Tree chart",
  timeline: "Timeline",
  fishbone: "Fishbone",
  radial: "Radial",
  brace: "Brace map",
};

const SAMPLE = `# Photosynthesis
How plants turn light into food.
## Inputs
- ☀️ Sunlight
- 💧 Water
- CO2
## Stages
### Light reactions
- In thylakoids
- Make ATP & NADPH
### Calvin cycle
- In stroma
- Fixes CO2 into sugar
## Revise
- [ ] Draw the diagram
- [ ] Learn the equation
`;

interface Props {
  open: boolean;
  onClose: () => void;
  /** "create": new map. "insert": add under the selected topic. */
  mode: "create" | "insert";
  defaultLayout: LayoutMode;
  defaultTheme: string;
  onCreate?: (markdown: string, layout: LayoutMode, theme: string) => void;
  onInsert?: (markdown: string) => void;
}

export function MarkdownDialog({ open, onClose, mode, defaultLayout, defaultTheme, onCreate, onInsert }: Props) {
  const [text, setText] = useState("");
  const [layout, setLayout] = useState<LayoutMode>(defaultLayout);
  const [theme, setTheme] = useState(defaultTheme);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (open) {
      setText("");
      setDebounced("");
      setLayout(defaultLayout);
      setTheme(defaultTheme);
    }
  }, [open, defaultLayout, defaultTheme]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(text), 250);
    return () => window.clearTimeout(t);
  }, [text]);

  const parsed = useMemo(() => (debounced.trim() ? mapFromOutline(debounced, "My map") : null), [debounced]);
  const count = parsed ? countNodes(parsed.root) - (mode === "insert" ? 1 : 0) : 0;

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText(clip);
    } catch {
      /* clipboard blocked: user can long-press and paste */
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={mode === "create" ? "Create from Markdown" : "Add Markdown under this topic"} wide className="md-sheet">
      <div className="md-layout">
        <div className="md-input">
          <div className="md-toolbar">
            <button type="button" className="chip" onClick={() => void paste()}>
              📋 Paste
            </button>
            <button type="button" className="chip" onClick={() => setText(SAMPLE)}>
              Example
            </button>
            {text && (
              <button type="button" className="chip" onClick={() => setText("")}>
                Clear
              </button>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={"Paste notes, an outline or Markdown from ChatGPT, Notion, Obsidian…\n\n# Main topic\n## Branch\n- Point\n  - Sub-point\n- [ ] Task to tick off"}
          />
          <p className="md-help">
            <b># Title</b> becomes the centre · <b>##</b> headings and <b>- bullets</b> become branches (indent to nest) · <b>- [ ]</b> adds a checkbox ·
            text under a heading becomes a note.
          </p>
        </div>
        <div className="md-preview">
          {mode === "create" && (
            <div className="md-options">
              <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutMode)} aria-label="Structure">
                {LAYOUTS.map((l) => (
                  <option key={l} value={l}>
                    {LAYOUT_LABELS[l]}
                  </option>
                ))}
              </select>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="md-preview-box">
            {parsed ? <MiniMap map={parsed} layout={mode === "create" ? layout : "right"} theme={theme} /> : <div className="md-preview-empty">Live preview appears here</div>}
          </div>
          <div className="form-actions">
            <span className="muted">{parsed ? `${count} topics` : ""}</span>
            <button
              type="button"
              className="btn primary"
              disabled={!text.trim()}
              onClick={() => (mode === "create" ? onCreate?.(text, layout, theme) : onInsert?.(text))}
            >
              {mode === "create" ? "Create mind map" : "Add topics"}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
