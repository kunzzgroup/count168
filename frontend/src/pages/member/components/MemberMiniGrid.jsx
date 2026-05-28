import { useLayoutEffect, useRef } from "react";

import {
  accountHoldsMiniGridCurrency,
  formatMiniGridMoney,
  miniGridAmountTone,
  miniGridShowsTotalRow,
  MEMBER_AMOUNT_NA_MARK,
  miniMatrixGridTemplateColumns,
  MINI_GRID_SHELL_ROWS,
  WINLOSS_MATRIX_FILL_CCY_COLS,
  WINLOSS_MATRIX_MIN_CCY_COL_WIDTH,
  WINLOSS_MATRIX_ROWHEAD_COL_WIDTH,
  WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD,
} from "../memberPageHelpers.js";

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

function MatrixAmountCell({ isNa, balDec }) {
  const tone = isNa ? null : miniGridAmountTone(balDec);
  return isNa ? (
    <span className="member-balance-matrix-na">{MEMBER_AMOUNT_NA_MARK}</span>
  ) : (
    <span className={`member-balance-matrix-amt member-balance-matrix-amt--${tone}`}>
      {formatMiniGridMoney(balDec)}
    </span>
  );
}

function MatrixTotalRow({ orderUpper, lastCi, totalsByCu, shellMode, t }) {
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

function MatrixAccountRow({
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
        return (
          <div
            key={`${idNum}-${cu}`}
            className={`member-balance-matrix-cell${isNa ? " member-balance-matrix-cell--na" : ""}${accIdx % 2 === 1 ? " member-balance-matrix-cell--alt" : ""}${ci === lastCi ? " member-balance-matrix-cell--edge" : ""}${isLastRow ? " member-balance-matrix-cell--edge-row" : ""}`}
            role="gridcell"
          >
            <MatrixAmountCell isNa={isNa} balDec={balDec} />
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
  if (shellMode && ncu) {
    listOrdered = Array.from({ length: MINI_GRID_SHELL_ROWS }, () => ({
      id: -1,
      account_id: "–",
      name: "",
    }));
  }

  const manyCcy = ncu >= 12;
  const showTotalRow = miniGridShowsTotalRow(shellMode, listOrdered);
  const lastCi = ncu - 1;
  const lastRi = listOrdered.length - 1;
  const gridRef = useRef(null);
  const fillMode = ncu > 0 && ncu < WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD;
  const gridCols = ncu > 0 ? miniMatrixGridTemplateColumns(ncu) : undefined;

  useLayoutEffect(() => {
    const scroll = gridRef.current?.parentElement;
    const grid = gridRef.current;
    if (!scroll?.classList.contains("member-dash-matrix-scroll") || !grid) return undefined;
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
      if (innerW > 0 && !scrollMode) {
        const fitColPx = (innerW - rowheadPx) / Math.min(ncu, WINLOSS_MATRIX_FILL_CCY_COLS);
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
  }, [ncu, orderUpper.join("|"), listOrdered.length, balanceMap?.size, shellMode, showTotalRow]);

  if (!ncu) {
    return (
      <p id="member_balance_grid_hint" className="member-balance-mini-hint">
        {hint || ""}
      </p>
    );
  }

  return (
    <>
      <div className="member-dash-matrix-scroll">
        <div
          id="member_balance_grid"
          ref={gridRef}
          className={`member-balance-mini-grid member-balance-mini-matrix${manyCcy ? " member-balance-mini-matrix--many-ccy" : ""}${fillMode ? " member-balance-mini-matrix--ccy-fill" : ""}${ncu >= WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD ? " member-balance-mini-matrix--ccy-scroll" : ""}`}
          role="grid"
          aria-label={t?.("balancesGridAria") || "Balances by account and currency"}
          style={gridCols ? { gridTemplateColumns: gridCols } : undefined}
        >
          <div className="member-balance-matrix-corner" role="columnheader">
            {t?.("colCurrency") || "Currency"}
          </div>
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
            <MatrixTotalRow
              orderUpper={orderUpper}
              lastCi={lastCi}
              totalsByCu={totalsByCu}
              shellMode={shellMode}
              t={t}
            />
          )}
          {listOrdered.map((acc, accIdx) => (
            <MatrixAccountRow
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
        </div>
      </div>
      <p id="member_balance_grid_hint" className="member-balance-mini-hint">
        {hint || ""}
      </p>
    </>
  );
}
