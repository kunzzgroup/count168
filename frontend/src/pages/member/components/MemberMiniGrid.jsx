import { useLayoutEffect, useRef } from "react";
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";

import {
  accountHoldsMiniGridCurrency,
  formatCompactCurrencyLabel,
  formatMiniGridMoney,
  miniGridAmountTone,
  miniGridShowsTotalRow,
  MEMBER_AMOUNT_NA_MARK,
  miniMatrixGridTemplateColumns,
  MINI_GRID_SHELL_ROWS,
  measureCompactMatrixColumnWidths,
  WINLOSS_MATRIX_FILL_CCY_COLS,
  WINLOSS_MATRIX_MIN_CCY_COL_WIDTH,
  WINLOSS_MATRIX_ROWHEAD_COL_WIDTH,
  WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD,
} from "../memberPageHelpers.js";

function totalRowToneClass(tone) {
  if (tone === "pos") return "gain";
  if (tone === "neg") return "loss";
  if (tone === "zero") return "zero";
  return "na";
}

function MemberTotalGridAmount({ dec, tone }) {
  const display = formatMiniGridMoney(dec);
  if (tone === "pos" || tone === "neg") {
    const gain = tone === "pos";
    return (
      <span className={`member-total-val member-total-val--${gain ? "gain" : "loss"}`}>
        <span className="member-total-val__arrow" aria-hidden="true">
          {gain ? "▲" : "▼"}
        </span>
        <span className="member-total-val__figure">{display}</span>
      </span>
    );
  }
  return <span className={`member-total-val member-total-val--${tone === "zero" ? "zero" : "na"}`}>{display}</span>;
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
  return { isNa, balDec };
}

