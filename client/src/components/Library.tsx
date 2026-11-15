import { useMemo, useRef, useState } from "react";
import type { MapSummary } from "@shared/model";
import type { Prefs } from "../prefs";
import { IMPORT_ACCEPT } from "../export/importers";
import { MiniMap } from "./MiniMap";
import { type Action, ActionSheet, ConfirmDialog, PromptDialog, Segmented, timeAgo } from "./ui";

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
  onOpen: (id: string) => void;
  onCreate: () => void;
  onImport: (files: FileList) => void;
  onBackupAll: () => void;
  mapOps: MapOps;
  folderOps: FolderOps;
  loading: boolean;
}

function FolderIcon({ count }: { count: number }) {
  return (
    <svg viewBox="0 0 64 52" className="folder-icon" aria-hidden>
      <path d="M4 8a6 6 0 0 1 6-6h14l6 6h24a6 6 0 0 1 6 6v4H4z" fill="#f5b800" />
      <rect x="4" y="12" width="56" height="38" rx="6" fill="#fcd12a" />
      <text x="54" y="44" textAnchor="end" fontSize="13" fontWeight="600" fill="#fff">
        {count}
      </text>
    </svg>
  );
}

export function Library(props: Props) {
  const { maps, prefs, updatePrefs, folder, setFolder, onOpen, onCreate, onImport, onBackupAll, mapOps, folderOps, loading } = props;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"all" | "fav" | "study">("all");
  const [menu, setMenu] = useState<{ title: string; actions: Action[] } | null>(null);
  const [prompt, setPrompt] = useState<{ title: string; initial: string; confirm: string; onConfirm: (v: string) => void } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of prefs.folders) counts.set(f, 0);
    for (const m of maps) if (m.folder) counts.set(m.folder, (counts.get(m.folder) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [maps, prefs.folders]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    let list = maps;
    if (q) list = list.filter((m) => m.title.toLowerCase().includes(q) || m.searchText.includes(q) || (m.folder ?? "").toLowerCase().includes(q));
    else if (folder) list = list.filter((m) => m.folder === folder);
    else if (tab === "all") list = list.filter((m) => !m.folder);
    if (tab === "fav") list = list.filter((m) => m.favorite);
    if (tab === "study") list = list.filter((m) => m.progress);
    const sorted = [...list];
    if (prefs.sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (prefs.sort === "created") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted;
  }, [maps, q, folder, tab, prefs.sort]);

  const askMove = (m: MapSummary) =>
    setMenu({
      title: `Move “${m.title}”`,
      actions: [
        ...folders.filter(([name]) => name !== m.folder).map(([name]) => ({ label: name, icon: "📁", onSelect: () => mapOps.move(m.id, name) })),
        ...(m.folder ? [{ label: "Remove from folder", icon: "↩️", onSelect: () => mapOps.move(m.id, undefined) }] : []),
        {
          label: "New folder…",
          icon: "➕",
          onSelect: () =>
            setPrompt({
              title: "New folder",
              initial: "",
              confirm: "Create & move",
              onConfirm: (name) => {
                folderOps.create(name);
                mapOps.move(m.id, name);
              },
            }),
        },
      ],
    });

  const openMapMenu = (m: MapSummary) =>
    setMenu({
      title: m.title,
      actions: [
        { label: "Open", icon: "📂", onSelect: () => onOpen(m.id) },
        { label: m.favorite ? "Remove from favorites" : "Add to favorites", icon: m.favorite ? "☆" : "⭐", onSelect: () => mapOps.favorite(m.id, !m.favorite) },
        {
          label: "Rename",
          icon: "✏️",
          onSelect: () => setPrompt({ title: "Rename map", initial: m.title, confirm: "Rename", onConfirm: (v) => mapOps.rename(m.id, v) }),
        },
        { label: "Move to folder", icon: "📁", onSelect: () => askMove(m) },
        { label: "Duplicate", icon: "⧉", onSelect: () => mapOps.duplicate(m.id) },
        {
          label: "Delete",
          icon: "🗑️",
          danger: true,
          onSelect: () => setConfirm({ title: "Delete map?", message: `“${m.title}” will be deleted permanently.`, onConfirm: () => mapOps.remove(m.id) }),
        },
      ],
    });

  const openFolderMenu = (name: string, count: number) =>
    setMenu({
      title: name,
      actions: [
        { label: "Open", icon: "📂", onSelect: () => setFolder(name) },
        {
          label: "Rename",
          icon: "✏️",
          onSelect: () => setPrompt({ title: "Rename folder", initial: name, confirm: "Rename", onConfirm: (v) => folderOps.rename(name, v) }),
        },
        {
          label: "Delete folder",
          icon: "🗑️",
          danger: true,
          onSelect: () =>
            setConfirm({
              title: "Delete folder?",
              message: count ? `The ${count} map(s) inside will move out of the folder; they are not deleted.` : "This empty folder will be removed.",
              onConfirm: () => folderOps.remove(name),
            }),
        },
      ],
    });

  const moreMenu = () =>
    setMenu({
      title: "Library",
      actions: [
        { label: "New folder", icon: "📁", onSelect: () => setPrompt({ title: "New folder", initial: "", confirm: "Create", onConfirm: (v) => folderOps.create(v) }) },
        { label: "Import files (XMind, Markdown, OPML…)", icon: "📥", onSelect: () => fileRef.current?.click() },
        { label: "Back up all maps", icon: "💾", onSelect: onBackupAll },
        { label: `Sort: ${prefs.sort === "recent" ? "Last edited" : prefs.sort === "name" ? "Name" : "Date created"}`, icon: "↕️", onSelect: () => updatePrefs({ sort: prefs.sort === "recent" ? "name" : prefs.sort === "name" ? "created" : "recent" }) },
        { label: prefs.view === "grid" ? "View as list" : "View as grid", icon: prefs.view === "grid" ? "☰" : "▦", onSelect: () => updatePrefs({ view: prefs.view === "grid" ? "list" : "grid" }) },
      ],
    });

  const showFolders = !folder && !q && tab === "all";
  const total = maps.length;

  return (
    <div className="library">
      <header className="lib-header">
        {folder ? (
          <button type="button" className="icon-btn ghost" onClick={() => setFolder(null)} aria-label="Back">
            ‹
          </button>
        ) : (
          <span className="brand-mark" aria-hidden />
        )}
        <h1>{folder ?? "MindFlow"}</h1>
        <div className="spacer" />
        <button type="button" className={`icon-btn ghost${searching ? " active" : ""}`} onClick={() => setSearching((v) => !v)} aria-label="Search">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
        <button type="button" className="icon-btn ghost" onClick={moreMenu} aria-label="More">
          ⋯
        </button>
      </header>

      {searching && (
        <div className="lib-search">
          <input autoFocus placeholder="Search maps and topics…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="icon-btn ghost" onClick={() => setQuery("")} aria-label="Clear">
              ✕
            </button>
          )}
        </div>
      )}

      {!folder && (
        <div className="lib-tabs">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "Mind maps" },
              { value: "fav", label: "★ Favorites" },
              { value: "study", label: "✅ Progress" },
            ]}
          />
        </div>
      )}

      <div className="lib-scroll">
        {showFolders && folders.length > 0 && (
          <section className={`card-grid ${prefs.view}`}>
            {folders.map(([name, count]) => (
              <div key={name} className="folder-card" onClick={() => setFolder(name)}>
                <div className="folder-art">
                  <FolderIcon count={count} />
                </div>
                <div className="card-foot">
                  <div className="card-title">{name}</div>
                  <button
                    type="button"
                    className="card-menu"
                    aria-label={`${name} options`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolderMenu(name, count);
                    }}
                  >
                    ⋮
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {shown.length > 0 ? (
          <section className={`card-grid ${prefs.view}`}>
            {shown.map((m) => (
              <div key={m.id} className="map-card" onClick={() => onOpen(m.id)}>
                <div className="map-art">
                  <MiniMap preview={m.preview} layout={m.layout} theme={m.theme} />
                  {m.favorite && <span className="fav-badge">★</span>}
                </div>
                <div className="card-foot">
                  <div className="card-text">
                    <div className="card-title">{m.title}</div>
                    <div className="card-meta">
                      {m.nodeCount} topics · {timeAgo(m.updatedAt)}
                      {q && m.folder ? ` · 📁 ${m.folder}` : ""}
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
                    ⋮
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : (
          !loading && (
            <div className="lib-empty">
              {q ? (
                <p>No maps match “{query}”.</p>
              ) : tab === "fav" ? (
                <p>Tap ⋮ on a map and choose “Add to favorites”.</p>
              ) : tab === "study" ? (
                <p>Maps with checkboxes show their progress here. Add checkboxes to topics to track your syllabus.</p>
              ) : folder ? (
                <p>This folder is empty. Create a map here with +.</p>
              ) : total === 0 ? (
                <>
                  <div className="lib-empty-art">🧠</div>
                  <h2>Your first mind map</h2>
                  <p>Tap + to start from a template, paste Markdown, or let Claude build one for you.</p>
                </>
              ) : (
                <p>All your maps are in folders.</p>
              )}
            </div>
          )
        )}
      </div>

      <button type="button" className="fab" onClick={onCreate} aria-label="Create">
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

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
