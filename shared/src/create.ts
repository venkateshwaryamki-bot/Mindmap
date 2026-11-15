import { type LayoutMode, type MapStyle, type MindMap, LAYOUTS, mapFromOutline, newId, normalizeMap } from "./model.ts";

/** Body accepted by "create map" (REST POST /api/maps and the on-device backend). */
export interface CreateMapRequest {
  title?: string;
  /** Markdown / indented text */
  outline?: string;
  layout?: string;
  theme?: string;
  style?: MapStyle;
  folder?: string;
  /** A complete map to import (gets a fresh id) */
  map?: unknown;
}

export function mapFromRequest(body: CreateMapRequest): MindMap {
  if (body.map) {
    const imported = normalizeMap(body.map);
    imported.id = newId(10);
    imported.version = 1;
    if (body.folder !== undefined) {
      if (body.folder) imported.folder = body.folder;
      else delete imported.folder;
    }
    return imported;
  }
  const layout = LAYOUTS.includes(body.layout as LayoutMode) ? (body.layout as LayoutMode) : undefined;
  const map = mapFromOutline(body.outline ?? "", body.title?.trim() || "Untitled map", {
    layout,
    theme: body.theme || undefined,
    style: body.style,
    folder: body.folder?.trim() || undefined,
  });
  if (body.title?.trim()) {
    map.title = body.title.trim().slice(0, 200);
    map.root.text = map.title;
  }
  return normalizeMap(map);
}
