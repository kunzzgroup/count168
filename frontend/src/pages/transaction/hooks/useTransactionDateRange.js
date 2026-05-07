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
  runSearch,
  txDate,
  setTxDate,
  rateDate,
  setRateDate,
  fpTxDateRef,
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
          const from = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
          const to = window.MaintenanceDateRangePicker.getDateTo?.() || "";
          setDateFrom(from);
          setDateTo(to);
          queueMicrotask(() => runSearch?.({ silent: false }));
        },
      });
      txDateRangePickerReadyRef.current = true;
    })();

    return () => {
      cancelled = true;
      txDateRangePickerReadyRef.current = false;
    };
  }, [loading, forbidden, filterSnapshot, setDateFrom, setDateTo, runSearch]);

  /** Flatpickr on transaction / rate single-date fields */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    const txInput = document.getElementById("transaction_date");
    const rateInput = document.getElementById("rate_transaction_date");

    if (txInput && !fpTxDateRef.current) {
      fpTxDateRef.current = flatpickr(txInput, {
        dateFormat: "d/m/Y",
        allowInput: false,
        defaultDate: parseDmyToDate(txDate || todayDmy) || new Date(),
        onChange: (_d, dateStr) => {
          if (dateStr) setTxDate(dateStr);
        },
      });
    }
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
        fpTxDateRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      fpTxDateRef.current = null;
      try {
        fpRateDateRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      fpRateDateRef.current = null;
    };
  }, [loading, forbidden, filterSnapshot, setTxDate, setRateDate, todayDmy, fpTxDateRef, fpRateDateRef]);

  // Sync flatpickr instances with state changes
  useEffect(() => {
    const fp = fpTxDateRef.current;
    if (!fp?.setDate) return;
    const d = parseDmyToDate(txDate || todayDmy);
    if (d) fp.setDate(d, false);
  }, [txDate, todayDmy, fpTxDateRef]);

  useEffect(() => {
    const fp = fpRateDateRef.current;
    if (!fp?.setDate) return;
    const d = parseDmyToDate(rateDate || todayDmy);
    if (d) fp.setDate(d, false);
  }, [rateDate, todayDmy, fpRateDateRef]);
}
