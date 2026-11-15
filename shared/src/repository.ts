import type { MapSummary, MindMap } from "./model.ts";

/**
 * Storage the map tools work against. Implemented by the server's file store
 * and by the on-device store used by the standalone mobile app.
 */
export interface MapRepository {
  list(): MapSummary[];
  get(id: string): MindMap;
  has(id: string): boolean;
  create(map: MindMap): Promise<MindMap>;
  update(id: string, fn: (current: MindMap) => MindMap, expectedVersion?: number): Promise<MindMap>;
  delete(id: string): Promise<void>;
}
