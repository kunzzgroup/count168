import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getAutoRenewCalendarI18n } from "../../../translateFile/pages/autoRenewTranslate.js";
import { formatDomainFeeDisplay2 } from "../../domain/domainHelpers.js";
import { fetchAutoRenewPaymentHistory } from "../autoRenewLogic.js";
import { useAutoRenewDateRange } from "../hooks/useAutoRenewDateRange.js";
import { defaultDashboardDateRange, ymdToDmy } from "../../dashboard/lib/dashboardDateUtils.js";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/payment_maintenance.css";

const HISTORY_FROM_ID = "auto_renew_history_date_from";
const HISTORY_TO_ID = "auto_renew_history_date_to";
const HISTORY_DISPLAY_ID = "auto-renew-history-date-display";
const HISTORY_PICKER_ID = "auto-renew-history-date-range-picker";

export default function AutoRenewPaymentHistory({ ready, t }) {
  const defaults = useMemo(() => defaultDashboardDateRange(), []);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lang = useLoginLang();

  const calendarI18n = useMemo(() => getAutoRenewCalendarI18n(lang), [lang]);

  const { effectiveDateRangeText } = useAutoRenewDateRange({
    ready,
    i18n: calendarI18n,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    fromInputId: HISTORY_FROM_ID,
    toInputId: HISTORY_TO_ID,
    displayId: HISTORY_DISPLAY_ID,
    pickerId: HISTORY_PICKER_ID,
  });

  const loadHistory = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAutoRenewPaymentHistory({
        dateFrom: ymdToDmy(dateFrom),
        dateTo: ymdToDmy(dateTo),
      });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || "load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ready, dateFrom, dateTo]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <section className="auto-renew-history-panel payment-maintenance-page-root" aria-labelledby="auto-renew-history-title">
      <div className="auto-renew-history-header">
        <h2 id="auto-renew-history-title" className="auto-renew-history-title">
          {t("historyTitle")}
        </h2>
        <div className="auto-renew-history-date-row">
          <span className="user-gc-inline-label">{t("historyDateRange")}</span>
          <div className="report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
            <div className="report-outlined-shell report-outlined-shell--no-label">
              <div className="report-outlined-inner">
                <div className="transaction-date-range-group">
                  <div
                    className="date-range-picker"
                    id={HISTORY_PICKER_ID}
                    data-drp-from={HISTORY_FROM_ID}
                    data-drp-to={HISTORY_TO_ID}
                    data-drp-display={HISTORY_DISPLAY_ID}
                    role="button"
                    tabIndex={0}
                    aria-label={t("selectDateRange")}
                  >
                    <i className="fas fa-calendar-alt" />
                    <span id={HISTORY_DISPLAY_ID}>{effectiveDateRangeText}</span>
                    <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                  </div>
                  <input type="hidden" id={HISTORY_FROM_ID} readOnly />
                  <input type="hidden" id={HISTORY_TO_ID} readOnly />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="auto-renew-notice warn">{t("historyLoadFailed", { message: error })}</div> : null}

      <div className="auto-renew-history-table-wrap" aria-busy={loading}>
        <div className="auto-renew-history-table" role="table">
          <div className="auto-renew-history-table-header" role="row">
            <div role="columnheader">{t("histColDate")}</div>
            <div role="columnheader">{t("histColFrom")}</div>
            <div role="columnheader">{t("histColTo")}</div>
            <div role="columnheader">{t("histColAmount")}</div>
            <div role="columnheader">{t("histColCurrency")}</div>
            <div role="columnheader">{t("histColDescription")}</div>
          </div>
          {rows.length === 0 && !loading ? (
            <div className="auto-renew-history-empty" role="status">
              {t("historyEmpty")}
            </div>
          ) : (
            rows.map((row, idx) => {
              const isDeleted =
                row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
              const deletedTitle =
                isDeleted && row.deleted_by
                  ? `${row.deleted_by}${row.dts_deleted ? ` (${row.dts_deleted})` : ""}`
                  : isDeleted
                    ? row.dts_deleted || ""
                    : undefined;
              return (
                <div
                  key={`${row.transaction_id}-${row.is_deleted}-${idx}`}
                  role="row"
                  className={`maintenance-virtual-data-row auto-renew-history-row maintenance-row${
                    isDeleted ? " maintenance-row-deleted" : ""
                  }`}
                  title={deletedTitle}
                >
                  <div role="cell" className="maintenance-virtual-cell">
                    {row.transaction_date || "—"}
                  </div>
                  <div role="cell" className="maintenance-virtual-cell">
                    {row.from_account || "—"}
                  </div>
                  <div role="cell" className="maintenance-virtual-cell">
                    {row.to_account || "—"}
                  </div>
                  <div role="cell" className="maintenance-virtual-cell">
                    {row.amount ? formatDomainFeeDisplay2(row.amount) : "—"}
                  </div>
                  <div role="cell" className="maintenance-virtual-cell">
                    {row.currency || "—"}
                  </div>
                  <div role="cell" className="maintenance-virtual-cell">
                    {row.description || "—"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}