/** Legacy PHP grid: row axis shows A–Z for first 26 rows */
export function dataCaptureRowLabel(rowIdx) {
  const i = Number(rowIdx);
  if (Number.isFinite(i) && i >= 0 && i < 26) return String.fromCharCode(65 + i);
  return String(Math.max(1, Math.floor(i) + 1));
}
