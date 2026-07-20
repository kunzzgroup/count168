import { useMemo, useState } from "react";
import { parseBalanceValue, formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";
import { moneyToneClass } from "../../lib/money/moneyToneClass.js";
import MoneyDecimal from "../../lib/money/moneyDecimal.js";
import { getRoleClass } from "../../lib/transactionPaymentLogic.js";

function MoneyText({ value }) {
  return (
    <span className={moneyToneClass(value)}>
      {formatTransactionGridMoneyHalfUp(value)}
    </span>
  );
}

function sumSideMetrics(rows) {
  let bf = MoneyDecimal.toDecimal(0);
  let winLoss = MoneyDecimal.toDecimal(0);
  let crDr = MoneyDecimal.toDecimal(0);
  let balance = MoneyDecimal.toDecimal(0);
  for (const row of rows || []) {
    bf = MoneyDecimal.add(bf, row?.bf ?? 0);
    winLoss = MoneyDecimal.add(winLoss, row?.win_loss ?? 0);
    crDr = MoneyDecimal.add(crDr, row?.cr_dr ?? 0);
    balance = MoneyDecimal.add(balance, row?.balance ?? 0);
  }
  return {
    bf: bf.toFixed(),
    win_loss: winLoss.toFixed(),
    cr_dr: crDr.toFixed(),
    balance: balance.toFixed(),
  };
}

function SideTotalsCard({ m, totals }) {
  const metrics = [
    { key: "bf", label: m.bfTable, value: totals.bf },
    { key: "wl", label: m.winLossTable, value: totals.win_loss },
    { key: "cd", label: m.crDrTable, value: totals.cr_dr },
    { key: "bal", label: m.balanceTable, value: totals.balance },
  ];
  return (
    <div className="m-tx-total-card" aria-label={m.total}>
      <div className="m-tx-total-card-head">{m.total}</div>
      <table className="m-tx-total-card-table">
        <tbody>
          {metrics.map((item, idx) => (
            <tr
              key={item.key}
              className={`m-tx-total-card-row${idx % 2 === 1 ? " m-tx-total-card-row--alt" : ""}`}
            >
              <th scope="row" className="m-tx-total-card-label">
                {item.label}
              </th>
              <td className="m-tx-total-card-value">
                <MoneyText value={item.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DenseAccountTable({ side, rows, showName, m, onOpenHistory, onPickBalance }) {
  return (
    <div className="m-tx-dense-wrap">
      <table className="m-tx-dense-table">
        <thead>
          <tr>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--acc">
              {m.accountTableCompact || m.accountTable || "Acc"}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.bfTable}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.winLossTableCompact}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.crDrTable}
            </th>
            <th scope="col" className="m-tx-dense-th m-tx-dense-th--num">
              {m.balanceTableCompact}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="m-tx-dense-row">
              <td className="m-tx-dense-td m-tx-dense-td--empty" colSpan={5}>
                {m.noAccountsFound}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const roleCls = getRoleClass(row?.role);
              const code = String(row?.account_id || "").toUpperCase();
              const name = String(row?.account_name || "").trim();
              const isAlert = Number(row?.is_alert) === 1;
              const key = `${row.account_db_id || row.account_id}-${row.currency}-${row.transaction_id || ""}`;
              const balDisplay = formatTransactionGridMoneyHalfUp(row?.balance);
              return (
                <tr
                  key={key}
                  className={`m-tx-dense-row${isAlert ? " m-tx-dense-row--alert" : ""}`}
                >
                  <td
                    className={`m-tx-dense-td m-tx-dense-td--acc m-account-role${roleCls ? ` ${roleCls}` : ""}`}
                  >
                    <button
                      type="button"
                      className="m-tx-dense-acc tap-scale"
                      onClick={() => onOpenHistory?.(row)}
                      title={m.tapForHistory}
                      aria-label={`${m.tapForHistory}: ${code}`}
                    >
                      <span className="m-tx-dense-code">{code}</span>
                      {showName && name ? <span className="m-tx-dense-name">{name}</span> : null}
                    </button>
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <MoneyText value={row?.bf} />
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <MoneyText value={row?.win_loss} />
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <MoneyText value={row?.cr_dr} />
                  </td>
                  <td className="m-tx-dense-td m-tx-dense-td--num">
                    <button
                      type="button"
                      className="m-tx-dense-bal tap-scale"
                      onClick={() => onPickBalance?.(row, side)}
                      title={m.tapBalanceToFill || m.balanceTable}
                      aria-label={
                        m.tapBalanceAria
                          ? m.tapBalanceAria
                              .replace("{account}", code)
                              .replace("{amount}", balDisplay)
                          : `${m.tapBalanceToFill || m.balanceTable}: ${code} ${balDisplay}`
                      }
                    >
                      <MoneyText value={row?.balance} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
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
  const sideTotals = useMemo(() => sumSideMetrics(activeRows), [activeRows]);

  return (
    <div className="m-tx-balance-root">
      <p className="m-tx-balance-currency">
        {m.currencyLabel} {String(currency || "").toUpperCase()}
        {rows?.length ? ` · ${rows.length}` : ""}
      </p>

      <div className="m-tx-side-tabs" role="tablist" aria-label={m.accountSideTabs || "Account balance sides"}>
        <button
          type="button"
          role="tab"
          aria-selected={isLeft}
          className={`m-tx-side-tab tap-scale${isLeft ? " m-tx-side-tab--active-left" : ""}`}
          onClick={() => setSideTab("left")}
        >
          <span className="m-tx-side-tab-label">{m.leftBalanceTab || "Balance +"}</span>
          <span className={`m-tx-side-tab-count${isLeft ? " m-tx-side-tab-count--left-active" : ""}`}>
            {left.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLeft}
          className={`m-tx-side-tab tap-scale${!isLeft ? " m-tx-side-tab--active-right" : ""}`}
          onClick={() => setSideTab("right")}
        >
          <span className="m-tx-side-tab-label">{m.rightBalanceTab || "Balance -"}</span>
          <span className={`m-tx-side-tab-count${!isLeft ? " m-tx-side-tab-count--right-active" : ""}`}>
            {right.length}
          </span>
        </button>
      </div>

      <SideTotalsCard m={m} totals={sideTotals} />

      <DenseAccountTable
        side={isLeft ? "left" : "right"}
        rows={activeRows}
        showName={showName}
        m={m}
        onOpenHistory={onOpenHistory}
        onPickBalance={onPickBalance}
      />
    </div>
  );
}
