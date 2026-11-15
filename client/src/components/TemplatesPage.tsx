import { useMemo, useState } from "react";
import { ALL_TEMPLATES, TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from "../templates";
import { Icon } from "./Icon";
import { MiniMap } from "./MiniMap";

export function TemplatesPage({ onTemplate, onBlank, onAI, onMarkdown }: { onTemplate: (t: Template) => void; onBlank: () => void; onAI: () => void; onMarkdown: () => void }) {
  const [cat, setCat] = useState<TemplateCategory | "All">("All");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ALL_TEMPLATES.filter(
      (t) => (cat === "All" || t.category === cat) && (!query || t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)),
    );
  }, [cat, q]);
  return (
    <div className="page">
      <header className="lib-header">
        <h1>Templates</h1>
      </header>
      <div className="lib-scroll">
        <div className="search-box">
          <Icon name="search" size={18} />
          <input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips scroll">
          {(["All", ...TEMPLATE_CATEGORIES] as const).map((c) => (
            <button key={c} type="button" className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        {cat === "All" && !q && (
          <div className="quick-start">
            <button type="button" onClick={onBlank}>
              <span className="qs-icon violet">
                <Icon name="plus" />
              </span>
              Blank map
            </button>
            <button type="button" onClick={onAI}>
              <span className="qs-icon ai">
                <Icon name="sparkles" />
              </span>
              AI Generate
            </button>
            <button type="button" onClick={onMarkdown}>
              <span className="qs-icon blue">
                <Icon name="markdown" />
              </span>
              From Markdown
            </button>
          </div>
        )}
        <div className="template-grid">
          {list.map((t) => (
            <button key={t.id} type="button" className="template-tile" onClick={() => onTemplate(t)}>
              <MiniMap markdown={t.markdown} layout={t.layout} theme={t.theme} style={t.style} />
              <span className="tt-text">
                <span className="tt-name">{t.name}</span>
                <span className="tt-desc">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="muted center pad">No templates match.</p>}
      </div>
    </div>
  );
}
