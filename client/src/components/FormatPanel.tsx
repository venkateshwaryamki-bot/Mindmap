import { useEffect, useMemo, useState } from "react";
import { type LayoutMode, LAYOUTS, type MindMap, type MindNode, type TextSize, pathTo, summarize } from "@shared/model";
import { THEMES, type Theme } from "../themes";
import type { EditorActions } from "../useMapEditor";
import { LAYOUT_LABELS } from "./MarkdownDialog";
import { MiniMap } from "./MiniMap";
import { StickerPicker } from "./StickerPicker";
import { Segmented } from "./ui";

export type FormatTab = "topic" | "map";

interface Props {
  map: MindMap;
  node: MindNode | null;
  theme: Theme;
  actions: EditorActions;
  tab: FormatTab;
  onTab: (t: FormatTab) => void;
  onClose: () => void;
  onPickImage: () => void;
  /** Scroll to and focus a section when opened from the toolbar. */
  focus?: "sticker" | "note" | null;
}

const STRUCTURE_SAMPLE = "# Main\n- Topic\n  - Sub\n  - Sub\n- Topic\n  - Sub\n- Topic\n";
const TEXT_COLORS = ["#111827", "#ffffff", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777"];
const FILLS = ["#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#e5e7eb", "#1f2937", "#f97316", "#10b981", "#3b82f6", "#8b5cf6"];

export function FormatPanel({ map, node, theme, actions, tab, onTab, onClose, onPickImage, focus }: Props) {
  const [note, setNote] = useState(node?.note ?? "");
  const [link, setLink] = useState(node?.link ?? "");
  useEffect(() => {
    setNote(node?.note ?? "");
    setLink(node?.link ?? "");
  }, [node?.id, node?.note, node?.link]);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`fmt-${focus}`);
    el?.scrollIntoView({ block: "center" });
    if (focus === "note") (el?.querySelector("textarea") as HTMLTextAreaElement | null)?.focus();
  }, [focus, node?.id]);

  const preview = useMemo(() => summarize(map).preview, [map]);
  const style = map.style ?? {};
  const isRoot = node?.id === map.root.id;
  const ts = node?.textStyle ?? {};

  return (
    <aside className="side-panel format-panel">
      <header className="panel-head">
        <Segmented
          value={tab}
          onChange={onTab}
          options={[
            { value: "topic", label: "Topic" },
            { value: "map", label: "Map style" },
          ]}
        />
        <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="panel-scroll">
        {tab === "topic" &&
          (node ? (
            <>
              <div className="crumbs">{pathTo(map.root, node.id).map((n) => n.text).join(" › ")}</div>

              <section>
                <h4>Text</h4>
                <div className="row-wrap">
                  <Segmented
                    value={ts.size ?? "m"}
                    onChange={(size: TextSize) => actions.updateNode(node.id, { textStyle: { size: size === "m" ? null : size } })}
                    options={[
                      { value: "s", label: "S" },
                      { value: "m", label: "M" },
                      { value: "l", label: "L" },
                      { value: "xl", label: "XL" },
                    ]}
                  />
                  <button type="button" className={`chip bold${ts.bold ? " on" : ""}`} onClick={() => actions.updateNode(node.id, { textStyle: { bold: !ts.bold } })}>
                    B
                  </button>
                  <button type="button" className={`chip italic${ts.italic ? " on" : ""}`} onClick={() => actions.updateNode(node.id, { textStyle: { italic: !ts.italic } })}>
                    I
                  </button>
                </div>
                <div className="swatches">
                  <button type="button" className={`swatch none${!ts.color ? " on" : ""}`} title="Default" onClick={() => actions.updateNode(node.id, { textStyle: { color: "" } })} />
                  {TEXT_COLORS.map((c) => (
                    <button key={c} type="button" className={`swatch${ts.color === c ? " on" : ""}`} style={{ background: c }} onClick={() => actions.updateNode(node.id, { textStyle: { color: c } })} />
                  ))}
                </div>
              </section>

              <section>
                <h4>Topic fill</h4>
                <div className="swatches">
                  <button type="button" className={`swatch none${!ts.fill ? " on" : ""}`} title="Theme" onClick={() => actions.updateNode(node.id, { textStyle: { fill: "" } })} />
                  {FILLS.map((c) => (
                    <button key={c} type="button" className={`swatch${ts.fill === c ? " on" : ""}`} style={{ background: c }} onClick={() => actions.updateNode(node.id, { textStyle: { fill: c } })} />
                  ))}
                </div>
              </section>

              {!isRoot && (
                <section>
                  <h4>Branch colour</h4>
                  <div className="swatches">
                    <button type="button" className={`swatch none${!node.color ? " on" : ""}`} title="Automatic" onClick={() => actions.updateNode(node.id, { color: null })} />
                    {theme.palette.map((c) => (
                      <button key={c} type="button" className={`swatch${node.color === c ? " on" : ""}`} style={{ background: c }} onClick={() => actions.updateNode(node.id, { color: c })} />
                    ))}
                    <input type="color" value={node.color ?? theme.palette[0]} onChange={(e) => actions.updateNode(node.id, { color: e.target.value })} title="Custom colour" />
                  </div>
                </section>
              )}

              <section>
                <h4>Priority & checkbox</h4>
                <div className="row-wrap">
                  {[1, 2, 3, 4, 5, 6].map((p) => (
                    <button key={p} type="button" className={`prio-chip${node.priority === p ? " on" : ""}`} onClick={() => actions.updateNode(node.id, { priority: node.priority === p ? null : p })}>
                      {p}
                    </button>
                  ))}
                  <button type="button" className={`chip${node.task ? " on" : ""}`} onClick={() => actions.updateNode(node.id, { task: node.task ? null : "todo" })}>
                    ☑ Checkbox
                  </button>
                </div>
              </section>

              <section id="fmt-sticker">
                <h4>Sticker</h4>
                <StickerPicker value={node.marker} onPick={(s) => actions.updateNode(node.id, { marker: s })} />
              </section>

              <section id="fmt-note">
                <h4>Note</h4>
                <textarea
                  rows={5}
                  value={note}
                  placeholder="Explanation, example, formula, source…"
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => note !== (node.note ?? "") && actions.updateNode(node.id, { note })}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </section>

              <section>
                <h4>Link</h4>
                <input
                  value={link}
                  placeholder="https://"
                  inputMode="url"
                  onChange={(e) => setLink(e.target.value)}
                  onBlur={() => link !== (node.link ?? "") && actions.updateNode(node.id, { link })}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </section>

              <section>
                <h4>Image</h4>
                <div className="row-wrap">
                  <button type="button" className="chip" onClick={onPickImage}>
                    🖼 {node.image ? "Replace image" : "Add image"}
                  </button>
                  {node.image && (
                    <button type="button" className="chip danger" onClick={() => actions.updateNode(node.id, { image: null })}>
                      Remove image
                    </button>
                  )}
                </div>
              </section>
            </>
          ) : (
            <p className="muted pad">Select a topic to style it.</p>
          ))}

        {tab === "map" && (
          <>
            <section>
              <h4>Structure</h4>
              <div className="structure-grid">
                {LAYOUTS.map((l: LayoutMode) => (
                  <button key={l} type="button" className={`structure-card${map.layout === l ? " on" : ""}`} onClick={() => actions.setLayout(l)}>
                    <MiniMap markdown={STRUCTURE_SAMPLE} layout={l} theme={map.theme} style={map.style} />
                    <span>{LAYOUT_LABELS[l]}</span>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h4>Theme</h4>
              <div className="theme-grid">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" className={`theme-card${map.theme === t.id ? " on" : ""}`} onClick={() => actions.setTheme(t.id)}>
                    <MiniMap preview={preview} layout="right" theme={t.id} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h4>Branch lines</h4>
              <Segmented
                value={style.line ?? theme.line}
                onChange={(line) => actions.setStyle({ line })}
                options={[
                  { value: "curve", label: "Curved" },
                  { value: "elbow", label: "Elbow" },
                  { value: "straight", label: "Straight" },
                ]}
              />
            </section>
            <section>
              <h4>Topic shape</h4>
              <Segmented
                value={style.shape ?? "theme"}
                onChange={(shape) => actions.setStyle({ shape })}
                options={[
                  { value: "theme", label: "Theme" },
                  { value: "rounded", label: "▢" , title: "Rounded" },
                  { value: "pill", label: "⬭", title: "Pill" },
                  { value: "rect", label: "□", title: "Square" },
                  { value: "underline", label: "▁", title: "Underline" },
                ]}
              />
            </section>
            <section>
              <h4>Spacing</h4>
              <Segmented
                value={style.spacing ?? "normal"}
                onChange={(spacing) => actions.setStyle({ spacing })}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "normal", label: "Normal" },
                  { value: "loose", label: "Roomy" },
                ]}
              />
            </section>
            <section>
              <label className="toggle-row">
                <span>Rainbow branches</span>
                <input type="checkbox" checked={style.rainbow ?? true} onChange={(e) => actions.setStyle({ rainbow: e.target.checked })} />
              </label>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
