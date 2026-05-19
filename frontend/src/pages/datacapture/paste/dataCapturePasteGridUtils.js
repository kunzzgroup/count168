/** Shared grid helpers for paste modules (no legacy script required). */
export function ensurePasteGrid(rows, cols) {
  if (typeof window.__DC_INITIALIZE_TABLE__ === "function") {
    window.__DC_INITIALIZE_TABLE__(rows, cols);
  }
}

export function parseGenericHtmlTable(htmlString, startCell) {
  if (typeof window.__DC_PARSE_GENERIC_HTML__ === "function") {
    return window.__DC_PARSE_GENERIC_HTML__(htmlString, startCell);
  }
  return false;
}
