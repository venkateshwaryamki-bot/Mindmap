import type { NodeImage } from "@shared/model";

/** Load a picked image, shrink it for storage (max 640 px) and return a node image. */
export async function imageFromFile(file: File): Promise<NodeImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That file is not an image"));
      img.src = url;
    });
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const png = file.type === "image/png" || file.type === "image/gif" || file.type === "image/svg+xml";
    const src = canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.85);
    const display = Math.min(220, w);
    return { src, w: display, h: Math.round((h * display) / w) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
