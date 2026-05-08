import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const phpTarget = env.VITE_PHP_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    base: mode === "production" ? "/frontend/dist/" : "/",
    server: {
      proxy: {
        "/dashboard.php": { target: phpTarget, changeOrigin: true },
        "/deleted-log.php": { target: phpTarget, changeOrigin: true },
        "/deleted_log.php": { target: phpTarget, changeOrigin: true },
        "/member.php": { target: phpTarget, changeOrigin: true },
        "/owner_secondary_password.php": { target: phpTarget, changeOrigin: true },
        "/api": { target: phpTarget, changeOrigin: true },
        "/reset-password.php": { target: phpTarget, changeOrigin: true },
        "/images": { target: phpTarget, changeOrigin: true },
        "/js": { target: phpTarget, changeOrigin: true },
        "/datacapturesummary.php": { target: phpTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
