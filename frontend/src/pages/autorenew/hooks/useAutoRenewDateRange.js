import { useEffect, useMemo, useRef } from "react";
import { parseDdMmYyyyToYmd } from "../../../utils/date/dateUtils.js";
import {
  bindMaintenanceCalendarDismissListeners,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import { defaultDashboardDateRange, ymdToDmy } from "../../dashboard/lib/dashboardDateUtils.js";

export function useAutoRenewDateRangeState() {
  const defaults = defaultDashboardDateRange();
  return {
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
  };
}

/**
 * @param {object} opts
 * @param {boolean} opts.ready
 * @param {object} opts.i18n
 * @param {string} opts.dateFrom YMD
 * @param {string} opts.dateTo YMD
 * @param {(v: string) => void} opts.setDateFrom
 * @param {(v: string) => void} opts.setDateTo
 * @param {string} opts.fromInputId hidden input id
 * @param {string} opts.toInputId hidden input id
 * @param {string} opts.displayId span id
 * @param {string} opts.pickerId date-range-picker element id
 */
export function useAutoRenewDateRange({
  ready,
  i18n,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  fromInputId,
  toInputId,
  displayId,
  pickerId,
}) {
  const pickerReadyRef = useRef(false);

  const effectiveDateRangeText = useMemo(
    () => `${ymdToDmy(dateFrom)} - ${ymdToDmy(dateTo)}`,
    [dateFrom, dateTo],
  );

  useEffect(() => {
    bindMaintenanceCalendarDismissListeners();
  }, []);

  useEffect(() => {
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: i18n.selectDateRange,
      selectEndDateHint: i18n.selectEndDate,
      monthLabels: i18n.monthLabels,
    });
  }, [i18n]);

  useEffect(() => {
    const df = document.getElementById(fromInputId);
    const dt = document.getElementById(toInputId);
    if (!df || !dt) return;
    const f = ymdToDmy(dateFrom);
    const t = ymdToDmy(dateTo);
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: fromInputId,
      dateToId: toInputId,
      displayId,
    });
  }, [dateFrom, dateTo, fromInputId, toInputId, displayId]);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    ensureMaintenanceDateRangePicker();

    const initPicker = () => {
      if (cancelled || pickerReadyRef.current) return;
      if (!window.MaintenanceDateRangePicker?.init) return;
      if (!document.getElementById("calendar-popup")) return;

      window.MaintenanceDateRangePicker.init({
        allowEmpty: false,
        placeholder: i18n.selectDateRange,
        selectEndDateHint: i18n.selectEndDate,
      });
      pickerReadyRef.current = true;
    };

    initPicker();

    const pickerEl = document.getElementById(pickerId);
    if (!pickerEl) return () => { cancelled = true; };

    const onRangeChanged = () => {
      const binding = window.MaintenanceDateRangePicker?.getActiveRangeBinding?.() || {};
      if (binding.dateFromId !== fromInputId) return;
      const fromDmy = document.getElementById(fromInputId)?.value || "";
      const toDmy = document.getElementById(toInputId)?.value || "";
      const from = parseDdMmYyyyToYmd(fromDmy);
      const to = parseDdMmYyyyToYmd(toDmy);
      if (from && to) {
        setDateFrom(from);
        setDateTo(to);
      }
    };

    pickerEl.addEventListener("ec:date-changed", onRangeChanged);

    return () => {
      cancelled = true;
      pickerEl.removeEventListener("ec:date-changed", onRangeChanged);
    };
  }, [
    ready,
    i18n.selectDateRange,
    i18n.selectEndDate,
    fromInputId,
    toInputId,
    displayId,
    pickerId,
    setDateFrom,
    setDateTo,
  ]);

  return { effectiveDateRangeText };
}
