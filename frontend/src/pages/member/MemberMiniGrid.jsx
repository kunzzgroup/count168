import { useLayoutEffect, useRef } from "react";
import { MoneyDecimal } from "../../utils/moneyDecimal.js";

import {

  accountHoldsMiniGridCurrency,

  miniMatrixGridTemplateColumns,

  MINI_GRID_SHELL_ROWS,

  WINLOSS_MATRIX_FILL_CCY_COLS,

  WINLOSS_MATRIX_ROWHEAD_COL_WIDTH,

  WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD,

} from "./memberPageHelpers.js";



function formatGridAmt(dec) {

  return MoneyDecimal.formatThousands(dec.toString(), 2);

}



function resolveBalanceCell({

  shellMode,

  idNum,

  cu,

  balanceMap,

  linkedCurrenciesLoaded,

  linkedAccountCurrenciesMap,

}) {

  const holds =

    shellMode || idNum <= 0

      ? false

      : accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, idNum, cu);

  const key = `${idNum}|${cu}`;

  const balDec = !shellMode && holds && balanceMap?.has(key) ? balanceMap.get(key) : null;

  const hasBalance = balDec != null && typeof balDec.lt === "function";

  const isNa = shellMode || !holds || !hasBalance;

  const neg = hasBalance && balDec.lt(0);

  return { isNa, neg, balDec };

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

        const { isNa, neg, balDec } = resolveBalanceCell({

          shellMode,

          idNum,

          cu,

          balanceMap,

          linkedCurrenciesLoaded,

          linkedAccountCurrenciesMap,

        });

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



/** 单币种：账户与金额两列紧凑表，避免宽栏空白 */

function CompactSingleCurrencyMatrix({

  currency,

  listOrdered,

  shellMode,

  balanceMap,

  linkedCurrenciesLoaded,

  linkedAccountCurrenciesMap,

  t,

}) {

  const cu = currency;

  const lastRi = listOrdered.length - 1;

  return (

    <div

      id="member_balance_grid"

      className="member-wl-compact-matrix"

      role="grid"

      aria-label={t?.("balancesGridAria") || "Balances by account and currency"}

    >

      <div className="member-wl-compact-matrix__hd" role="row">

        <div className="member-wl-compact-matrix__account-hd" role="columnheader">

          {t?.("accounts") || "Accounts"}

        </div>

        <div className="member-wl-compact-matrix__amt-hd" role="columnheader">

          {cu}

        </div>

      </div>

      {listOrdered.map((acc, accIdx) => {

        const idNum = Number(acc.id);

        const code = String(acc.account_id || acc.name || acc.id).trim() || String(acc.id);

        const { isNa, neg, balDec } = resolveBalanceCell({

          shellMode,

          idNum,

          cu,

          balanceMap,

          linkedCurrenciesLoaded,

          linkedAccountCurrenciesMap,

        });

        return (

          <div

            key={`compact-${acc.id}-${accIdx}`}

            className={`member-wl-compact-matrix__row${accIdx % 2 === 1 ? " member-wl-compact-matrix__row--alt" : ""}${accIdx === lastRi ? " member-wl-compact-matrix__row--last" : ""}`}

            role="row"

          >

            <div className="member-wl-compact-matrix__account" role="rowheader" title={code}>

              {code}

            </div>

            <div className={`member-wl-compact-matrix__amt${isNa ? " member-wl-compact-matrix__amt--na" : ""}`} role="gridcell">

              {isNa ? (

                "–"

              ) : (

                <span className={`member-balance-matrix-amt${neg ? " member-balance-matrix-amt--neg" : ""}`}>

                  {formatGridAmt(balDec)}

                </span>

              )}

            </div>

          </div>

        );

      })}

    </div>

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



  const manyCcy = ncu >= 12;

  const singleCcy = ncu === 1;

  const lastCi = ncu - 1;

  const lastRi = listOrdered.length - 1;

  const gridRef = useRef(null);

  useLayoutEffect(() => {
    const scroll = gridRef.current?.parentElement;
    if (!scroll?.classList.contains("member-dash-matrix-scroll")) return undefined;
    if (ncu < WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD) {
      scroll.style.removeProperty("--member-wl-ccy-fill-col-w");
      return undefined;
    }
    const syncColWidth = () => {
      const corner = gridRef.current?.querySelector(".member-balance-matrix-corner");
      let rowheadPx = corner?.getBoundingClientRect().width ?? 0;
      if (!rowheadPx) {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const m = String(WINLOSS_MATRIX_ROWHEAD_COL_WIDTH).match(/^([\d.]+)rem$/);
        rowheadPx = m ? parseFloat(m[1]) * rem : 5.75 * rem;
      }
      const colPx = (scroll.clientWidth - rowheadPx) / WINLOSS_MATRIX_FILL_CCY_COLS;
      scroll.style.setProperty("--member-wl-ccy-fill-col-w", `${Math.max(0, colPx)}px`);
    };
    syncColWidth();
    const ro = new ResizeObserver(syncColWidth);
    ro.observe(scroll);
    window.addEventListener("resize", syncColWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncColWidth);
    };
  }, [ncu, orderUpper.join("|"), listOrdered.length]);

  if (singleCcy) {

    return (

      <>

        <div className="member-dash-matrix-scroll member-dash-matrix-scroll--compact">

          <CompactSingleCurrencyMatrix

            currency={orderUpper[0]}

            listOrdered={listOrdered}

            shellMode={shellMode}

            balanceMap={balanceMap}

            linkedCurrenciesLoaded={linkedCurrenciesLoaded}

            linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}

            t={t}

          />

        </div>

        <p id="member_balance_grid_hint" className="member-balance-mini-hint">

          {hint || ""}

        </p>

      </>

    );

  }



  return (

    <>

      <div className="member-dash-matrix-scroll">

        <div

          id="member_balance_grid"

          ref={gridRef}

          className={`member-balance-mini-grid${ncu ? " member-balance-mini-matrix" : ""}${manyCcy ? " member-balance-mini-matrix--many-ccy" : ""}${ncu >= WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD ? " member-balance-mini-matrix--ccy-scroll" : " member-balance-mini-matrix--ccy-fill"}`}

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

