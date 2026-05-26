import { useEffect } from "react";
import { ensureMaintenanceDateRangePicker } from "../utils/date/dateRangePicker.js";
import { formatDmy, parseYmd } from "../utils/date/dateUtils.js";

function isoToDmy(iso) {
  const d = parseYmd(String(iso || "").trim());
  return d ? formatDmy(d) : "";
}

/**
 * Single-date field using MaintenanceDateRangePicker (same calendar UX as Bank Process / Transaction).
 */
export default function FormDateField({
  fieldKey,
  label,
  htmlFor,
  value,
  disabled = false,
  minYmd,
  placeholder = "",
  clearLabel = "Clear",
  className = "",
  wrapClassName = "",
  inputClassName = "form-datepicker-input",
  hitboxClassName = "form-datepicker-hitbox",
  clearClassName = "form-datepicker-clear",
  srSpanClassName = "form-datepicker-sr-span",
  showCalendarIcon = true,
}) {
  const fromId = `${fieldKey}_drp_from`;
  const toId = `${fieldKey}_drp_to`;
  const displayId = `${fieldKey}_drp_display`;
  const pickerId = `${fieldKey}_drp_picker`;
  const displayDmy = isoToDmy(String(value || "").trim());

  useEffect(() => {
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.bindPickers?.();
  }, []);

  useEffect(() => {
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    if (!fromEl || !toEl) return;
    if (fromEl.value !== displayDmy) fromEl.value = displayDmy;
    if (toEl.value !== displayDmy) toEl.value = displayDmy;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: fromId,
      dateToId: toId,
      displayId,
    });
  }, [displayDmy, fromId, toId, displayId]);

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !displayDmy) return;
    const picker = document.getElementById(pickerId);
    if (picker) window.MaintenanceDateRangePicker?.clearForPicker?.(picker);
  };

  return (
    <div className={`form-group ${className}`.trim()}>
      {label ? <label htmlFor={htmlFor || fieldKey}>{label}</label> : null}
      <div className={`form-datepicker-wrap ${wrapClassName}`.trim()}>
        <input
          id={htmlFor || fieldKey}
          type="text"
          className={inputClassName}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          placeholder={placeholder}
          value={displayDmy}
          disabled={disabled}
        />
        {showCalendarIcon ? (
          <i className="fas fa-calendar-alt form-datepicker-icon" aria-hidden="true" />
        ) : null}
        {displayDmy && !disabled ? (
          <button
            type="button"
            className={clearClassName}
            title={clearLabel}
            aria-label={clearLabel}
            onClick={handleClear}
          >
            ×
          </button>
        ) : null}
        <input type="hidden" id={fromId} readOnly aria-hidden="true" data-min-ymd={minYmd || ""} />
        <input type="hidden" id={toId} readOnly aria-hidden="true" />
        <div
          className={`date-range-picker ${hitboxClassName}${disabled ? ` ${hitboxClassName}--disabled` : ""}`}
          id={pickerId}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label || placeholder || "Date"}
          data-drp-from={fromId}
          data-drp-to={toId}
          data-drp-display={displayId}
          data-drp-hide-presets="true"
          data-drp-collapse-single="true"
          data-form-date-key={fieldKey}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <span id={displayId} className={srSpanClassName} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export { isoToDmy };
