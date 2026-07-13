#!/usr/bin/env node
/**
 * Clear pipeline phase marker when user explicitly finishes or starts a fresh coding turn.
 * Invoked from sessionStart so a new chat does not inherit a stuck phase lock.
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
const phasePath = path.join(root, ".cursor", "state", "e2e-pipeline.phase");
const dirtyPath = path.join(root, ".cursor", "state", "e2e-pipeline.dirty");

for (const p of [phasePath, dirtyPath]) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

process.stdout.write("{}\n");
