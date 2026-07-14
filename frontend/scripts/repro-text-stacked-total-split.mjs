/**
 * 1.TEXT: stacked SUB TOTAL+GRAND TOTAL in one label cell → two rows (Fig2-like).
 * Must not change format paste modules.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { splitStackedSubtotalGrandTotalRows } = await import(
  pathToFileURL(path.join(base, "dataCaptureStackedTotalSplit.js")).href,
);

const matrix = [
  ["1", "OB", "RS", "677", "100"],
  ["2", "OC", "NIXON", "8714", "200"],
  ["SUB TOTAL\nGRAND TOTAL", "", "", "18140", "7,371,689.64"],
];

const split = splitStackedSubtotalGrandTotalRows(matrix);
const checks = {
  rows: split.length === 4,
  subLabel: String(split[2][0]) === "SUB TOTAL",
  grandLabel: String(split[3][0]) === "GRAND TOTAL",
  sharedNum: String(split[2][3]) === "18140" && String(split[3][3]) === "18140",
  dataUntouched: String(split[0][0]) === "1" && String(split[1][1]) === "OC",
  noop: splitStackedSubtotalGrandTotalRows([["SUB TOTAL", "1"], ["GRAND TOTAL", "1"]]).length === 2,
};

const patchMatrix = [
  [
    { value: "SUB TOTAL\nGRAND TOTAL", html: "<div>SUB TOTAL<br>GRAND TOTAL</div>" },
    { value: "" },
    { value: "18140" },
  ],
];
const splitPatch = splitStackedSubtotalGrandTotalRows(patchMatrix);
const patchChecks = {
  patchRows: splitPatch.length === 2,
  patchSub: splitPatch[0][0].value === "SUB TOTAL" && splitPatch[0][0].html === undefined,
  patchGrand: splitPatch[1][0].value === "GRAND TOTAL",
  patchNum: splitPatch[0][2].value === "18140" && splitPatch[1][2].value === "18140",
};

const ok = Object.values(checks).every(Boolean) && Object.values(patchChecks).every(Boolean);
console.log(JSON.stringify({ ok, checks, patchChecks, split }, null, 2));
if (!ok) process.exit(1);
console.log("PASS stacked SUBTOTAL/GRAND TOTAL split helper");
