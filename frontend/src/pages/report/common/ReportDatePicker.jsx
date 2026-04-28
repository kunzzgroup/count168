import { useMemo, useState, useEffect, useRef } from "react";
import { formatDmy, formatYmd, parseYmd } from "../../../utils/dateUtils.js";

export default function ReportDatePicker({ dateFrom, dateTo, onRangeChange, label = "Date Range", containerClass = "report-date-range-group" }) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [calendarYear, setCalendarYear] = useState(parseYmd(dateFrom)?.getFullYear() || today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState((parseYmd(dateFrom)?.getMonth() || today.getMonth()) + 1);
  const [pendingStart, setPendingStart] = useState(null);
  
  const containerRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const buildCalendar = () => {
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const offset = firstDay.getDay();
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);
    
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ymd = formatYmd(d);
      const isCurrent = d.getMonth() === calendarMonth - 1;
      const isSelected = ymd === dateFrom || ymd === dateTo;
      const inRange = ymd > dateFrom && ymd < dateTo;
      
      cells.push(
        <div 
          key={ymd} 
          className={`calendar-day ${!isCurrent ? "not-current" : ""} ${isSelected ? "selected" : ""} ${inRange ? "in-range" : ""}`}
          onClick={() => {
            if (!pendingStart) {
              setPendingStart(ymd);
              onRangeChange(ymd, ymd);
            } else {
              const [s, e] = [pendingStart, ymd].sort();
              onRangeChange(s, e);
              setPendingStart(null);
              setOpen(false);
            }
          }}
        >
          {d.getDate()}
        </div>
      );
    }
    return cells;
  };

  return (
    <div className={`report-filter-group ${containerClass}`} ref={containerRef}>
      <label>{label}</label>
      <div 
        className="report-date-range-picker" 
        onClick={() => setOpen(!open)}
      >
        <i className="fas fa-calendar-alt" />
        <span className="report-date-range-input">
          {formatDmy(parseYmd(dateFrom))} - {formatDmy(parseYmd(dateTo))}
        </span>
      </div>

      {open && (
        <div className="calendar-popup" style={{ display: "block", top: "100%", left: "0", marginTop: 10 }}>
          <div className="calendar-header">
            <button type="button" className="calendar-nav-btn" onClick={() => {
              if (calendarMonth === 1) { setCalendarMonth(12); setCalendarYear(calendarYear - 1); }
              else setCalendarMonth(calendarMonth - 1);
            }}>
              <i className="fas fa-chevron-left" />
            </button>
            <div className="calendar-month-year">
              <select value={calendarMonth - 1} onChange={(e) => setCalendarMonth(parseInt(e.target.value) + 1)}>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select value={calendarYear} onChange={(e) => setCalendarYear(parseInt(e.target.value))}>
                {Array.from({ length: 15 }, (_, i) => today.getFullYear() - 10 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button type="button" className="calendar-nav-btn" onClick={() => {
              if (calendarMonth === 12) { setCalendarMonth(1); setCalendarYear(calendarYear + 1); }
              else setCalendarMonth(calendarMonth + 1);
            }}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="calendar-weekday">{d}</div>)}
          </div>
          <div className="calendar-days">
            {buildCalendar()}
          </div>
          <div style={{ padding: 10, textAlign: "center" }}>
            <button type="button" className="btn btn-primary" style={{ width: '100%', padding: '6px' }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
