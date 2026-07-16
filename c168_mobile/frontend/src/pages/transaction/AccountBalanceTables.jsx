import { useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { getRoleClass } from "../../lib/transactionPaymentLogic.js";

/** Desktop parity: account column role tints (transaction.css). */
const ROLE_ACCOUNT_STYLES = {
  "transaction-role-capital": "bg-[#ffe0e0] text-[#a30b0b]",
  "transaction-role-bank": "bg-[#dfe3ff] text-[#14228a]",
  "transaction-role-cash": "bg-[#dff4e7] text-[#0f6d38]",
  "transaction-role-profit": "bg-[#fff2c7] text-[#7a5b00]",
  "transaction-role-expenses": "bg-[#f0e1ff] text-[#4f148f]",
  "transaction-role-company": "bg-[#ecfccb] text-[#3f6212] border border-[#bef264]",
  "transaction-role-partner": "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]",
  "transaction-role-staff": "bg-[#ffe5cc] text-[#a24700]",
  "transaction-role-upline": "bg-[#d6f9ff] text-[#0a6b78]",
  "transaction-role-agent": "bg-[#ffe0f3] text-[#a02578]",
  "transaction-role-member": "bg-[#f2dfd2] text-[#5f2e0f]",
  "transaction-role-debtor": "bg-[#f1f5f9] text-[#475569] border border-[#cbd5e1]",
  "transaction-role-none": "bg-[#eceef2] text-[#3e434f]",
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

function MetricCell({
  label,
  value,
  emphasize = false,
  forceTone = null,
  onClick,
  title,
  ariaLabel,
}) {
  const interactive = typeof onClick === "function";
  const Comp = interactive ? "button" : "div";
  const display = formatTransactionGridMoneyHalfUp(value);
  return (
    <Comp
      type={interactive ? "button" : undefined}
      className={`min-w-0 px-1 py-1 text-right ${
        interactive ? "tap-scale rounded-md active:bg-slate-100/80" : ""
      }`}
      onClick={onClick}
      title={title}
      aria-label={interactive ? ariaLabel || title || `${label} ${display}` : undefined}
    >
      <p className="text-[0.78em] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-[1.4rem] font-semibold leading-snug">
        <MoneyCell value={value} emphasize={emphasize} forceTone={forceTone} />
      </p>
    </Comp>
  );
}

function AccountCardList({ side, rows, showName, m, onOpenHistory, onPickBalance, balanceTone }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl bg-white px-3 py-8 text-center text-[1.4rem] font-medium text-slate-400 shadow-sm ring-1 ring-slate-100">
        {m.noAccountsFound}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const roleCls = getRoleClass(row?.role);
        const accountTone = ROLE_ACCOUNT_STYLES[roleCls] || "bg-white text-slate-900";
        const code = String(row?.account_id || "").toUpperCase();
        const name = String(row?.account_name || "").trim();
        const cur = String(row?.currency || "").toUpperCase();
        const key = `${row.account_db_id || row.account_id}-${row.currency}-${row.transaction_id || ""}`;
        return (
          <li
            key={key}
            className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/90"
          >
            <button
              type="button"
              className={`tap-scale flex w-full items-center gap-2 border-b border-slate-200/70 px-3 py-2.5 text-left active:brightness-95 ${accountTone}`}
              onClick={() => onOpenHistory?.(row)}
              title={m.tapForHistory}
              aria-label={`${m.tapForHistory}: ${code}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.4rem] font-bold underline decoration-current/35 underline-offset-2">
                  {code}
                </span>
                {showName && name ? (
                  <span className="mt-0.5 block truncate text-[1.1rem] font-medium opacity-80">{name}</span>
                ) : null}
              </span>
              <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[0.78em] font-bold tracking-wide text-slate-600 ring-1 ring-slate-200/80">
                {cur}
              </span>
            </button>

            <div className="grid grid-cols-4 gap-0 px-1.5 py-1.5">
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
                ariaLabel={
                  m.tapBalanceAria
                    ? m.tapBalanceAria
                        .replace("{account}", code)
                        .replace("{amount}", formatTransactionGridMoneyHalfUp(row?.balance))
                    : `${m.tapBalanceToFill || m.balanceTable}: ${code} ${formatTransactionGridMoneyHalfUp(row?.balance)}`
                }
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
    <div className="space-y-3 pb-24 text-[1.4rem]">
      <p className="text-[0.78em] font-bold uppercase tracking-wide text-slate-400">
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
          className={`tap-scale flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[1.4rem] font-bold transition ${
            isLeft
              ? "bg-white text-[#2f6bf6] shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500"
          }`}
          onClick={() => setSideTab("left")}
        >
          <span className="truncate">{m.leftBalanceTab || "Balance +"}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.72em] font-bold tabular-nums ${
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
          className={`tap-scale flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[1.4rem] font-bold transition ${
            !isLeft
              ? "bg-white text-rose-600 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500"
          }`}
          onClick={() => setSideTab("right")}
        >
          <span className="truncate text-[1.6rem] leading-none">{m.rightBalanceTab || "−"}</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.72em] font-bold tabular-nums ${
              !isLeft ? "bg-rose-100 text-rose-700" : "bg-slate-200/80 text-slate-500"
            }`}
          >
            {right.length}
          </span>
        </button>
      </div>

      <p className="text-[0.78em] leading-snug text-slate-500">
        {m.cardClickHint ||
          m.tableClickHint ||
          "Tap account → history · Tap balance → fill form (left→To, right→From)"}
      </p>

      <section>
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
