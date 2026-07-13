/**
 * PHP count168 mat-row paste repro (plain + HTML normalize).
 * Run from count168: node ./scripts/repro-mat-row-paste.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Prefer local linkedom, else sibling count168test
let parseHTML;
try {
  const require = createRequire(path.join(root, "package.json"));
  ({ parseHTML } = require("linkedom"));
} catch {
  const require = createRequire(
    path.join(root, "..", "count168test", "frontend", "package.json"),
  );
  ({ parseHTML } = require("linkedom"));
}

const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
const sandbox = { window, document, Node: window.Node, HTMLElement: window.HTMLElement, console };
sandbox.globalThis = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

function loadScript(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  vm.runInContext(code, sandbox, { filename: rel });
}

loadScript("js/datacapture-clipboard-normalize.js");
loadScript("js/datacapture-paste-matrix.js");

const pasteMatrix = sandbox.window.DataCapturePasteMatrix || sandbox.DataCapturePasteMatrix;
const clipboardNorm =
  sandbox.window.DataCaptureClipboardNormalize || sandbox.DataCaptureClipboardNormalize;
if (!pasteMatrix || !clipboardNorm) {
  console.error("APIs missing", {
    paste: !!pasteMatrix,
    norm: !!clipboardNorm,
    keys: Object.keys(sandbox.window || {}).filter((k) => k.startsWith("Data")),
  });
  process.exit(1);
}

const { parsePlainTextMatrix } = pasteMatrix;
const { normalizeClipboardHtmlToTable, clipboardHtmlLooksLikeGrid } = clipboardNorm;

let failed = 0;

const plain1 = `SDSPDA95
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

const plain3 = `${plain1}
Subtotal
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Total Amount
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

const plain4 = `${plain1}
SDSPDA95B
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Subtotal
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Total Amount
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

for (const [name, plain, rows, cols] of [
  ["plain-1-row", plain1, 1, 9],
  ["plain-3-rows", plain3, 3, 9],
  ["plain-4-rows", plain4, 4, 9],
]) {
  const m = parsePlainTextMatrix(plain);
  const ok = m.length === rows && (m[0]?.length || 0) === cols;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${m.length}x${m[0]?.length || 0}`);
  if (!ok) {
    failed += 1;
    console.log(m);
  }
}

const numeric = ["100", "200", "300", "$4.00", "5,000", "6.5", "7", "8", "9"];
const numM = parsePlainTextMatrix(numeric.join("\n"));
const numOk = numM.length === 9 && numM.every((r) => r.length === 1);
console.log(`${numOk ? "PASS" : "FAIL"} all-numeric-stays-1col`);
if (!numOk) failed += 1;

const matHtml = `
<html><body><!--StartFragment-->
<mat-row class="mat-row" role="row">
  <mat-cell role="gridcell">SDSPDA95</mat-cell>
  <mat-cell role="gridcell">6,522</mat-cell>
  <mat-cell role="gridcell">$0.00</mat-cell>
  <mat-cell role="gridcell">$11,110.75</mat-cell>
  <mat-cell role="gridcell">$11,110.75</mat-cell>
  <mat-cell role="gridcell">$9,825.31</mat-cell>
  <mat-cell role="gridcell">$11,110.75</mat-cell>
  <mat-cell role="gridcell">$0.00</mat-cell>
  <mat-cell role="gridcell">$1,285.44</mat-cell>
</mat-row>
<mat-row class="mat-row" role="row">
  <mat-cell role="gridcell">Subtotal</mat-cell>
  <mat-cell role="gridcell">6,522</mat-cell>
  <mat-cell role="gridcell">$0.00</mat-cell>
  <mat-cell role="gridcell">$11,110.75</mat-cell>
  <mat-cell role="gridcell">$11,110.75</mat-cell>
  <mat-cell role="gridcell">$9,825.31</mat-cell>
  <mat-cell role="gridcell">$11,110.75</mat-cell>
  <mat-cell role="gridcell">$0.00</mat-cell>
  <mat-cell role="gridcell">$1,285.44</mat-cell>
</mat-row>
<!--EndFragment--></body></html>`;

const looks = clipboardHtmlLooksLikeGrid(matHtml);
const normalized = normalizeClipboardHtmlToTable(matHtml);
const hasTable = /<table\b/i.test(normalized);
const trCount = (normalized.match(/<tr\b/gi) || []).length;
const tdCount = (normalized.match(/<t[dh]\b/gi) || []).length;
const htmlOk = looks && hasTable && trCount === 2 && tdCount >= 18;
console.log(
  `${htmlOk ? "PASS" : "FAIL"} mat-row-html-normalize: looks=${looks} table=${hasTable} tr=${trCount} cells≈${tdCount}`,
);
if (!htmlOk) failed += 1;

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll PHP mat-row cases green");
