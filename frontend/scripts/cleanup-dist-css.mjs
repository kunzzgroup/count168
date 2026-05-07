import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const distCssDir = resolve(process.cwd(), "dist", "css");

if (existsSync(distCssDir)) {
  rmSync(distCssDir, { recursive: true, force: true });
  console.log("[cleanup] Removed dist/css directory.");
} else {
  console.log("[cleanup] dist/css not found, nothing to remove.");
}
