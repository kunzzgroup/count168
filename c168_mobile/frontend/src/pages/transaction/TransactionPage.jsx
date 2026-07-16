import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileTransaction } from "../../hooks/useMobileTransaction.js";
import { buildPaymentHistoryScope, persistPaymentHistoryScope } from "../../lib/transactionHistoryScope.js";
import { formatTransactionGridMoneyHalfUp, parseBalanceValue } from "../../lib/transactionFormat.js";
import MoneyDecimal from "../../lib/money/moneyDecimal.js";
import { resolveGridRowToAccountOption } from "../../lib/transactionPaymentLogic.js";
import FilterSheet from "../dashboard/FilterSheet.jsx";
import ScopeBreadcrumb from "../dashboard/ScopeBreadcrumb.jsx";
import AccountBalanceTables from "./AccountBalanceTables.jsx";
import AddTransactionSheet from "./AddTransactionSheet.jsx";
import ContraInboxSheet from "./ContraInboxSheet.jsx";

function ToggleChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap-scale shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
        active ? "bg-[#2f6bf6] text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

export default function TransactionPage() {
  const tx = useMobileTransaction();
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [addEntryIntent, setAddEntryIntent] = useState("add");

  const openHistory = useCallback(
    (row) => {
      const scope = buildPaymentHistoryScope({
        row,
        dateFrom: tx.dateFrom,
        dateTo: tx.dateTo,
        scopeApi: tx.scopeApi,
        currency: tx.currency,
      });
      persistPaymentHistoryScope(scope);
      navigate("/transaction/history");
    },
    [navigate, tx.dateFrom, tx.dateTo, tx.scopeApi, tx.currency],
  );

  const pickBalanceForForm = useCallback(
    (row, side) => {
      if (tx.mutationsBlocked) {
        tx.pushToast(tx.m.readOnlyModeCannotSubmit, "error");
        return;
      }
      const account = resolveGridRowToAccountOption(row, tx.accountOptions);
      if (!account) {
        tx.pushToast(tx.m.couldNotResolveAccount, "error");
        return;
      }

      const rowCurrency = String(row?.currency || "").trim().toUpperCase();
      const accountCurrency = account.currency ? String(account.currency).trim().toUpperCase() : "";
      const currency = rowCurrency || accountCurrency || "";

      let amount = "";
      const balRaw = row?.balance;
      const parsed = parseBalanceValue(String(balRaw ?? "").replace(/,/g, ""));
      if (parsed !== null) {
        try {
          amount = MoneyDecimal.formatFixedHalfUp(MoneyDecimal.abs(String(balRaw)).toString(), 2);
        } catch {
          amount = MoneyDecimal.formatFixedHalfUp(String(Math.abs(parsed)), 2);
        }
      }

      setAddPrefill({
        id: Date.now(),
        side: side === "right" ? "right" : "left",
        account,
        amount,
        currency,
      });
      setFabOpen(false);
      setAddEntryIntent("add");
      setAddOpen(true);
    },
    [tx],
  );

  const openAddSheet = useCallback(() => {
    setFabOpen(false);
    setAddPrefill(null);
    setAddEntryIntent("add");
    setAddOpen(true);
  }, []);

  const openSearchSheet = useCallback(() => {
    setFabOpen(false);
    setAddPrefill(null);
    setAddEntryIntent("search");
    setAddOpen(true);
  }, []);

  if (tx.blocked) return null;

  const companyCode = String(tx.selectedCompany?.company_id || "").toUpperCase();
  const groupId = String(
    tx.selectedGroup || tx.selectedCompany?.group_id || tx.selectedCompany?.link_source_group || "",
  )
    .trim()
    .toUpperCase();

  const viewingCompanyCode = tx.groupsAllMode || tx.groupAllMode
    ? tx.i18n.all
    : tx.groupOnlyMode
      ? groupId
      : companyCode;
  const sidebarGroupId = tx.groupOnlyMode ? "" : groupId;
  const inboxCount = tx.contraInbox?.items?.length || 0;
  const overlayOpen = filterOpen || addOpen || Boolean(tx.contraInbox?.open);

  const stickyBar = (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className={`tap-scale min-w-0 flex-1 rounded-2xl bg-white px-3 py-2 text-left shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)] ring-1 ring-slate-100`}
        >
          <div className="flex items-center gap-2">
            <i className="far fa-calendar shrink-0 text-[#2f6bf6]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-700">{tx.dateRangeText}</span>
            <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-1 text-[11px] font-bold tracking-wide text-slate-600">
              {tx.currency}
            </span>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#2f6bf6] text-white">
              <i className="fas fa-filter text-[11px]" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-1.5 border-t border-slate-100/90 pt-1.5">
            <ScopeBreadcrumb
              i18n={tx.i18n}
              groupId={groupId}
              companyCode={companyCode}
              groupsAllMode={tx.groupsAllMode}
              groupAllMode={tx.groupAllMode}
              groupOnlyMode={tx.groupOnlyMode}
            />
          </div>
        </button>
        {tx.canUseContraInbox ? (
          <button
            type="button"
            onClick={() => tx.setContraInbox((s) => ({ ...s, open: true }))}
            className="tap-scale relative flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)] ring-1 ring-slate-100"
            aria-label={tx.m.contraInbox}
          >
            <i className="fas fa-inbox text-[16px]" aria-hidden="true" />
            {inboxCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 grid min-w-[16px] place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                {inboxCount}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToggleChip active={tx.showName} onClick={() => tx.setShowName(!tx.showName)}>
          {tx.m.showName}
        </ToggleChip>
        <ToggleChip active={tx.showCaptureOnly} onClick={() => tx.setShowCaptureOnly(!tx.showCaptureOnly)}>
          {tx.m.showCaptureOnly}
        </ToggleChip>
        <ToggleChip active={tx.showPaymentOnly} onClick={() => tx.setShowPaymentOnly(!tx.showPaymentOnly)}>
          {tx.m.showPaymentOnly}
        </ToggleChip>
        <ToggleChip active={tx.showZeroBalance} onClick={() => tx.setShowZeroBalance(!tx.showZeroBalance)}>
          {tx.m.showZeroBalance}
        </ToggleChip>
        {tx.typeSearchActive ? (
          <ToggleChip active onClick={() => tx.exitTypeSearch()}>
            {tx.typeSearchFormType || tx.m.search}
          </ToggleChip>
        ) : null}
      </div>
    </div>
  );

  const showLoading = tx.loading || (tx.searchLoading && !tx.displayRows.length);

  return (
    <MobileShell
      i18n={tx.i18n}
      me={tx.me}
      companyCode={viewingCompanyCode}
      groupId={sidebarGroupId}
      onLogout={tx.logout}
      onRefresh={tx.retry}
      refreshing={tx.searchLoading}
      stickyBar={stickyBar}
      lang={tx.lang}
      onLangChange={tx.setLang}
      overlayOpen={overlayOpen}
      onMainScrollStart={() => {
        setFabOpen((open) => (open ? false : open));
      }}
      floatingAction={
        <>
          {fabOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-[48] bg-slate-900/25"
              aria-label={tx.m.fabCloseMenu}
              onClick={() => setFabOpen(false)}
            />
          ) : null}

          <div className="mb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] ml-4 flex flex-col-reverse items-start gap-3">
            <button
              type="button"
              onClick={() => setFabOpen((v) => !v)}
              className={`tap-scale grid size-14 place-items-center rounded-full border text-white shadow-[0_10px_28px_-10px_rgba(47,107,246,0.55)] transition ${
                fabOpen
                  ? "border-white/40 bg-slate-800/80"
                  : "border-[#6b9bff]/80 bg-[#2f6bf6]"
              }`}
              aria-label={fabOpen ? tx.m.fabCloseMenu : tx.m.fabMenu}
              aria-expanded={fabOpen}
            >
              <i
                className={`fas ${fabOpen ? "fa-xmark" : "fa-money-bill-transfer"} text-lg`}
                aria-hidden="true"
              />
            </button>

            {fabOpen ? (
              <>
                <button
                  type="button"
                  onClick={openAddSheet}
                  disabled={tx.mutationsBlocked}
                  className="tap-scale flex items-center gap-2 rounded-full border border-white/50 bg-white/85 py-2 pl-2 pr-3.5 text-[12px] font-bold text-slate-800 shadow-lg disabled:opacity-40"
                  aria-label={tx.m.fabAddPayment || tx.m.addTransaction}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-[#2f6bf6] text-white">
                    <i className="fas fa-plus text-sm" aria-hidden="true" />
                  </span>
                  <span>{tx.m.fabAddPayment || tx.m.addTransaction}</span>
                </button>
                <button
                  type="button"
                  onClick={openSearchSheet}
                  className="tap-scale flex items-center gap-2 rounded-full border border-white/50 bg-white/85 py-2 pl-2 pr-3.5 text-[12px] font-bold text-slate-800 shadow-lg"
                  aria-label={tx.m.fabSearchPayment || tx.m.search}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-slate-800 text-white">
                    <i className="fas fa-filter text-sm" aria-hidden="true" />
                  </span>
                  <span>{tx.m.fabSearchPayment || tx.m.search}</span>
                </button>
              </>
            ) : null}
          </div>
        </>
      }
      overlay={
        <>
          <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} dash={tx} />
          <AddTransactionSheet
            open={addOpen}
            onClose={() => {
              setAddOpen(false);
              setAddPrefill(null);
              setAddEntryIntent("add");
            }}
            m={tx.m}
            accountOptions={tx.accountOptions}
            currencyOptions={tx.formCurrencies}
            mutationsBlocked={tx.mutationsBlocked}
            onSubmit={tx.submitTx}
            pushToast={tx.pushToast}
            onTypeSearch={(t) => {
              tx.runTypeSearch(t);
              setAddOpen(false);
            }}
            typeSearchActive={tx.typeSearchActive}
            onExitTypeSearch={tx.exitTypeSearch}
            prefill={addPrefill}
            onPrefillConsumed={() => setAddPrefill(null)}
            entryIntent={addEntryIntent}
          />
          <ContraInboxSheet
            open={Boolean(tx.contraInbox?.open)}
            onClose={() => tx.setContraInbox((s) => ({ ...s, open: false }))}
            m={tx.m}
            items={tx.contraInbox?.items || []}
            loading={tx.contraInbox?.loading}
            mutationsBlocked={tx.mutationsBlocked}
            onApprove={tx.onApproveContra}
            onReject={tx.onRejectContra}
          />
        </>
      }
    >
      {tx.toast ? (
        <div
          className={`fixed left-4 right-4 top-24 z-[70] rounded-2xl px-4 py-3 text-[13px] font-semibold shadow-lg ${
            tx.toast.tone === "error"
              ? "bg-rose-600 text-white"
              : tx.toast.tone === "success"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-white"
          }`}
        >
          {tx.toast.message}
        </div>
      ) : null}

      {tx.error ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{tx.error}</div>
      ) : null}

      {showLoading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <i className="fas fa-spinner fa-spin text-2xl text-[#2f6bf6]" aria-hidden="true" />
          <p className="text-[13px] font-semibold">{tx.m.loadingData}</p>
        </div>
      ) : (
        <>
          {tx.totals ? (
            <div className="mb-3 grid grid-cols-4 gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
              <TotalCell label={tx.m.bfTable} value={tx.totals.bf} />
              <TotalCell label={tx.m.winLossTableCompact} value={tx.totals.win_loss} />
              <TotalCell label={tx.m.crDrTable} value={tx.totals.cr_dr} />
              <TotalCell label={tx.m.balanceTableCompact} value={tx.totals.balance} highlight />
            </div>
          ) : null}

          {tx.searchError ? (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              {tx.searchError}
            </p>
          ) : null}

          {tx.displayRows.length === 0 ? (
            <p className="py-8 text-center text-[13px] font-medium text-slate-500">{tx.m.noAccountsFound}</p>
          ) : (
            <AccountBalanceTables
              rows={tx.displayRows}
              showName={tx.showName}
              m={tx.m}
              currency={tx.currency}
              onOpenHistory={openHistory}
              onPickBalance={pickBalanceForForm}
            />
          )}
        </>
      )}
    </MobileShell>
  );
}

function TotalCell({ label, value, highlight = false }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[11px] font-bold tabular-nums ${highlight ? "text-[#2f6bf6]" : "text-slate-800"}`}>
        {formatTransactionGridMoneyHalfUp(value)}
      </p>
    </div>
  );
}
