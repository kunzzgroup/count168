import { useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { getRoleClass } from "../../lib/transactionPaymentLogic.js";

const ROLE_ROW_BG = {
  "transaction-role-capital": "bg-rose-50",
  "transaction-role-bank": "bg-sky-50/80",
  "transaction-role-cash": "bg-emerald-50/80",
  "transaction-role-profit": "bg-amber-50/80",
  "transaction-role-expenses": "bg-orange-50/70",
  "transaction-role-company": "bg-indigo-50/70",
  "transaction-role-member": "bg-teal-50/70",
  "transaction-role-agent": "bg-cyan-50/80",
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

function AccountTable({ side, rows, showName, m, onOpenHistory, onPickBalance, balanceTone }) {
  if (rows.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[12px] font-medium text-slate-400">{m.noAccountsFound}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <th className="sticky left-0 z-[1] bg-slate-50 px-2.5 py-2">{m.accountTable}</th>
            {showName ? <th className="px-2 py-2">{m.nameTable}</th> : null}
            <th className="px-2 py-2 text-right">{m.bfTable}</th>
            <th className="px-2 py-2 text-right">{m.winLossTableCompact}</th>
            <th className="px-2 py-2 text-right">{m.crDrTable}</th>
            <th className="px-2.5 py-2 text-right">{m.balanceTableCompact}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const roleCls = getRoleClass(row?.role);
            const rowBg = ROLE_ROW_BG[roleCls] || "bg-white";
            const code = String(row?.account_id || "").toUpperCase();
            const name = String(row?.account_name || "").trim();
            const key = `${row.account_db_id || row.account_id}-${row.currency}-${row.transaction_id || ""}`;
            return (
              <tr key={key} className={`border-t border-slate-100/90 ${rowBg}`}>
                <td
                  className={`sticky left-0 z-[1] cursor-pointer px-2.5 py-2 text-[12px] font-bold text-slate-900 active:brightness-95 ${rowBg}`}
                  onClick={() => onOpenHistory?.(row)}
                  title={m.tapForHistory}
                >
                  <span className="block max-w-[7.5rem] truncate underline decoration-slate-300 underline-offset-2">
                    {code}
                  </span>
                  <span className="block text-[9px] font-bold tracking-wide text-slate-400">
                    {String(row?.currency || "").toUpperCase()}
                  </span>
                </td>
                {showName ? (
                  <td className="max-w-[7rem] truncate px-2 py-2 text-[11px] text-slate-500">{name || "—"}</td>
                ) : null}
                <td className="px-2 py-2 text-right text-[11px] font-semibold">
                  <MoneyCell value={row?.bf} />
                </td>
                <td className="px-2 py-2 text-right text-[11px] font-semibold">
                  <MoneyCell value={row?.win_loss} />
                </td>
                <td className="px-2 py-2 text-right text-[11px] font-semibold">
                  <MoneyCell value={row?.cr_dr} />
                </td>
                <td
                  className="cursor-pointer px-2.5 py-2 text-right text-[12px] font-bold active:brightness-95"
                  onClick={() => onPickBalance?.(row, side)}
                  title={m.tapBalanceToFill || m.balanceTable}
                >
                  <MoneyCell value={row?.balance} emphasize forceTone={balanceTone} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Desktop parity: left = balance ≥ 0 (To), right = balance < 0 (From). */
export function splitAccountRowsByBalance(rows) {
  const leftTo = [];
  const rightFrom = [];
  for (const row of rows || []) {
    const bal = parseBalanceValue(String(row?.balance ?? "").replace(/,/g, ""));
    if (bal != null && bal < 0) rightFrom.push(row);
    else leftTo.push(row);
  }
  return { leftTo, rightFrom };
}

export default function AccountBalanceTables({
  rows,
  showName,
  m,
  currency,
  onOpenHistory,
  onPickBalance,
}) {
  const { leftTo, rightFrom } = splitAccountRowsByBalance(rows);
  const [sideTab, setSideTab] = useState("left");
  const isLeft = sideTab === "left";
  const activeRows = isLeft ? leftTo : rightFrom;

  return (
    <div className="space-y-3 pb-24">
      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
        {m.currencyLabel} {String(currency || "").toUpperCase()}
        {rows?.length ? ` · ${rows.length}` : ""}
      </p>

      <div
        className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/80"
        role="tablist"
        aria-label={m.accountSideTabs || "Account sides"}
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
          <span className="truncate">{m.toAccountLeftTab || m.toAccount}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              isLeft ? "bg-sky-100 text-sky-700" : "bg-slate-200/80 text-slate-500"
            }`}
          >
            {leftTo.length}
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
          <span className="truncate">{m.fromAccountRightTab || m.fromAccount}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              !isLeft ? "bg-rose-100 text-rose-700" : "bg-slate-200/80 text-slate-500"
            }`}
          >
            {rightFrom.length}
          </span>
        </button>
      </div>

      <p className="text-[11px] leading-snug text-slate-500">
        {m.tableClickHint ||
          "Tap account → history · Tap balance → fill form field for this side"}
      </p>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <AccountTable
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
