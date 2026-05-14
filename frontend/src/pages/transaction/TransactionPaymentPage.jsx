import { useLayoutEffect, useMemo, useEffect, useCallback, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import TransactionAddSection from "./components/TransactionAddSection.jsx";
import TransactionHeader from "./components/TransactionHeader.jsx";
import TransactionHistoryModal from "./components/TransactionHistoryModal.jsx";
import TransactionSearchSection from "./components/TransactionSearchSection.jsx";
import TransactionTablesSection from "./components/TransactionTablesSection.jsx";
import { formatDmy, formatHistoryMoney } from "./transactionFormat.js";
import { useTransactionData } from "./hooks/useTransactionData.js";
import { useTransactionUI } from "./hooks/useTransactionUI.js";
import { useTransactionSearch } from "./hooks/useTransactionSearch.js";
import { useTransactionForm } from "./hooks/useTransactionForm.js";
import { useTransactionSync } from "./hooks/useTransactionSync.js";
import { useTransactionDateRange } from "./hooks/useTransactionDateRange.js";
import { useTransactionInitialization } from "./hooks/useTransactionInitialization.js";
import { installTransactionExcelCopy } from "./transactionExcelCopy.js";
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN } from "./transactionPaymentPageUtils.js";
import { getRoleClass } from "./transactionPaymentLogic.js";
import "flatpickr/dist/flatpickr.min.css";
import "../../../public/css/transaction.css";
import "../../../public/css/userlist.css";

/** Cleared on mount so SPA navigation cannot leave stale route classes on `body` before paint (e.g. Process uses `useEffect`; this page uses `useLayoutEffect`, which runs first). */
const ROUTE_BODY_CLASSES_TO_CLEAR = [
  "bg",
  "account-page",
  "announcement-page",
  "datacapture-page",
  "process-page",
  "process-page--show-all",
  "process-page--bank",
  "process-page--bank-show-all",
  "maintenance-page",
  "report-page",
  "user-page",
  "user-page--show-all",
  "member-winloss-page",
];

