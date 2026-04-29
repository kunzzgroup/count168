import { useLayoutEffect, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
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
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN, injectStylesheet } from "./transactionPaymentPageUtils.js";
import { getRoleClass } from "./transactionPaymentLogic.js";
import { assetUrl } from "../../utils/apiUrl.js";
import "flatpickr/dist/flatpickr.min.css";

export default function TransactionPaymentPage() {
  const navigate = useNavigate();
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
    runSearch: search.runSearch,
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
    setContraInbox: ui.setContraInbox,
  });

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page");
    document.body.classList.add("dashboard-page", "transaction-page");
    return () => {
      document.body.classList.remove("transaction-page", "page-ready");
    };
  }, []);

  useEffect(() => {
    return installTransactionExcelCopy();
  }, []);

  useEffect(() => {
    void injectStylesheet(assetUrl("css/transaction.css"));
  }, []);

  if (forbidden) {
    return <Navigate to="/dashboard" replace />;
  }
  if (loading || !filterSnapshot) {
    return null;
  }

  const onSearch = () => search.runSearch({ silent: false });

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
        pushToast={ui.pushToast}
        refreshContraInboxAfterAction={() => ui.refreshContraInboxBadge(filterSnapshot?.companyId)}
        runSearch={search.runSearch}
      />

      <main className="transaction-main">
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
          fallbackRoleClass=""
          openHistory={(row) =>
            ui.onViewHistory(row, search.effectiveDateFrom, search.effectiveDateTo, filterSnapshot?.companyId)
          }
          handleBalanceCellClick={form.handleBalanceCellClick}
        />
      </main>

      {/* Same markup as transaction.php — required by js/date-range-picker.js (calendar popup). */}
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
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
