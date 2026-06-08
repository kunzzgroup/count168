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

export const CURRENCY_DISPLAY_ORDER_LS_PREFIX = "eazycount:currency_display_order:";

/** Browser-local fallback when API is slow or unavailable (per company). */
export function persistCurrencyDisplayOrder(companyId, order) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0 || !Array.isArray(order) || !order.length) return;
  try {
    localStorage.setItem(
      `${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${cid}`,
      JSON.stringify(
        order.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
      ),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function readCurrencyDisplayOrder(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  try {
    const raw = localStorage.getItem(`${CURRENCY_DISPLAY_ORDER_LS_PREFIX}${cid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null;
  } catch {
    return null;
  }
}

/** Prefer API order; fall back to localStorage from last drag on this browser. */
export function resolveSavedCurrencyOrder(companyId, apiOrder) {
  const fromApi = Array.isArray(apiOrder)
    ? apiOrder.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  if (fromApi.length) return fromApi;
  return readCurrencyDisplayOrder(companyId) || null;
}
