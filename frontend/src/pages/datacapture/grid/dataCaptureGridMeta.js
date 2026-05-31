/** Default grid size (A–Z rows). Matches legacy `initializeTable(26, 20)`. */
export const DEFAULT_GRID_ROWS = 26;
export const DEFAULT_GRID_COLS = 20;

/** Group-only mode (Group selected, no Company): 11 columns × 11 rows (A–K). */
export const GROUP_ONLY_GRID_ROWS = 11;
export const GROUP_ONLY_GRID_COLS = 11;

export function resolveDataCaptureGridDimensions(groupOnly) {
  return groupOnly
    ? { rows: GROUP_ONLY_GRID_ROWS, cols: GROUP_ONLY_GRID_COLS }
    : { rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS };
}
/** ZZ row index + 1 in legacy. */
export const MAX_GRID_ROWS = 702;

/** Row header labels: A, B, …, Z, AA, … — same as `getColumnLabel` in `js/datacapture.js`. */
export function getRowLabel(index) {
  let result = "";
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/** Whether the user has activated the grid (click/focus). */
let tableActive = false;

export function setTableActive(value) {
  tableActive = !!value;
}

export function isTableActive() {
  return tableActive;
}
