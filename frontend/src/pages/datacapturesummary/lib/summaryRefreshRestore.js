import { recalculateRowAmounts } from "../table/summaryRowAmount.js";

function readRateMaps() {
  let byKey = null;
  let byProduct = null;
  try {
    const raw = localStorage.getItem("capturedTableRateValues");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        byKey = parsed;
      }
    }
    const rawProduct = localStorage.getItem("capturedTableRateValuesByProductId");
    if (rawProduct) {
      const parsed = JSON.parse(rawProduct);
      if (parsed && typeof parsed === "object") byProduct = parsed;
    }
  } catch {
    /* ignore */
  }
  return { byKey, byProduct };
}

/** Restore rate checkbox/value from refresh storage onto populated rows. */
export function restoreRateValuesOnRows(rows) {
  const { byKey, byProduct } = readRateMaps();
  if (!byKey && !byProduct) return rows;

  return rows.map((row) => {
    let rateChecked = row.rateChecked;
    let rateValue = row.rateValue || "";

    const fromKey = byKey?.[row.key];
    if (fromKey && typeof fromKey === "object") {
      rateChecked = !!fromKey.checked;
      rateValue = fromKey.value != null ? String(fromKey.value) : rateValue;
    } else if (fromKey != null && typeof fromKey !== "object") {
      rateValue = String(fromKey);
    }

    if (!rateValue && row.idProduct && byProduct?.[row.idProduct]) {
      const entry = byProduct[row.idProduct];
      if (entry && typeof entry === "object") {
        rateChecked = !!entry.checked;
        rateValue = entry.value != null ? String(entry.value) : rateValue;
      }
    }

    if (!rateValue && !rateChecked) return row;
    return recalculateRowAmounts({ ...row, rateChecked, rateValue }, "");
  });
}
