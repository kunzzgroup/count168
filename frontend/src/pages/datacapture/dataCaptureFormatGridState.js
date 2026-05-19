/** Whether 2.Format grid has been filled from a paste (legacy `isFormatGridReady`). */
let formatGridReady = false;

export function getFormatGridReady() {
  return formatGridReady;
}

export function setFormatGridReady(value) {
  formatGridReady = !!value;
  window.__DC_ON_FORMAT_GRID_READY__?.(formatGridReady);
}
