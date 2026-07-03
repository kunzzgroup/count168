/**
 * After `npm run build`: drop Vite hash asset churn, stage frontend source + dist/css.
 * Run from frontend/ via package.json postbuild (repo root = ../..).
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function run(cmd, { allowFail = false } = {}) {
  try {
    execSync(cmd, { cwd: repoRoot, stdio: "inherit", shell: true });
    return true;
  } catch {
    if (!allowFail) throw new Error(`git-sync-after-build failed: ${cmd}`);
    return false;
  }
}

function isGitRepo() {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

if (!isGitRepo()) {
  console.log("[git-sync-after-build] skip — not a git repo");
  process.exit(0);
}

console.log("[git-sync-after-build] restore dist/assets + index.html churn…");
run("git restore frontend/dist/assets frontend/dist/index.html", { allowFail: true });
run("git clean -fd frontend/dist/assets", { allowFail: true });

const stagePaths = ["frontend/src", "frontend/public", "frontend/dist/css"];
console.log("[git-sync-after-build] stage frontend source + dist/css…");
for (const rel of stagePaths) {
  run(`git add -A -- "${rel}"`, { allowFail: true });
}

console.log("[git-sync-after-build] done — dist/assets not staged (hash bundles)");
