/**
 * Prefer plain dual for agent_period; statement sheets (serial + 16 cols) stay HTML-first.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

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
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const paste = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href,
);

const fields = [
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
const agentPlain = [...fields, ["Subtotal", ...fields.slice(1)].flat()].join("\n");
const agentMatrix = parsePlainTextMatrix(fields.concat(["Subtotal", ...fields.slice(1)]).join("\n"));

const statementPlain = [
  "1\tOB\tRS\t9714\t7054992\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0",
  "2\tOC\tXX\t1\t2\t3\t4\t5\t6\t7\t8\t9\t0\t1\t2\t3",
].join("\n");
const statementMatrix = parsePlainTextMatrix(statementPlain);

const wideStack =
  `<table><tr><td>${fields.map((v) => `<div>${v}</div>`).join("")}</td>${"<td></td>".repeat(8)}</tr></table>`;

const extracted = paste.extractPlainFieldDumpFromHtml(wideStack);
const extractedMatrix = parsePlainTextMatrix(extracted);

const checks = {
  agentMulti: (agentMatrix[0]?.length || 0) >= 9,
  agentPrefer: paste.formatHtmlLooksLikeVerticalNx1(wideStack) === false,
  extractReshape: (extractedMatrix[0]?.length || 0) >= 9,
  extractLines: extracted.split("\n").filter(Boolean).length >= 9,
  statementWide: (statementMatrix[0]?.length || 0) >= 14,
  statementNotAgentWidth: (statementMatrix[0]?.length || 0) > 12,
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, extractCols: extractedMatrix[0]?.length }, null, 2));
if (!ok) process.exit(1);
console.log("PASS agent_period prefer-plain heuristics");
