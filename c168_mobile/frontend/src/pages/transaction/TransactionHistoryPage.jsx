import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileTransaction } from "../../hooks/useMobileTransaction.js";
import {
  formatHistoryBalanceMoney,
  formatHistoryMoney,
  formatRateForHistoryDisplay,
  getHistoryRemark,
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
import ExportPdfSheet from "./ExportPdfSheet.jsx";

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
        {m.paymentHistoryShowingEntries.replace("{count}", String(rows.length))}
      </p>

      {loading ? (
        <div className="py-16 text-center text-[13px] font-semibold text-slate-500">{m.loadingHistory}</div>
      ) : error ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{error}</div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-[13px] font-medium text-slate-500">{m.searchCompletedNoData}</p>
      ) : (
        <div className="space-y-2 pb-8">
          {rows.map((row, idx) => {
            const isBf = row.row_type === "bf";
            const product = row.is_bank_process_transaction
              ? row.card_owner || "-"
              : row.product || row.transaction_type || "-";
            const createdRaw = row.created_by;
            const createdBy =
              createdRaw == null ||
              String(createdRaw).trim() === "" ||
              String(createdRaw).toLowerCase() === "null"
                ? "-"
                : String(createdRaw);

            return (
              <article
                key={row.id ?? `${idx}-${row.date || ""}-${row.balance || ""}`}
                className={`rounded-2xl border p-3 shadow-sm ${
                  isBf ? "border-amber-200 bg-amber-50/60" : "border-slate-100 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-900">
                      {toUpperDisplay(product)}
                    </p>
                    <p className="text-[11px] text-slate-500">{row.date || "—"}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                    {toUpperDisplay(row.currency)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <HistMetric label={m.winLossTableCompact} value={formatHistoryMoney(row.win_loss)} />
                  <HistMetric label={m.crDrTable} value={formatHistoryMoney(row.cr_dr)} />
                  <HistMetric label={m.balanceTableCompact} value={formatHistoryBalanceMoney(row.balance)} />
                </div>
                {row.rate && row.rate !== "-" ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {m.rate}: {formatRateForHistoryDisplay(row.rate)}
                  </p>
                ) : null}
                <p className="mt-1 truncate text-[11px] text-slate-500">{getHistoryRemark(row)}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                  {m.createdByCompact}: {createdBy}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </MobileShell>
  );
}

function HistMetric({ label, value }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}
