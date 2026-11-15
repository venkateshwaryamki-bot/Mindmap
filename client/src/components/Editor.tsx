import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type MindMap,
  type NodeInput,
  clone,
  findNode,
  parseOutline,
  taskProgress,
  toOutline,
  walk,
} from "@shared/model";
import { type Health, api } from "../api";
import { copyText } from "../export/download";
import { imageFromFile } from "../image";
import { getTheme } from "../themes";
import { useMapEditor } from "../useMapEditor";
import type { Prefs } from "../prefs";
import { AIPanel } from "./AIPanel";
import { Canvas, type CanvasHandle } from "./Canvas";
import { ExportSheet } from "./ExportSheet";
import { Flashcards } from "./Flashcards";
import { FormatPanel, type FormatTab } from "./FormatPanel";
import { MarkdownDialog } from "./MarkdownDialog";
import { NodeToolbar } from "./NodeToolbar";
import { OutlineView } from "./OutlineView";
import { PresentControls, QuizControls, presentationSteps, visibleAtStep } from "./StudyOverlay";
import { type Action, ActionSheet, ConfirmDialog, PromptDialog } from "./ui";
import { Icon, type IconName } from "./Icon";

interface Props {
  mapId: string;
  health: Health | null;
  prefs: Prefs;
  folders: string[];
  isMobile: boolean;
  toast: (message: string) => void;
  onBack: () => void;
  onDuplicate: (id: string) => void;
  onHealthChange: () => void;
  autoPrompt: string | null;
  onAutoPromptConsumed: () => void;
}

type Panel = { kind: "format"; tab: FormatTab; focus?: "sticker" | "note" | null } | { kind: "ai" } | null;
type Study = { mode: "present"; step: number; playing: boolean } | { mode: "quiz"; revealed: Set<string> } | { mode: "flash" } | null;

function markdownToInputs(text: string): NodeInput[] {
  const parsed = parseOutline(text);
  if (parsed.title) return [{ text: parsed.title, note: parsed.note, children: parsed.nodes }];
  return parsed.nodes;
}

function setCollapsedAll(map: MindMap, collapsed: boolean): MindMap {
  const next = clone(map);
  for (const { node, depth } of walk(next.root)) {
    if (depth >= 1 && node.children.length) {
      if (collapsed) node.collapsed = true;
      else delete node.collapsed;
    } else if (!collapsed) delete node.collapsed;
  }
  return next;
}

