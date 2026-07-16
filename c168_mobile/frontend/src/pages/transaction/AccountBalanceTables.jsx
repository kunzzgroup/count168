import { useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { getRoleClass } from "../../lib/transactionPaymentLogic.js";

/** Opaque role tints so sticky Account does not ghost-over B/F. */
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

function AccountTable({ side, rows, showName, m, onOpenHistory, onPickBalance, balanceTone }) {
  if (rows.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[12px] font-medium text-slate-400">{m.noAccountsFound}</p>
    );
  }

  /*
   * Restore full-column scan: only Account is sticky (opaque + 1px edge, no blur).
   * Do NOT pin Balance — dual sticky crushed W/L + Cr/Dr off the first viewport.
   */
  const stickyAccount =
    "sticky left-0 z-[2] border-r border-slate-200 bg-inherit";

  return (
    <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[30rem] border-collapse text-left">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <th
              className={`${stickyAccount} z-[3] w-[5.25rem] max-w-[5.25rem] whitespace-nowrap bg-slate-50 px-2 py-2`}
            >
              {m.accountTable}
            </th>
            {showName ? (
              <th className="min-w-[4.5rem] whitespace-nowrap px-1.5 py-2">{m.nameTable}</th>
            ) : null}
            <th className="min-w-[3.75rem] whitespace-nowrap px-1.5 py-2 text-right">{m.bfTable}</th>
            <th className="min-w-[4.25rem] whitespace-nowrap px-1.5 py-2 text-right">
              {m.winLossTableCompact}
            </th>
            <th className="min-w-[4.25rem] whitespace-nowrap px-1.5 py-2 text-right">{m.crDrTable}</th>
            <th className="min-w-[4.75rem] whitespace-nowrap px-2 py-2 text-right">
              {m.balanceTableCompact}
            </th>
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
              <tr key={key} className={`border-t border-slate-100 ${rowBg}`}>
                <td
                  className={`${stickyAccount} cursor-pointer px-2 py-2 text-[12px] font-bold text-slate-900 active:brightness-95 ${rowBg}`}
                  onClick={() => onOpenHistory?.(row)}
                  title={m.tapForHistory}
                >
                  <span className="block max-w-[4.75rem] truncate underline decoration-slate-300 underline-offset-2">
                    {code}
                  </span>
                  <span className="block text-[9px] font-bold tracking-wide text-slate-400">
                    {String(row?.currency || "").toUpperCase()}
                  </span>
                </td>
                {showName ? (
                  <td className="max-w-[5.5rem] truncate px-1.5 py-2 text-[11px] text-slate-500">
                    {name || "—"}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-1.5 py-2 text-right text-[11px] font-semibold">
                  <MoneyCell value={row?.bf} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-2 text-right text-[11px] font-semibold">
                  <MoneyCell value={row?.win_loss} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-2 text-right text-[11px] font-semibold">
                  <MoneyCell value={row?.cr_dr} />
                </td>
                <td
                  className="cursor-pointer whitespace-nowrap px-2 py-2 text-right text-[12px] font-bold active:brightness-95"
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
