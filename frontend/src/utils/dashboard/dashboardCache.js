const MAX_ENTRIES = 24;

/** @type {Map<string, Record<string, unknown>>} */
const store = new Map();

export function buildDashboardCacheKey({
  companyId,
  dateFrom,
  dateTo,
  currencyCode,
  selectedGroup,
  groupAllMode,
  mergedSubsetIds,
}) {
  const ids = Array.isArray(mergedSubsetIds) ? [...mergedSubsetIds].sort((a, b) => Number(a) - Number(b)).join(",") : "";
  return [
    companyId ?? "",
    dateFrom ?? "",
    dateTo ?? "",
    currencyCode ?? "",
    selectedGroup ?? "",
    groupAllMode ? "1" : "0",
    ids,
  ].join("|");
}

export function getDashboardCache(key) {
  if (!key) return null;
  return store.get(key) ?? null;
}

export function setDashboardCache(key, value) {
  if (!key || !value) return;
  if (store.has(key)) store.delete(key);
  store.set(key, { ...value });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function patchDashboardCache(key, patch) {
  if (!key || !patch) return;
  const prev = store.get(key) ?? {};
  if (store.has(key)) store.delete(key);
  store.set(key, { ...prev, ...patch });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}
