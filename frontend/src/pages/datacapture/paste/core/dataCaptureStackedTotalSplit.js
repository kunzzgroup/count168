/**
 * 1.TEXT helper: split a matrix row whose label cell stacks SUB TOTAL + GRAND TOTAL
 * (webpage often collapses these into one Excel cell). Format must not import
 * this unless intentionally opted in — keeps 2.FORMAT paths unchanged.
 */

function normalizeLabel(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isSubTotalLabel(text) {
  const upper = normalizeLabel(text).replace(/:$/, "");
  return upper === "SUB TOTAL" || upper === "SUBTOTAL";
}

function isGrandTotalLabel(text) {
  const upper = normalizeLabel(text).replace(/:$/, "");
  return upper === "GRAND TOTAL" || upper === "GRANDTOTAL";
}

function cellPlainValue(cell) {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  return String(cell.value ?? "");
}

function labelLinesFromCell(cell) {
  const raw = cellPlainValue(cell)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines;

  // Rare: both labels on one line separated by spaces / punctuation.
  const spaced = normalizeLabel(raw).split(/\s+/).filter(Boolean);
  if (spaced.length >= 2) {
    // Re-join multi-word labels like SUB TOTAL / GRAND TOTAL when split by space.
    const joined = [];
    for (let i = 0; i < spaced.length; ) {
      if (spaced[i] === "SUB" && spaced[i + 1] === "TOTAL") {
        joined.push("SUB TOTAL");
        i += 2;
        continue;
      }
      if (spaced[i] === "GRAND" && spaced[i + 1] === "TOTAL") {
        joined.push("GRAND TOTAL");
        i += 2;
        continue;
      }
      joined.push(spaced[i]);
      i += 1;
    }
    return joined;
  }
  return lines;
}

/** @returns {{ labelCol: number, labels: [string, string] } | null} */
function findStackedTotalLabels(row) {
  if (!Array.isArray(row) || !row.length) return null;
  for (let col = 0; col < row.length; col += 1) {
    const lines = labelLinesFromCell(row[col]);
    if (lines.length < 2) continue;
    // Prefer exact top/bottom stack (Fig1).
    if (isSubTotalLabel(lines[0]) && isGrandTotalLabel(lines[1])) {
      return { labelCol: col, labels: [lines[0].trim(), lines[1].trim()] };
    }
    // Allow only those two labels among lines.
    const sub = lines.find((line) => isSubTotalLabel(line));
    const grand = lines.find((line) => isGrandTotalLabel(line));
    if (sub && grand && lines.length <= 3) {
      return { labelCol: col, labels: [sub.trim(), grand.trim()] };
    }
  }
  return null;
}

function withLabel(cell, label) {
  if (cell != null && typeof cell === "object") {
    return {
      ...cell,
      value: label,
      // Drop stacked HTML so the grid shows a single plain label.
      html: undefined,
    };
  }
  return label;
}

function cloneCell(cell) {
  if (cell != null && typeof cell === "object") return { ...cell };
  return cell;
}

/**
 * @param {Array<Array<any>>} matrix
 * @returns {Array<Array<any>>}
 */
export function splitStackedSubtotalGrandTotalRows(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix || [];

  const out = [];
  matrix.forEach((row) => {
    const found = findStackedTotalLabels(row);
    if (!found) {
      out.push(row);
      return;
    }

    const { labelCol, labels } = found;
    const [subLabel, grandLabel] = labels;
    const subRow = row.map((cell, index) =>
      index === labelCol ? withLabel(cell, subLabel) : cloneCell(cell),
    );
    const grandRow = row.map((cell, index) =>
      index === labelCol ? withLabel(cell, grandLabel) : cloneCell(cell),
    );
    out.push(subRow, grandRow);
  });

  return out;
}
