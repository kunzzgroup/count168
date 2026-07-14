/**
 * Source DOM is mat-row > mat-cell (cdk-column-*). Clipboard may rewrite tags,
 * but normalize + format fill must yield the pipe field order.
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
globalThis.HTMLElement = window.HTMLElement;
globalThis.DOMParser = window.DOMParser;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

const expected = [
  "SDSPDA95",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
];

function matRow(fields, { link = false, green = false } = {}) {
  const cols = [
    "agent_account",
    "bet_count",
    "event_amount",
    "bet_amount",
    "real_bet_amount",
    "win_score",
    "valid_amount",
    "handling_fee",
    "net_win_loss",
  ];
  const cells = fields
    .map((v, i) => {
      const positive = i === fields.length - 1 && green ? " positive" : "";
      const body = i === 0 && link ? `<a href="#">${v}</a>` : v;
      return `<mat-cell class="mat-cell cdk-column-${cols[i]} ng-star-inserted${positive}" role="gridcell">${body}</mat-cell>`;
    })
    .join("");
  return `<mat-row class="mat-row ng-star-inserted" role="row">${cells}</mat-row>`;
}

const html = `<!--StartFragment-->
<style>.positive{color:#82c751}a{color:#82b8b9}</style>
${matRow(expected, { link: true, green: true })}
${matRow(["Subtotal", ...expected.slice(1)])}
${matRow(["Total Amount", ...expected.slice(1)])}
<!--EndFragment-->`;

const normalized = normalizeClipboardHtmlToTable(html) || html;
const sanitized = sanitizePastedHTML(normalized) || normalized;
const structure = parseFormatHtmlTableStructure(sanitized);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const got = (matrix[0] || []).map((c) => String(c.value || ""));
const pipe = got.join("|");

const checks = {
  rows3: matrix.length === 3,
  cols9: got.length >= 9,
  pipeMatch: pipe === expected.join("|"),
  green: /#82c751/.test(String(matrix[0]?.[8]?.styleCssText || matrix[0]?.[8]?.html || "")),
  link: /#82b8b9/.test(String(matrix[0]?.[0]?.styleCssText || matrix[0]?.[0]?.html || "")),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, pipe, sample: matrix.map((r) => r.map((c) => c.value)) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS mat-row cdk columns → pipe order");
