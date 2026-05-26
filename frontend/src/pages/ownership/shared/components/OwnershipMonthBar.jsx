import React, { useRef } from "react";
import {
  formatOwnershipMonthShort,
  getOwnershipCurrentMonthKey,
} from "../ownershipMonthHelpers.js";

export default function OwnershipMonthBar({
  selectedMonth,
  onMonthChange,
  isHistoricalView,
  historyBanner,
  t,
  lang,
}) {
  const inputRef = useRef(null);
  const shortLabel = formatOwnershipMonthShort(selectedMonth, lang);
  const maxMonth = new Date().toISOString().slice(0, 7);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fallback click */
      }
    }
    el.click();
  };

  return (
    <div className="own-month-picker-wrap">
      <div className="own-month-picker">
        <button
          type="button"
          className={`own-month-trigger${isHistoricalView ? " is-history" : ""}`}
          onClick={openPicker}
          aria-label={t("viewMonth")}
        >
          <span className="own-month-trigger-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <span className="own-month-trigger-label">{shortLabel}</span>
          {isHistoricalView ? (
            <span className="own-month-trigger-tag">{t("historicalView")}</span>
          ) : null}
          <span className="own-month-trigger-chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>
        <input
          ref={inputRef}
          id="own-month-picker"
          type="month"
          className="own-month-input-native"
          value={selectedMonth}
          max={maxMonth}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.value) onMonthChange(e.target.value);
          }}
        />
        {isHistoricalView ? (
          <button
            type="button"
            className="own-month-back-btn"
            onClick={() => onMonthChange(getOwnershipCurrentMonthKey())}
          >
            {t("currentMonth")}
          </button>
        ) : null}
      </div>
      {historyBanner ? (
        <p className={`own-month-hint${historyBanner.empty ? " is-warn" : ""}`}>
          {historyBanner.empty
            ? t("noSnapshotShort")
            : t("snapshotSavedShort", { savedAt: historyBanner.savedAt })}
        </p>
      ) : null}
    </div>
  );
}
