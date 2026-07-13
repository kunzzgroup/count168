#!/usr/bin/env node
/**
 * afterFileEdit: mark that this agent turn edited files (for optional e2e follow-up).
 */
import fs from "node:fs";
import path from "node:path";

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", () => resolve(""));
  });
}

function workspaceRoot(payload) {
  const roots = payload?.workspace_roots;
  if (Array.isArray(roots) && roots[0]) return roots[0];
  return process.cwd();
}

const raw = await readStdin();
let payload = {};
try {
  payload = raw ? JSON.parse(raw) : {};
} catch {
  payload = {};
}

const root = workspaceRoot(payload);
const stateDir = path.join(root, ".cursor", "state");
const autoPath = path.join(stateDir, "e2e-pipeline.auto");
const dirtyPath = path.join(stateDir, "e2e-pipeline.dirty");

if (fs.existsSync(autoPath)) {
  fs.mkdirSync(stateDir, { recursive: true });
  // New edits start a fresh cycle (unlock after a prior pipeline phase).
  const phasePath = path.join(stateDir, "e2e-pipeline.phase");
  try {
    if (fs.existsSync(phasePath)) fs.unlinkSync(phasePath);
  } catch {
    /* ignore */
  }
  fs.writeFileSync(
    dirtyPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        file: payload?.file_path || payload?.path || null,
      },
      null,
      2,
    ),
    "utf8",
  );
}

process.stdout.write("{}\n");
process.stdout.end?.();
