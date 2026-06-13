/** English UI label: first letter uppercase, rest lowercase. */
export function toEnglishDisplayCase(value) {
  const s = String(value ?? "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
