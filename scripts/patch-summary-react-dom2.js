const fs = require("fs");
const p = "js/datacapturesummary.js";
let s = fs.readFileSync(p, "utf8");

const replacements = [
  [
    /    if \(cells\[4\] && originalFormula !== null\) \{\s*\n        const imTooltip[\s\S]*?        \}\s*\n    \}/,
    `    if (cells[4] && originalFormula !== null) {
        const imTooltip = (row.getAttribute('data-input-method') || '').trim();
        const imTitle = imTooltip ? \` title="\${String(imTooltip).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"\` : '';
        setSummaryFormulaCellDisplay(cells[4], row, originalFormula === '' ? '' : originalFormula, imTitle);
        if (!isSummaryReactTableMode()) {
            attachInlineEditListeners(row);
        }
    }`,
  ],
  [
    /            cells\[4\]\.innerHTML = `\s*\n                <div class="formula-cell-content"[\s\S]*?            attachInlineEditListeners\(row\);\s*\n            \/\/ cells\[4\]\.style\.backgroundColor = '#e8f5e8'; \/\/ Removed\s*\n        \}/,
    `            setSummaryFormulaCellDisplay(cells[4], row, formulaDisplay, inputMethodTooltip);
            if (!isSummaryReactTableMode()) {
                attachInlineEditListeners(row);
            }`,
  ],
  [
    /    \/\/ Update Rate column \(now index 6\)\s*\n    if \(cells\[6\]\) \{\s*\n        \/\/ Clear the cell first\s*\n        cells\[6\]\.innerHTML = '';[\s\S]*?        cells\[6\]\.appendChild\(rateCheckbox\);\s*\n    \}\s*\n\s*\n    if \(data\.inputMethod !== undefined\)/,
    `    syncSummaryRateAndValueColumns(row, cells, data);

    if (data.inputMethod !== undefined)`,
  ],
];

for (const [re, rep] of replacements) {
  const before = s;
  s = s.replace(re, rep);
  if (s === before) console.warn("No match for", re.toString().slice(0, 70));
  else console.log("OK", re.toString().slice(0, 55));
}

fs.writeFileSync(p, s);
