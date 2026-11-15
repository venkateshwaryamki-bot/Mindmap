import { STRUCTURES, STUDY_TEMPLATES, type Template } from "../templates";
import { MiniMap } from "./MiniMap";
import { Sheet } from "./ui";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  onBlank: () => void;
  onTemplate: (t: Template) => void;
  onMarkdown: () => void;
  onAI: () => void;
  onImport: () => void;
  /** Render as a full page (Templates tab) instead of a sheet. */
  asPage?: boolean;
}

export function TemplateGallery({ onTemplate }: { onTemplate: (t: Template) => void }) {
  return (
    <>
      <h3 className="section-title">Create from type</h3>
      <div className="template-row">
        {STRUCTURES.map((t) => (
          <button key={t.id} type="button" className="template-card" onClick={() => onTemplate(t)}>
            <MiniMap markdown={t.markdown} layout={t.layout} theme={t.theme} style={t.style} />
            <span className="template-name">{t.name}</span>
          </button>
        ))}
      </div>
      <h3 className="section-title">Study templates</h3>
      <div className="study-grid">
        {STUDY_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="study-card" onClick={() => onTemplate(t)}>
            <MiniMap markdown={t.markdown} layout={t.layout} theme={t.theme} style={t.style} />
            <span className="study-text">
              <span className="study-name">
                {t.icon} {t.name}
              </span>
              <span className="study-desc">{t.description}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export function CreateOptions({ onBlank, onMarkdown, onAI, onImport }: Pick<Props, "onBlank" | "onMarkdown" | "onAI" | "onImport">) {
  return (
    <div className="create-tiles">
      <button type="button" className="create-tile orange" onClick={onBlank}>
        <span className="tile-icon"><Icon name="plus" size={28} strokeWidth={2.2} /></span>
        <span className="tile-label">Blank mind map</span>
      </button>
      <button type="button" className="create-tile purple" onClick={onAI}>
        <span className="tile-icon"><Icon name="sparkles" size={28} /></span>
        <span className="tile-label">AI Generation</span>
      </button>
      <button type="button" className="create-tile blue" onClick={onMarkdown}>
        <span className="tile-icon"><Icon name="markdown" size={28} /></span>
        <span className="tile-label">From Markdown / notes</span>
      </button>
      <button type="button" className="create-tile green" onClick={onImport}>
        <span className="tile-icon"><Icon name="upload" size={28} /></span>
        <span className="tile-label">Import file</span>
        <span className="tile-sub">XMind · OPML · MD · JSON</span>
      </button>
    </div>
  );
}

export function CreateSheet(props: Props) {
  const { open, onClose } = props;
  return (
    <Sheet open={open} onClose={onClose} title="Create a mind map" wide className="create-sheet">
      <CreateOptions {...props} />
      <TemplateGallery onTemplate={props.onTemplate} />
    </Sheet>
  );
}
