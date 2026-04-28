import { useEffect, useRef } from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { formatDmy, parseYmd } from "../../../utils/dateUtils.js";

function ymdToDmy(ymd) {
  const d = parseYmd(ymd);
  return d ? formatDmy(d) : "";
}

function dmyToYmd(dmy) {
  const text = String(dmy || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3];
  return `${year}-${month}-${day}`;
}

export default function ReportDatePicker({ dateFrom, dateTo, onRangeChange, label = "Date Range", containerClass = "report-date-range-group" }) {
  const initializedRef = useRef(false);

  useEffect(() => {
    const fromEl = document.getElementById("date_from");
    const toEl = document.getElementById("date_to");
    if (fromEl) fromEl.value = ymdToDmy(dateFrom);
    if (toEl) toEl.value = ymdToDmy(dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let disposed = false;

    const initPicker = () => {
      if (disposed || initializedRef.current) return;
      if (!window?.MaintenanceDateRangePicker?.init) return;
      initializedRef.current = true;
      window.MaintenanceDateRangePicker.init({
        allowEmpty: false,
        placeholder: "Select date range",
        onChange: () => {
          const nextFromDmy = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
          const nextToDmy = window.MaintenanceDateRangePicker.getDateTo?.() || "";
          const nextFrom = dmyToYmd(nextFromDmy);
          const nextTo = dmyToYmd(nextToDmy);
          if (nextFrom && nextTo) onRangeChange(nextFrom, nextTo);
        },
      });
    };

    if (window?.MaintenanceDateRangePicker?.init) {
      initPicker();
      return () => { disposed = true; };
    }

    const script = document.createElement("script");
    script.src = assetUrl("js/date-range-picker.js");
    script.onload = () => initPicker();
    document.body.appendChild(script);

    return () => {
      disposed = true;
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [onRangeChange]);

  return (
    <div className={`report-filter-group ${containerClass}`}>
      <label className="maintenance-label">{label}</label>
      <div className="date-range-picker" id="date-range-picker">
        <i className="fas fa-calendar-alt" />
        <span className="report-date-range-input" id="date-range-display">
          {ymdToDmy(dateFrom)} - {ymdToDmy(dateTo)}
        </span>
      </div>
      <input type="hidden" id="date_from" defaultValue={ymdToDmy(dateFrom)} />
      <input type="hidden" id="date_to" defaultValue={ymdToDmy(dateTo)} />
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
            <select id="calendar-month-select" aria-label="Month">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <select id="calendar-year-select" aria-label="Year" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (<div key={d} className="calendar-weekday">{d}</div>))}
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
