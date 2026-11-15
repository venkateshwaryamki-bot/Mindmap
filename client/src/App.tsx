import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type MapSummary, type MindMap, summarize } from "@shared/model";
import type { CreateMapRequest } from "@shared/create";
import { AUTH_REQUIRED_EVENT, api, type Health, subscribeEvents } from "./api";
import { LoginScreen } from "./components/LoginScreen";
import { Library } from "./components/Library";
import { Editor } from "./components/Editor";
import { CreateSheet } from "./components/CreateSheet";
import { TemplatesPage } from "./components/TemplatesPage";
import { Icon, type IconName } from "./components/Icon";
import { MarkdownDialog } from "./components/MarkdownDialog";
import { AIGenerateDialog, type AIRequest } from "./components/AIGenerateDialog";
import { Settings } from "./components/Settings";
import { IMPORT_ACCEPT, importFile } from "./export/importers";
import { download } from "./export/download";
import { MOBILE_QUERY, useMediaQuery } from "./useMediaQuery";
import { usePrefs } from "./prefs";
import type { Template } from "./templates";

type Route = { name: "home" } | { name: "templates" } | { name: "search" } | { name: "settings" } | { name: "map"; id: string };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("map/")) return { name: "map", id: decodeURIComponent(h.slice(4)) };
  if (h === "templates") return { name: "templates" };
  if (h === "settings") return { name: "settings" };
  if (h === "search") return { name: "search" };
  return { name: "home" };
}

interface Toast {
  id: number;
  text: string;
}