export function MemberMiniGridTotals({ currencyOrder, totalsByCu, t }) {
  const order = currencyOrder.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  if (!order.length) {
    return <span className="member-dash-total-amt member-amount--empty">{MEMBER_AMOUNT_NA_MARK}</span>;
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
          const tone = miniGridAmountTone(dec);
          const rowTone = totalRowToneClass(tone);
          return (
            <div key={cu} className={`member-dash-total-grid-cell member-dash-total-grid-cell--${rowTone}`}>
              <span className="member-dash-total-grid-code">{cu}</span>
              <MemberTotalGridAmount dec={dec} tone={tone} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactAmountCell({ isNa, balDec }) {
  const tone = isNa ? null : miniGridAmountTone(balDec);
  return isNa ? (
    <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
  ) : (
    <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
      {formatMiniGridMoney(balDec)}
    </span>
  );
}

function CompactGridRow({
  idNum,
  code,
  cu,
  isLastRow,
  accIdx,
  shellMode,
  balanceMap,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
}) {
  const { isNa, balDec } = resolveBalanceCell({
    shellMode,
    idNum,
    cu,
    balanceMap,
    linkedCurrenciesLoaded,
    linkedAccountCurrenciesMap,
  });
  return (
    <div
      className={`member-wl-compact-matrix__row${accIdx % 2 === 1 ? " member-wl-compact-matrix__row--alt" : ""}${isLastRow ? " member-wl-compact-matrix__row--last" : ""}`}
      role="row"
    >
      <div className="member-wl-compact-matrix__account" role="rowheader" title={code}>
        {code}
      </div>
      <div
        className={`member-wl-compact-matrix__amt${isNa ? " member-wl-compact-matrix__amt--na" : ""}`}
        role="gridcell"
      >
        <CompactAmountCell isNa={isNa} balDec={balDec} />
      </div>
    </div>
  );
}

function CompactTotalRow({ totalDec, rowIdx, t }) {
  const hasTotal = totalDec != null && typeof totalDec.lt === "function";
  const tone = hasTotal ? miniGridAmountTone(totalDec) : null;
  const isNa = !hasTotal;
  return (
    <div
      className={`member-wl-compact-matrix__row member-wl-compact-matrix__row--total${rowIdx % 2 === 1 ? " member-wl-compact-matrix__row--alt" : ""}`}
      role="row"
    >
      <div className="member-wl-compact-matrix__account member-wl-compact-matrix__account--total" role="rowheader">
        {t?.("total") || "Total"}
      </div>
      <div
        className={`member-wl-compact-matrix__amt member-wl-compact-matrix__amt--total${isNa ? " member-wl-compact-matrix__amt--na" : ""}`}
        role="gridcell"
      >
        {isNa ? (
          <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
        ) : (
          <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
            {formatMiniGridMoney(totalDec)}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniGridTotalRow({
  orderUpper,
  lastCi,
  totalsByCu,
  shellMode,
  t,
}) {
  return (
    <>
      <div className="member-balance-matrix-rowhead member-balance-matrix-rowhead--total" role="rowheader">
        {t?.("total") || "Total"}
      </div>
      {orderUpper.map((cu, ci) => {
        const raw = totalsByCu?.get(cu);
        const balDec = raw != null && typeof raw.lt === "function" ? raw : null;
        const hasBalance = balDec != null;
        const tone = hasBalance ? miniGridAmountTone(balDec) : null;
        return (
          <div
            key={`total-${cu}`}
            className={`member-balance-matrix-cell member-balance-matrix-cell--total${!hasBalance ? " member-balance-matrix-cell--na" : ""}${ci === lastCi ? " member-balance-matrix-cell--edge" : ""}`}
            role="gridcell"
          >
            {!hasBalance || shellMode ? (
              <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
            ) : (
              <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
                {formatMiniGridMoney(balDec)}
              </span>
            )}
          </div>
        );
      })}
    </>
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
        const { isNa, balDec } = resolveBalanceCell({
          shellMode,
          idNum,
          cu,
          balanceMap,
          linkedCurrenciesLoaded,
          linkedAccountCurrenciesMap,
        });
        const tone = isNa ? null : miniGridAmountTone(balDec);
        return (
          <div
            key={`${idNum}-${cu}`}
            className={`member-balance-matrix-cell${isNa ? " member-balance-matrix-cell--na" : ""}${accIdx % 2 === 1 ? " member-balance-matrix-cell--alt" : ""}${ci === lastCi ? " member-balance-matrix-cell--edge" : ""}${isLastRow ? " member-balance-matrix-cell--edge-row" : ""}`}
            role="gridcell"
          >
            {isNa ? (
              <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
            ) : (
              <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
                {formatMiniGridMoney(balDec)}
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
  totalsByCu,
  hint,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  t,
}) {
  const orderUpper = (currencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  const ncu = orderUpper.length;

  let listOrdered = accounts || [];
  /* shell 仅显示占位行，勿用真实账户列表（切换 acc 时会闪出全表） */
  if (shellMode && ncu) {
    listOrdered = Array.from({ length: MINI_GRID_SHELL_ROWS }, () => ({
      id: -1,
      account_id: "–",
      name: "",
    }));
  }

  const manyCcy = ncu >= 12;
  const compactMode = ncu === 1;
  const singleCu = compactMode ? orderUpper[0] : "";
  const lastCi = ncu - 1;
  const lastRi = listOrdered.length - 1;
  const showTotalRow = miniGridShowsTotalRow(shellMode, listOrdered);
  const gridRef = useRef(null);
  const fillMode = !compactMode && ncu > 0 && ncu < WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD;
  const gridCols = !compactMode && ncu > 0 ? miniMatrixGridTemplateColumns(ncu) : undefined;

  useLayoutEffect(() => {
    const scroll = gridRef.current?.parentElement;
    const grid = gridRef.current;
    if (!scroll?.classList.contains("member-dash-matrix-scroll") || !grid) return undefined;
    if (compactMode) {
      const syncCompactWidth = () => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const { accountColPx, amtColPx } = measureCompactMatrixColumnWidths(grid, rem);
        const accW = `${accountColPx}px`;
        const amtW = `${amtColPx}px`;
        scroll.style.setProperty("--member-wl-compact-acc-col-w", accW);
        scroll.style.setProperty("--member-wl-ccy-fill-col-w", amtW);
        grid.style.setProperty("--member-wl-compact-acc-col-w", accW);
        grid.style.setProperty("--member-wl-ccy-fill-col-w", amtW);
      };
      syncCompactWidth();
      requestAnimationFrame(syncCompactWidth);
      const ro = new ResizeObserver(syncCompactWidth);
      const matrixColEl = scroll.closest(".member-dash-col-matrix");
      if (matrixColEl) ro.observe(matrixColEl);
      window.addEventListener("resize", syncCompactWidth);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", syncCompactWidth);
        scroll.style.removeProperty("--member-wl-compact-acc-col-w");
        scroll.style.removeProperty("--member-wl-ccy-fill-col-w");
        grid.style.removeProperty("--member-wl-compact-acc-col-w");
        grid.style.removeProperty("--member-wl-ccy-fill-col-w");
      };
    }
    if (ncu < 1) {
      scroll.style.removeProperty("--member-wl-ccy-fill-col-w");
      grid.style.removeProperty("--member-wl-ccy-fill-col-w");
      grid.style.removeProperty("grid-template-columns");
      return undefined;
    }

    const syncColWidth = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const matrixCol = scroll.closest(".member-dash-col-matrix");
      let innerW = 0;
      if (matrixCol) {
        const cs = getComputedStyle(matrixCol);
        innerW =
          matrixCol.clientWidth -
          (parseFloat(cs.paddingLeft) || 0) -
          (parseFloat(cs.paddingRight) || 0);
      }
      if (innerW <= 0) innerW = scroll.closest(".member-dash-rail-matrix")?.clientWidth ?? 0;
      if (innerW <= 0) return;

      const parseRem = (s, fallbackRem) => {
        const hit = String(s).match(/^([\d.]+)rem$/);
        return hit ? parseFloat(hit[1]) * rem : fallbackRem * rem;
      };
      const rowheadPx = parseRem(WINLOSS_MATRIX_ROWHEAD_COL_WIDTH, 5.75);
      const minColPx = parseRem(WINLOSS_MATRIX_MIN_CCY_COL_WIDTH, 6);
      const scrollMode = ncu >= WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD;

      const measureContentColPx = () => {
        let maxPx = 0;
        grid.querySelectorAll(".member-balance-matrix-th, .member-balance-matrix-cell").forEach((el) => {
          const w = el.scrollWidth;
          if (w > maxPx) maxPx = w;
        });
        return maxPx;
      };

      const applyColumns = (px) => {
        const colW = `${px}px`;
        scroll.style.setProperty("--member-wl-ccy-fill-col-w", colW);
        grid.style.setProperty("--member-wl-ccy-fill-col-w", colW);
        grid.style.gridTemplateColumns = `minmax(${WINLOSS_MATRIX_ROWHEAD_COL_WIDTH}, max-content) repeat(${ncu}, minmax(${colW}, max-content))`;
      };

      let colPx = minColPx;
      if (innerW > 0) {
        const fitColPx = (innerW - rowheadPx) / WINLOSS_MATRIX_FILL_CCY_COLS;
        colPx = Math.max(minColPx, fitColPx);
      }

      applyColumns(colPx);
      const contentPx = measureContentColPx();
      if (contentPx > colPx) {
        colPx = contentPx;
        applyColumns(colPx);
      }

      if (!scrollMode) {
        grid.style.width = `${rowheadPx + ncu * colPx}px`;
        grid.style.maxWidth = "100%";
      } else {
        grid.style.removeProperty("width");
        grid.style.removeProperty("maxWidth");
      }
    };

    syncColWidth();
    requestAnimationFrame(syncColWidth);
    const ro = new ResizeObserver(syncColWidth);
    const matrixColEl = scroll.closest(".member-dash-col-matrix");
    if (matrixColEl) ro.observe(matrixColEl);
    window.addEventListener("resize", syncColWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncColWidth);
      scroll.style.removeProperty("--member-wl-ccy-fill-col-w");
      grid.style.removeProperty("--member-wl-ccy-fill-col-w");
      grid.style.removeProperty("grid-template-columns");
      grid.style.removeProperty("width");
      grid.style.removeProperty("max-width");
    };
  }, [ncu, compactMode, orderUpper.join("|"), listOrdered.length, balanceMap?.size, shellMode, showTotalRow]);

  return (
    <>
      <div
        className={`member-dash-matrix-scroll${compactMode ? " member-dash-matrix-scroll--compact" : ""}`}
      >
        {compactMode ? (
          <div
            id="member_balance_grid"
            ref={gridRef}
            className="member-wl-compact-matrix"
            role="grid"
            aria-label={t?.("balancesGridAria") || "Balances by account and currency"}
          >
            <div className="member-wl-compact-matrix__hd" role="row">
              <div className="member-wl-compact-matrix__account-hd" role="columnheader">
                {t?.("colCurrency") || "Currency"}
              </div>
              <div className="member-wl-compact-matrix__amt-hd" role="columnheader">
                {formatCompactCurrencyLabel(singleCu)}
              </div>
            </div>
            {showTotalRow && (
              <CompactTotalRow
                totalDec={totalsByCu?.get(singleCu)}
                rowIdx={0}
                t={t}
              />
            )}
            {listOrdered.map((acc, accIdx) => (
              <CompactGridRow
                key={`compact-${acc.id}-${accIdx}`}
                idNum={Number(acc.id)}
                code={String(acc.account_id || acc.name || acc.id).trim() || String(acc.id)}
                cu={singleCu}
                isLastRow={accIdx === lastRi}
                accIdx={showTotalRow ? accIdx + 1 : accIdx}
                shellMode={shellMode}
                balanceMap={balanceMap}
                linkedCurrenciesLoaded={linkedCurrenciesLoaded}
                linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
              />
            ))}
          </div>
        ) : (
          <div
            id="member_balance_grid"
            ref={gridRef}
            className={`member-balance-mini-grid${ncu ? " member-balance-mini-matrix" : ""}${manyCcy ? " member-balance-mini-matrix--many-ccy" : ""}${fillMode ? " member-balance-mini-matrix--ccy-fill" : ""}${ncu >= WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD ? " member-balance-mini-matrix--ccy-scroll" : ""}`}
            role={ncu ? "grid" : undefined}
            aria-label={ncu ? t?.("balancesGridAria") || "Balances by account and currency" : undefined}
            style={gridCols ? { gridTemplateColumns: gridCols } : undefined}
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
                {showTotalRow && (
                  <MiniGridTotalRow
                    orderUpper={orderUpper}
                    lastCi={lastCi}
                    totalsByCu={totalsByCu}
                    shellMode={shellMode}
                    t={t}
                  />
                )}
                {listOrdered.map((acc, accIdx) => (
                  <MiniGridRow
                    key={`row-${acc.id}-${accIdx}`}
                    idNum={Number(acc.id)}
                    code={String(acc.account_id || acc.name || acc.id).trim() || String(acc.id)}
                    isLastRow={accIdx === lastRi}
                    accIdx={showTotalRow ? accIdx + 1 : accIdx}
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
        )}
      </div>
      <p id="member_balance_grid_hint" className="member-balance-mini-hint">
        {hint || ""}
      </p>
    </>
  );
}
