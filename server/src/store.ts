import { promises as fs } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  type MindMap,
  type MapSummary,
  MapError,
  normalizeMap,
  summarize,
} from "../../shared/src/model.ts";

export type StoreEvent =
  | { type: "map.created"; map: MindMap }
  | { type: "map.updated"; map: MindMap }
  | { type: "map.deleted"; id: string };

/**
 * File-backed map store. Each map lives in `<dataDir>/<id>.json`. All writes go
 * through `update()` which bumps the version and notifies subscribers, so the
 * UI, the MCP server and the in-app Claude assistant always see the same state.
 */
export class MapStore {
  private readonly maps = new Map<string, MindMap>();
  private readonly emitter = new EventEmitter();
  private readonly queue = new Map<string, Promise<unknown>>();
  private loaded = false;

  constructor(private readonly dataDir: string) {
    this.emitter.setMaxListeners(1000);
  }

  async load(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const files = await fs.readdir(this.dataDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(this.dataDir, file), "utf8");
        const map = normalizeMap(JSON.parse(raw));
        this.maps.set(map.id, map);
      } catch (error) {
        console.warn(`[store] skipping unreadable map file ${file}:`, (error as Error).message);
      }
    }
    this.loaded = true;
  }

  list(): MapSummary[] {
    return [...this.maps.values()]
      .map(summarize)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    const normalized = normalizeMap(map);
    normalized.version = 1;
    normalized.updatedAt = new Date().toISOString();
    this.maps.set(normalized.id, normalized);
    await this.persist(normalized);
    this.emitter.emit("event", { type: "map.created", map: normalized } satisfies StoreEvent);
    return normalized;
  }

  /**
   * Apply a pure transformation to a map. Writes to the same map are serialised
   * so concurrent edits from the UI and MCP never interleave half-way.
   */
  async update(id: string, fn: (current: MindMap) => MindMap, expectedVersion?: number): Promise<MindMap> {
    const previous = this.queue.get(id) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      const current = this.get(id);
      if (expectedVersion !== undefined && expectedVersion !== current.version) {
        throw new MapError(
          `Version conflict: you have version ${expectedVersion}, the server has ${current.version}`,
          "INVALID",
        );
      }
      const next = normalizeMap(fn(current));
      next.id = current.id;
      next.createdAt = current.createdAt;
      next.version = current.version + 1;
      next.updatedAt = new Date().toISOString();
      this.maps.set(id, next);
      await this.persist(next);
      this.emitter.emit("event", { type: "map.updated", map: next } satisfies StoreEvent);
      return next;
    });
    this.queue.set(id, run);
    return run;
  }

  async delete(id: string): Promise<void> {
    this.get(id);
    this.maps.delete(id);
    await fs.rm(this.filePath(id), { force: true });
    this.emitter.emit("event", { type: "map.deleted", id } satisfies StoreEvent);
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  private filePath(id: string): string {
    // ids are generated from a safe alphabet, but never trust them for paths
    const safe = id.replace(/[^a-z0-9_-]/gi, "");
    return path.join(this.dataDir, `${safe}.json`);
  }

  private async persist(map: MindMap): Promise<void> {
    if (!this.loaded) await fs.mkdir(this.dataDir, { recursive: true });
    const target = this.filePath(map.id);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
    await fs.rename(tmp, target);
  }
}
