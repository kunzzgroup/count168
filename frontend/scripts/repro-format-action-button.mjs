/**
 * 2.FORMAT keeps decorative action button; 1.TEXT still strips it.
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window,
  document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  DOMParser: window.DOMParser,
});

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const clip = await import(pathToFileURL(path.join(base, "dataCaptureClipboard.js")).href);
const preview = await import(pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href);
const matrix = await import(pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href);

const actionCell =
  '<button type="button" class="mat-mdc-icon-button" onclick="evil()">' +
  '<mat-icon>remove</mat-icon></button>';

const textStrip = clip.sanitizePastedCellHtml(actionCell);
const formatKeep = clip.sanitizePastedCellHtmlForFormat(actionCell);

const tableHtml = `<table><tr>
  <td><a href="#">AW07</a></td>
  <td>$1.00</td>
  <td>${actionCell}</td>
</tr></table>`;
const sanitized = preview.sanitizePastedHTML(tableHtml);
const structure = matrix.parseFormatHtmlTableStructure(sanitized);
const body = matrix.buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const last = body[0]?.[body[0].length - 1];

const checks = {
  textStripped: !/button|mat-icon|data-dc-format-action|1e88e5/i.test(textStrip),
  formatHasChrome: /data-dc-format-action|1e88e5/.test(formatKeep),
  formatNoHandler: !/onclick|javascript:/i.test(formatKeep),
  tableHasAction: /data-dc-format-action|1e88e5/.test(sanitized),
  matrixHasActionHtml: /data-dc-format-action|1e88e5/.test(String(last?.html || "")),
  matrixHasMarker: String(last?.value || "").includes("−") || /data-dc-format-action/.test(String(last?.html || "")),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, last, formatKeep: formatKeep.slice(0, 120) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS format preserves action button chrome");
