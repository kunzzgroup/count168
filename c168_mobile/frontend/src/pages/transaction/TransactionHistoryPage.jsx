import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileTransaction } from "../../hooks/useMobileTransaction.js";
import {
  formatHistoryBalanceMoney,
  formatHistoryMoney,
  formatRateForHistoryDisplay,
  getHistoryRemark,
  parseBalanceValue,
  toUpperDisplay,
} from "../../lib/transactionFormat.js";
import { getHistory } from "../../lib/transactionApi.js";
import {
  paymentHistoryParamsReady,
  paymentHistoryScopeApiParams,
  paymentHistoryTitle,
  resolveHistoryAccountName,
  resolvePaymentHistoryScope,
} from "../../lib/transactionHistoryScope.js";
import { historyTypeBadgeClass, historyTypeCardClass, historyTypeLabel } from "../../lib/transactionTypeStyles.js";
import ExportPdfSheet from "./ExportPdfSheet.jsx";

/** Sort key for history row dates (supports DD/MM/YYYY and YYYY-MM-DD). */
function historyDateSortKey(row) {
  const raw = String(row?.date || "").trim();
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10).replace(/-/g, "");
  return raw;
}

/** Newest date first; B/F (period opening) stays at the bottom. */
function sortHistoryNewestFirst(rows) {
  return [...(rows || [])].sort((a, b) => {
    const aBf = a?.row_type === "bf" ? 1 : 0;
    const bBf = b?.row_type === "bf" ? 1 : 0;
    if (aBf !== bBf) return aBf - bBf;
    const byDate = historyDateSortKey(b).localeCompare(historyDateSortKey(a));
    if (byDate !== 0) return byDate;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

function MoneyTone({ value, children }) {
  const n = parseBalanceValue(String(value ?? "").replace(/,/g, ""));
  let tone = "text-slate-800";
  if (n != null) {
    if (n < 0) tone = "text-rose-600";
    else if (n > 0) tone = "text-[#2f6bf6]";
  }
  return <span className={`tabular-nums ${tone}`}>{children}</span>;
}

function HistMetric({ label, rawValue, display }) {
  return (
    <div className="min-w-0 px-1 py-1 text-right">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-[11px] font-semibold leading-snug">
        <MoneyTone value={rawValue}>{display}</MoneyTone>
      </p>
    </div>
  );
}

export default function TransactionHistoryPage() {
  const tx = useMobileTransaction();
  const [searchParams] = useSearchParams();
  const scope = useMemo(() => resolvePaymentHistoryScope(searchParams), [searchParams]);
  const scopeApi = useMemo(() => paymentHistoryScopeApiParams(scope), [scope]);
  const paramsReady = paymentHistoryParamsReady(scope);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountMeta, setAccountMeta] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const m = tx.m;
  const i18n = tx.i18n;

  const exportScope = useMemo(() => {
    const companyId =
      scope.companyId ||
      (Number(tx.companyId) > 0 ? Number(tx.companyId) : undefined) ||
      (Number(tx.selectedCompany?.id) > 0 ? Number(tx.selectedCompany.id) : undefined);
    return { ...scope, companyId };
  }, [scope, tx.companyId, tx.selectedCompany]);

  useEffect(() => {
    if (!paramsReady) return undefined;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    (async () => {
      try {
        const data = await getHistory({
          ...scopeApi,
          accountId: scope.accountDbId,
          dateFrom: scope.dateFrom,
          dateTo: scope.dateTo,
          currency: scope.currency,
          virtualCompanyCode: scope.virtualCompanyCode,
          pureTypeSearch: scope.pureTypeSearch,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!data?.success) {
          setError(data?.message || m.searchFailed);
          setRows([]);
          return;
        }
        setRows(Array.isArray(data.data) ? data.data : []);
        setAccountMeta(data.account || null);
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(e?.message || m.searchFailed);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [paramsReady, scope, scopeApi, m.searchFailed]);

  const title = useMemo(() => {
    const meta = accountMeta
      ? {
          ...accountMeta,
          name: resolveHistoryAccountName({
            accountName: scope.accountName,
            accountMeta,
            accountCode: scope.accountCode,
          }),
        }
      : null;
    return paymentHistoryTitle({
      accountCode: scope.accountCode,
      accountName: scope.accountName,
      accountMeta: meta,
    });
  }, [accountMeta, scope.accountCode, scope.accountName]);

  const resolvedAccountName = resolveHistoryAccountName({
    accountName: scope.accountName,
    accountMeta,
    accountCode: scope.accountCode,
  });

  const displayRows = useMemo(() => sortHistoryNewestFirst(rows), [rows]);

  if (!paramsReady) {
    return <Navigate to="/transaction" replace />;
  }

  const stickyBar = (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100">
      <Link
        to="/transaction"
        className="tap-scale grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"
        aria-label={m.backToList}
      >
        <i className="fas fa-arrow-left text-sm" aria-hidden="true" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-slate-900">{title}</p>
        <p className="truncate text-[11px] text-slate-500">
          {scope.dateFrom} — {scope.dateTo}
          {scope.currency ? ` · ${scope.currency}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className="tap-scale grid size-9 shrink-0 place-items-center rounded-xl bg-[#2f6bf6] text-white"
        aria-label={m.exportPdf}
        title={m.exportPdf}
      >
        <i className="fas fa-file-pdf text-sm" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <MobileShell
      i18n={i18n}
      me={tx.me}
      onLogout={tx.logout}
      stickyBar={stickyBar}
      lang={tx.lang}
      onLangChange={tx.setLang}
      showBottomNav={false}
      overlayOpen={exportOpen}
      overlay={
        <ExportPdfSheet
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          m={m}
          scope={exportScope}
          accountCode={scope.accountCode || accountMeta?.account_id || ""}
          accountName={resolvedAccountName}
          lang={tx.lang}
        />
      }
    >
      <p className="mb-3 text-[12px] font-medium text-slate-500">
        {m.paymentHistoryShowingEntries.replace("{count}", String(displayRows.length))}
      </p>

      {loading ? (
        <div className="py-16 text-center text-[13px] font-semibold text-slate-500">{m.loadingHistory}</div>
      ) : error ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{error}</div>
      ) : displayRows.length === 0 ? (
        <p className="py-12 text-center text-[13px] font-medium text-slate-500">{m.searchCompletedNoData}</p>
      ) : (
        <ul className="space-y-2.5 pb-8">
          {displayRows.map((row, idx) => {
            const typeLabel = historyTypeLabel(row);
            const badgeCls = historyTypeBadgeClass(row);
            const cardCls = historyTypeCardClass(row);
            const createdRaw = row.created_by;
            const createdBy =
              createdRaw == null ||
              String(createdRaw).trim() === "" ||
              String(createdRaw).toLowerCase() === "null"
                ? "-"
                : String(createdRaw);
            const remark = getHistoryRemark(row);
            const cur = toUpperDisplay(row.currency);

            return (
              <li
                key={row.id ?? `${idx}-${row.date || ""}-${row.balance || ""}`}
                className={`overflow-hidden rounded-xl shadow-sm ${cardCls}`}
              >
                <div className="flex items-center gap-2 border-b border-black/5 bg-white/50 px-3 py-2">
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ${badgeCls}`}
                  >
                    {typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">
                    {row.date || "—"}
                  </span>
                  <span className="shrink-0 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600 ring-1 ring-slate-200/80">
                    {cur || "—"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-0 px-1.5 py-1.5">
                  <HistMetric
                    label={m.winLossTableCompact}
                    rawValue={row.win_loss}
                    display={formatHistoryMoney(row.win_loss)}
                  />
                  <HistMetric
                    label={m.crDrTable}
                    rawValue={row.cr_dr}
                    display={formatHistoryMoney(row.cr_dr)}
                  />
                  <HistMetric
                    label={m.balanceTableCompact}
                    rawValue={row.balance}
                    display={formatHistoryBalanceMoney(row.balance)}
                  />
                </div>

                {(row.rate && row.rate !== "-") || remark || createdBy !== "-" ? (
                  <div className="space-y-0.5 border-t border-black/5 px-3 py-2">
                    {row.rate && row.rate !== "-" ? (
                      <p className="text-[10px] font-medium text-slate-500">
                        {m.rate}: {formatRateForHistoryDisplay(row.rate)}
                      </p>
                    ) : null}
                    {remark && remark !== "-" ? (
                      <p className="truncate text-[10px] text-slate-500">{remark}</p>
                    ) : null}
                    <p className="text-[10px] font-medium text-slate-400">
                      {m.createdByCompact}: {createdBy}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </MobileShell>
  );
}
