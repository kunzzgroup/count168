import { useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { getRoleClass } from "../../lib/transactionPaymentLogic.js";

/** Opaque tints — no bleed under overlapping columns (card layout has none). */
const ROLE_ROW_BG = {
  "transaction-role-capital": "bg-rose-50",
  "transaction-role-bank": "bg-sky-50",
  "transaction-role-cash": "bg-emerald-50",
  "transaction-role-profit": "bg-amber-50",
  "transaction-role-expenses": "bg-orange-50",
  "transaction-role-company": "bg-indigo-50",
  "transaction-role-member": "bg-teal-50",
  "transaction-role-agent": "bg-cyan-50",
};

function MoneyCell({ value, emphasize = false, forceTone = null }) {
  const n = parseBalanceValue(String(value ?? "").replace(/,/g, ""));
  const display = formatTransactionGridMoneyHalfUp(value);
  let tone = "text-slate-800";
  if (forceTone === "pos") tone = "text-[#2f6bf6]";
  else if (forceTone === "neg") tone = "text-rose-600";
  else if (emphasize && n != null) {
    if (n < 0) tone = "text-rose-600";
    else if (n > 0) tone = "text-[#2f6bf6]";
  }
  return <span className={`tabular-nums ${tone}`}>{display}</span>;
}

function MetricCell({ label, value, emphasize = false, forceTone = null, onClick, title }) {
  const interactive = typeof onClick === "function";
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      className={`min-w-0 px-1.5 py-1.5 text-right ${
        interactive ? "tap-scale rounded-lg active:bg-slate-100/80" : ""
      }`}
      onClick={onClick}
      title={title}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-[11px] font-bold leading-tight ${emphasize ? "text-[12px]" : ""}`}>
        <MoneyCell value={value} emphasize={emphasize} forceTone={forceTone} />
      </p>
    </Comp>
  );
}

function AccountCardList({ side, rows, showName, m, onOpenHistory, onPickBalance, balanceTone }) {
  if (rows.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[12px] font-medium text-slate-400">{m.noAccountsFound}</p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => {
        const roleCls = getRoleClass(row?.role);
        const rowBg = ROLE_ROW_BG[roleCls] || "bg-white";
        const code = String(row?.account_id || "").toUpperCase();
        const name = String(row?.account_name || "").trim();
        const cur = String(row?.currency || "").toUpperCase();
        const key = `${row.account_db_id || row.account_id}-${row.currency}-${row.transaction_id || ""}`;
        return (
          <li key={key} className={`${rowBg}`}>
            <button
              type="button"
              className="tap-scale flex w-full items-center gap-2 px-3 py-2.5 text-left active:brightness-95"
              onClick={() => onOpenHistory?.(row)}
              title={m.tapForHistory}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-900 underline decoration-slate-300 underline-offset-2">
                  {code}
                </span>
                {showName && name ? (
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{name}</span>
                ) : null}
              </span>
              <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-500 ring-1 ring-slate-200/80">
                {cur}
              </span>
            </button>

            <div className="grid grid-cols-4 gap-0 border-t border-slate-100/80 px-1.5 pb-2 pt-0.5">
              <MetricCell label={m.bfTable} value={row?.bf} />
              <MetricCell label={m.winLossTableCompact} value={row?.win_loss} />
              <MetricCell label={m.crDrTable} value={row?.cr_dr} />
              <MetricCell
                label={m.balanceTableCompact}
                value={row?.balance}
                emphasize
                forceTone={balanceTone}
                onClick={() => onPickBalance?.(row, side)}
                title={m.tapBalanceToFill || m.balanceTable}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop parity: left = balance ≥ 0, right = balance < 0 (sign only — not From/To role). */
export function splitAccountRowsByBalance(rows) {
  const left = [];
  const right = [];
  for (const row of rows || []) {
    const bal = parseBalanceValue(String(row?.balance ?? "").replace(/,/g, ""));
    if (bal != null && bal < 0) right.push(row);
    else left.push(row);
  }
  return { left, right };
}

export default function AccountBalanceTables({
  rows,
  showName,
  m,
  currency,
  onOpenHistory,
  onPickBalance,
}) {
  const { left, right } = splitAccountRowsByBalance(rows);
  const [sideTab, setSideTab] = useState("left");
  const isLeft = sideTab === "left";
  const activeRows = isLeft ? left : right;

  return (
    <div className="space-y-3 pb-24">
      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
        {m.currencyLabel} {String(currency || "").toUpperCase()}
        {rows?.length ? ` · ${rows.length}` : ""}
      </p>

      <div
        className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/80"
        role="tablist"
        aria-label={m.accountSideTabs || "Account balance sides"}
      >
        <button
          type="button"
          role="tab"
          aria-selected={isLeft}
          className={`tap-scale flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[12px] font-bold transition ${
            isLeft
              ? "bg-white text-[#2f6bf6] shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500"
          }`}
          onClick={() => setSideTab("left")}
        >
          <span className="truncate">{m.leftBalanceTab || "Balance ≥ 0"}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              isLeft ? "bg-sky-100 text-sky-700" : "bg-slate-200/80 text-slate-500"
            }`}
          >
            {left.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLeft}
          className={`tap-scale flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[12px] font-bold transition ${
            !isLeft
              ? "bg-white text-rose-600 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500"
          }`}
          onClick={() => setSideTab("right")}
        >
          <span className="truncate">{m.rightBalanceTab || "Balance < 0"}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              !isLeft ? "bg-rose-100 text-rose-700" : "bg-slate-200/80 text-slate-500"
            }`}
          >
            {right.length}
          </span>
        </button>
      </div>

      <p className="text-[11px] leading-snug text-slate-500">
        {m.cardClickHint ||
          m.tableClickHint ||
          "Tap account → history · Tap balance → fill form (left→To, right→From)"}
      </p>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <AccountCardList
          side={isLeft ? "left" : "right"}
          rows={activeRows}
          showName={showName}
          m={m}
          onOpenHistory={onOpenHistory}
          onPickBalance={onPickBalance}
          balanceTone={isLeft ? "pos" : "neg"}
        />
      </section>
    </div>
  );
}
