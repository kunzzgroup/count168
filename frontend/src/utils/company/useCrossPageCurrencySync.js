import { useCallback, useEffect } from "react";

import {
  DASHBOARD_CURRENCY_FILTER_EVENT,
  buildDashboardCurrencyScopeKey,
  notifyDashboardCurrencyFilterChanged,
  resolveCrossPageCurrencyPreference,
} from "./sharedCompanyFilter.js";

/**
 * Keep currency pills in sync across Dashboard, Transaction, Reports, Bank Process, etc.
 * Call `persistSelection(code)` when the user picks a currency on the host page.
 */
export function useCrossPageCurrencySync({
  enabled = true,
  companyId = null,
  selectedGroup = null,
  availableCodes = [],
  currentCode = "",
  onApplyCode,
  suppressRef = null,
}) {
  const scopeKey = buildDashboardCurrencyScopeKey({ companyId, selectedGroup });
  const groupOnlyScope =
    Boolean(selectedGroup && String(selectedGroup).trim()) &&
    (companyId == null || companyId === "");
  const codesKey = (availableCodes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean)
    .join("|");

  const applyPersisted = useCallback(() => {
    if (!enabled || typeof onApplyCode !== "function") return;
    if (suppressRef?.current) return;
    if (!codesKey) return;
    const pref = resolveCrossPageCurrencyPreference({
      scopeKey,
      availableCodes: codesKey.split("|"),
      scopeOnly: groupOnlyScope,
    });
    const current = String(currentCode || "").trim().toUpperCase();
    if (pref && pref !== current) onApplyCode(pref);
  }, [enabled, scopeKey, codesKey, currentCode, onApplyCode, suppressRef, groupOnlyScope]);

  useEffect(() => {
    if (!enabled || typeof onApplyCode !== "function") return undefined;
    const onChange = (e) => {
      if (suppressRef?.current) return;
      const code = e?.detail?.currencyCode;
      if (!code) return;
      const upper = String(code).trim().toUpperCase();
      const allowed = codesKey ? codesKey.split("|") : [];
      if (allowed.length && !allowed.includes(upper)) return;
      const current = String(currentCode || "").trim().toUpperCase();
      if (upper !== current) onApplyCode(upper);
    };
    window.addEventListener(DASHBOARD_CURRENCY_FILTER_EVENT, onChange);
    return () => window.removeEventListener(DASHBOARD_CURRENCY_FILTER_EVENT, onChange);
  }, [enabled, codesKey, currentCode, onApplyCode, suppressRef]);

  useEffect(() => {
    if (!enabled) return;
    applyPersisted();
  }, [enabled, applyPersisted, scopeKey, codesKey]);

  const persistSelection = useCallback(
    (code) => {
      const cur = String(code || "").trim().toUpperCase();
      if (!cur) return;
      notifyDashboardCurrencyFilterChanged(cur, scopeKey);
    },
    [scopeKey],
  );

  return { persistSelection, applyPersisted };
}
