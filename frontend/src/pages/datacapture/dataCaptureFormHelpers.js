/** Descriptions from modal/global state, with fallback when display text is set but array is empty. */
export function getActiveDescriptions(descriptionDisplay) {
  const fromWindow = Array.isArray(window.selectedDescriptions) ? window.selectedDescriptions : [];
  if (fromWindow.length) return fromWindow.filter(Boolean);
  const display = String(descriptionDisplay || "").trim();
  if (!display) return [];
  return display
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