export default function TransactionPaymentPage() {
  const location = useLocation();
  const todayDmy = useMemo(() => formatDmy(new Date()), []);

  // 1. UI State
  const ui = useTransactionUI();
  const { pushToast } = ui;

  // 2. Data & Auth
  const data = useTransactionData({ todayDmy });
  const { filterSnapshot, currencyRowsOrdered, loading, forbidden } = data;

  // 3. Form Logic
  const formSearchRef = useRef(null);
  const onFormSearch = useCallback((opts) => {
    if (formSearchRef.current) formSearchRef.current(opts);
  }, []);

  const form = useTransactionForm({
    todayDmy,
    pushToast,
    onSearch: onFormSearch,
    refreshContraInboxBadge: ui.refreshContraInboxBadge,
    filterSnapshot,
    accountOptions: data.accountOptions,
  });

  // 4. Search Logic
  const search = useTransactionSearch({
    filterSnapshot,
    todayDmy,
    pushToast,
    txType: form.txType,
    currencyRowsOrdered,
    setCurrencyRowsOrdered: data.setCurrencyRowsOrdered,
  });
  formSearchRef.current = search.runSearch;

  // 5. Defaults (useLayoutEffect: must run before passive effects that call runSearch)
  useTransactionInitialization({
    loading,
    forbidden,
    filterSnapshot,
    currencyRowsOrdered,
    todayDmy,
    search,
    form,
  });

  // 6. Date Range & External Libs
  useTransactionDateRange({
    loading,
    forbidden,
    filterSnapshot,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    setDateFrom: search.setDateFrom,
    setDateTo: search.setDateTo,
    todayDmy,
    txDate: form.txDate,
    setTxDate: form.setTxDate,
    rateDate: form.rateDate,
    setRateDate: form.setRateDate,
    fpTxDateRef: form.fpTxDateRef,
    fpRateDateRef: form.fpRateDateRef,
  });

  // 7. Sync & Lifecycle
  const canApproveContra = useMemo(() => {
    const role = filterSnapshot?.viewerRole;
    return ["manager", "admin", "owner"].includes(role);
  }, [filterSnapshot?.viewerRole]);

  useTransactionSync({
    filterSnapshot,
    effectiveDateFrom: search.effectiveDateFrom,
    effectiveDateTo: search.effectiveDateTo,
    selectedCategories: search.selectedCategories,
    searchState: search.searchState,
    showAllCurrencies: search.showAllCurrencies,
    selectedCurrencies: search.selectedCurrencies,
    lastSearchCommitMsRef: search.lastSearchCommitMsRef,
    runSearch: search.runSearch,
    setHistory: ui.setHistory,
    loading,
    forbidden,
    canApproveContra,
    refreshContraInboxBadge: ui.refreshContraInboxBadge,
  });

  useLayoutEffect(() => {
    document.body.classList.remove(...ROUTE_BODY_CLASSES_TO_CLEAR);
    document.body.classList.add("dashboard-page", "transaction-page");
    return () => {
      document.body.classList.remove("transaction-page", "page-ready");
    };
  }, []);

  /** Runs after previous route's `useEffect` cleanup (User/Account used to re-add `bg`). `body.bg::before` blocks clicks site-wide. */
  useEffect(() => {
    document.body.classList.remove("bg");
  }, []);

  useEffect(() => {
    return installTransactionExcelCopy();
  }, []);

  /** Hooks must run every render — never after `return null` / `Navigate` (React #310). */
  const singleCategoryFallbackRoleClass = useMemo(() => {
    const raw = search.selectedCategories || [];
    const sel = raw.filter((x) => x != null && String(x).trim() !== "" && String(x).trim().toUpperCase() !== "");
    if (sel.length !== 1) return "";
    return getRoleClass(String(sel[0]));
  }, [search.selectedCategories]);

  const txWlTolBannerActive = useMemo(() => {
    try {
      return new URLSearchParams(location.search || "").get("tx_wl_tol") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

  const onSearch = useCallback(() => {
    search.runSearch({ silent: false });
  }, [search.runSearch]);

  if (forbidden) {
    return <Navigate to="/dashboard" replace />;
  }
  if (loading || !filterSnapshot) {
    return null;
  }

  return (
    <div className="container-fluid transaction-container">
      <TransactionHeader
        canApproveContra={canApproveContra}
        contraInbox={ui.contraInbox}
        toggleContraInbox={() => ui.setContraInbox((s) => ({ ...s, open: !s.open }))}
        refreshContraInbox={() => ui.refreshContraInboxBadge(filterSnapshot?.companyId)}
        approveContra={(opts) => ui.onApproveContra(opts.transactionId, opts.companyId, search.runSearch)}
        rejectContra={(opts) => ui.onRejectContra(opts.transactionId, opts.companyId)}
        fsCompanyId={filterSnapshot?.companyId}
      />

      <main className="transaction-main">
        {txWlTolBannerActive ? (
          <div
            className="transaction-tx-wl-tol-banner"
            style={{
              margin: "0 0 12px 0",
              padding: "10px 12px",
              background: "#fffbeb",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              color: "#78350f",
              fontSize: 13,
            }}
          >
            已启用 <strong>底部 Summary Win/Loss 展示容差</strong>（<code style={{ background: "#fde68a", padding: "2px 6px", borderRadius: 4 }}>tx_wl_tol=1</code>）：合计 Win/Loss 绝对值不超过 <strong>RM1.00</strong> 时将显示 <strong>0.00</strong>，并重算该行 Balance；各账户列与 API 仍为真实轧差。
          </div>
        ) : null}
        <div className="transaction-main-content">
          <TransactionSearchSection
            dateFrom={search.dateFrom}
            dateTo={search.dateTo}
            effectiveDateRangeText={search.effectiveDateRangeText}
            quickOpen={search.quickOpen}
            toggleQuick={search.toggleQuick}
            selectQuickRange={search.selectQuickRange}
            categoryOpen={search.categoryOpen}
            toggleCategory={search.toggleCategory}
            categories={data.categories}
            selectedCategories={search.selectedCategories}
            categoryAllCheckboxRef={search.categoryAllCheckboxRef}
            onCategoryAllChange={search.onCategoryAllChange}
            toggleCategoryValue={search.toggleCategoryValue}
            removeCategoryTag={search.removeCategoryTag}
            searchState={search.searchState}
            setSearchState={search.setSearchState}
            showAllCurrencies={search.showAllCurrencies}
            setShowAllCurrencies={search.setShowAllCurrencies}
            selectedCurrencies={search.selectedCurrencies}
            setSelectedCurrencies={search.setSelectedCurrencies}
            currencyOptions={data.currencyOptions}
            searchLoading={search.searchLoading}
            onSearch={onSearch}
            fs={filterSnapshot}
            onGroupButtonClick={data.onGroupButtonClick}
            onGroupFilterAllClick={data.onGroupFilterAllClick}
            onCompanyButtonClick={data.onCompanyButtonClick}
            currencyRowsOrdered={currencyRowsOrdered}
            toggleAllCurrenciesBtn={search.toggleAllCurrenciesBtn}
            onCurrencyDragStart={search.onCurrencyDragStart}
            onCurrencyDropOn={search.onCurrencyDropOn}
            toggleCurrencyBtn={search.toggleCurrencyBtn}
          />

          <TransactionAddSection
            txType={form.txType}
            setTxType={form.setTxType}
            txDate={form.txDate}
            todayDmy={todayDmy}
            setTxDate={form.setTxDate}
            txToAccount={form.txToAccount}
            setTxToAccount={form.setTxToAccount}
            txFromAccount={form.txFromAccount}
            setTxFromAccount={form.setTxFromAccount}
            selectedCategories={search.selectedCategories}
            txCurrency={form.txCurrency}
            setTxCurrency={form.setTxCurrency}
            txAmount={form.txAmount}
            setTxAmount={form.setTxAmount}
            txRemark={form.txRemark}
            setTxRemark={form.setTxRemark}
            txConfirm={form.txConfirm}
            setTxConfirm={form.setTxConfirm}
            winLoseSide={form.winLoseSide}
            setWinLoseSide={form.setWinLoseSide}
            submitting={form.submitting}
            onSubmitTx={form.onSubmitTx}
            onSearch={onSearch}
            searchLoading={search.searchLoading}
            accountOptions={data.accountOptions}
            currencyOptions={data.currencyOptions}
            showStandardFromAndReverse={form.showStandardFromAndReverse}
            onReverseAccounts={form.onReverseAccounts}
            isAdjustment={form.isAdjustment}
            rateDate={form.rateDate}
            setRateDate={form.setRateDate}
            rateToAccount={form.rateToAccount}
            setRateToAccount={form.setRateToAccount}
            rateFromAccount={form.rateFromAccount}
            setRateFromAccount={form.setRateFromAccount}
            rateCurrencyFrom={form.rateCurrencyFrom}
            setRateCurrencyFrom={form.setRateCurrencyFrom}
            rateCurrencyTo={form.rateCurrencyTo}
            setRateCurrencyTo={form.setRateCurrencyTo}
            rateCurrencyFromAmount={form.rateCurrencyFromAmount}
            setRateCurrencyFromAmount={form.setRateCurrencyFromAmount}
            rateExchangeRateRaw={form.rateExchangeRateRaw}
            setRateExchangeRateRaw={form.setRateExchangeRateRaw}
            rateCurrencyToAmount={form.rateCurrencyToAmount}
            onRateCurrencyRowReverse={form.onRateCurrencyRowReverse}
            rateTransferToAccount={form.rateTransferToAccount}
            setRateTransferToAccount={form.setRateTransferToAccount}
            rateTransferFromAccount={form.rateTransferFromAccount}
            setRateTransferFromAccount={form.setRateTransferFromAccount}
            rateMiddlemanAccount={form.rateMiddlemanAccount}
            setRateMiddlemanAccount={form.setRateMiddlemanAccount}
            rateMiddlemanRate={form.rateMiddlemanRate}
            setRateMiddlemanRate={form.setRateMiddlemanRate}
            rateMiddlemanAmount={form.rateMiddlemanAmount}
          />
        </div>

        <TransactionTablesSection
          tablesVisible={search.tablesVisible}
          searchLoading={search.searchLoading}
          tp={search.tablePresentation}
          searchState={search.searchState}
          getRoleClass={getRoleClass}
          fallbackRoleClass={singleCategoryFallbackRoleClass}
          openHistory={(row) =>
            ui.onViewHistory(row, search.effectiveDateFrom, search.effectiveDateTo, filterSnapshot?.companyId, {
              selectedCurrencies: search.selectedCurrencies,
              showAllCurrencies: search.showAllCurrencies,
            })
          }
          handleBalanceCellClick={form.handleBalanceCellClick}
        />
      </main>

      {/* Same date logic as legacy page, with Transaction-specific range picker layout. */}
      <div className="calendar-popup calendar-popup--transaction-range" id="calendar-popup" style={{ display: "none" }}>
        <div className="transaction-calendar-presets" aria-label="Period shortcuts">
          {[
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["thisWeek", "This Week"],
            ["lastWeek", "Last Week"],
            ["thisMonth", "This Month"],
            ["lastMonth", "Last Month"],
            ["thisYear", "This Year"],
            ["lastYear", "Last Year"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="transaction-calendar-preset"
              onClick={(e) => {
                e.stopPropagation();
                window.selectQuickRange?.(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="transaction-calendar-panel">
          <div className="calendar-header">
            <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
              <i className="fas fa-chevron-left" />
            </button>
            <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
              <select id="calendar-month-select" aria-label="Month">
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select id="calendar-year-select" aria-label="Year" />
            </div>
            <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
          </div>
          <div className="calendar-days" id="calendar-days" />
        </div>
      </div>

      <TransactionHistoryModal
        history={ui.history}
        setHistory={ui.setHistory}
        histMoney={formatHistoryMoney}
        showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
      />

      <div id="notificationContainer" className="transaction-notification-container" aria-live="polite">
        {ui.toast.map((t) => {
          const typeClass =
            t.type === "error"
              ? "transaction-notification-error"
              : t.type === "success"
                ? "transaction-notification-success"
                : "transaction-notification-info";
          return (
            <div key={t.id} className={`transaction-notification ${typeClass} show`} role="status">
              {t.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}
