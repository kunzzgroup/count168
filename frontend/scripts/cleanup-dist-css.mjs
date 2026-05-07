import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distIndexHtml = resolve(process.cwd(), "dist", "index.html");
const distCssDir = resolve(process.cwd(), "dist", "css");

if (existsSync(distIndexHtml)) {
  const html = readFileSync(distIndexHtml, "utf8");
  const patched = html.replaceAll("/frontend/dist/css/", "/frontend/public/css/");
  if (patched !== html) {
    writeFileSync(distIndexHtml, patched, "utf8");
    console.log("[cleanup] Rewrote dist/index.html CSS links to /frontend/public/css/.");
  }
}

if (existsSync(distCssDir)) {
  rmSync(distCssDir, { recursive: true, force: true });
  console.log("[cleanup] Removed dist/css directory.");
} else {
  console.log("[cleanup] dist/css not found, nothing to remove.");
}
