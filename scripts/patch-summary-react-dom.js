const fs = require("fs");
const p = "js/datacapturesummary.js";
let s = fs.readFileSync(p, "utf8");

const replacements = [
  [
    /        cells\[4\]\.innerHTML = `\s*\n            <div class="formula-cell-content"[\s\S]*?        `;\s*\n        \/\/ Attach double-click event listener\s*\n        attachInlineEditListeners\(row\);\s*\n        \/\/ cells\[4\]\.style\.backgroundColor = '#e8f5e8'; \/\/ Removed/g,
    `        setSummaryFormulaCellDisplay(cells[4], row, displayText, inputMethodTooltip);
        if (!isSummaryReactTableMode()) {
            attachInlineEditListeners(row);
        }`,
  ],
  [
    /    \/\/ Update Rate column \(index 6\)\s*\n    if \(cells\[6\]\) \{[\s\S]*?        attachRateValueEditListener\(cells\[7\], row\);\s*\n    \}/,
    `    syncSummaryRateAndValueColumns(row, cells, data);
    if (cells[7] && !isSummaryReactTableMode() && typeof attachRateValueEditListener === 'function') {
        attachRateValueEditListener(cells[7], row);
    }`,
  ],
  [
    /                    \/\/ 刷新 Id Product 单元格显示（以清掉 description 渲染）\s*\n                    if \(typeof refreshIdProductCellDisplay === 'function'\) \{\s*\n                        refreshIdProductCellDisplay\(row\);\s*\n                    \}/,
    `                    if (!isSummaryReactTableMode() && typeof refreshIdProductCellDisplay === 'function') {
                        refreshIdProductCellDisplay(row);
                    }`,
  ],
];

for (const [re, rep] of replacements) {
  const before = s;
  s = s.replace(re, rep);
  if (s === before) console.warn("No match for", re.toString().slice(0, 60));
  else console.log("Replaced", re.toString().slice(0, 50));
}

fs.writeFileSync(p, s);
console.log("Done");
