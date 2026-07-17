import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProcessModalDropdownZIndex } from "../../../components/ProcessModalPortal.jsx";
import SimpleSelect from "../../../components/SimpleSelect.jsx";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";
import FormDateField from "../../../components/FormDateField.jsx";
import { formatDmy, formatYmd, parseYmd } from "../../../utils/date/dateUtils.js";
import { filterBankPickAccounts, formatBankAccountDisplay } from "../lib/bankProcessHelpers.js";

const PORTAL_MIN_WIDTH = 180;
const ACCOUNT_PICK_MIN_WIDTH = 220;
const PORTAL_EDGE_PAD = 16;
const PORTAL_GAP = 1;
const ACCOUNT_SEARCH_RESERVE = 0;
const PORTAL_DROPDOWN_CAP_ACCOUNT = 280;

function layoutPortalDropdown(buttonEl, wrapEl, { minWidth, searchReserve = 0, minMenu = 160, dropdownCap }) {
  const rect = buttonEl.getBoundingClientRect();
  const width = Math.max(rect.width, minWidth);
  const spaceBelow = window.innerHeight - rect.bottom - PORTAL_EDGE_PAD;
  const spaceAbove = rect.top - PORTAL_EDGE_PAD;
  const openBelow = spaceBelow >= minMenu || spaceBelow >= spaceAbove;
  const viewportFit = Math.max(minMenu, openBelow ? spaceBelow : spaceAbove);
  const dropdownMaxHeight = Math.min(dropdownCap, viewportFit);
  const optionsMaxHeight = Math.max(100, dropdownMaxHeight - searchReserve);

  return {
    optionsMaxHeight,
    menuStyle: {
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${dropdownMaxHeight}px`,
      display: "flex",
      flexDirection: "column",
      top: openBelow ? `${rect.bottom + PORTAL_GAP}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + PORTAL_GAP}px`,
      zIndex: getProcessModalDropdownZIndex(wrapEl),
    },
  };
}

export function BankSimpleSelect({ className = "", ...props }) {
  return <SimpleSelect {...props} wrapperClassName={`bank-simple-select${className ? ` ${className}` : ""}`} />;
}

/** Bank Process modal wrapper — same calendar as FormDateField, bank-specific CSS classes. */
export function BankFormDateField(props) {
  const { wrapClassName = "", disabled = false, ...rest } = props;
  return (
    <FormDateField
      {...rest}
      disabled={disabled}
      wrapClassName={`bank-form-datepicker-wrap${disabled ? " bank-form-datepicker-wrap--disabled" : ""} ${wrapClassName}`.trim()}
      inputClassName="bank-input bank-form-datepicker-input"
      hitboxClassName="bank-form-datepicker-hitbox"
      clearClassName="bank-form-datepicker-clear"
      srSpanClassName="bank-form-datepicker-sr-span"
      showCalendarIcon={false}
    />
  );
}

function toDisplayDate(value) {
  const date = parseYmd(String(value || "").trim());
  return date ? formatDmy(date) : "";
}

function firstOfMonth(value) {
  const date = parseYmd(String(value || "").trim()) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarCells(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const firstCell = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    date.setHours(0, 0, 0, 0);
    return {
      date,
      ymd: formatYmd(date),
      otherMonth: date.getMonth() !== month,
    };
  });
}

/**
 * Add/Edit-only date range field. It intentionally does not use the shared
 * MaintenanceDateRangePicker so the list Period picker and Resend fields keep
 * their existing bindings and behavior.
 */
export function BankFormDateRangeFields({
  startValue,
  endValue,
  onRangeChange,
  startLabel,
  endLabel,
  placeholder,
  clearLabel,
  endDisabled = false,
  singleDateMode = false,
  endLabelExtra = null,
  monthLabels,
  weekdaysShort,
}) {
  const groupRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeEndpoint, setActiveEndpoint] = useState("start");
  const [draftStart, setDraftStart] = useState(String(startValue || ""));
  const [draftEnd, setDraftEnd] = useState(String(endValue || ""));
  const [hoverYmd, setHoverYmd] = useState("");
  const [viewMonth, setViewMonth] = useState(() => firstOfMonth(startValue || endValue));
  const [popupStyle, setPopupStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setDraftStart(String(startValue || ""));
      setDraftEnd(String(endValue || ""));
      return;
    }
    setDraftStart(String(startValue || ""));
    setDraftEnd(String(endValue || ""));
  }, [endValue, open, startValue]);

  useLayoutEffect(() => {
    if (!open || !groupRef.current) return;
    const anchorRect = groupRef.current.getBoundingClientRect();
    const popupWidth = Math.min(292, Math.max(1, window.innerWidth - 24));
    const popupHeight = popupRef.current?.offsetHeight || 320;
    const left = Math.max(12, Math.min(anchorRect.left, window.innerWidth - popupWidth - 12));
    const fitsBelow = window.innerHeight - anchorRect.bottom >= popupHeight + 8;
    const top = fitsBelow
      ? anchorRect.bottom + 4
      : Math.max(12, anchorRect.top - popupHeight - 4);
    setPopupStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(popupWidth)}px`,
      zIndex: getProcessModalDropdownZIndex(groupRef.current),
    });
  }, [activeEndpoint, open, viewMonth]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      const target = event.target;
      if (groupRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnViewportMove = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportMove);
    window.addEventListener("scroll", closeOnViewportMove, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportMove);
      window.removeEventListener("scroll", closeOnViewportMove, true);
    };
  }, [open]);

  const openCalendar = (endpoint) => {
    if (endpoint === "end" && endDisabled) return;
    const nextEndpoint = endpoint === "end" && !startValue ? "start" : endpoint;
    setDraftStart(String(startValue || ""));
    setDraftEnd(String(endValue || ""));
    setHoverYmd("");
    setActiveEndpoint(nextEndpoint);
    setViewMonth(firstOfMonth(nextEndpoint === "end" ? endValue || startValue : startValue || endValue));
    setOpen(true);
  };

  const commitRange = (nextStart, nextEnd) => {
    onRangeChange?.(nextStart, nextEnd);
  };

  const selectDay = (ymd) => {
    if (activeEndpoint === "start") {
      if (singleDateMode) {
        setDraftStart(ymd);
        setDraftEnd("");
        commitRange(ymd, "");
        setOpen(false);
        return;
      }
      if (endDisabled) {
        setDraftStart(ymd);
        commitRange(ymd, draftEnd);
        setOpen(false);
        return;
      }
      const nextEnd = draftEnd && draftEnd >= ymd ? draftEnd : "";
      setDraftStart(ymd);
      setDraftEnd(nextEnd);
      commitRange(ymd, nextEnd);
      setActiveEndpoint("end");
      setHoverYmd("");
      return;
    }

    if (!draftStart) {
      setDraftStart(ymd);
      setDraftEnd("");
      commitRange(ymd, "");
      setActiveEndpoint("end");
      return;
    }

    const nextStart = ymd < draftStart ? ymd : draftStart;
    const nextEnd = ymd < draftStart ? draftStart : ymd;
    setDraftStart(nextStart);
    setDraftEnd(nextEnd);
    commitRange(nextStart, nextEnd);
    setOpen(false);
  };

  const clearStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDraftStart("");
    setDraftEnd("");
    commitRange("", "");
    setOpen(false);
  };

  const clearEnd = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDraftEnd("");
    commitRange(draftStart || String(startValue || ""), "");
    setOpen(false);
  };

  const cells = useMemo(() => buildCalendarCells(viewMonth), [viewMonth]);
  const todayYmd = formatYmd(new Date());
  const previewStart = draftStart;
  const previewEnd =
    activeEndpoint === "end" && hoverYmd
      ? hoverYmd < previewStart
        ? previewStart
        : hoverYmd
      : draftEnd;
  const previewRangeStart =
    activeEndpoint === "end" && hoverYmd && hoverYmd < previewStart ? hoverYmd : previewStart;

  const selectedYears = [parseYmd(draftStart)?.getFullYear(), parseYmd(draftEnd)?.getFullYear()]
    .filter(Number.isFinite);
  const currentYear = new Date().getFullYear();
  const minYear = Math.min(2022, ...selectedYears);
  const maxYear = Math.max(currentYear + 1, ...selectedYears);
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  const labels = Array.isArray(monthLabels) && monthLabels.length === 12
    ? monthLabels
    : Array.from({ length: 12 }, (_, index) => String(index + 1));
  const weekdays = Array.isArray(weekdaysShort) && weekdaysShort.length === 7
    ? weekdaysShort
    : Array(7).fill("");

  const renderField = ({ endpoint, label, value, disabled, labelExtra, wrapClassName, className = "" }) => (
    <div className={`form-group ${className}`.trim()}>
      {labelExtra ? (
        <div className="form-date-label-row bank-day-end-label-row">
          <label htmlFor={`bank_day_${endpoint}`}>{label}</label>
          {labelExtra}
        </div>
      ) : (
        <label htmlFor={`bank_day_${endpoint}`}>{label}</label>
      )}
      <div
        className={`bank-form-datepicker-wrap ${wrapClassName}${disabled ? " bank-form-datepicker-wrap--disabled" : ""}`.trim()}
      >
        <input
          id={`bank_day_${endpoint}`}
          type="text"
          className="bank-input bank-form-datepicker-input"
          readOnly
          placeholder={placeholder}
          value={toDisplayDate(value)}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open && activeEndpoint === endpoint}
          onClick={() => openCalendar(endpoint)}
          onKeyDown={(event) => {
            if (!disabled && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              openCalendar(endpoint);
            }
          }}
        />
        {value && !disabled ? (
          <button
            type="button"
            className="bank-form-datepicker-clear"
            title={clearLabel}
            aria-label={clearLabel}
            onClick={endpoint === "start" ? clearStart : clearEnd}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );

  const popup = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={popupRef}
          className="calendar-popup calendar-popup--transaction-range calendar-popup--no-presets bank-form-range-calendar"
          style={{ ...popupStyle, display: "grid", visibility: popupStyle ? "visible" : "hidden" }}
          role="dialog"
          aria-label={`${startLabel} - ${endLabel}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="transaction-calendar-panel">
            <div className="calendar-header">
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label={labels[(viewMonth.getMonth() + 11) % 12]}
                onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <div className="calendar-month-year">
                <select
                  value={viewMonth.getMonth()}
                  aria-label={startLabel}
                  onChange={(event) =>
                    setViewMonth((prev) => new Date(prev.getFullYear(), Number(event.target.value), 1))
                  }
                >
                  {labels.map((label, index) => (
                    <option key={label} value={index}>{label}</option>
                  ))}
                </select>
                <select
                  value={viewMonth.getFullYear()}
                  aria-label={endLabel}
                  onChange={(event) =>
                    setViewMonth((prev) => new Date(Number(event.target.value), prev.getMonth(), 1))
                  }
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label={labels[(viewMonth.getMonth() + 1) % 12]}
                onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div className="calendar-weekdays">
              {weekdays.map((weekday, index) => (
                <div key={`${weekday}-${index}`} className="calendar-weekday">{weekday}</div>
              ))}
            </div>
            <div className="calendar-days">
              {cells.map(({ ymd, date, otherMonth }) => {
                const isStart = !!previewRangeStart && ymd === previewRangeStart;
                const isEnd = !!previewEnd && ymd === previewEnd;
                const inRange =
                  !!previewRangeStart && !!previewEnd && ymd > previewRangeStart && ymd < previewEnd;
                const classNames = [
                  "calendar-day",
                  otherMonth ? "other-month" : "",
                  ymd === todayYmd ? "today" : "",
                  isStart ? "start-date" : "",
                  isEnd ? "end-date" : "",
                  isStart && isEnd ? "selected" : "",
                  inRange ? (hoverYmd ? "preview-range" : "in-range") : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={ymd}
                    type="button"
                    className={classNames}
                    aria-label={formatDmy(date)}
                    onMouseEnter={() => {
                      if (activeEndpoint === "end" && draftStart) setHoverYmd(ymd);
                    }}
                    onFocus={() => {
                      if (activeEndpoint === "end" && draftStart) setHoverYmd(ymd);
                    }}
                    onClick={() => selectDay(ymd)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={groupRef} className="form-row bank-day-start-row bank-form-date-range-fields">
      {renderField({
        endpoint: "start",
        label: startLabel,
        value: startValue,
        disabled: false,
        wrapClassName: "bank-day-start-input-wrap",
      })}
      {renderField({
        endpoint: "end",
        label: endLabel,
        value: endValue,
        disabled: endDisabled,
        labelExtra: endLabelExtra,
        wrapClassName: "bank-day-end-input-wrap",
        className: `bank-day-end-field-group${endDisabled ? " bank-day-end-input-wrap--muted" : ""}`,
      })}
      {popup}
    </div>
  );
}

function accountLabel(account) {
  if (!account) return "";
  return formatBankAccountDisplay(account.account_id, account.name, account.id);
}

export function BankSearchableAccountPick({ value, onChange, accounts, disabled, t }) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(320);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutPortalDropdown(
      btn,
      wrapRef.current,
      {
        minWidth: ACCOUNT_PICK_MIN_WIDTH,
        searchReserve: ACCOUNT_SEARCH_RESERVE,
        minMenu: 180,
        dropdownCap: PORTAL_DROPDOWN_CAP_ACCOUNT,
      },
    );
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, close]);

  const pickableAccounts = useMemo(() => {
    const list = filterBankPickAccounts(accounts);
    return list.slice().sort((a, b) => accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: "base" }));
  }, [accounts]);

  const menuItems = useMemo(() => {
    const placeholder = t("selectAccount");
    return [{ id: "", label: placeholder }, ...pickableAccounts.map((a) => ({ id: a.id, label: accountLabel(a) }))];
  }, [pickableAccounts, t]);

  const getItemLabel = useCallback((idx) => menuItems[idx]?.label ?? "", [menuItems]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open,
    itemCount: menuItems.length,
    getItemLabel,
  });

  const selected = pickableAccounts.find((a) => String(a.id) === String(value));
  const placeholder = t("selectAccount");

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal");
    setUsePortal(inModal);
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (id) => {
    onChange(id ? String(id) : "");
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
    >
      <div
        ref={listRef}
        className="custom-select-options"
        style={usePortal ? { flex: "1 1 auto", minHeight: 0 } : { maxHeight: optionsMaxHeight }}
      >
        {menuItems.map((item, idx) => (
          <div
            key={item.id || "placeholder"}
            className={`custom-select-option${String(value) === String(item.id) ? " selected" : ""}${highlightClass(idx)}`}
            role="option"
            aria-selected={String(value) === String(item.id)}
            data-kb-idx={idx}
            onMouseEnter={() => setHighlightIdx(idx)}
            onClick={() => pick(item.id)}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="custom-select-wrapper bank-searchable-account-pick" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}${!selected ? " simple-select-button--placeholder" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
        onKeyDown={(e) => {
          handleButtonKeyDown(e, {
            isOpen: open,
            onToggleOpen: openDropdown,
            onClose: close,
            len: menuItems.length,
            onSelectIndex: (idx) => {
              const item = menuItems[idx];
              if (item) pick(item.id);
            },
          });
        }}
      >
        {selected ? accountLabel(selected) : placeholder}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
