import { useEffect } from "react";
import { ensureMaintenanceDateRangePicker } from "../../../utils/maintenanceDateRangePicker.js";
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

export default function ReportDatePicker({
  dateFrom,
  dateTo,
  onRangeChange,
  label = "Date Range",
  containerClass = "report-date-range-group",
  placeholder = "Select date range",
  selectEndDateHint = "Select end date",
  outlinedFloatingLabel = false,
}) {
  useEffect(() => {
    const fromEl = document.getElementById("date_from");
    const toEl = document.getElementById("date_to");
    if (fromEl) fromEl.value = ymdToDmy(dateFrom);
    if (toEl) toEl.value = ymdToDmy(dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let disposed = false;

    const initPicker = () => {
      if (disposed || !window?.MaintenanceDateRangePicker?.init) return;
      window.MaintenanceDateRangePicker.init({
        allowEmpty: false,
        placeholder,
        selectEndDateHint,
        onChange: () => {
          const nextFromDmy = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
          const nextToDmy = window.MaintenanceDateRangePicker.getDateTo?.() || "";
          const nextFrom = dmyToYmd(nextFromDmy);
          const nextTo = dmyToYmd(nextToDmy);
          if (nextFrom && nextTo) onRangeChange(nextFrom, nextTo);
        },
      });
    };

    ensureMaintenanceDateRangePicker();
    initPicker();

    return () => {
      disposed = true;
    };
  }, [onRangeChange, placeholder, selectEndDateHint]);

  const dateBar = (
    <div
      className="date-range-picker"
      id="date-range-picker"
      {...(outlinedFloatingLabel
        ? { role: "button", tabIndex: 0, "aria-labelledby": "cr-date-range-outlined-label" }
        : {})}
    >
      <i className="fas fa-calendar-alt" />
      <span className="report-date-range-input" id="date-range-display">
        {ymdToDmy(dateFrom)} - {ymdToDmy(dateTo)}
      </span>
    </div>
  );

  const hiddenInputs = (
    <>
      <input type="hidden" id="date_from" defaultValue={ymdToDmy(dateFrom)} />
      <input type="hidden" id="date_to" defaultValue={ymdToDmy(dateTo)} />
    </>
  );

  const calendarPopup = (
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
  );

  if (outlinedFloatingLabel) {
    return (
      <div className={`report-filter-group ${containerClass} customer-report-outlined-anchor`}>
        <div className="customer-report-outlined-shell customer-report-date-outlined-shell">
          <span className="customer-report-outlined-label" id="cr-date-range-outlined-label">
            {label}
          </span>
          <div className="customer-report-outlined-inner customer-report-date-outlined-inner">
            {dateBar}
            {hiddenInputs}
          </div>
        </div>
        {calendarPopup}
      </div>
    );
  }

  return (
    <div className={`report-filter-group ${containerClass}`}>
      <label className="maintenance-label">{label}</label>
      {dateBar}
      {hiddenInputs}
      {calendarPopup}
    </div>
  );
}
