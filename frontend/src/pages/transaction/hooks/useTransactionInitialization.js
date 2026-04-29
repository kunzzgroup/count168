import { useEffect, useRef } from "react";
import { readTransactionCurrencyFilterState } from "../transactionPaymentLogic.js";

export function useTransactionInitialization({
  loading,
  forbidden,
  filterSnapshot,
  currencyRowsOrdered,
  todayDmy,
  search,
  form,
}) {
  const currencyInitCompanyRef = useRef(null);

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot || currencyRowsOrdered.length === 0) return;

    const cid = filterSnapshot.companyId;
    const resetSelection = currencyInitCompanyRef.current !== cid;
    currencyInitCompanyRef.current = cid;

    // 1. Set initial search dates if not set
    search.setDateFrom((v) => v || todayDmy);
    search.setDateTo((v) => v || todayDmy);

    // 2. Set initial form dates if not set
    form.setTxDate((v) => v || todayDmy);
    form.setRateDate((v) => v || todayDmy);

    const rows = currencyRowsOrdered;
    const codes = rows.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);

    let preferredDefault = null;
    try {
      preferredDefault =
        String(localStorage.getItem(`transaction_default_currency_${cid || 0}`))
          .trim()
          .toUpperCase() || null;
    } catch {
      preferredDefault = null;
    }

    // 3. Handle Currency selection
    if (!resetSelection) {
      // Just ensure form has defaults if none
      const pickDefault =
        (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
        rows[0];
      if (pickDefault?.code) {
        form.setTxCurrency((v) => v || pickDefault.code);
        form.setRateCurrencyFrom((v) => v || pickDefault.code);
        if (codes.includes("MYR")) form.setRateCurrencyTo((v) => v || "MYR");
      }
      return;
    }

    // Resetting for a new company
    const saved = readTransactionCurrencyFilterState(cid);
    let nextShowAll = false;
    let nextSel = [];

    if (saved?.showAll) {
      nextShowAll = true;
      nextSel = [];
    } else if (saved?.currencies?.length) {
      const valid = saved.currencies.filter((code) => rows.some((c) => String(c.code) === String(code)));
      if (valid.length > 0) nextSel = valid;
    }

    if (!nextShowAll && nextSel.length === 0 && rows.length > 0) {
      const pick =
        (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
        rows[0];
      if (pick?.code) nextSel = [pick.code];
    }

    search.setShowAllCurrencies(nextShowAll);
    search.setSelectedCurrencies(nextSel);
    search.persistCurrencyFilter(cid, nextShowAll, nextSel);

    const pickDefault =
      (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
      rows[0];
    if (pickDefault?.code) {
      form.setTxCurrency(pickDefault.code);
      form.setRateCurrencyFrom(pickDefault.code);
      if (codes.includes("MYR")) form.setRateCurrencyTo("MYR");
    }
  }, [loading, forbidden, filterSnapshot, currencyRowsOrdered, todayDmy, search, form]);
}
