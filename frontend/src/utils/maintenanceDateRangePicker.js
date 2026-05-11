/**
 * Bundled ES module port of legacy `js/date-range-picker.js` — attaches `window.MaintenanceDateRangePicker`,
 * `window.changeMonth`, `window.selectQuickRange`, `window.toggleQuickSelectDropdown` for DOM markup (#date-range-picker, #calendar-popup, …).
 */
let initialized = false;

export function ensureMaintenanceDateRangePicker() {
  if (initialized && window.MaintenanceDateRangePicker?.init) return;

  let calendarStartDate = null;
  let calendarEndDate = null;
  let isSelectingRange = false;
  let calendarCurrentDate = new Date();
  let config = {
    dateFromId: "date_from",
    dateToId: "date_to",
    onChange: null,
    allowEmpty: false,
    placeholder: "Select date range",
    /** Shown after user picked start date and before end date (range selection). */
    selectEndDateHint: "Select end date",
  };

  function formatDateDisplay(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${day}/${month}/${year}`;
  }

  function updateDateRangeDisplay() {
    const display = document.getElementById("date-range-display");
    if (!display) return;
    if (calendarStartDate && calendarEndDate) {
      display.textContent = `${formatDateDisplay(calendarStartDate)} - ${formatDateDisplay(calendarEndDate)}`;
    } else if (calendarStartDate) {
      const hint = config.selectEndDateHint || "Select end date";
      display.textContent = `${formatDateDisplay(calendarStartDate)} - ${hint}`;
    } else {
      display.textContent = config.placeholder || "Select date range";
    }
  }

  function syncToHiddenInputs() {
    const fromEl = document.getElementById(config.dateFromId);
    const toEl = document.getElementById(config.dateToId);
    if (fromEl) fromEl.value = calendarStartDate ? formatDateDisplay(calendarStartDate) : "";
    if (toEl) toEl.value = calendarEndDate ? formatDateDisplay(calendarEndDate) : "";
  }

  function parseDmy(val) {
    const m = String(val || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Same as legacy: refresh internal range from hidden #date_from / #date_to when opening the popup. */
  function syncRangeStateFromHiddenInputs() {
    const fromEl = document.getElementById(config.dateFromId);
    const toEl = document.getElementById(config.dateToId);
    const fromDate = fromEl ? parseDmy(fromEl.value) : null;
    const toDate = toEl ? parseDmy(toEl.value) : null;
    if (fromDate && toDate) {
      calendarStartDate = new Date(fromDate);
      calendarEndDate = new Date(toDate);
    } else if (fromDate) {
      calendarStartDate = new Date(fromDate);
      calendarEndDate = new Date(fromDate);
    } else if (!config.allowEmpty) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      calendarStartDate = new Date(today);
      calendarEndDate = new Date(today);
    } else {
      calendarStartDate = null;
      calendarEndDate = null;
    }
    if (calendarStartDate) calendarStartDate.setHours(0, 0, 0, 0);
    if (calendarEndDate) calendarEndDate.setHours(0, 0, 0, 0);
    isSelectingRange = false;
  }

  function highlightPreviewRange(hoverDate) {
    const days = document.querySelectorAll("#calendar-popup .calendar-day");
    if (!calendarStartDate || calendarEndDate) return;
    const startTime = calendarStartDate.getTime();
    const hoverTime = hoverDate.getTime();
    const yearSelect = document.getElementById("calendar-year-select");
    const monthSelect = document.getElementById("calendar-month-select");
    if (!yearSelect || !monthSelect) return;
    const year = Number(yearSelect.value);
    const month = Number(monthSelect.value);
    days.forEach((day) => {
      day.classList.remove("preview-range", "preview-end");
      const dayText = parseInt(day.textContent, 10);
      if (!dayText) return;
      let dayDate;
      if (day.classList.contains("other-month")) {
        if (dayText > 20) {
          dayDate = new Date(year, month - 1, dayText);
        } else {
          dayDate = new Date(year, month + 1, dayText);
        }
      } else {
        dayDate = new Date(year, month, dayText);
      }
      dayDate.setHours(0, 0, 0, 0);
      const dayTime = dayDate.getTime();
      const minTime = Math.min(startTime, hoverTime);
      const maxTime = Math.max(startTime, hoverTime);
      if (dayTime > minTime && dayTime < maxTime) day.classList.add("preview-range");
      else if (dayTime === hoverTime && dayTime !== startTime) day.classList.add("preview-end");
    });
  }

  function initCalendar() {
    const today = new Date();
    if (!calendarStartDate && !config.allowEmpty) {
      calendarStartDate = new Date(today);
      calendarStartDate.setHours(0, 0, 0, 0);
      calendarEndDate = new Date(today);
      calendarEndDate.setHours(0, 0, 0, 0);
    }
    isSelectingRange = !!(calendarStartDate && !calendarEndDate);
    if (calendarStartDate) {
      calendarCurrentDate = new Date(calendarStartDate.getFullYear(), calendarStartDate.getMonth(), 1);
    } else {
      calendarCurrentDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    const yearSelect = document.getElementById("calendar-year-select");
    if (yearSelect) {
      yearSelect.innerHTML = "";
      const currentYear = today.getFullYear();
      for (let year = 2022; year <= currentYear + 1; year += 1) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        if (year === calendarCurrentDate.getFullYear()) option.selected = true;
        yearSelect.appendChild(option);
      }
    }
    const monthSelect = document.getElementById("calendar-month-select");
    if (monthSelect) monthSelect.value = String(calendarCurrentDate.getMonth());
    updateDateRangeDisplay();
  }

  function renderCalendar() {
    const yearSelect = document.getElementById("calendar-year-select");
    const monthSelect = document.getElementById("calendar-month-select");
    if (!yearSelect || !monthSelect) return;
    const year = Number(yearSelect.value);
    const month = Number(monthSelect.value);
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    const firstDayWeek = firstDay.getDay();
    const lastDate = lastDay.getDate();
    const prevLastDate = prevLastDay.getDate();
    const daysContainer = document.getElementById("calendar-days");
    if (!daysContainer) return;
    daysContainer.innerHTML = "";

    function createDayElement(day, y, m, isOtherMonth) {
      const dayElement = document.createElement("div");
      dayElement.className = "calendar-day";
      dayElement.textContent = String(day);
      const date = new Date(y, m, day);
      date.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isOtherMonth) dayElement.classList.add("other-month");
      if (date.getTime() === today.getTime() && !isOtherMonth) dayElement.classList.add("today");

      if (calendarStartDate) {
        const startTime = calendarStartDate.getTime();
        const currentTime = date.getTime();
        if (calendarEndDate) {
          const endTime = calendarEndDate.getTime();
          if (currentTime === startTime && currentTime === endTime) dayElement.classList.add("selected", "start-date", "end-date");
          else if (currentTime === startTime) dayElement.classList.add("start-date");
          else if (currentTime === endTime) dayElement.classList.add("end-date");
          else if (currentTime > startTime && currentTime < endTime) dayElement.classList.add("in-range");
        } else if (currentTime === startTime) {
          dayElement.classList.add("start-date", "selecting");
        }
      }

      dayElement.addEventListener("click", (e) => {
        e.stopPropagation();
        selectDate(date);
      });
      dayElement.addEventListener("mouseenter", () => {
        if (isSelectingRange && calendarStartDate && !calendarEndDate) highlightPreviewRange(date);
      });
      return dayElement;
    }

    for (let i = firstDayWeek - 1; i >= 0; i -= 1) {
      daysContainer.appendChild(createDayElement(prevLastDate - i, year, month - 1, true));
    }
    for (let day = 1; day <= lastDate; day += 1) {
      daysContainer.appendChild(createDayElement(day, year, month, false));
    }
    const totalCells = daysContainer.children.length;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day += 1) {
      daysContainer.appendChild(createDayElement(day, year, month + 1, true));
    }
  }

  function changeMonth(delta) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    const monthSelect = document.getElementById("calendar-month-select");
    const yearSelect = document.getElementById("calendar-year-select");
    if (monthSelect) monthSelect.value = String(calendarCurrentDate.getMonth());
    if (yearSelect) yearSelect.value = String(calendarCurrentDate.getFullYear());
    renderCalendar();
  }

  function selectDate(date) {
    if (!calendarStartDate || (calendarStartDate && calendarEndDate)) {
      calendarStartDate = new Date(date);
      calendarEndDate = null;
      isSelectingRange = true;
    } else {
      if (date.getTime() < calendarStartDate.getTime()) {
        calendarEndDate = new Date(calendarStartDate);
        calendarStartDate = new Date(date);
      } else {
        calendarEndDate = new Date(date);
      }
      isSelectingRange = false;
      syncToHiddenInputs();
      updateDateRangeDisplay();
      if (typeof config.onChange === "function") config.onChange();
      const popup = document.getElementById("calendar-popup");
      if (popup) popup.style.display = "none";
    }
    renderCalendar();
    updateDateRangeDisplay();
  }

  function toggleCalendar() {
    const popup = document.getElementById("calendar-popup");
    const picker = document.getElementById("date-range-picker");
    if (!popup || !picker) return;
    if (popup.style.display === "none" || !popup.style.display) {
      syncRangeStateFromHiddenInputs();
      const rect = picker.getBoundingClientRect();
      let barWidth = rect.width;
      const parent = picker.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        if (
          parent.classList &&
          (parent.classList.contains("transaction-capture-date-row") ||
            parent.classList.contains("transaction-date-range-group"))
        ) {
          barWidth = parentRect.width;
        } else if (parentRect.width > barWidth) {
          barWidth = parentRect.width;
        }
      }
      popup.style.top = `${rect.bottom + 8}px`;
      popup.style.left = `${rect.left}px`;
      popup.style.width = `${barWidth}px`;
      popup.style.boxSizing = "border-box";
      popup.style.display = "block";
      initCalendar();
      renderCalendar();
    } else {
      popup.style.display = "none";
    }
  }

  function clearSelection(triggerOnChange) {
    calendarStartDate = null;
    calendarEndDate = null;
    isSelectingRange = false;
    syncToHiddenInputs();
    updateDateRangeDisplay();
    renderCalendar();
    const popup = document.getElementById("calendar-popup");
    if (popup) popup.style.display = "none";
    if (triggerOnChange !== false && typeof config.onChange === "function") config.onChange();
  }

  function setQuickRange(range) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = null;
    let endDate = null;
    if (range === "today") {
      startDate = new Date(today);
      endDate = new Date(today);
    } else if (range === "yesterday") {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      startDate = d;
      endDate = d;
    } else if (range === "thisWeek") {
      const dayMon0 = (today.getDay() + 6) % 7;
      startDate = new Date(today);
      startDate.setDate(today.getDate() - dayMon0);
      endDate = new Date(today);
    } else if (range === "lastWeek") {
      const dayMon0 = (today.getDay() + 6) % 7;
      endDate = new Date(today);
      endDate.setDate(today.getDate() - dayMon0 - 1);
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6);
    } else if (range === "thisMonth") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today);
    } else if (range === "lastMonth") {
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (range === "thisYear") {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today);
    } else if (range === "lastYear") {
      const y = today.getFullYear() - 1;
      startDate = new Date(y, 0, 1);
      endDate = new Date(y, 11, 31);
    } else {
      return;
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    calendarStartDate = startDate;
    calendarEndDate = endDate;
    isSelectingRange = false;
    syncToHiddenInputs();
    updateDateRangeDisplay();
    if (typeof config.onChange === "function") config.onChange();
    const qd = document.getElementById("quick-select-dropdown");
    if (qd) qd.classList.remove("show");
  }

  window.changeMonth = changeMonth;
  window.selectQuickRange = setQuickRange;
  window.toggleQuickSelectDropdown = function toggleQuickSelectDropdown() {
    const dropdown = document.getElementById("quick-select-dropdown");
    if (dropdown) dropdown.classList.toggle("show");
  };
  window.MaintenanceDateRangePicker = {
    init(options) {
      if (options) {
        config = { ...config, ...options };
      }
      const fromEl = document.getElementById(config.dateFromId);
      const toEl = document.getElementById(config.dateToId);
      const fromDate = parseDmy(fromEl?.value);
      const toDate = parseDmy(toEl?.value);
      if (fromDate) {
        calendarStartDate = fromDate;
        calendarEndDate = toDate || new Date(fromDate);
      } else if (!config.allowEmpty) {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        calendarStartDate = new Date(t);
        calendarEndDate = new Date(t);
      } else {
        calendarStartDate = null;
        calendarEndDate = null;
      }
      syncToHiddenInputs();
      updateDateRangeDisplay();

      const picker = document.getElementById("date-range-picker");
      if (picker) {
        picker.onclick = (e) => {
          e.stopPropagation();
          toggleCalendar();
        };
      }
      const monthSelect = document.getElementById("calendar-month-select");
      const yearSelect = document.getElementById("calendar-year-select");
      if (monthSelect) monthSelect.onchange = renderCalendar;
      if (yearSelect) yearSelect.onchange = renderCalendar;
    },
    clear() {
      clearSelection(true);
    },
    getDateFrom() {
      return document.getElementById(config.dateFromId)?.value || "";
    },
    getDateTo() {
      return document.getElementById(config.dateToId)?.value || "";
    },
  };

  if (!window.__maintenanceDatePickerDocClickBound) {
    document.addEventListener("click", (e) => {
      const calendar = document.getElementById("date-range-picker");
      const popup = document.getElementById("calendar-popup");
      const bankPick = e.target.closest && e.target.closest(".bank-form-day-picker");
      if (calendar && popup && !calendar.contains(e.target) && !popup.contains(e.target) && !bankPick) {
        popup.style.display = "none";
      }
      const dropdown = document.getElementById("quick-select-dropdown");
      const inToggle = e.target.closest?.(".quick-select-dropdown-toggle") || e.target.closest?.("#quick-select-dropdown");
      if (dropdown && !inToggle) dropdown.classList.remove("show");
    });
    window.__maintenanceDatePickerDocClickBound = true;
  }

  initialized = true;
}

