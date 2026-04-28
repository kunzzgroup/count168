import { useMemo, useState, useEffect, useRef } from "react";
import { formatDmy, formatYmd, parseYmd } from "../../../utils/dateUtils.js";

export default function ReportDatePicker({ dateFrom, dateTo, onRangeChange, label = "Date Range", containerClass = "report-date-range-group" }) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [calendarYear, setCalendarYear] = useState(parseYmd(dateFrom)?.getFullYear() || today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState((parseYmd(dateFrom)?.getMonth() || today.getMonth()) + 1);
  const [pendingStart, setPendingStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  
  const containerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setPendingStart(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Update calendar view when dateFrom changes externally
  useEffect(() => {
    const d = parseYmd(dateFrom);
    if (d) {
      setCalendarYear(d.getFullYear());
      setCalendarMonth(d.getMonth() + 1);
    }
  }, [dateFrom]);

  const buildCalendar = () => {
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const offset = firstDay.getDay() === 0 ? 0 : firstDay.getDay(); // Adjust based on Sunday start or Monday? Original uses Sunday: firstDay.getDay()
    
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);
    
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ymd = formatYmd(d);
      const isOtherMonth = d.getMonth() !== calendarMonth - 1;
      const isToday = ymd === formatYmd(today);
      
      let classes = ["calendar-day"];
      if (isOtherMonth) classes.push("other-month");
      if (isToday) classes.push("today");

      const startTime = pendingStart || dateFrom;
      const endTime = pendingStart ? null : dateTo;

      if (startTime && endTime) {
        if (ymd === startTime && ymd === endTime) classes.push("selected", "start-date", "end-date");
        else if (ymd === startTime) classes.push("start-date");
        else if (ymd === endTime) classes.push("end-date");
        else if (ymd > startTime && ymd < endTime) classes.push("in-range");
      } else if (startTime) {
        if (ymd === startTime) classes.push("start-date", "selecting");
        
        // Preview range logic
        if (hoverDate) {
          const min = startTime < hoverDate ? startTime : hoverDate;
          const max = startTime < hoverDate ? hoverDate : startTime;
          if (ymd > min && ymd < max) classes.push("preview-range");
          else if (ymd === hoverDate && ymd !== startTime) classes.push("preview-end");
        }
      }

      cells.push(
        <div 
          key={ymd} 
          className={classes.join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            if (!pendingStart) {
              setPendingStart(ymd);
              setHoverDate(null);
            } else {
              const dates = [pendingStart, ymd].sort();
              onRangeChange(dates[0], dates[1]);
              setPendingStart(null);
              setHoverDate(null);
              setOpen(false);
            }
          }}
          onMouseEnter={() => pendingStart && setHoverDate(ymd)}
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
        id="date-range-picker"
        onClick={() => setOpen(!open)}
      >
        <i className="fas fa-calendar-alt" />
        <span className="report-date-range-input" id="date-range-display">
          {formatDmy(parseYmd(dateFrom))} - {formatDmy(parseYmd(dateTo))}
        </span>
      </div>

      {open && (
        <div className="calendar-popup" id="calendar-popup" style={{ display: "block" }} ref={popupRef}>
          <div className="calendar-header">
            <button type="button" className="calendar-nav-btn" onClick={() => {
              let nm = calendarMonth - 1;
              let ny = calendarYear;
              if (nm < 1) { nm = 12; ny--; }
              setCalendarMonth(nm);
              setCalendarYear(ny);
            }}>
              <i className="fas fa-chevron-left" />
            </button>
            <div className="calendar-month-year">
              <select value={calendarMonth - 1} id="calendar-month-select" onChange={(e) => setCalendarMonth(parseInt(e.target.value) + 1)}>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select value={calendarYear} id="calendar-year-select" onChange={(e) => setCalendarYear(parseInt(e.target.value))}>
                {Array.from({ length: 10 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button type="button" className="calendar-nav-btn" onClick={() => {
              let nm = calendarMonth + 1;
              let ny = calendarYear;
              if (nm > 12) { nm = 1; ny++; }
              setCalendarMonth(nm);
              setCalendarYear(ny);
            }}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="calendar-weekday">{d}</div>)}
          </div>
          <div className="calendar-days" id="calendar-days">
            {buildCalendar()}
          </div>
        </div>
      )}
    </div>
  );
}
