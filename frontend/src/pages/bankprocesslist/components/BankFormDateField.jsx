import { useEffect } from "react";
import { ensureMaintenanceDateRangePicker } from "../../../utils/maintenanceDateRangePicker.js";
import { isoToDmy } from "../bankProcessHelpers.js";

/**
 * Single-date field for Add/Edit Bank Process — uses MaintenanceDateRangePicker
 * (localized month/weekday labels) instead of native type="date".
 */
export default function BankFormDateField({
  fieldKey,
  label,
  htmlFor,
  value,
  disabled = false,
  minYmd,
  placeholder,
  clearLabel = "Clear",
  className = "",
  wrapClassName = "",
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
    const dmy = displayDmy;
    if (fromEl.value !== dmy) fromEl.value = dmy;
    if (toEl.value !== dmy) toEl.value = dmy;
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
      <label htmlFor={htmlFor || fieldKey}>{label}</label>
      <div className={`bank-form-datepicker-wrap ${wrapClassName}`.trim()}>
        <input
          id={htmlFor || fieldKey}
          type="text"
          className="bank-input bank-form-datepicker-input"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          placeholder={placeholder}
          value={displayDmy}
          disabled={disabled}
        />
        {displayDmy && !disabled ? (
          <button
            type="button"
            className="bank-form-datepicker-clear"
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
          className={`date-range-picker bank-form-datepicker-hitbox${disabled ? " bank-form-datepicker-hitbox--disabled" : ""}`}
          id={pickerId}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          data-drp-from={fromId}
          data-drp-to={toId}
          data-drp-display={displayId}
          data-drp-hide-presets="true"
          data-drp-collapse-single="true"
          data-bank-form-date-key={fieldKey}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <span id={displayId} className="bank-form-datepicker-sr-span" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