export default function App() {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const { prefs, update: updatePrefs } = usePrefs();
  const [authState, setAuthState] = useState<"checking" | "required" | "ok">("checking");
  const [authRequired, setAuthRequired] = useState(false);
  const [route, setRoute] = useState<Route>(parseHash);
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [mdOpen, setMdOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  // ---- routing (history aware, so the phone's Back button works) -----------
  useEffect(() => {
    const onPop = () => setRoute(parseHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((next: Route) => {
    const hash = next.name === "home" ? "" : next.name === "map" ? `#/map/${encodeURIComponent(next.id)}` : `#/${next.name}`;
    history.pushState({ mf: true }, "", hash || location.pathname + location.search);
    setRoute(next);
  }, []);
  const goHome = useCallback(() => {
    if ((history.state as { mf?: boolean } | null)?.mf) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      setRoute({ name: "home" });
    }
  }, []);

  // ---- sign in -------------------------------------------------------------------
  useEffect(() => {
    api
      .session()
      .then((s) => {
        setAuthRequired(s.required);
        setAuthState(s.required && !s.signedIn ? "required" : "ok");
      })
      .catch(() => setAuthState("ok"));
    const onAuth = () => setAuthState("required");
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuth);
  }, []);
  const ready = authState === "ok";

  // ---- data --------------------------------------------------------------------
  const refreshMaps = useCallback(async () => {
    try {
      const list = await api.listMaps();
      setMaps(list);
      return list;
    } catch (e) {
      toast((e as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);
  const refreshHealth = useCallback(() => void api.health().then(setHealth).catch(() => undefined), []);

  useEffect(() => {
    if (!ready) return;
    refreshHealth();
    void refreshMaps();
  }, [ready, refreshMaps, refreshHealth]);

  useEffect(() => {
    if (!ready) return;
    return subscribeEvents((event) => {
      if (event.type === "map.deleted") setMaps((prev) => prev.filter((m) => m.id !== event.id));
      else {
        const summary = summarize(event.map);
        setMaps((prev) => [summary, ...prev.filter((m) => m.id !== summary.id)]);
      }
    });
  }, [ready]);

  const folders = useMemo(() => {
    const set = new Set(prefs.folders);
    for (const m of maps) if (m.folder) set.add(m.folder);
    return [...set].sort();
  }, [maps, prefs.folders]);

  // ---- creating ----------------------------------------------------------------
  const createAndOpen = useCallback(
    async (body: CreateMapRequest, prompt?: string) => {
      try {
        const map = await api.createMap({ folder: folder ?? undefined, ...body });
        setCreateOpen(false);
        setMdOpen(false);
        setAiOpen(false);
        if (prompt) setAutoPrompt(prompt);
        navigate({ name: "map", id: map.id });
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [folder, navigate, toast],
  );

  const createBlank = () =>
    void createAndOpen({ outline: "# Main Idea\n- Ideas\n- Goals\n- Action", layout: prefs.defaultLayout, theme: prefs.defaultTheme });
  const createFromTemplate = (t: Template) => void createAndOpen({ outline: t.markdown, layout: t.layout, theme: t.theme, style: t.style });
  const createFromAI = (r: AIRequest) => void createAndOpen({ title: r.title, layout: r.layout, theme: prefs.defaultTheme }, r.prompt);

  const runImport = async (files: FileList | File[]) => {
    let created: MindMap | undefined;
    let count = 0;
    for (const file of Array.from(files)) {
      try {
        for (const req of await importFile(file, folder ?? undefined)) {
          created = await api.createMap(req);
          count++;
        }
      } catch (e) {
        toast(`${file.name}: ${(e as Error).message}`);
      }
    }
    await refreshMaps();
    setCreateOpen(false);
    if (count === 1 && created) navigate({ name: "map", id: created.id });
    else if (count > 1) toast(`Imported ${count} maps`);
  };

  const backupAll = async () => {
    try {
      const list = await api.listMaps();
      const all: MindMap[] = [];
      for (const m of list) all.push(await api.getMap(m.id));
      const stamp = new Date().toISOString().slice(0, 10);
      download(`mindflow-backup-${stamp}.json`, JSON.stringify({ mindflowBackup: 2, exportedAt: new Date().toISOString(), folders, maps: all }, null, 2), "application/json");
      toast(`Backed up ${all.length} map(s)`);
    } catch (e) {
      toast(`Backup failed: ${(e as Error).message}`);
    }
  };

  // ---- map & folder operations from the library -----------------------------
  const patchMap = useCallback(
    async (id: string, fn: (m: MindMap) => MindMap) => {
      try {
        const m = await api.getMap(id);
        await api.saveMap(fn(m), m.version);
        await refreshMaps();
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [refreshMaps, toast],
  );

  const mapOps = {
    rename: (id: string, title: string) => void patchMap(id, (m) => ({ ...m, title, root: { ...m.root, text: title } })),
    move: (id: string, f: string | undefined) => void patchMap(id, (m) => ({ ...m, folder: f })).then(() => toast(f ? `Moved to ${f}` : "Moved out of folder")),
    favorite: (id: string, value: boolean) => void patchMap(id, (m) => ({ ...m, favorite: value })),
    duplicate: (id: string) =>
      void (async () => {
        const m = await api.getMap(id);
        await api.createMap({ map: { ...m, title: `${m.title} (copy)`, root: { ...m.root, text: `${m.title} (copy)` } } });
        await refreshMaps();
        toast("Map duplicated");
      })().catch((e: Error) => toast(e.message)),
    remove: (id: string) =>
      void api
        .deleteMap(id)
        .then(refreshMaps)
        .catch((e: Error) => toast(e.message)),
  };

  const folderOps = {
    create: (name: string) => {
      if (!folders.includes(name)) updatePrefs({ folders: [...prefs.folders, name] });
    },
    rename: (from: string, to: string) => {
      updatePrefs({ folders: [...prefs.folders.filter((f) => f !== from && f !== to), to] });
      void (async () => {
        for (const m of maps.filter((x) => x.folder === from)) await patchMap(m.id, (x) => ({ ...x, folder: to }));
        if (folder === from) setFolder(to);
      })();
    },
    remove: (name: string) => {
      updatePrefs({ folders: prefs.folders.filter((f) => f !== name) });
      void (async () => {
        for (const m of maps.filter((x) => x.folder === name)) await patchMap(m.id, (x) => ({ ...x, folder: undefined }));
        if (folder === name) setFolder(null);
      })();
    },
  };

  // ---- Android back button --------------------------------------------------------
  useEffect(() => {
    const w = window as unknown as { mindflowBack?: () => boolean; mindflowEditorBack?: () => boolean };
    w.mindflowBack = () => {
      if (aiOpen) return setAiOpen(false), true;
      if (mdOpen) return setMdOpen(false), true;
      if (createOpen) return setCreateOpen(false), true;
      if (route.name === "map") {
        if (w.mindflowEditorBack?.()) return true;
        goHome();
        return true;
      }
      if (route.name !== "home") return goHome(), true;
      if (folder) return setFolder(null), true;
      return false;
    };
    return () => {
      delete w.mindflowBack;
    };
  }, [aiOpen, mdOpen, createOpen, route, folder, goHome]);

  if (authState === "checking") return <div className="splash" />;
  if (authState === "required") return <LoginScreen onSignedIn={() => setAuthState("ok")} />;

  const signOut = authRequired
    ? async () => {
        await api.logout().catch(() => undefined);
        setAuthState("required");
      }
    : undefined;

  const navItem = (name: Route["name"], icon: IconName, label: string) => (
    <button
      type="button"
      className={route.name === name ? "on" : ""}
      onClick={() => {
        if (name === "home") setFolder(null);
        if (route.name !== name) navigate({ name } as Route);
      }}
    >
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </button>
  );

  const mobileNav = (
    <nav className="bottom-nav">
      {navItem("home", "home", "Home")}
      {navItem("templates", "templates", "Templates")}
      <button type="button" className="nav-create" onClick={() => setCreateOpen(true)} aria-label="Create">
        <span>
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </span>
      </button>
      {navItem("search", "search", "Search")}
      {navItem("settings", "settings", "Settings")}
    </nav>
  );

  const sidebar = (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden />
        <span>MindFlow</span>
      </div>
      <button type="button" className="btn primary sidebar-new" onClick={() => setCreateOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> New Map
      </button>
      <nav className="side-nav">
        {navItem("home", "home", "My Maps")}
        {navItem("templates", "templates", "Templates")}
        {navItem("search", "search", "Search")}
        <button type="button" onClick={() => setAiOpen(true)}>
          <Icon name="sparkles" size={22} />
          <span>AI Generate</span>
        </button>
      </nav>
      {folders.length > 0 && (
        <>
          <div className="side-label">Folders</div>
          <nav className="side-nav folders">
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                className={route.name === "home" && folder === f ? "on" : ""}
                onClick={() => {
                  setFolder(f);
                  if (route.name !== "home") navigate({ name: "home" });
                }}
              >
                <Icon name="folder" size={20} />
                <span>{f}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      <div className="spacer" />
      <nav className="side-nav">{navItem("settings", "settings", "Settings")}</nav>
    </aside>
  );

  return (
    <div className={`app${isMobile ? " is-mobile" : ""}`}>
      {route.name === "map" ? (
        <Editor
          key={route.id}
          mapId={route.id}
          health={health}
          prefs={prefs}
          folders={folders}
          isMobile={isMobile}
          toast={toast}
          onBack={() => {
            goHome();
            void refreshMaps();
          }}
          onDuplicate={mapOps.duplicate}
          onHealthChange={refreshHealth}
          autoPrompt={autoPrompt}
          onAutoPromptConsumed={() => setAutoPrompt(null)}
        />
      ) : (
        <div className="shell">
          {!isMobile && sidebar}
          <main className="shell-main">
            {(route.name === "home" || route.name === "search") && (
              <Library
                key={route.name}
                searchMode={route.name === "search"}
                onTemplates={() => navigate({ name: "templates" })}
                onAI={() => setAiOpen(true)}
                maps={maps}
                prefs={prefs}
                updatePrefs={updatePrefs}
                folder={folder}
                setFolder={setFolder}
                onOpen={(id) => navigate({ name: "map", id })}
                onCreate={() => setCreateOpen(true)}
                onImport={(files) => void runImport(files)}
                onBackupAll={() => void backupAll()}
                mapOps={mapOps}
                folderOps={folderOps}
                loading={loading}
              />
            )}
            {route.name === "templates" && (
              <TemplatesPage onTemplate={createFromTemplate} onBlank={createBlank} onAI={() => setAiOpen(true)} onMarkdown={() => setMdOpen(true)} />
            )}
            {route.name === "settings" && (
              <Settings
                prefs={prefs}
                update={updatePrefs}
                health={health}
                mapCount={maps.length}
                onBackupAll={() => void backupAll()}
                onImport={() => importRef.current?.click()}
                onHealthChange={refreshHealth}
                onSignOut={signOut}
              />
            )}
          </main>
          {isMobile && mobileNav}
        </div>
      )}

      <CreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onBlank={createBlank}
        onTemplate={createFromTemplate}
        onMarkdown={() => {
          setCreateOpen(false);
          setMdOpen(true);
        }}
        onAI={() => {
          setCreateOpen(false);
          setAiOpen(true);
        }}
        onImport={() => importRef.current?.click()}
      />
      <MarkdownDialog
        open={mdOpen}
        onClose={() => setMdOpen(false)}
        mode="create"
        defaultLayout={prefs.defaultLayout}
        defaultTheme={prefs.defaultTheme}
        onCreate={(markdown, layout, theme) => void createAndOpen({ outline: markdown, layout, theme })}
      />
      <AIGenerateDialog open={aiOpen} onClose={() => setAiOpen(false)} defaultLayout={prefs.defaultLayout} onGenerate={createFromAI} />

      <input
        ref={importRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void runImport(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
