import { MoneyDecimal } from "../../utils/moneyDecimal.js";
import { accountHoldsMiniGridCurrency, miniMatrixGridTemplateColumns, MINI_GRID_SHELL_ROWS } from "./memberPageHelpers.js";

function formatGridAmt(dec) {
  return MoneyDecimal.formatThousands(dec.toString(), 2);
}

export function MemberMiniGridTotals({ currencyOrder, totalsByCu, t }) {
  const order = currencyOrder.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  if (!order.length) {
    return <span className="member-dash-total-amt">–</span>;
  }
  return (
    <div className="member-dash-total-values member-dash-total-values--grid">
      <div className="member-dash-total-currency-grid" role="group" aria-label={t?.("totalsByCurrencyAria") || "Totals by currency"}>
        {order.map((cu) => {
          const raw = totalsByCu.get(cu);
          const dec =
            raw != null && typeof raw.lt === "function"
              ? raw
              : MoneyDecimal.toDecimal("0", 0);
          const neg = dec.lt(0);
          return (
            <div key={cu} className="member-dash-total-grid-cell">
              <span className="member-dash-total-grid-code">{cu}</span>
              <span className={`member-dash-total-grid-amt${neg ? " member-dash-total-grid-amt--neg" : ""}`}>{formatGridAmt(dec)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniGridRow({
  idNum,
  code,
  isLastRow,
  accIdx,
  orderUpper,
  lastCi,
  shellMode,
  balanceMap,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
}) {
  return (
    <>
      <div
        className={`member-balance-matrix-rowhead${isLastRow ? " member-balance-matrix-rowhead--edge" : ""}`}
        role="rowheader"
        title={code}
      >
        {code}
      </div>
      {orderUpper.map((cu, ci) => {
        const holds =
          shellMode || idNum <= 0
            ? false
            : accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, idNum, cu);
        const key = `${idNum}|${cu}`;
        const balDec =
          !shellMode && holds && balanceMap?.has(key) ? balanceMap.get(key) : null;
        const hasBalance = balDec != null && typeof balDec.lt === "function";
        const isNa = shellMode || !holds || !hasBalance;
        const neg = hasBalance && balDec.lt(0);
        return (
          <div
            key={`${idNum}-${cu}`}
            className={`member-balance-matrix-cell${isNa ? " member-balance-matrix-cell--na" : ""}${accIdx % 2 === 1 ? " member-balance-matrix-cell--alt" : ""}${ci === lastCi ? " member-balance-matrix-cell--edge" : ""}${isLastRow ? " member-balance-matrix-cell--edge-row" : ""}`}
            role="gridcell"
          >
            {isNa ? (
              "–"
            ) : (
              <span className={`member-balance-matrix-amt${neg ? " member-balance-matrix-amt--neg" : ""}`}>
                {formatGridAmt(balDec)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function MemberMiniGrid({
  shellMode,
  currencies,
  accounts,
  balanceMap,
  hint,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  t,
}) {
  const orderUpper = (currencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  const ncu = orderUpper.length;

  let listOrdered = accounts || [];
  if (shellMode && !listOrdered.length && ncu) {
    const rowCount = Math.max(3, MINI_GRID_SHELL_ROWS);
    listOrdered = Array.from({ length: rowCount }, () => ({ id: -1, account_id: "–", name: "" }));
  }

  const manyCcy = ncu >= 8;
  const lastCi = ncu - 1;
  const lastRi = listOrdered.length - 1;

  return (
    <>
      <div className="member-dash-matrix-scroll">
        <div
          id="member_balance_grid"
        className={`member-balance-mini-grid${ncu ? " member-balance-mini-matrix" : ""}${manyCcy ? " member-balance-mini-matrix--many-ccy" : ""}`}
        role={ncu ? "grid" : undefined}
        aria-label={ncu ? t?.("balancesGridAria") || "Balances by account and currency" : undefined}
        style={ncu ? { gridTemplateColumns: miniMatrixGridTemplateColumns(ncu) } : undefined}
      >
        {ncu > 0 && (
          <>
            <div className="member-balance-matrix-corner" aria-hidden="true" />
            {orderUpper.map((cu, ci) => (
              <div
                key={`th-${cu}`}
                className={`member-balance-matrix-th${ci === lastCi ? " member-balance-matrix-th--edge" : ""}`}
                role="columnheader"
              >
                {cu}
              </div>
            ))}
            {listOrdered.map((acc, accIdx) => (
              <MiniGridRow
                key={`row-${acc.id}-${accIdx}`}
                idNum={Number(acc.id)}
                code={String(acc.account_id || acc.name || acc.id).trim() || String(acc.id)}
                isLastRow={accIdx === lastRi}
                accIdx={accIdx}
                orderUpper={orderUpper}
                lastCi={lastCi}
                shellMode={shellMode}
                balanceMap={balanceMap}
                linkedCurrenciesLoaded={linkedCurrenciesLoaded}
                linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
              />
            ))}
          </>
        )}
        </div>
      </div>
      <p id="member_balance_grid_hint" className="member-balance-mini-hint">
        {hint || ""}
      </p>
    </>
  );
}
