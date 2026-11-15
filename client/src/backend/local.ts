/**
 * On-device backend for the standalone mobile app: maps live in IndexedDB on the
 * phone, and the Claude assistant calls the Claude API directly with the user's key.
 * Mirrors the server's REST API so the rest of the app does not care which is used.
 */
import { type MapSummary, type MindMap, MapError, normalizeMap, summarize } from "@shared/model";
import { type CreateMapRequest, mapFromRequest } from "@shared/create";
import type { MapRepository } from "@shared/repository";
import { welcomeMap } from "@shared/welcome";
import { DEFAULT_MODEL, runChat } from "@shared/assistant";
import { ApiError, type ChatEvent, type ChatTurn, type Health, type StoreEvent } from "../apiTypes";

// ---------------------------------------------------------------- API key

const KEY_STORAGE = "mindflow:anthropicKey";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

// --------------------------------------------------------------- IndexedDB

const DB_NAME = "mindflow";
const STORE_NAME = "maps";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, mode);
    const req = run(t.objectStore(STORE_NAME));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ------------------------------------------------------------------- store

type Listener = (event: StoreEvent) => void;

class LocalStore implements MapRepository {
  private maps = new Map<string, MindMap>();
  private listeners = new Set<Listener>();
  private queue = new Map<string, Promise<unknown>>();
  private db!: IDBDatabase;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    this.db = await openDb();
    const all = await tx<MindMap[]>(this.db, "readonly", (s) => s.getAll() as IDBRequest<MindMap[]>);
    for (const raw of all) {
      try {
        const map = normalizeMap(raw);
        this.maps.set(map.id, map);
      } catch {
        /* skip damaged record */
      }
    }
    if (this.maps.size === 0) await this.create(welcomeMap());
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.();
  }

  list(): MapSummary[] {
    return [...this.maps.values()].map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): MindMap {
    const map = this.maps.get(id);
    if (!map) throw new MapError(`Mind map "${id}" was not found`, "NOT_FOUND");
    return map;
  }

  has(id: string): boolean {
    return this.maps.has(id);
  }

  async create(map: MindMap): Promise<MindMap> {
    const created = normalizeMap(map);
    created.version = 1;
    created.updatedAt = new Date().toISOString();
    await tx(this.db, "readwrite", (s) => s.put(created));
    this.maps.set(created.id, created);
    this.emit({ type: "map.created", map: created });
    return created;
  }

  async update(id: string, fn: (current: MindMap) => MindMap, expectedVersion?: number): Promise<MindMap> {
    const previous = this.queue.get(id) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const current = this.get(id);
        if (expectedVersion !== undefined && expectedVersion !== current.version) {
          throw new MapError(`Version conflict: you have version ${expectedVersion}, the device has ${current.version}`);
        }
        const next = normalizeMap(fn(current));
        next.id = current.id;
        next.createdAt = current.createdAt;
        next.version = current.version + 1;
        next.updatedAt = new Date().toISOString();
        await tx(this.db, "readwrite", (s) => s.put(next));
        this.maps.set(id, next);
        this.emit({ type: "map.updated", map: next });
        return next;
      });
    this.queue.set(id, run);
    return run;
  }

  async delete(id: string): Promise<void> {
    this.get(id);
    await tx(this.db, "readwrite", (s) => s.delete(id));
    this.maps.delete(id);
    this.emit({ type: "map.deleted", id });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StoreEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

let storePromise: Promise<LocalStore> | null = null;
function store(): Promise<LocalStore> {
  storePromise ??= (async () => {
    const s = new LocalStore();
    await s.ready;
    return s;
  })();
  return storePromise;
}

function asApiError(error: unknown): never {
  if (error instanceof MapError) throw new ApiError(error.message, error.code === "NOT_FOUND" ? 404 : 400);
  throw error;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// --------------------------------------------------------------------- API

export const localApi = {
  session: async () => ({ required: false, signedIn: true }),
  login: async (_password: string) => ({ ok: true }),
  logout: async () => ({ ok: true }),
  health: async (): Promise<Health> => ({
    ok: true,
    ai: Boolean(getApiKey()),
    model: DEFAULT_MODEL,
    auth: false,
    mcp: { http: "", tools: [] },
  }),
  listMaps: async () => (await store()).list(),
  getMap: async (id: string) => {
    try {
      return clone((await store()).get(id));
    } catch (e) {
      return asApiError(e);
    }
  },
  createMap: async (body: CreateMapRequest) => {
    const s = await store();
    try {
      return clone(await s.create(mapFromRequest(body)));
    } catch (e) {
      return asApiError(e);
    }
  },
  saveMap: async (map: MindMap, expectedVersion?: number) => {
    const s = await store();
    try {
      const incoming = normalizeMap(map);
      return clone(await s.update(map.id, () => incoming, expectedVersion));
    } catch (e) {
      return asApiError(e);
    }
  },
  deleteMap: async (id: string) => {
    try {
      await (await store()).delete(id);
    } catch (e) {
      asApiError(e);
    }
  },
};

export function localSubscribeEvents(onEvent: (event: StoreEvent) => void, onStatus?: (connected: boolean) => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let cancelled = false;
  void store().then((s) => {
    if (cancelled) return;
    unsubscribe = s.subscribe((event) => onEvent(clone(event)));
    onStatus?.(true);
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export async function localStreamChat(
  body: { mapId: string; message: string; history: ChatTurn[]; selectedNodeId?: string },
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    onEvent({ type: "error", message: "Add your Anthropic API key first (key button at the top of this panel)." });
    return;
  }
  const s = await store();
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  try {
    await runChat(client, s, body, onEvent, signal, { model: DEFAULT_MODEL, effort: "medium", fallbacks: true });
  } catch (error) {
    if (signal?.aborted) return;
    let message = "The assistant failed.";
    if (error instanceof Anthropic.AuthenticationError) message = "Claude rejected the API key. Check it with the key button above.";
    else if (error instanceof Anthropic.RateLimitError) message = "Claude is rate limited right now. Try again in a moment.";
    else if (error instanceof Anthropic.APIConnectionError) message = "Could not reach Claude. Check your internet connection.";
    else if (error instanceof Anthropic.APIError) message = `Claude API error ${error.status}: ${error.message}`;
    else if (error instanceof Error) message = error.message;
    onEvent({ type: "error", message });
  }
}
