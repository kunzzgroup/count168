import React from "react";
import { formatOwnershipMonthLabel } from "../ownershipMonthHelpers.js";

export default function OwnershipMonthBar({
  selectedMonth,
  onMonthChange,
  isHistoricalView,
  historyBanner,
  t,
  lang,
}) {
  const currentLabel = formatOwnershipMonthLabel(selectedMonth, lang);

  return (
    <div className="own-month-bar">
      <div className="own-month-bar-main">
        <label className="own-month-label" htmlFor="own-month-picker">
          {t("viewMonth")}
        </label>
        <input
          id="own-month-picker"
          type="month"
          className="own-month-input"
          value={selectedMonth}
          max={new Date().toISOString().slice(0, 7)}
          onChange={(e) => {
            if (e.target.value) onMonthChange(e.target.value);
          }}
        />
        {isHistoricalView ? (
          <span className="own-month-badge own-month-badge--history">{t("historicalView")}</span>
        ) : (
          <span className="own-month-badge own-month-badge--current">{t("currentMonth")}</span>
        )}
      </div>
      {historyBanner ? (
        <div className={`own-month-banner${historyBanner.empty ? " own-month-banner--empty" : ""}`}>
          {historyBanner.empty
            ? t("noSnapshotForMonth", { month: currentLabel })
            : t("historicalSnapshotSaved", {
                month: currentLabel,
                savedAt: historyBanner.savedAt,
              })}
        </div>
      ) : null}
    </div>
  );
}
