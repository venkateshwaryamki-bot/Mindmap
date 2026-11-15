interface AndroidBridge {
  saveFile: (name: string, base64: string, mime: string) => void;
  copyText: (text: string) => void;
}

/** Present when running inside the MindFlow Android app. */
export function androidBridge(): AndroidBridge | undefined {
  return (window as unknown as { MindFlowAndroid?: AndroidBridge }).MindFlowAndroid;
}

export function safeFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "mindmap"
  );
}

export function download(filename: string, data: Blob | string, type = "text/plain"): void {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const android = androidBridge();
  if (android) {
    // Android WebView cannot follow blob: download links, so hand the bytes to the app.
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      android.saveFile(filename, result.slice(result.indexOf(",") + 1), blob.type || type);
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<void> {
  const android = androidBridge();
  if (android) android.copyText(text);
  else await navigator.clipboard.writeText(text);
}
