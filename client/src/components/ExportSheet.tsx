import { useState } from "react";
import type { MindMap } from "@shared/model";
import type { LayoutResult } from "../layout";
import type { Theme } from "../themes";
import { androidBridge, safeFileName } from "../export/download";
import { EXPORT_FORMATS, type ExportFormat, copyAsMarkdown, exportMap, renderImage } from "../export/formats";
import { Sheet } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  map: MindMap;
  getLayout: () => LayoutResult | null;
  theme: Theme;
  toast: (message: string) => void;
}

export function ExportSheet({ open, onClose, map, getLayout, theme, toast }: Props) {
  const [busy, setBusy] = useState<ExportFormat | "share" | null>(null);
  const canShare = typeof navigator.share === "function" && typeof navigator.canShare === "function" && !androidBridge();

  const run = async (format: ExportFormat) => {
    const layout = getLayout();
    if (!layout) return;
    setBusy(format);
    try {
      const label = await exportMap(format, map, layout, theme);
      toast(androidBridge() ? `${label} saved to Downloads` : `${label} exported`);
      onClose();
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const layout = getLayout();
    if (!layout) return;
    setBusy("share");
    try {
      const { blob } = await renderImage(map, layout, theme, "image/png", 2);
      const file = new File([blob], `${safeFileName(map.title)}.png`, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: map.title });
      else toast("Sharing images is not supported here; use PNG instead.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(`Share failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Export" wide>
      <p className="muted small">Every format is free and has no watermark.</p>
      <div className="export-grid">
        {EXPORT_FORMATS.map((f) => (
          <button key={f.id} type="button" className="export-tile" disabled={busy !== null} onClick={() => void run(f.id)}>
            <span className="export-icon">{busy === f.id ? <span className="spinner" /> : f.icon}</span>
            <span className="export-label">{f.label}</span>
            <span className="export-hint">{f.hint}</span>
          </button>
        ))}
      </div>
      <div className="row-wrap export-extra">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await copyAsMarkdown(map);
            toast("Markdown copied");
            onClose();
          }}
        >
          📋 Copy as Markdown
        </button>
        {canShare && (
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void share()}>
            {busy === "share" ? <span className="spinner" /> : "📤"} Share image
          </button>
        )}
      </div>
    </Sheet>
  );
}
