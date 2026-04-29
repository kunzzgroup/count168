import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import { parseDmyToDate } from "../transactionPaymentPageUtils.js";

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

  /** Legacy initDatePickers: shared Capture Date range + Flatpickr on transaction / rate dates */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    // MaintenanceDateRangePicker is still a global for now, but we don't load the script here anymore.
    // We assume it's either bundled or we will port it.
    if (window.MaintenanceDateRangePicker?.init && !txDateRangePickerReadyRef.current) {
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
    }

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
  }, [loading, forbidden, filterSnapshot, setDateFrom, setDateTo, runSearch, setTxDate, setRateDate, todayDmy, fpTxDateRef, fpRateDateRef]);

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
