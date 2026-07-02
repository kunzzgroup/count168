import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const phpTarget = process.env.VITE_PHP_PROXY_TARGET || "http://127.0.0.1/c168_mobile";

/** Cloudflare Rocket Loader breaks Vite ES modules on count168.site */
function cloudflareModuleFix() {
  return {
    name: "cloudflare-module-fix",
    transformIndexHtml(html) {
      return html
        .replace(
          /<script type="module"(?![^>]*data-cfasync)/g,
          '<script type="module" data-cfasync="false"',
        )
        .replace(
          /<link rel="stylesheet"(?![^>]*data-cfasync)/g,
          '<link rel="stylesheet" data-cfasync="false"',
        );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudflareModuleFix()],
  base: mode === "production" ? "/c168_mobile/frontend/dist/" : "/",
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": { target: phpTarget, changeOrigin: true },
      "/images": { target: phpTarget, changeOrigin: true },
      "/reset-password": { target: phpTarget.replace(/\/c168_mobile\/?$/, "") || "http://127.0.0.1", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
