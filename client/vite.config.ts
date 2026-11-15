import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // `vite build --mode mobile`: standalone app bundled into the Android APK.
  const mobile = mode === "mobile";
  return {
    plugins: [
      react(),
      {
        // The APK has no manifest, service worker or web icons; drop links to them.
        name: "mindflow-mobile-html",
        transformIndexHtml(html: string) {
          if (!mobile) return html;
          // The Android app already keeps content clear of the status bar, so the page must
          // not reserve that space again (viewport-fit=cover would double it).
          return html
            .replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, "")
            .replace(", viewport-fit=cover", "");
        },
      },
    ],
    base: mobile ? "./" : "/",
    publicDir: mobile ? false : "public",
    resolve: {
      alias: { "@shared": path.resolve(here, "../shared/src") },
    },
    build: mobile
      ? { outDir: path.resolve(here, "../android/app/src/main/assets/www"), emptyOutDir: true }
      : { outDir: "dist" },
    server: {
      port: 5173,
      fs: { allow: [path.resolve(here, "..")] },
      proxy: {
        "/api": { target: "http://localhost:8787", changeOrigin: true },
        "/mcp": { target: "http://localhost:8787", changeOrigin: true },
      },
    },
  };
});
