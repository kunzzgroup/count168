import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { portalToDocumentBody } from "../../../components/ProcessModalPortal.jsx";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { TRANSACTION_I18N } from "../../../translateFile/pages/transactionTranslate.js";
import { MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import ReportDatePicker from "../../report/common/ReportDatePicker.jsx";
import {
  buildMaintenancePeriodPresets,
  parseDmy,
} from "../../maintenance/shared/maintenanceDateHelpers.js";
import {
  buildCombinedMemberReportPrintHtml,
  buildMemberReportFilename,
  exportCurrencyCodes,
  fetchMemberReportHistory,
  fetchPaymentHistoryExportCurrencies,
  openReportPrintWindow,
  renderReportToWindow,
  resolveExportCurrenciesDefault,
  ymdRangeToDmy,
} from "../lib/paymentHistoryMemberReportExport.js";
import { applyCurrencyToggle } from "../../member/memberPageHelpers.js";

function ExportPdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export default function PaymentHistoryExportPdfModal({
  open,
  onClose,
  scope,
  accountTitle,
  messages,
  pickerInstanceId = "",
  shareCalendarPopup = false,
}) {
  const lang = useLoginLang();
  const defaultM = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);
  const m = useMemo(() => ({ ...defaultM, ...messages }), [defaultM, messages]);
  const maintenanceLocale = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const periodPresets = useMemo(() => buildMaintenancePeriodPresets(maintenanceLocale), [maintenanceLocale]);

  const initialFromYmd = useMemo(() => parseDmy(scope?.dateFrom || ""), [scope?.dateFrom]);
  const initialToYmd = useMemo(() => parseDmy(scope?.dateTo || ""), [scope?.dateTo]);

  const accountCode = String(scope?.accountCode || "").trim();
  const accountName = String(scope?.accountName || "").trim();
  const accountContextLabel = useMemo(() => {
    if (accountCode && accountName && accountName !== accountCode) {
      return { code: accountCode, name: accountName };
    }
    if (accountCode) return { code: accountCode, name: "" };
    const fallback = String(accountTitle || "").trim();
    return fallback ? { code: fallback, name: "" } : null;
  }, [accountCode, accountName, accountTitle]);

  const [dateFromYmd, setDateFromYmd] = useState(initialFromYmd);
  const [dateToYmd, setDateToYmd] = useState(initialToYmd);
  const [currencies, setCurrencies] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const exportCodes = useMemo(
    () => exportCurrencyCodes(isAllSelected, selectedCurrencies, currencies),
    [isAllSelected, selectedCurrencies, currencies],
  );

  useEffect(() => {
    if (!open) return;
    setDateFromYmd(initialFromYmd);
    setDateToYmd(initialToYmd);
    setError("");
  }, [open, initialFromYmd, initialToYmd]);

  useEffect(() => {
    if (!open) return undefined;
    const accountId = scope?.accountDbId;
    const companyId = scope?.companyId;
    if (!accountId || !companyId) {
      setCurrencies([]);
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      return undefined;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingCurrencies(true);
    setError("");
    void fetchPaymentHistoryExportCurrencies(accountId, companyId, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        const defaults = resolveExportCurrenciesDefault(scope?.currency, list);
        setCurrencies(list);
        setIsAllSelected(defaults.isAllSelected);
        setSelectedCurrencies(defaults.codes);
      })
      .catch((err) => {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        setCurrencies([]);
        setIsAllSelected(true);
        setSelectedCurrencies([]);
        setError(err?.message || m.exportPdfLoadCurrenciesFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCurrencies(false);
      });
    return () => controller.abort();
  }, [open, scope?.accountDbId, scope?.companyId, scope?.currency, m.exportPdfLoadCurrenciesFailed]);

  const handleRangeChange = useCallback((fromYmd, toYmd) => {
    setDateFromYmd(fromYmd || "");
    setDateToYmd(toYmd || "");
    setError("");
  }, []);

  const handleToggleCurrency = useCallback(
    (code) => {
      const next = applyCurrencyToggle(currencies, isAllSelected, selectedCurrencies, code);
      setIsAllSelected(next.isAllSelected);
      setSelectedCurrencies(next.selectedCurrencies);
      setError("");
    },
    [currencies, isAllSelected, selectedCurrencies],
  );

  const handleSelectAllCurrencies = useCallback(() => {
    setIsAllSelected(true);
    setSelectedCurrencies([]);
    setError("");
  }, []);

  const handleExport = useCallback(async () => {
    const accountId = scope?.accountDbId;
    const { dateFrom, dateTo } = ymdRangeToDmy(dateFromYmd, dateToYmd);
    const codes = exportCodes;
    if (!dateFrom || !dateTo) {
      setError(m.pleaseSelectDateRange);
      return;
    }
    if (!codes.length) {
      setError(m.pleaseSelectCurrency);
      return;
    }
    if (!accountId || !scope?.companyId) {
      setError(m.exportPdfMissingAccount);
      return;
    }
    const printWin = openReportPrintWindow(m.exportPdfExporting);
    if (!printWin) {
      setError(m.exportPdfPopupBlocked);
      return;
    }
    setExporting(true);
    setError("");
    try {
      const sections = await Promise.all(
        codes.map(async (currency) => {
          const rows = await fetchMemberReportHistory({
            accountId,
            companyId: scope.companyId,
            dateFrom,
            dateTo,
            currency,
          });
          return { currency, rows };
        }),
      );
      const html = buildCombinedMemberReportPrintHtml({
        sections,
        accountCode,
        accountName,
        dateFrom,
        dateTo,
        lang,
      });
      const filename = buildMemberReportFilename({
        accountCode,
        currencies: codes,
        dateFrom,
        dateTo,
      });
      renderReportToWindow(printWin, { html, documentTitle: filename });
      onClose?.();
    } catch (err) {
      try {
        if (printWin && !printWin.closed) printWin.close();
      } catch {
        /* ignore */
      }
      if (err?.name === "AbortError") return;
      if (err?.message === "Popup blocked") {
        setError(m.exportPdfPopupBlocked);
        return;
      }
      setError(err?.message || m.exportPdfFailed);
    } finally {
      setExporting(false);
    }
  }, [
    scope,
    dateFromYmd,
    dateToYmd,
    exportCodes,
    accountCode,
    accountName,
    lang,
    m,
    onClose,
  ]);

  if (!open) return null;

  return portalToDocumentBody(
    <div
      className="transaction-payment-history-export-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-history-export-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose?.();
      }}
    >
      <div className="transaction-payment-history-export-modal">
        <div className="transaction-payment-history-export-modal__header">
          <div className="transaction-payment-history-export-modal__heading">
            <h3 id="payment-history-export-title">{m.exportPdfTitle}</h3>
            {accountContextLabel ? (
              <p className="transaction-payment-history-export-modal__subtitle">
                <span className="transaction-payment-history-export-modal__account-code">
                  {accountContextLabel.code}
                </span>
                {accountContextLabel.name ? (
                  <span className="transaction-payment-history-export-modal__account-name">
                    {accountContextLabel.name}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="transaction-modal-close transaction-payment-history-export-modal__close"
            aria-label={m.close}
            disabled={exporting}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="transaction-payment-history-export-modal__body">
          <p className="transaction-payment-history-export-modal__hint">{m.exportPdfHint}</p>

          <div className="transaction-payment-history-export-modal__form">
            <div className="transaction-payment-history-export-modal__inline-row">
              <span className="transaction-payment-history-export-modal__inline-label">
                {m.exportPdfDateRange}:
              </span>
              <div className="transaction-payment-history-export-modal__inline-control">
                <ReportDatePicker
                  dateFrom={dateFromYmd}
                  dateTo={dateToYmd}
                  onRangeChange={handleRangeChange}
                  containerClass="transaction-payment-history-export-date"
                  label=""
                  placeholder={m.exportPdfSelectDateRange}
                  selectEndDateHint={m.exportPdfSelectEndDate}
                  captureDateStyle
                  instanceId={pickerInstanceId}
                  shareCalendarPopup={shareCalendarPopup}
                  periodPresets={periodPresets}
                  periodShortcutsAria={m.exportPdfPeriod}
                  monthLabels={m.monthsShort}
                  weekdaysShort={m.weekdaysShort}
                />
              </div>
            </div>

            <div className="transaction-payment-history-export-modal__inline-row">
              <span className="transaction-payment-history-export-modal__inline-label">
                {m.exportPdfCurrency}:
              </span>
              <div className="transaction-payment-history-export-modal__inline-control">
                {loadingCurrencies ? (
                  <p className="transaction-payment-history-export-modal__loading">{m.loading}</p>
                ) : currencies.length === 0 ? (
                  <p className="transaction-payment-history-export-modal__empty">{m.exportPdfNoCurrencies}</p>
                ) : (
                  <div
                    className="transaction-payment-history-export-modal__currency-pills"
                    role="group"
                    aria-label={m.exportPdfCurrency}
                  >
                    <div className="transaction-payment-history-export-modal__currency-segments">
                      {currencies.length > 1 ? (
                        <button
                          type="button"
                          className={`transaction-payment-history-export-modal__currency-segment${isAllSelected ? " is-on" : ""}`}
                          data-currency-code="ALL"
                          onClick={handleSelectAllCurrencies}
                        >
                          {m.all || "ALL"}
                        </button>
                      ) : null}
                      {currencies.map((code) => (
                        <button
                          key={code}
                          type="button"
                          className={`transaction-payment-history-export-modal__currency-segment${
                            !isAllSelected && selectedCurrencies.includes(code) ? " is-on" : ""
                          }`}
                          data-currency-code={code}
                          onClick={() => handleToggleCurrency(code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <p className="transaction-payment-history-export-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="transaction-payment-history-export-modal__actions">
          <button
            type="button"
            className="transaction-payment-history-export-modal__btn transaction-payment-history-export-modal__btn--ghost"
            disabled={exporting}
            onClick={onClose}
          >
            {m.exportPdfCancel}
          </button>
          <button
            type="button"
            className="transaction-payment-history-export-modal__btn transaction-payment-history-export-modal__btn--primary"
            disabled={exporting || loadingCurrencies || exportCodes.length === 0}
            onClick={() => void handleExport()}
          >
            <ExportPdfIcon />
            <span>{exporting ? m.exportPdfExporting : m.exportPdf}</span>
          </button>
        </div>
      </div>
    </div>,
  );
}
