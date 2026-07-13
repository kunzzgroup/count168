#!/usr/bin/env node
/**
 * stop: if auto-pipeline enabled and dirty from edits, inject e2e-pipeline follow-up once.
 * On success/no-op: print {}. Never follow up on aborted/error or when already looping.
 */
import fs from "node:fs";
import path from "node:path";

const FOLLOWUP = [
  "按 e2e-pipeline skill 执行：",
  "1) 圈定本次改动相关 SPA 路由（spaPath，勿漏 UUID）",
  "2) 对 https://count168.site 用 Playwright MCP 冒烟（browser_navigate + browser_snapshot）",
  "3) 对照 diff 做 Review（同一会话；不要调外部 Codex 扩展）",
  "4) 输出 Bug 清单后停步，等我回复「确认」再修",
  "基址默认 https://count168.site（live）；测的是已部署版本，本地未上线改动要标明。",
].join("\n");

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", () => resolve(""));
  });
}

function emit(obj) {
  const out = `${JSON.stringify(obj)}\n`;
  process.stdout.write(out);
  if (typeof process.stdout.flush === "function") {
    try {
      process.stdout.flush();
    } catch {
      /* ignore */
    }
  }
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
  emit({});
  process.exit(0);
}

const status = payload?.status;
const root = workspaceRoot(payload);
const stateDir = path.join(root, ".cursor", "state");
const autoPath = path.join(stateDir, "e2e-pipeline.auto");
const dirtyPath = path.join(stateDir, "e2e-pipeline.dirty");
const phasePath = path.join(stateDir, "e2e-pipeline.phase");

// Only auto-continue a normal completed turn after real file edits.
if (status !== "completed") {
  emit({});
  process.exit(0);
}

if (!fs.existsSync(autoPath) || !fs.existsSync(dirtyPath)) {
  emit({});
  process.exit(0);
}

// Already injected follow-up for this edit cycle — wait for new edits.
if (fs.existsSync(phasePath)) {
  try {
    fs.unlinkSync(dirtyPath);
  } catch {
    /* ignore */
  }
  emit({});
  process.exit(0);
}

try {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(phasePath, new Date().toISOString(), "utf8");
  fs.unlinkSync(dirtyPath);
} catch {
  emit({});
  process.exit(0);
}

emit({ followup_message: FOLLOWUP });
process.exit(0);
