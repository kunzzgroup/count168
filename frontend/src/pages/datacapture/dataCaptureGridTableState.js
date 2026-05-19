/** Whether the user has activated the grid (click/focus). */
let tableActive = false;

export function setTableActive(value) {
  tableActive = !!value;
}

export function isTableActive() {
  return tableActive;
}
