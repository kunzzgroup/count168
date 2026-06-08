/** Apply saved user order; unknown codes append after ordered ones. */
export function mergeCurrencyCodesWithSavedOrder(baseCodes, savedOrder) {
  if (!Array.isArray(baseCodes) || !baseCodes.length) return [];
  const codes = baseCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (!Array.isArray(savedOrder) || !savedOrder.length) return codes;
  const set = new Set(codes);
  const ordered = savedOrder
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => set.has(c));
  const rest = codes.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}
