/**
 * User symptom (2.FORMAT): jusan909 paste lands as vertical stack in col1, no styles.
 * Expect: horizontal JUSAN909 | 3,000 | $0.00 | … with link/green cues.
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
const { sanitizePastedHTML, plainMatrixToStyledHtmlTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const {
  formatHtmlLooksLikeVerticalNx1,
  extractPlainFieldDumpFromHtml,
} = await import(pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href);
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);

const fields = [
  "JUSAN909",
  "3,000",
  "$0.00",
  "$4,592.85",
  "$4,592.85",
  "$4,328.04",
  "$4,592.85",
  "$0.00",
  "$264.81",
];
const sub = ["SUBTOTAL", ...fields.slice(1)];
const total = ["TOTAL AMOUNT", ...fields.slice(1)];
const plain = [...fields, ...sub, ...total].join("\n");

function matrixFromHtml(html) {
  const normalized = normalizeClipboardHtmlToTable(html) || html;
  const sanitized = sanitizePastedHTML(normalized) || normalized;
  const structure = parseFormatHtmlTableStructure(sanitized);
  if (!structure) return { sanitized, structure: null, matrix: null };
  const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
  return { sanitized, structure, matrix };
}

function isStackedDump(matrix) {
  if (!matrix?.length) return true;
  const cols = matrix[0]?.length || 0;
  if (cols <= 1) return true;
  const v0 = String(matrix[0]?.[0]?.value || "");
  const h0 = String(matrix[0]?.[0]?.html || "");
  return v0.includes("3,000") || h0.includes("3,000") || v0.includes("\n");
}

function probe(name, html) {
  const { sanitized, structure, matrix } = matrixFromHtml(html);
  const cols = matrix?.[0]?.length || 0;
  const sample = (matrix || []).map((row) =>
    (row || []).map((cell) => String(cell?.value || "").slice(0, 14)),
  );
  const stacked = isStackedDump(matrix);
  return {
    name,
    nx1: formatHtmlLooksLikeVerticalNx1(sanitized),
    maxCols: structure?.maxCols ?? null,
    rows: matrix?.length ?? 0,
    cols,
    stacked,
    agent: sample[0]?.[0],
    bet: sample[0]?.[1],
    sample,
  };
}

const htmlNewline = `<table><tbody>${[fields, sub, total]
  .map((row) => `<tr><td>${row.join("\n")}</td></tr>`)
  .join("")}</tbody></table>`;

const htmlSpaces = `<table><tbody>${[fields, sub, total]
  .map((row) => `<tr><td>${row.join(" ")}</td></tr>`)
  .join("")}</tbody></table>`;

const htmlNx1 = `<table><tbody>${plain
  .split("\n")
  .map((line) => `<tr><td>${line}</td></tr>`)
  .join("")}</tbody></table>`;

// Fake-wide: one field per row + empty padding TDs (Chrome Material clipboard).
const htmlWideEmpty = `<table><tbody>${plain
  .split("\n")
  .map((line) => `<tr><td>${line}</td><td></td><td></td></tr>`)
  .join("")}</tbody></table>`;

const htmlDivStack = `<table><tbody>${[fields, sub, total]
  .map(
    (row) =>
      `<tr><td>${row
        .map((v, i) => {
          if (i === 0) return `<div><a href="#">${v}</a></div>`;
          if (i === row.length - 1) return `<div class="positive">${v}</div>`;
          return `<div>${v}</div>`;
        })
        .join("")}</td></tr>`,
  )
  .join("")}</tbody></table>`;

const htmlMat = `
<style>.positive{color:#82c751}</style>
${[fields, sub, total]
  .map(
    (row) => `<mat-row class="mat-row" role="row">${row
      .map((v, i) => {
        const cls = i === row.length - 1 ? "mat-cell positive" : "mat-cell";
        const inner = i === 0 && row[0] === "JUSAN909" ? `<a href="#">${v}</a>` : v;
        return `<mat-cell class="${cls}" role="gridcell">${inner}</mat-cell>`;
      })
      .join("")}</mat-row>`,
  )
  .join("\n")}`;

const plainMatrix = parsePlainTextMatrix(plain);
const fromHtmlNx1 = extractPlainFieldDumpFromHtml(htmlNx1);
const fromHtmlNx1Matrix = parsePlainTextMatrix(fromHtmlNx1);
const styled = plainMatrixToStyledHtmlTable(plainMatrix, htmlMat);

function looksLikeVerticalDumpMatrix(matrix) {
  if (!matrix?.length || matrix.length < 3) return false;
  let single = 0;
  const tokens = [];
  matrix.forEach((row) => {
    const filled = (row || [])
      .map((c, i) => ({ i, v: String(c?.value || "").trim() }))
      .filter((e) => e.v);
    if (filled.length === 1 && filled[0].i === 0) {
      single += 1;
      tokens.push(filled[0].v);
    }
  });
  if (single < Math.max(3, Math.ceil(matrix.length * 0.75))) return false;
  return tokens.filter((t) => /^\$?-?[\d,]+(?:\.\d+)?$/.test(t)).length >= 2;
}

function reshapeIfVerticalDump(matrix, htmlHints = "") {
  if (!looksLikeVerticalDumpMatrix(matrix)) return matrix;
  const tokens = (matrix || []).map((row) => String(row?.[0]?.value || "").trim()).filter(Boolean);
  const reshaped = parsePlainTextMatrix(tokens.join("\n"));
  if (!reshaped?.length || (reshaped[0]?.length || 0) < 2) return matrix;
  const tableHtml = plainMatrixToStyledHtmlTable(reshaped, htmlHints) || "";
  if (!tableHtml) return reshaped.map((row) => row.map((value) => ({ value })));
  return matrixFromHtml(tableHtml).matrix;
}

const probes = [
  probe("newline-2d", htmlNewline),
  probe("spaces-2d", htmlSpaces),
  probe("nx1-fields", htmlNx1),
  probe("wide-empty", htmlWideEmpty),
  probe("div-stack", htmlDivStack),
  probe("mat-row", htmlMat),
  probe("styled-from-plain", styled),
];

const nx1Filled = reshapeIfVerticalDump(matrixFromHtml(htmlNx1).matrix, htmlMat);
const wideFilled = reshapeIfVerticalDump(matrixFromHtml(htmlWideEmpty).matrix, htmlMat);
const wideNx1Flag = formatHtmlLooksLikeVerticalNx1(
  sanitizePastedHTML(htmlWideEmpty) || htmlWideEmpty,
);

const checks = {
  plain3x9: plainMatrix.length === 3 && plainMatrix[0]?.length === 9,
  plainAgent: plainMatrix[0]?.[0] === "JUSAN909",
  plainBet: plainMatrix[0]?.[1] === "3,000",
  nx1ExtractReshape: fromHtmlNx1Matrix[0]?.length === 9,
  newlineOk: !probes[0].stacked && probes[0].cols >= 9,
  spacesOk: !probes[1].stacked && probes[1].cols >= 9,
  nx1Detected: probes[2].nx1 === true,
  wideDetectedAsNx1: wideNx1Flag === true,
  nx1FillReshape:
    nx1Filled?.[0]?.[0]?.value === "JUSAN909" && nx1Filled?.[0]?.[1]?.value === "3,000",
  wideFillReshape:
    wideFilled?.[0]?.[0]?.value === "JUSAN909" && wideFilled?.[0]?.[1]?.value === "3,000",
  wideHasStyle:
    /#82c751|#82b8b9/.test(String(wideFilled?.[0]?.[0]?.html || wideFilled?.[0]?.[0]?.styleCssText || "")),
  divOk: !probes[4].stacked && probes[4].cols >= 9,
  matOk: !probes[5].stacked && probes[5].cols >= 9,
  styledOk: !probes[6].stacked && probes[6].cols >= 9 && /#82c751|#82b8b9/.test(styled),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, probes }, null, 2));
if (!ok) process.exit(1);
console.log("PASS jusan909 format dump shapes");
