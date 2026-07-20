/**
 * agent_period plain reshape must be multi-column (not N×1 col1 stack).
 * Usage: node scripts/agent-period-plain-smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = fs.readFileSync(path.join(root, "js/datacapture-paste-matrix.js"), "utf8");
const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox);
const api = sandbox.DataCapturePasteMatrix;

function fail(msg) {
  console.error("✗", msg);
  process.exit(1);
}
function ok(msg) {
  console.log("✓", msg);
}

const agentPeriod = [
  "SDSPDA95",
  "5,069",
  "$0.00",
  "$8,952.20",
  "$8,952.20",
  "$7,787.17",
  "$8,952.20",
  "$0.00",
  "$1,347.73",
  "SUBTOTAL",
  "5,069",
  "$0.00",
  "$8,952.20",
  "$8,952.20",
  "$7,787.17",
  "$8,952.20",
  "$0.00",
  "$1,347.73",
].join("\n");

const matrix = api.parsePlainTextMatrix(agentPeriod);
console.log("shape", matrix.length + "x" + (matrix[0]?.length || 0));
if (matrix.length !== 2 || (matrix[0]?.length || 0) < 8) {
  fail(`expected 2x9+, got ${matrix.length}x${matrix[0]?.length}: ${JSON.stringify(matrix)}`);
}
if (matrix[0][0] !== "SDSPDA95") fail(`row0 id: ${matrix[0][0]}`);
if (!/subtotal/i.test(matrix[1][0])) fail(`row1 label: ${matrix[1][0]}`);
ok("agent_period reshapes to 2 wide rows");

const sparse = agentPeriod.replace("5,069\n", "5,069\t\n");
const sparseMatrix = api.parsePlainTextMatrix(sparse);
if (sparseMatrix.length !== 2 || (sparseMatrix[0]?.length || 0) < 8) {
  fail(`sparse-tab reshape failed: ${sparseMatrix.length}x${sparseMatrix[0]?.length}`);
}
ok("sparse-tab agent_period still wide");

console.log("SMOKE GREEN");
