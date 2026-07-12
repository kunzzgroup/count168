/**
 * Verify billing-statement plain text reshapes to multi-column like 3.CITIBET.
 * Run: node ./scripts/repro-statement-plain-matrix.mjs
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);

const lines = [];
const row1 = ["SDSPDA95", "2,881", "$0.00", "$4,378.65", "$4,378.65", "$4,199.70", "$4,378.65", "$0.00", "$178.95"];
const row2 = ["SUBTOTAL", "2,881", "$0.00", "$4,378.65", "$4,378.65", "$4,199.70", "$4,378.65", "$0.00", "$178.95"];
const row3 = ["TOTAL AMOUNT", "2,881", "$0.00", "$4,378.65", "$4,378.65", "$4,199.70", "$4,378.65", "$0.00", "$178.95"];
[row1, row2, row3].forEach((row) => row.forEach((cell) => lines.push(cell)));
const pasted = lines.join("\n");

const matrix = parsePlainTextMatrix(pasted);
const cols = matrix[0]?.length || 0;
const ok = matrix.length === 3 && cols === 9;
console.log(ok ? "PASS" : "FAIL", `${matrix.length}x${cols}`);
matrix.forEach((r, i) => console.log(" ", i, r));
if (!ok) process.exit(1);
