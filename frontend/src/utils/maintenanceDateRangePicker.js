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
  let calendarViewMode = "days";
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  function setWeekdaysVisible(visible) {
    const weekdays = document.querySelector("#calendar-popup .calendar-weekdays");
    if (weekdays) weekdays.style.display = visible ? "" : "none";
  }

  function updateHeaderTriggerActive(activeMode) {
    const monthControl = document.getElementById("calendar-month-select");
    const yearControl = document.getElementById("calendar-year-select");
    if (monthControl) monthControl.classList.toggle("is-active", activeMode === "months");
    if (yearControl) yearControl.classList.toggle("is-active", activeMode === "years");
  }

  function setMonthControlValue(monthIndex) {
    const monthControl = document.getElementById("calendar-month-select");
    if (!monthControl) return;
    monthControl.value = String(monthIndex);
    if (monthControl.tagName !== "SELECT") {
      monthControl.textContent = monthLabels[monthIndex] || "";
    }
  }

  function setYearControlValue(year) {
    const yearControl = document.getElementById("calendar-year-select");
    if (!yearControl) return;
    yearControl.value = String(year);
    if (yearControl.tagName !== "SELECT") {
      yearControl.textContent = String(year);
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

  function getQuickRangeDates(range) {
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
    }
    if (!startDate || !endDate) return null;
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }

  function updateQuickPresetActive(activeKey) {
    document.querySelectorAll(".transaction-calendar-preset[data-period-key]").forEach((btn) => {
      const isActive = activeKey && btn.getAttribute("data-period-key") === activeKey;
      btn.classList.toggle("is-active", !!isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function detectMatchingQuickRange() {
    if (!calendarStartDate || !calendarEndDate) return "";
    const keys = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];
    const startTime = calendarStartDate.getTime();
    const endTime = calendarEndDate.getTime();
    return keys.find((key) => {
      const range = getQuickRangeDates(key);
      return range && range.startDate.getTime() === startTime && range.endDate.getTime() === endTime;
    }) || "";
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
    if (yearSelect && yearSelect.tagName === "SELECT") {
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
    setMonthControlValue(calendarCurrentDate.getMonth());
    setYearControlValue(calendarCurrentDate.getFullYear());
    updateDateRangeDisplay();
    updateQuickPresetActive(detectMatchingQuickRange());
  }

  function renderMonthPicker() {
    const daysContainer = document.getElementById("calendar-days");
    const yearSelect = document.getElementById("calendar-year-select");
    if (!daysContainer || !yearSelect) return;
    calendarViewMode = "months";
    updateHeaderTriggerActive("months");
    setWeekdaysVisible(false);
    daysContainer.classList.remove("calendar-year-grid");
    daysContainer.classList.add("calendar-month-grid");
    daysContainer.innerHTML = "";
    const currentMonth = Number(document.getElementById("calendar-month-select")?.value ?? calendarCurrentDate.getMonth());
    monthLabels.forEach((label, monthIndex) => {
      const monthButton = document.createElement("button");
      monthButton.type = "button";
      monthButton.className = "calendar-month-option";
      if (monthIndex === currentMonth) monthButton.classList.add("is-active");
      monthButton.textContent = label;
      monthButton.addEventListener("click", (e) => {
        e.stopPropagation();
        calendarCurrentDate = new Date(Number(yearSelect.value), monthIndex, 1);
        setMonthControlValue(monthIndex);
        renderCalendar();
      });
      daysContainer.appendChild(monthButton);
    });
  }

  function getYearBounds() {
    const currentYear = new Date().getFullYear();
    return { minYear: 2022, maxYear: currentYear + 1 };
  }

  function renderYearPicker() {
    const daysContainer = document.getElementById("calendar-days");
    const yearControl = document.getElementById("calendar-year-select");
    if (!daysContainer || !yearControl) return;
    calendarViewMode = "years";
    updateHeaderTriggerActive("years");
    setWeekdaysVisible(false);
    daysContainer.classList.remove("calendar-month-grid");
    daysContainer.classList.add("calendar-year-grid");
    daysContainer.innerHTML = "";
    const { minYear, maxYear } = getYearBounds();
    const selectedYear = Number(yearControl.value) || calendarCurrentDate.getFullYear();
    const rangeStart = Math.max(minYear, Math.min(selectedYear - 3, maxYear - 7));
    const rangeEnd = Math.min(maxYear, rangeStart + 7);
    for (let year = rangeStart; year <= rangeEnd; year += 1) {
      const yearButton = document.createElement("button");
      yearButton.type = "button";
      yearButton.className = "calendar-year-option";
      if (year === selectedYear) yearButton.classList.add("is-active");
      yearButton.textContent = String(year);
      yearButton.addEventListener("click", (e) => {
        e.stopPropagation();
        calendarCurrentDate = new Date(year, calendarCurrentDate.getMonth(), 1);
        setYearControlValue(year);
        renderCalendar();
      });
      daysContainer.appendChild(yearButton);
    }
  }

  function renderCalendar() {
    calendarViewMode = "days";
    updateHeaderTriggerActive("");
    setWeekdaysVisible(true);
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
    daysContainer.classList.remove("calendar-month-grid", "calendar-year-grid");
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
    const monthSelect = document.getElementById("calendar-month-select");
    const yearSelect = document.getElementById("calendar-year-select");
    if (calendarViewMode === "months") {
      const { minYear, maxYear } = getYearBounds();
      const currentYear = Number(yearSelect?.value) || calendarCurrentDate.getFullYear();
      const nextYear = Math.min(maxYear, Math.max(minYear, currentYear + delta));
      calendarCurrentDate.setFullYear(nextYear);
      setYearControlValue(nextYear);
      renderMonthPicker();
      return;
    }
    if (calendarViewMode === "years") {
      const { minYear, maxYear } = getYearBounds();
      const currentYear = Number(yearSelect?.value) || calendarCurrentDate.getFullYear();
      const nextYear = Math.min(maxYear, Math.max(minYear, currentYear + delta * 8));
      calendarCurrentDate.setFullYear(nextYear);
      setYearControlValue(nextYear);
      renderYearPicker();
      return;
    }
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    if (monthSelect) setMonthControlValue(calendarCurrentDate.getMonth());
    setYearControlValue(calendarCurrentDate.getFullYear());
    renderCalendar();
  }

  function selectDate(date) {
    if (!calendarStartDate || (calendarStartDate && calendarEndDate)) {
      calendarStartDate = new Date(date);
      calendarEndDate = null;
      isSelectingRange = true;
      updateQuickPresetActive("");
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
      updateQuickPresetActive(detectMatchingQuickRange());
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
      if (popup.classList.contains("calendar-popup--transaction-range")) {
        const popupWidth = Math.min(Math.max(window.innerWidth * 0.22, 316), 336);
        const maxLeft = window.innerWidth - popupWidth - 12;
        popup.style.left = `${Math.max(12, Math.min(rect.left, maxLeft))}px`;
        popup.style.width = "";
      } else {
        popup.style.left = `${rect.left}px`;
        popup.style.width = `${barWidth}px`;
      }
      popup.style.top = `${rect.bottom + 8}px`;
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
    updateQuickPresetActive("");
    renderCalendar();
    const popup = document.getElementById("calendar-popup");
    if (popup) popup.style.display = "none";
    if (triggerOnChange !== false && typeof config.onChange === "function") config.onChange();
  }

  function setQuickRange(range) {
    const quickRange = getQuickRangeDates(range);
    if (!quickRange) {
      return;
    }
    calendarStartDate = quickRange.startDate;
    calendarEndDate = quickRange.endDate;
    isSelectingRange = false;
    syncToHiddenInputs();
    updateDateRangeDisplay();
    updateQuickPresetActive(range);
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
    setLocaleStrings(partial) {
      if (!partial || typeof partial !== "object") return;
      config = { ...config, ...partial };
      updateDateRangeDisplay();
    },
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
      if (monthSelect) {
        if (monthSelect.tagName === "SELECT") {
          monthSelect.onchange = renderCalendar;
        } else {
          monthSelect.onclick = (e) => {
            e.stopPropagation();
            if (calendarViewMode === "months") renderCalendar();
            else renderMonthPicker();
          };
        }
      }
      if (yearSelect) {
        if (yearSelect.tagName === "SELECT") {
          yearSelect.onchange = renderCalendar;
        } else {
          yearSelect.onclick = (e) => {
            e.stopPropagation();
            if (calendarViewMode === "years") renderCalendar();
            else renderYearPicker();
          };
        }
      }
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

