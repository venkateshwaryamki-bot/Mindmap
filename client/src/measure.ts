/** Text measurement shared by layout estimates and SVG export, so both agree. */
let ctx: CanvasRenderingContext2D | null = null;
function context(): CanvasRenderingContext2D {
  ctx ??= document.createElement("canvas").getContext("2d")!;
  return ctx;
}

export function textWidth(text: string, font: string): number {
  const c = context();
  c.font = font;
  return c.measureText(text).width;
}

export function wrapText(text: string, font: string, maxWidth: number): string[] {
  const c = context();
  c.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const breakLong = (w: string) => {
    while (c.measureText(w).width > maxWidth && w.length > 1) {
      let i = w.length - 1;
      while (i > 1 && c.measureText(w.slice(0, i)).width > maxWidth) i--;
      lines.push(w.slice(0, i));
      w = w.slice(i);
    }
    return w;
  };
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = breakLong(word);
    } else line = line ? test : breakLong(word);
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
