import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPath = path.resolve(__dirname, "../../js/datacapturesummary.js");
let s = fs.readFileSync(legacyPath, "utf8");

const validateFn = `
function validateSummaryRowsCurrencyFormula(rows) {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        const selectCheckbox = row.querySelector('.summary-select-checkbox');
        if (selectCheckbox && selectCheckbox.checked) continue;
        const accountCell = cells[1];
        if (!accountCell) continue;
        const accountText = accountCell.textContent.trim();
        const hasButton = accountCell.querySelector('.add-account-btn');
        if (!accountText || accountText === '+' || hasButton) continue;
        const currencyCell = cells[3];
        const currencyText = (currencyCell && currencyCell.textContent) ? String(currencyCell.textContent).trim().replace(/[()]/g, '') : '';
        const formulaCell = cells[4];
        const formulaText = formulaCell ? (formulaCell.querySelector('.formula-text')?.textContent.trim() || formulaCell.textContent.trim() || '') : '';
        const currencyEmpty = !currencyText || /^select\\s*curren/i.test(currencyText);
        const formulaEmpty = !formulaText || !String(formulaText).trim();
        if (currencyEmpty || formulaEmpty) {
            const msg = currencyEmpty && formulaEmpty
                ? '请先填写 Currency 和 Formula 后再提交。Cannot save: Currency and Formula are required.'
                : (currencyEmpty ? '请先选择 Currency 后再提交。Cannot save: Currency is required.' : '请先填写 Formula 后再提交。Cannot save: Formula is required.');
            return { ok: false, message: msg };
        }
    }
    return { ok: true };
}
`;

const blockStart = "        // Collect all rows with data from summary table";
const blockStartIdx = s.indexOf(blockStart);
if (blockStartIdx === -1) throw new Error("collect block start not found");

const startMarker = "        rows.forEach(row => {";
const startIdx = s.indexOf(startMarker, blockStartIdx);
const endMarker = "        if (summaryRows.length === 0) {";
const endIdx = s.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  throw new Error("forEach markers not found");
}
const forEachBody = s.slice(startIdx + startMarker.length, endIdx).replace(/\s*\}\);\s*$/, "");
const collectFn = `
function collectSummarySubmitRowsFromTable(rows, parsedProcessData) {
    const summaryRows = [];
    rows.forEach(row => {${forEachBody}
    });
    return summaryRows;
}
`;

const prepareFn = `
async function prepareSummarySubmitCollection(parsedProcessData) {
    const summaryTableBody = document.getElementById('summaryTableBody');
    if (!summaryTableBody) {
        return { ok: false, message: 'Summary table not found.', rows: [] };
    }
    const rows = summaryTableBody.querySelectorAll('tr');
    window.__summaryAccountListCache = await fetchSummaryAccountList();
    const rowValidation = validateSummaryRowsCurrencyFormula(rows);
    if (!rowValidation.ok) {
        return { ok: false, message: rowValidation.message, rows: [] };
    }
    const summaryRows = collectSummarySubmitRowsFromTable(rows, parsedProcessData);
    if (summaryRows.length === 0) {
        return {
            ok: false,
            warning: true,
            message: 'No data to submit. Please add at least one row with data.',
            rows: []
        };
    }
    return { ok: true, rows: summaryRows };
}
window.__SUMMARY_PREPARE_SUBMIT_COLLECTION__ = prepareSummarySubmitCollection;
window.__SUMMARY_COLLECT_SUBMIT_ROWS__ = async function () {
    const raw = localStorage.getItem('capturedProcessData');
    if (!raw) return [];
    const parsedProcessData = JSON.parse(raw);
    const prep = await prepareSummarySubmitCollection(parsedProcessData);
    return prep.ok ? prep.rows : [];
};
`;

const insertBefore = "function validateSummarySubmitTotal() {";
const insertIdx = s.indexOf(insertBefore);
if (insertIdx === -1) throw new Error("insert point not found");
s = s.slice(0, insertIdx) + validateFn + collectFn + prepareFn + "\n" + s.slice(insertIdx);

const oldBlockStart = "        // Collect all rows with data from summary table";
const oldBlockEnd = "        if (summaryRows.length === 0) {";
const obs = s.indexOf(oldBlockStart);
const obe = s.indexOf(oldBlockEnd, obs);
if (obs === -1 || obe === -1) throw new Error("old block not found");

const replacement = [
  "        const prep = await prepareSummarySubmitCollection(parsedProcessData);",
  "        if (!prep.ok) {",
  "            setSummarySubmitUiActive(false);",
  "            showNotification(prep.warning ? 'Warning' : 'Error', prep.message || 'Failed to prepare summary rows.', 'error');",
  "            return;",
  "        }",
  "        const summaryRows = prep.rows;",
  "",
  "        ",
].join("\n");

s = s.slice(0, obs) + replacement + s.slice(obe);

fs.writeFileSync(legacyPath, s);
console.log("Patched", legacyPath);
