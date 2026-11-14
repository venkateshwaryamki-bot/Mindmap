import { useEffect, useState } from "react";
import { THEMES } from "../themes";

export interface NewMapRequest {
  title: string;
  outline: string;
  layout: "mindmap" | "right" | "down";
  theme: string;
  generate: boolean;
  brief: string;
}

interface Props {
  open: boolean;
  aiAvailable: boolean;
  onClose: () => void;
  onCreate: (request: NewMapRequest) => void;
}

export function NewMapDialog({ open, aiAvailable, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");
  const [layout, setLayout] = useState<NewMapRequest["layout"]>("mindmap");
  const [theme, setTheme] = useState("aurora");
  const [generate, setGenerate] = useState(false);
  const [brief, setBrief] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setOutline("");
      setGenerate(false);
      setBrief("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onCreate({ title: title.trim(), outline, layout, theme, generate: generate && aiAvailable, brief });
        }}
      >
        <h2>New mind map</h2>
        <label>
          Central topic
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product launch plan" />
        </label>
        <div className="row">
          <label>
            Layout
            <select value={layout} onChange={(e) => setLayout(e.target.value as NewMapRequest["layout"])}>
              <option value="mindmap">Mind map</option>
              <option value="right">Logic chart</option>
              <option value="down">Org chart</option>
            </select>
          </label>
          <label>
            Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={generate} disabled={!aiAvailable} onChange={(e) => setGenerate(e.target.checked)} />
          Let Claude generate the first draft {aiAvailable ? "" : "(configure ANTHROPIC_API_KEY to enable)"}
        </label>
        {generate ? (
          <label>
            What should the map cover? (optional)
            <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Audience, goals, constraints, angle…" />
          </label>
        ) : (
          <label>
            Start from an outline (optional)
            <textarea
              rows={5}
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder={"- Branch one\n  - Sub idea\n- Branch two"}
            />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!title.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
