import { useMemo, useRef, useState } from "react";
import type { MapSummary } from "@shared/model";
import type { Prefs } from "../prefs";
import { IMPORT_ACCEPT } from "../export/importers";
import { Icon } from "./Icon";
import { MiniMap } from "./MiniMap";
import { type Action, ActionSheet, ConfirmDialog, PromptDialog, timeAgo } from "./ui";

export interface MapOps {
  rename: (id: string, title: string) => void;
  move: (id: string, folder: string | undefined) => void;
  favorite: (id: string, value: boolean) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
}

export interface FolderOps {
  create: (name: string) => void;
  rename: (from: string, to: string) => void;
  remove: (name: string) => void;
}

interface Props {
  maps: MapSummary[];
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs>) => void;
  folder: string | null;
  setFolder: (folder: string | null) => void;
  /** Search tab: show the search field and search every map. */
  searchMode?: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onTemplates: () => void;
  onAI: () => void;
  onImport: (files: FileList) => void;
  onBackupAll: () => void;
  mapOps: MapOps;
  folderOps: FolderOps;
  loading: boolean;
}

const topics = (n: number) => `${n} topic${n === 1 ? "" : "s"}`;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Library(props: Props) {
  const { maps, prefs, updatePrefs, folder, setFolder, searchMode, onOpen, onCreate, onTemplates, onAI, onImport, onBackupAll, mapOps, folderOps, loading } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "starred" | "progress">("all");
  const [menu, setMenu] = useState<{ title: string; actions: Action[] } | null>(null);
  const [prompt, setPrompt] = useState<{ title: string; initial: string; confirm: string; onConfirm: (v: string) => void } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mapsRef = useRef<HTMLElement>(null);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of prefs.folders) counts.set(f, 0);
    for (const m of maps) if (m.folder) counts.set(m.folder, (counts.get(m.folder) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [maps, prefs.folders]);

  const sortList = (list: MapSummary[]) => {
    const sorted = [...list];
    if (prefs.sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (prefs.sort === "created") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted;
  };

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    let list = maps;
    if (searchMode) {
      if (!q) return sortList(list).slice(0, 12);
      return sortList(list.filter((m) => m.title.toLowerCase().includes(q) || m.searchText.includes(q) || (m.folder ?? "").toLowerCase().includes(q)));
    }
    if (folder) list = list.filter((m) => m.folder === folder);
    else if (filter === "all") list = list.filter((m) => !m.folder);
    if (filter === "starred") list = list.filter((m) => m.favorite);
    if (filter === "progress") list = list.filter((m) => m.progress);
    return sortList(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, q, folder, filter, prefs.sort, searchMode]);

  const recent = useMemo(() => [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8), [maps]);

  const newFolder = (then?: (name: string) => void) =>
    setPrompt({
      title: "New folder",
      initial: "",
      confirm: "Create",
      onConfirm: (name) => {
        folderOps.create(name);
        then?.(name);
      },
    });

  const askMove = (m: MapSummary) =>
    setMenu({
      title: `Move “${m.title}”`,
      actions: [
        ...folders.filter(([name]) => name !== m.folder).map(([name]) => ({ label: name, icon: "folder" as const, onSelect: () => mapOps.move(m.id, name) })),
        ...(m.folder ? [{ label: "Remove from folder", icon: "arrowLeft" as const, onSelect: () => mapOps.move(m.id, undefined) }] : []),
        { label: "New folder…", icon: "folderPlus", onSelect: () => newFolder((name) => mapOps.move(m.id, name)) },
      ],
    });

  const openMapMenu = (m: MapSummary) =>
    setMenu({
      title: m.title,
      actions: [
        { label: "Open", icon: "file", onSelect: () => onOpen(m.id) },
        { label: m.favorite ? "Remove star" : "Star", icon: "star", onSelect: () => mapOps.favorite(m.id, !m.favorite) },
        { label: "Rename", icon: "rename", onSelect: () => setPrompt({ title: "Rename map", initial: m.title, confirm: "Rename", onConfirm: (v) => mapOps.rename(m.id, v) }) },
        { label: "Move to folder", icon: "folder", onSelect: () => askMove(m) },
        { label: "Duplicate", icon: "copy", onSelect: () => mapOps.duplicate(m.id) },
        {
          label: "Delete",
          icon: "trash",
          danger: true,
          onSelect: () => setConfirm({ title: "Delete map?", message: `“${m.title}” will be deleted permanently.`, onConfirm: () => mapOps.remove(m.id) }),
        },
      ],
    });

  const openFolderMenu = (name: string, count: number) =>
    setMenu({
      title: name,
      actions: [
        { label: "Open", icon: "folder", onSelect: () => setFolder(name) },
        { label: "Rename", icon: "rename", onSelect: () => setPrompt({ title: "Rename folder", initial: name, confirm: "Rename", onConfirm: (v) => folderOps.rename(name, v) }) },
        {
          label: "Delete folder",
          icon: "trash",
          danger: true,
          onSelect: () =>
            setConfirm({
              title: "Delete folder?",
              message: count ? `The ${count} map(s) inside move out of the folder; they are not deleted.` : "This empty folder will be removed.",
              onConfirm: () => folderOps.remove(name),
            }),
        },
      ],
    });

  const moreMenu = () =>
    setMenu({
      title: "Library",
      actions: [
        { label: "New folder", icon: "folderPlus", onSelect: () => newFolder() },
        { label: "Import files (XMind, Markdown, OPML…)", icon: "upload", onSelect: () => fileRef.current?.click() },
        { label: "Back up all maps", icon: "backup", onSelect: onBackupAll },
        {
          label: `Sort: ${prefs.sort === "recent" ? "Last edited" : prefs.sort === "name" ? "Name" : "Date created"}`,
          icon: "sort",
          onSelect: () => updatePrefs({ sort: prefs.sort === "recent" ? "name" : prefs.sort === "name" ? "created" : "recent" }),
        },
        { label: prefs.view === "grid" ? "Show as list" : "Show as grid", icon: prefs.view === "grid" ? "list" : "grid", onSelect: () => updatePrefs({ view: prefs.view === "grid" ? "list" : "grid" }) },
      ],
    });

  const card = (m: MapSummary) => (
    <div key={m.id} className="map-card" onClick={() => onOpen(m.id)}>
      <div className="map-art">
        <MiniMap preview={m.preview} layout={m.layout} theme={m.theme} />
        {m.favorite && (
          <span className="fav-badge">
            <Icon name="star" size={15} />
          </span>
        )}
      </div>
      <div className="card-foot">
        <div className="card-text">
          <div className="card-title">{m.title}</div>
          <div className="card-meta">
            {topics(m.nodeCount)} · {timeAgo(m.updatedAt)}
            {searchMode && m.folder ? ` · ${m.folder}` : ""}
          </div>
          {m.progress && (
            <div className="progress" title={`${m.progress.done} of ${m.progress.total} done`}>
              <div style={{ width: `${(m.progress.done / m.progress.total) * 100}%` }} />
            </div>
          )}
        </div>
        <button
          type="button"
          className="card-menu"
          aria-label={`${m.title} options`}
          onClick={(e) => {
            e.stopPropagation();
            openMapMenu(m);
          }}
        >
          <Icon name="moreV" size={18} />
        </button>
      </div>
    </div>
  );

  const isHome = !folder && !searchMode;

  return (
    <div className="library">
      <header className="lib-header">
        {folder ? (
          <button type="button" className="icon-btn" onClick={() => setFolder(null)} aria-label="Back">
            <Icon name="back" />
          </button>
        ) : (
          <span className="brand-mark" aria-hidden />
        )}
        <h1>{searchMode ? "Search" : folder ?? "MindFlow"}</h1>
        <div className="spacer" />
        <button type="button" className="icon-btn" onClick={moreMenu} aria-label="More">
          <Icon name="more" />
        </button>
      </header>

      <div className="lib-scroll">
        {searchMode && (
          <div className="search-box">
            <Icon name="search" size={18} />
            <input autoFocus placeholder="Search maps and every topic…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="icon-btn sm" onClick={() => setQuery("")} aria-label="Clear">
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        )}

        {isHome && (
          <section className="hero">
            <div className="hero-text">
              <span className="hero-hello">{greeting()}</span>
              <h2>Think · Plan · Organize</h2>
            </div>
            <button type="button" className="btn primary hero-new" onClick={onCreate}>
              <Icon name="plus" size={18} strokeWidth={2.4} /> New Map
            </button>
            <div className="hero-quick">
              <button type="button" onClick={onTemplates}>
                <Icon name="templates" size={18} /> Templates
              </button>
              <button type="button" onClick={onAI}>
                <Icon name="sparkles" size={18} /> AI Generate
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={18} /> Import
              </button>
            </div>
          </section>
        )}

        {isHome && recent.length > 3 && (
          <section>
            <div className="section-head">
              <h3>Recent</h3>
              <button type="button" className="link-btn" onClick={() => mapsRef.current?.scrollIntoView({ behavior: "smooth" })}>
                See all <Icon name="chevronRight" size={14} />
              </button>
            </div>
            <div className="recent-row">{recent.map(card)}</div>
          </section>
        )}

        {isHome && folders.length > 0 && (
          <section>
            <div className="section-head">
              <h3>Folders</h3>
              <button type="button" className="link-btn" onClick={() => newFolder()}>
                <Icon name="plus" size={14} /> New
              </button>
            </div>
            <div className="folder-grid">
              {folders.map(([name, count]) => (
                <div key={name} className="folder-tile" onClick={() => setFolder(name)}>
                  <span className="folder-glyph">
                    <Icon name="folder" size={22} />
                  </span>
                  <span className="folder-text">
                    <span className="folder-name">{name}</span>
                    <span className="folder-count">{count === 1 ? "1 map" : `${count} maps`}</span>
                  </span>
                  <button
                    type="button"
                    className="card-menu"
                    aria-label={`${name} options`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderMenu(name, count);
                    }}
                  >
                    <Icon name="moreV" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section ref={mapsRef}>
          {!searchMode && (
            <div className="section-head">
              <h3>{folder ? `${shown.length} map${shown.length === 1 ? "" : "s"}` : "My Maps"}</h3>
              <div className="chips">
                <button type="button" className={`chip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>
                  All
                </button>
                <button type="button" className={`chip${filter === "starred" ? " on" : ""}`} onClick={() => setFilter("starred")}>
                  <Icon name="star" size={14} /> Starred
                </button>
                <button type="button" className={`chip${filter === "progress" ? " on" : ""}`} onClick={() => setFilter("progress")}>
                  <Icon name="task" size={14} /> Progress
                </button>
              </div>
            </div>
          )}
          {searchMode && <div className="section-head">{<h3>{q ? `${shown.length} result${shown.length === 1 ? "" : "s"}` : "Recently edited"}</h3>}</div>}

          {shown.length > 0 ? (
            <div className={`card-grid ${prefs.view}`}>{shown.map(card)}</div>
          ) : (
            !loading && (
              <div className="lib-empty">
                {searchMode ? (
                  <p>No maps match “{query}”.</p>
                ) : filter === "starred" ? (
                  <p>Star maps from their ⋮ menu to find them here.</p>
                ) : filter === "progress" ? (
                  <p>Maps with checkboxes show their progress here — great for tracking a syllabus.</p>
                ) : folder ? (
                  <p>This folder is empty. Tap + to create a map here.</p>
                ) : maps.length === 0 ? (
                  <p>No maps yet. Start with New Map, a template, or let AI build one.</p>
                ) : (
                  <p>All your maps are inside folders.</p>
                )}
              </div>
            )
          )}
        </section>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onImport(e.target.files);
          e.target.value = "";
        }}
      />

      <ActionSheet open={menu !== null} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />
      <PromptDialog
        open={prompt !== null}
        title={prompt?.title ?? ""}
        initial={prompt?.initial ?? ""}
        confirmLabel={prompt?.confirm}
        onCancel={() => setPrompt(null)}
        onConfirm={(v) => {
          prompt?.onConfirm(v);
          setPrompt(null);
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.onConfirm();
          setConfirm(null);
        }}
      />
    </div>
  );
}
