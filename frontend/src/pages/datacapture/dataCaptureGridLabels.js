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
