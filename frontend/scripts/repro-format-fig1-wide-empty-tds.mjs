/**
 * Fig1 on multi-TD rows: first TD holds stacked fields, remaining TDs empty.
 * Must expand to SDSPDA95|7,182|$0.00|… (9 cols).
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
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);

const vals = [
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

function stacked(fields, { link = false, green = false, bold = false } = {}) {
  return fields
    .map((v, i) => {
      if (i === 0 && link) return `<div style="color:#82b8b9"><a href="#">${v}</a></div>`;
      if (i === fields.length - 1 && green) return `<div style="color:#82c751">${v}</div>`;
      if (bold) return `<div><b>${v}</b></div>`;
      return `<div>${v}</div>`;
    })
    .join("");
}

function wideRow(fields, opts) {
  const empties = Array.from({ length: 8 }, () => "<td></td>").join("");
  return `<tr><td>${stacked(fields, opts)}</td>${empties}</tr>`;
}

const html = `<table><tbody>${wideRow(vals, { link: true, green: true })}${wideRow(
  ["SUBTOTAL", ...vals.slice(1)],
  { bold: true },
)}${wideRow(["TOTAL AMOUNT", ...vals.slice(1)], { bold: true })}</tbody></table>`;

const sanitized = sanitizePastedHTML(html) || html;
const structure = parseFormatHtmlTableStructure(sanitized);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const filled = (row) =>
  (row || []).filter((c) => String(c?.value || "").trim()).length;

const expected = vals.join("|");
const got = (matrix[0] || []).map((c) => String(c.value || "")).join("|");

const checks = {
  rows3: matrix.length === 3,
  cols9: (matrix[0]?.length || 0) >= 9,
  agent: String(matrix[0]?.[0]?.value || "") === "SDSPDA95",
  bet: String(matrix[0]?.[1]?.value || "") === "7,182",
  filled9: filled(matrix[0]) >= 9,
  notDump: !String(matrix[0]?.[0]?.html || "").includes("$0.00"),
  pipeOrder: got.startsWith(expected),
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      expected,
      got,
      filled: matrix.map(filled),
      sample: matrix.map((r) => r.map((c) => String(c.value || "").slice(0, 14))),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS wide empty-td stacked → fig2 pipe order");
