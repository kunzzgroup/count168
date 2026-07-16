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

function AccountTable({ title, badge, rows, showName, m, onOpenHistory, balanceTone }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[clamp(1.3rem,0.2vw+1.2rem,1.5rem)] font-bold text-slate-900">
            {title}
          </h2>
          <span
            className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${
              balanceTone === "neg" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"
            }`}
          >
            {badge}
          </span>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-slate-400">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] font-medium text-slate-400">{m.noAccountsFound}</p>
      ) : (
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
                  <tr
                    key={key}
                    className={`tap-scale cursor-pointer border-t border-slate-100/90 ${rowBg} active:brightness-95`}
                    onClick={() => onOpenHistory?.(row)}
                  >
                    <td className={`sticky left-0 z-[1] px-2.5 py-2 text-[12px] font-bold text-slate-900 ${rowBg}`}>
                      <span className="block max-w-[7.5rem] truncate">{code}</span>
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
                    <td className="px-2.5 py-2 text-right text-[12px] font-bold">
                      <MoneyCell value={row?.balance} emphasize forceTone={balanceTone} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function splitAccountRowsByBalance(rows) {
  const fromPositive = [];
  const toNegative = [];
  for (const row of rows || []) {
    const bal = parseBalanceValue(String(row?.balance ?? "").replace(/,/g, ""));
    if (bal != null && bal < 0) toNegative.push(row);
    else fromPositive.push(row);
  }
  return { fromPositive, toNegative };
}

export default function AccountBalanceTables({
  rows,
  showName,
  m,
  currency,
  onOpenHistory,
}) {
  const { fromPositive, toNegative } = splitAccountRowsByBalance(rows);

  return (
    <div className="space-y-4 pb-24">
      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
        {m.currencyLabel} {String(currency || "").toUpperCase()}
        {rows?.length ? ` · ${rows.length}` : ""}
      </p>

      <AccountTable
        title={m.fromAccountPositive || m.fromAccount}
        badge="+"
        rows={fromPositive}
        showName={showName}
        m={m}
        onOpenHistory={onOpenHistory}
        balanceTone="pos"
      />

      <AccountTable
        title={m.toAccountNegative || m.toAccount}
        badge="−"
        rows={toNegative}
        showName={showName}
        m={m}
        onOpenHistory={onOpenHistory}
        balanceTone="neg"
      />
    </div>
  );
}
