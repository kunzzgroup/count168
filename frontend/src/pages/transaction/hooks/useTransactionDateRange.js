import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import { ensureMaintenanceDateRangePicker } from "../../../utils/maintenanceDateRangePicker.js";
import { parseDmyToDate } from "../transactionPaymentPageUtils.js";
import "../../../../public/css/date-range-picker.css";

export function useTransactionDateRange({
  loading,
  forbidden,
  filterSnapshot,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  todayDmy,
  txDate,
  setTxDate,
  rateDate,
  setRateDate,
  fpRateDateRef,
}) {
  const txDateRangePickerReadyRef = useRef(false);

  /** Hidden #date_from/#date_to must stay in sync for MaintenanceDateRangePicker (writes DOM directly). */
  useEffect(() => {
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = dateFrom || todayDmy;
    const t = dateTo || todayDmy;
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
  }, [dateFrom, dateTo, todayDmy]);

  /** Load shared date-range-picker (same as transaction.php) + init Capture Date popup. */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    let cancelled = false;

    (async () => {
      if (cancelled) return;
      ensureMaintenanceDateRangePicker();
      if (cancelled || txDateRangePickerReadyRef.current) return;
      if (!window.MaintenanceDateRangePicker?.init) return;
      if (!document.getElementById("calendar-popup")) return;

      window.MaintenanceDateRangePicker.init({
        onChange: () => {
          const b = window.MaintenanceDateRangePicker.getActiveRangeBinding?.() || {};
          if (b.dateFromId === "add_tx_date_from") {
            const from = document.getElementById("add_tx_date_from")?.value?.trim() || "";
            setTxDate(from || todayDmy);
          } else {
            const from = document.getElementById("date_from")?.value || "";
            const to = document.getElementById("date_to")?.value || "";
            setDateFrom(from);
            setDateTo(to);
          }
          /* 搜索由 useTransactionSearch 在 dateFrom/dateTo 写入 state 后的 effect 触发，避免 queueMicrotask 读到旧 effectiveDate */
        },
      });
      txDateRangePickerReadyRef.current = true;
    })();

    return () => {
      cancelled = true;
      txDateRangePickerReadyRef.current = false;
    };
  }, [loading, forbidden, filterSnapshot, setDateFrom, setDateTo, setTxDate, todayDmy]);

  /** Keep add-form hidden range inputs + label text in sync with txDate (submit uses range start = transaction_date). */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    ensureMaintenanceDateRangePicker();
    const f = document.getElementById("add_tx_date_from");
    const t = document.getElementById("add_tx_date_to");
    if (!f || !t) return;
    const td = (txDate || todayDmy).trim();
    if (f.value !== td) f.value = td;
    if (t.value !== td) t.value = td;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: "add_tx_date_from",
      dateToId: "add_tx_date_to",
      displayId: "add-tx-date-range-display",
    });
  }, [txDate, todayDmy, loading, forbidden, filterSnapshot]);

  /** Flatpickr on RATE single-date field */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    const rateInput = document.getElementById("rate_transaction_date");

    if (rateInput && !fpRateDateRef.current) {
      fpRateDateRef.current = flatpickr(rateInput, {
        dateFormat: "d/m/Y",
        allowInput: false,
        defaultDate: parseDmyToDate(rateDate || todayDmy) || new Date(),
        onChange: (_d, dateStr) => {
          if (dateStr) setRateDate(dateStr);
        },
      });
    }

    return () => {
      try {
        fpRateDateRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      fpRateDateRef.current = null;
    };
  }, [loading, forbidden, filterSnapshot, setRateDate, todayDmy, fpRateDateRef]);

  useEffect(() => {
    const fp = fpRateDateRef.current;
    if (!fp?.setDate) return;
    const d = parseDmyToDate(rateDate || todayDmy);
    if (d) fp.setDate(d, false);
  }, [rateDate, todayDmy, fpRateDateRef]);
}
