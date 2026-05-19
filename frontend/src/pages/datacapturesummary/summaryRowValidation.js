/**
 * Validate Currency + Formula on rows that have Account filled.
 */
export function validateSummaryRowsCurrencyFormula() {
  if (typeof window.validateSummaryRowsCurrencyFormula === "function") {
    const tbody = document.getElementById("summaryTableBody");
    if (!tbody) return { ok: true };
    return window.validateSummaryRowsCurrencyFormula(tbody.querySelectorAll("tr"));
  }
  return { ok: true };
}
