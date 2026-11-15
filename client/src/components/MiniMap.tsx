import { memo, useMemo } from "react";
import { type LayoutMode, type MapPreview, type MapStyle, type MindMap, type MindNode, mapFromOutline } from "@shared/model";
import { layoutMap } from "../layout";
import { renderSvg } from "../export/svg";
import { getTheme } from "../themes";

let seq = 0;
const node = (text: string, children: MindNode[] = []): MindNode => ({ id: `p${seq++}`, text, children });

function previewToMap(preview: MapPreview, layout: LayoutMode, theme: string, style?: MapStyle): MindMap {
  const branches = preview.branches.map((b) => {
    const n = node(b.text || "Topic", Array.from({ length: Math.min(b.children, 2) }, () => node("····")));
    if (b.color) n.color = b.color;
    return n;
  });
  return {
    id: "preview",
    title: preview.root,
    root: node(preview.root || "Main", branches),
    layout,
    theme,
    style,
    version: 1,
    createdAt: "",
    updatedAt: "",
  };
}

interface Props {
  /** A library summary preview … */
  preview?: MapPreview;
  /** … or Markdown (templates) … */
  markdown?: string;
  /** … or a full map. */
  map?: MindMap;
  layout: LayoutMode;
  theme: string;
  style?: MapStyle;
  className?: string;
}

/** Small rendered picture of a map, used for cards, templates and themes. */
function MiniMapImpl({ preview, markdown, map, layout, theme, style, className }: Props) {
  const html = useMemo(() => {
    const t = getTheme(theme);
    let m: MindMap;
    if (map) m = { ...map, layout, theme, style: style ?? map.style };
    else if (markdown) m = { ...mapFromOutline(markdown), layout, theme, style };
    else m = previewToMap(preview ?? { root: "Main", branches: [] }, layout, theme, style);
    const result = layoutMap(m, new Map(), t);
    return renderSvg(m, result, t, { padding: 24, minWidth: 560, minHeight: 340 }).svg.replace(/^<svg /, '<svg preserveAspectRatio="xMidYMid meet" ');
  }, [preview, markdown, map, layout, theme, style]);
  return <div className={`minimap ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const MiniMap = memo(MiniMapImpl);
