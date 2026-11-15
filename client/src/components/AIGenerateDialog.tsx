import { useEffect, useState } from "react";
import { type LayoutMode, LAYOUTS } from "@shared/model";
import { LAYOUT_LABELS } from "./MarkdownDialog";
import { Segmented, Sheet } from "./ui";

export interface AIRequest {
  title: string;
  layout: LayoutMode;
  prompt: string;
}

const LEVELS = {
  quick: "a quick overview: 4-6 main branches, 2 levels deep, short labels",
  detailed: "a detailed study map: 6-8 main branches, 3 levels deep, specific facts, definitions and examples",
  exam: "an exam-ready revision map: 6-8 main branches, 3-4 levels deep, key definitions, dates, numbers, examples, a 'Common mistakes' branch and a 'Likely questions' branch whose items are checkboxes",
} as const;

export function AIGenerateDialog({ open, onClose, defaultLayout, onGenerate }: { open: boolean; onClose: () => void; defaultLayout: LayoutMode; onGenerate: (r: AIRequest) => void }) {
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [level, setLevel] = useState<keyof typeof LEVELS>("detailed");
  const [layout, setLayout] = useState<LayoutMode>(defaultLayout);
  useEffect(() => {
    if (open) {
      setTopic("");
      setNotes("");
      setLayout(defaultLayout);
    }
  }, [open, defaultLayout]);

  const submit = () => {
    const title = topic.trim() || "My notes";
    const prompt =
      `Build ${LEVELS[level]} about "${title}" in this map. ` +
      (notes.trim()
        ? `Base it on my notes below; keep every important fact, organise it clearly, and correct anything that is factually wrong.\n\n<notes>\n${notes.trim().slice(0, 30000)}\n</notes>\n\n`
        : "") +
      "Use add_nodes with a nested outline (one call per main branch is fine). Keep labels short like a real mind map, add a leading emoji to each main branch, " +
      "and put longer explanations in notes. Finish with a two-sentence summary.";
    onGenerate({ title, layout, prompt });
  };

  return (
    <Sheet open={open} onClose={onClose} title="✨ AI Generation" className="ai-gen-sheet">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field-label">Topic</label>
        <input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Indian Monsoon, Game theory basics, Cell division" />
        <label className="field-label">Depth</label>
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: "quick", label: "Quick" },
            { value: "detailed", label: "Detailed" },
            { value: "exam", label: "Exam-ready" },
          ]}
        />
        <label className="field-label">Structure</label>
        <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutMode)}>
          {LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {LAYOUT_LABELS[l]}
            </option>
          ))}
        </select>
        <label className="field-label">Your notes (optional)</label>
        <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste a chapter, lecture notes or an article and Claude will turn it into a map." />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn ai" disabled={!topic.trim() && !notes.trim()}>
            ✨ Generate
          </button>
        </div>
      </form>
    </Sheet>
  );
}