export function Editor(props: Props) {
  const { mapId, health, folders, isMobile, toast, onBack, onDuplicate, onHealthChange, autoPrompt, onAutoPromptConsumed } = props;
  const { state, selectedNode, actions } = useMapEditor(mapId, toast);
  const map = state.map;
  const mapTheme = getTheme(map?.theme ?? "lavender");
  // In dark mode the default Lavender theme is shown as its night variant (the map keeps its theme).
  const appDark = props.prefs.appearance === "dark" || (props.prefs.appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = appDark && mapTheme.id === "lavender" ? getTheme("lavender-night") : mapTheme;
  const canvasRef = useRef<CanvasHandle | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const lastCopied = useRef<string>("");

  const [panel, setPanel] = useState<Panel>(() => (autoPrompt ? { kind: "ai" } : null));
  const [outline, setOutline] = useState(false);
  const [study, setStudy] = useState<Study>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [mdInsert, setMdInsert] = useState(false);
  const [menu, setMenu] = useState<{ title: string; actions: Action[] } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(autoPrompt);
  const [celebrate, setCelebrate] = useState(0);

  useEffect(() => {
    if (autoPrompt) {
      setAiPrompt(autoPrompt);
      setPanel({ kind: "ai" });
      onAutoPromptConsumed();
    }
  }, [autoPrompt, onAutoPromptConsumed]);

  const sel = state.selectedId;
  const selOrRoot = sel ?? map?.root.id ?? null;

  // ---- celebrate finishing every checkbox ---------------------------------
  const progress = useMemo(() => (map ? taskProgress(map.root) : { done: 0, total: 0 }), [map]);
  const prevDone = useRef(progress);
  useEffect(() => {
    const prev = prevDone.current;
    prevDone.current = progress;
    if (progress.total > 0 && progress.done === progress.total && prev.done < prev.total && prev.total === progress.total) {
      setCelebrate(Date.now());
      toast("🎉 Everything ticked off. Great work!");
    }
  }, [progress, toast]);
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(0), 2400);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  // ---- helpers --------------------------------------------------------------
  const askClaude = useCallback((prompt: string) => {
    setAiPrompt(prompt);
    setPanel({ kind: "ai" });
  }, []);

  const pickImage = useCallback(() => imageRef.current?.click(), []);

  const insertMarkdown = useCallback(
    (text: string, parentId?: string) => {
      if (!map) return;
      const inputs = markdownToInputs(text);
      if (!inputs.length) return;
      actions.addOutline(parentId ?? sel ?? map.root.id, inputs);
      toast(`Added ${inputs.length} topic${inputs.length > 1 ? "s" : ""} from Markdown`);
    },
    [actions, map, sel, toast],
  );

  const focusBranch = (id: string) => {
    const node = map && findNode(map.root, id);
    if (!node) return;
    const ids = [...walk(node)].map((w) => w.node.id);
    canvasRef.current?.focusOn(ids, 1.4);
  };

  // ---- menus ------------------------------------------------------------------
  const startStudy = (mode: "present" | "quiz" | "flash") => {
    setPanel(null);
    setOutline(false);
    setStudy(mode === "present" ? { mode, step: 0, playing: false } : mode === "quiz" ? { mode, revealed: new Set() } : { mode });
  };

  const tool = (icon: IconName, label: string, onClick: () => void, disabled = false, shortcut?: string, active = false) => (
    <button type="button" className={`tool${active ? " active" : ""}`} disabled={disabled} onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label}>
      <Icon name={icon} size={19} />
      <span>{label}</span>
    </button>
  );

  const openInsertMenu = () =>
    setMenu({
      title: "More tools",
      actions: [
        { label: "Parent topic", icon: "parent", disabled: !sel || sel === map?.root.id, onSelect: () => sel && actions.addParent(sel) },
        { label: "Topics from Markdown…", icon: "markdown", onSelect: () => setMdInsert(true) },
        { label: "Paste branch", icon: "paste", disabled: !actions.canPaste() || !selOrRoot, onSelect: () => selOrRoot && actions.paste(selOrRoot) },
        { label: "Present", icon: "present", onSelect: () => startStudy("present") },
        { label: "Quiz yourself", icon: "quiz", onSelect: () => startStudy("quiz") },
        { label: "Flashcards", icon: "cards", onSelect: () => startStudy("flash") },
        {
          label: "Expand with Claude",
          icon: "sparkles",
          disabled: !selectedNode,
          onSelect: () => selectedNode && askClaude(`Expand the selected topic "${selectedNode.text}" with 4-6 specific, useful sub-topics.`),
        },
      ],
    });

  const openNodeMenu = () => {
    if (!map || !selectedNode) return;
    const id = selectedNode.id;
    const isRoot = id === map.root.id;
    setMenu({
      title: selectedNode.text,
      actions: [
        { label: "Rename", icon: "rename", onSelect: () => actions.startEditing(id) },
        { label: "Note", icon: "note", onSelect: () => setPanel({ kind: "format", tab: "topic", focus: "note" }) },
        { label: "Image", icon: "image", onSelect: pickImage },
        { label: "Add parent topic", icon: "parent", disabled: isRoot, onSelect: () => actions.addParent(id) },
        { label: "Expand with Claude", icon: "sparkles", onSelect: () => askClaude(`Expand the selected topic "${selectedNode.text}" with 4-6 specific sub-topics.`) },
        {
          label: "Explain with Claude (adds a note)",
          icon: "bulb",
          onSelect: () => askClaude(`Write a clear, exam-friendly explanation (3-6 sentences, with one example) of "${selectedNode.text}" and save it as the selected topic's note with update_node.`),
        },
        { label: "Copy branch", icon: "copy", onSelect: () => actions.copy(id) && toast("Branch copied") },
        { label: "Cut branch", icon: "cut", disabled: isRoot, onSelect: () => actions.cut(id) && toast("Branch cut") },
        { label: "Paste into this topic", icon: "paste", disabled: !actions.canPaste(), onSelect: () => actions.paste(id) },
        { label: "Copy as Markdown", icon: "markdown", onSelect: () => void copyText(toOutline(selectedNode, { withNotes: true })).then(() => toast("Markdown copied")) },
        {
          label: selectedNode.collapsed ? "Expand branch" : "Collapse branch",
          icon: selectedNode.collapsed ? "expand" : "collapse",
          disabled: !selectedNode.children.length,
          onSelect: () => actions.toggleCollapse(id),
        },
        { label: "Focus on branch", icon: "target", onSelect: () => focusBranch(id) },
        { label: "Move up", icon: "arrowUp", disabled: isRoot, onSelect: () => actions.reorder(id, -1) },
        { label: "Move down", icon: "arrowDown", disabled: isRoot, onSelect: () => actions.reorder(id, 1) },
        { label: "Delete topic", icon: "trash", danger: true, disabled: isRoot, onSelect: () => actions.deleteNode(id) },
      ],
    });
  };

  const mapActions = (): Action[] =>
    map
      ? [
          { label: "Rename map", icon: "rename", onSelect: () => setRenaming(true) },
          { label: map.favorite ? "Remove star" : "Star this map", icon: "star", onSelect: () => actions.setMapMeta({ favorite: !map.favorite }) },
          {
            label: map.folder ? `Folder: ${map.folder}` : "Move to folder",
            icon: "folder",
            onSelect: () =>
              setMenu({
                title: "Move to folder",
                actions: [
                  ...folders.filter((f) => f !== map.folder).map((f) => ({ label: f, icon: "folder", onSelect: () => actions.setMapMeta({ folder: f }) })),
                  ...(map.folder ? [{ label: "Remove from folder", icon: "arrowLeft", onSelect: () => actions.setMapMeta({ folder: undefined }) }] : []),
                ],
              }),
          },
          { label: "Duplicate map", icon: "copy", onSelect: () => onDuplicate(map.id) },
          { label: "Delete map", icon: "trash", danger: true, onSelect: () => setConfirmDelete(true) },
        ]
      : [];

  const openTitleMenu = () => map && setMenu({ title: map.title, actions: mapActions() });

  const openMoreMenu = () => {
    if (!map) return;
    setMenu({
      title: map.title,
      actions: [
        ...(isMobile
          ? [
              { label: outline ? "Back to mind map" : "Outline view", icon: "outline", onSelect: () => setOutline((v) => !v) },
              { label: "Layout & theme", icon: "theme", onSelect: () => setPanel({ kind: "format", tab: "layout" }) },
              { label: "Export & share", icon: "share", onSelect: () => setExportOpen(true) },
              { label: "Quiz yourself", icon: "quiz", onSelect: () => startStudy("quiz") },
              { label: "Flashcards", icon: "cards", onSelect: () => startStudy("flash") },
              { label: "Claude assistant", icon: "sparkles", onSelect: () => setPanel({ kind: "ai" }) },
              { label: "Topics from Markdown…", icon: "markdown", onSelect: () => setMdInsert(true) },
            ]
          : [
              { label: "Export & share", icon: "share", onSelect: () => setExportOpen(true) },
              { label: "Quiz yourself", icon: "quiz", onSelect: () => startStudy("quiz") },
              { label: "Flashcards", icon: "cards", onSelect: () => startStudy("flash") },
            ]),
        { label: "Expand all", icon: "expand", onSelect: () => actions.replaceMap(setCollapsedAll(map, false)) },
        { label: "Collapse to main topics", icon: "collapse", onSelect: () => actions.replaceMap(setCollapsedAll(map, true)) },
        ...mapActions(),
      ],
    });
  };

  // ---- keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!map || study) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (mod && key === "y") return void (e.preventDefault(), actions.redo());
      if (mod && e.key === "0") return void (e.preventDefault(), canvasRef.current?.fit());
      if (mod && (e.key === "=" || e.key === "+")) return void (e.preventDefault(), canvasRef.current?.zoomBy(1.2));
      if (mod && e.key === "-") return void (e.preventDefault(), canvasRef.current?.zoomBy(1 / 1.2));
      if (mod && key === "k") return void (e.preventDefault(), setPanel((p) => (p?.kind === "ai" ? null : { kind: "ai" })));
      if (mod && e.shiftKey && key === "o") return void (e.preventDefault(), setOutline((v) => !v));
      if (mod && key === "e") return void (e.preventDefault(), setExportOpen(true));
      if (outline) return;
      if (!sel) {
        if (e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          actions.select(map.root.id);
        }
        return;
      }
      if (mod && key === "b") return void (e.preventDefault(), actions.updateNode(sel, { textStyle: { bold: !selectedNode?.textStyle?.bold } }));
      if (mod && key === "i") return void (e.preventDefault(), actions.updateNode(sel, { textStyle: { italic: !selectedNode?.textStyle?.italic } }));
      if (mod && e.key === "Enter") return void (e.preventDefault(), sel !== map.root.id && actions.addParent(sel));
      if (mod && /^[1-6]$/.test(e.key)) return void (e.preventDefault(), actions.updateNode(sel, { priority: selectedNode?.priority === Number(e.key) ? null : Number(e.key) }));
      const placed = canvasRef.current?.getLayout()?.byId.get(sel);
      switch (e.key) {
        case "Tab":
          e.preventDefault();
          actions.addChild(sel);
          break;
        case "Enter":
          e.preventDefault();
          if (sel === map.root.id) actions.addChild(sel);
          else actions.addSibling(sel);
          break;
        case "F2":
          e.preventDefault();
          actions.startEditing(sel);
          break;
        case " ":
          e.preventDefault();
          actions.toggleCollapse(sel);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (sel !== map.root.id) actions.deleteNode(sel);
          break;
        case "Escape":
          actions.select(null);
          break;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          if (mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            actions.reorder(sel, e.key === "ArrowUp" ? -1 : 1);
            break;
          }
          const layout = canvasRef.current?.getLayout();
          if (!layout || !placed) break;
          const cx = placed.x + placed.w / 2;
          const cy = placed.y + placed.h / 2;
          const [dx, dy] = e.key === "ArrowUp" ? [0, -1] : e.key === "ArrowDown" ? [0, 1] : e.key === "ArrowLeft" ? [-1, 0] : [1, 0];
          let best: { id: string; score: number } | null = null;
          for (const p of layout.nodes) {
            if (p.id === sel) continue;
            const ox = p.x + p.w / 2 - cx;
            const oy = p.y + p.h / 2 - cy;
            const along = ox * dx + oy * dy;
            if (along <= 4) continue;
            const across = Math.abs(ox * dy - oy * dx);
            const score = along + across * 2.2;
            if (!best || score < best.score) best = { id: p.id, score };
          }
          if (best) actions.select(best.id);
          break;
        }
        default:
          if (e.key.length === 1 && !mod && !e.altKey) actions.startEditing(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, sel, selectedNode, actions, outline, study]);

  // ---- clipboard: copy / cut / paste branches and Markdown --------------------
  useEffect(() => {
    const editable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!map || !sel || outline || editable(e.target) || window.getSelection()?.toString()) return;
      const node = findNode(map.root, sel);
      if (!node) return;
      const md = toOutline(node, { withNotes: true });
      e.clipboardData?.setData("text/plain", md);
      e.preventDefault();
      lastCopied.current = md;
      if (e.type === "cut" && sel !== map.root.id) actions.cut(sel);
      else actions.copy(sel);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!map || outline || editable(e.target)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const target = sel ?? map.root.id;
      e.preventDefault();
      if (actions.canPaste() && (text === lastCopied.current || !text.trim())) actions.paste(target);
      else if (text.trim()) insertMarkdown(text, target);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [map, sel, outline, actions, insertMarkdown]);

  // ---- Android back button / Escape closes the top-most layer -----------------
  useEffect(() => {
    const w = window as unknown as { mindflowEditorBack?: () => boolean };
    w.mindflowEditorBack = () => {
      if (menu) return setMenu(null), true;
      if (exportOpen) return setExportOpen(false), true;
      if (mdInsert) return setMdInsert(false), true;
      if (study) return setStudy(null), true;
      if (panel) return setPanel(null), true;
      if (state.editingId) return actions.stopEditing(), true;
      if (outline) return setOutline(false), true;
      return false;
    };
    return () => {
      delete w.mindflowEditorBack;
    };
  }, [menu, exportOpen, mdInsert, study, panel, outline, state.editingId, actions]);

  if (!map) {
    return (
      <div className="editor loading">
        <div className="editor-top">
          <button type="button" className="icon-btn ghost" onClick={onBack} aria-label="Back">
            ‹
          </button>
        </div>
        <div className="center-msg">{state.error ? <p className="error">{state.error}</p> : <span className="spinner big" />}</div>
      </div>
    );
  }

  const studyVisible =
    study?.mode === "present" ? visibleAtStep(presentationSteps(map), study.step) : study?.mode === "quiz" ? study.revealed : null;
  const quizTotal = study?.mode === "quiz" ? (canvasRef.current?.getLayout()?.nodes.length ?? 1) - 1 : 0;
  const sidePanelOpen = panel !== null;

  return (
    <div className={`editor${theme.dark ? " dark-canvas" : ""}${study ? " studying" : ""}${study?.mode === "present" ? " presenting" : ""}`}>
      {!study && (
        <header className="editor-top">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to library">
            <Icon name="back" />
          </button>
          <button type="button" className="title-btn" onClick={openTitleMenu} title="Map options">
            <span className="title-text">{map.title}</span>
            <Icon name="chevronDown" size={16} />
            {!isMobile && <span className={`save-dot${state.saving ? " saving" : ""}`} title={state.saving ? "Saving…" : "Saved"} />}
          </button>
          {!isMobile && (
            <>
              <button type="button" className="icon-btn" disabled={!state.canUndo} onClick={actions.undo} aria-label="Undo" title="Undo (Ctrl+Z)">
                <Icon name="undo" />
              </button>
              <button type="button" className="icon-btn" disabled={!state.canRedo} onClick={actions.redo} aria-label="Redo" title="Redo (Ctrl+Y)">
                <Icon name="redo" />
              </button>
            </>
          )}
          <div className="spacer" />
          {!isMobile && (
            <div className="tool-group">
              {tool("topic", "Topic", () => sel && sel !== map.root.id && actions.addSibling(sel), !sel || sel === map.root.id, "Enter")}
              {tool("subtopic", "Subtopic", () => selOrRoot && actions.addChild(selOrRoot), !selOrRoot, "Tab")}
              {tool("task", "Checkbox", () => sel && actions.updateNode(sel, { task: selectedNode?.task ? null : "todo" }), !sel)}
              {tool("smile", "Sticker", () => setPanel({ kind: "format", tab: "topic", focus: "sticker" }), !sel)}
              {tool("note", "Note", () => setPanel({ kind: "format", tab: "topic", focus: "note" }), !sel)}
              {tool("image", "Image", pickImage, !selOrRoot)}
              {tool("palette", "Style", () => setPanel((p) => (p?.kind === "format" ? null : { kind: "format", tab: sel ? "topic" : "layout" })), false, undefined, panel?.kind === "format")}
              {tool("outline", "Outline", () => setOutline((v) => !v), false, "Ctrl+Shift+O", outline)}
              {tool("more", "More", openInsertMenu)}
            </div>
          )}
          <div className="spacer" />
          {isMobile ? (
            <>
              <button type="button" className="icon-btn" disabled={!state.canUndo} onClick={actions.undo} aria-label="Undo">
                <Icon name="undo" />
              </button>
              <button type="button" className="icon-btn" disabled={!state.canRedo} onClick={actions.redo} aria-label="Redo">
                <Icon name="redo" />
              </button>
              <button type="button" className="icon-btn" onClick={() => startStudy("present")} aria-label="Present">
                <Icon name="play" size={18} />
              </button>
              <button type="button" className="icon-btn accent-circle" onClick={openMoreMenu} aria-label="More">
                <Icon name="more" />
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`ai-toggle${panel?.kind === "ai" ? " active" : ""}`} onClick={() => setPanel((p) => (p?.kind === "ai" ? null : { kind: "ai" }))} title="Claude (Ctrl+K)">
                <Icon name="sparkles" size={17} /> Claude
              </button>
              <button type="button" className="btn primary share-btn" onClick={() => setExportOpen(true)} title="Export & share (Ctrl+E)">
                <Icon name="share" size={17} /> Share
              </button>
              <button type="button" className="icon-btn round" onClick={() => startStudy("present")} aria-label="Present" title="Present">
                <Icon name="play" size={18} />
              </button>
              <button type="button" className="icon-btn" onClick={openMoreMenu} aria-label="More" title="More">
                <Icon name="moreV" />
              </button>
            </>
          )}
        </header>
      )}

      <div className="stage">
        {outline && !study ? (
          <OutlineView map={map} selectedId={sel} actions={actions} isMobile={isMobile} />
        ) : (
          <Canvas
            map={map}
            theme={theme}
            selectedId={sel}
            editingId={state.editingId}
            actions={actions}
            viewRef={canvasRef}
            controls={study ? null : isMobile ? (sidePanelOpen ? null : "mobile") : "desktop"}
            onClaude={() => setPanel((p) => (p?.kind === "ai" ? null : { kind: "ai" }))}
            study={
              study && study.mode !== "flash" && studyVisible
                ? {
                    mode: study.mode,
                    visible: studyVisible,
                    onReveal:
                      study.mode === "quiz"
                        ? (id) => setStudy((s) => (s?.mode === "quiz" ? { mode: "quiz", revealed: new Set(s.revealed).add(id) } : s))
                        : undefined,
                  }
                : null
            }
          />
        )}

        {!study && !outline && isMobile && !sidePanelOpen && (
          <NodeToolbar
            map={map}
            node={selectedNode}
            actions={actions}
            onSticker={() => setPanel({ kind: "format", tab: "topic", focus: "sticker" })}
            onStyle={() => setPanel({ kind: "format", tab: selectedNode ? "topic" : "layout" })}
            onMore={openNodeMenu}
          />
        )}

        {panel?.kind === "format" && !study && (
          <FormatPanel
            map={map}
            node={selectedNode}
            theme={theme}
            actions={actions}
            tab={panel.tab}
            focus={panel.focus}
            onTab={(tab) => setPanel({ kind: "format", tab })}
            onClose={() => setPanel(null)}
            onPickImage={pickImage}
          />
        )}
        {panel?.kind === "ai" && !study && (
          <AIPanel
            map={map}
            selectedNode={selectedNode}
            actions={actions}
            health={health}
            onClose={() => setPanel(null)}
            autoPrompt={aiPrompt}
            onAutoPromptConsumed={() => setAiPrompt(null)}
            onHealthChange={onHealthChange}
          />
        )}

        {study?.mode === "present" && (
          <PresentControls
            map={map}
            step={study.step}
            playing={study.playing}
            setPlaying={(playing) => setStudy((st) => (st?.mode === "present" ? { ...st, playing } : st))}
            setStep={(step) => setStudy((st) => (st?.mode === "present" ? { ...st, step } : st))}
            onExit={() => {
              setStudy(null);
              setTimeout(() => canvasRef.current?.fit(), 50);
            }}
            focusOn={(ids, s) => canvasRef.current?.focusOn(ids, s)}
            fit={() => canvasRef.current?.fit()}
            getLayout={() => canvasRef.current?.getLayout() ?? null}
          />
        )}
        {study?.mode === "quiz" && (
          <QuizControls
            total={quizTotal}
            revealed={study.revealed.size}
            onRevealAll={() => {
              const all = new Set((canvasRef.current?.getLayout()?.nodes ?? []).map((p) => p.id));
              setStudy({ mode: "quiz", revealed: all });
            }}
            onReset={() => setStudy({ mode: "quiz", revealed: new Set() })}
            onExit={() => setStudy(null)}
          />
        )}
        {celebrate > 0 && (
          <div className="confetti" aria-hidden>
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.07}s`, background: theme.palette[i % theme.palette.length] }} />
            ))}
          </div>
        )}
      </div>

      {study?.mode === "flash" && <Flashcards map={map} onExit={() => setStudy(null)} />}

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const target = sel ?? map.root.id;
          if (!file) return;
          try {
            actions.updateNode(target, { image: await imageFromFile(file) });
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      />

      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} map={map} getLayout={() => canvasRef.current?.getLayout() ?? null} theme={mapTheme} toast={toast} />
      <MarkdownDialog
        open={mdInsert}
        onClose={() => setMdInsert(false)}
        mode="insert"
        defaultLayout={map.layout}
        defaultTheme={map.theme}
        onInsert={(text) => {
          insertMarkdown(text, selOrRoot ?? undefined);
          setMdInsert(false);
        }}
      />
      <ActionSheet open={menu !== null} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />
      <PromptDialog
        open={renaming}
        title="Rename map"
        initial={map.title}
        confirmLabel="Rename"
        onCancel={() => setRenaming(false)}
        onConfirm={(v) => {
          actions.rename(v);
          setRenaming(false);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this map?"
        message={`“${map.title}” will be deleted permanently.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await api.deleteMap(map.id);
            onBack();
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      />
    </div>
  );
}
