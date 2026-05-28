import { useLayoutEffect, useRef } from "react";

import {
  accountHoldsMiniGridCurrency,
  formatCompactCurrencyLabel,
  formatMiniGridMoney,
  miniGridAmountTone,
  miniGridShowsTotalRow,
  MEMBER_AMOUNT_NA_MARK,
  MINI_GRID_SHELL_ROWS,
  measureCompactMatrixColumnWidths,
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

function CompactCurrencyBlock({
  cu,
  listOrdered,
  showTotalRow,
  shellMode,
  balanceMap,
  totalsByCu,
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  t,
}) {
  const lastRi = listOrdered.length - 1;
  return (
    <div className="member-wl-compact-matrix" role="grid" aria-label={`${formatCompactCurrencyLabel(cu)} balances`}>
      <div className="member-wl-compact-matrix__hd" role="row">
        <div className="member-wl-compact-matrix__account-hd" role="columnheader">
          {t?.("colCurrency") || "Currency"}
        </div>
        <div className="member-wl-compact-matrix__amt-hd" role="columnheader">
          {formatCompactCurrencyLabel(cu)}
        </div>
      </div>
      {showTotalRow && (
        <CompactTotalRow totalDec={totalsByCu?.get(cu)} rowIdx={0} t={t} />
      )}
      {listOrdered.map((acc, accIdx) => (
        <CompactGridRow
          key={`compact-${cu}-${acc.id}-${accIdx}`}
          idNum={Number(acc.id)}
          code={String(acc.account_id || acc.name || acc.id).trim() || String(acc.id)}
          cu={cu}
          isLastRow={accIdx === lastRi}
          accIdx={showTotalRow ? accIdx + 1 : accIdx}
          shellMode={shellMode}
          balanceMap={balanceMap}
          linkedCurrenciesLoaded={linkedCurrenciesLoaded}
          linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
        />
      ))}
    </div>
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

  const showTotalRow = miniGridShowsTotalRow(shellMode, listOrdered);
  const stackRef = useRef(null);

  useLayoutEffect(() => {
    const scroll = stackRef.current?.parentElement;
    const stack = stackRef.current;
    if (!scroll?.classList.contains("member-dash-matrix-scroll") || !stack) return undefined;

    const syncCompactWidth = () => {
      const grids = stack.querySelectorAll(".member-wl-compact-matrix");
      if (!grids.length) return;

      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      let maxAccPx = 0;
      let maxAmtPx = 0;
      grids.forEach((grid) => {
        const { accountColPx, amtColPx } = measureCompactMatrixColumnWidths(grid, rem);
        maxAccPx = Math.max(maxAccPx, accountColPx);
        maxAmtPx = Math.max(maxAmtPx, amtColPx);
      });

      const accW = `${maxAccPx}px`;
      const amtW = `${maxAmtPx}px`;
      scroll.style.setProperty("--member-wl-compact-acc-col-w", accW);
      scroll.style.setProperty("--member-wl-ccy-fill-col-w", amtW);
      grids.forEach((grid) => {
        grid.style.setProperty("--member-wl-compact-acc-col-w", accW);
        grid.style.setProperty("--member-wl-ccy-fill-col-w", amtW);
      });
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
      stack.querySelectorAll(".member-wl-compact-matrix").forEach((grid) => {
        grid.style.removeProperty("--member-wl-compact-acc-col-w");
        grid.style.removeProperty("--member-wl-ccy-fill-col-w");
      });
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
      <div className="member-dash-matrix-scroll member-dash-matrix-scroll--compact">
        <div
          id="member_balance_grid"
          ref={stackRef}
          className="member-wl-compact-matrix-stack"
          role="group"
          aria-label={t?.("balancesGridAria") || "Balances by account and currency"}
        >
          {orderUpper.map((cu) => (
            <CompactCurrencyBlock
              key={cu}
              cu={cu}
              listOrdered={listOrdered}
              showTotalRow={showTotalRow}
              shellMode={shellMode}
              balanceMap={balanceMap}
              totalsByCu={totalsByCu}
              linkedCurrenciesLoaded={linkedCurrenciesLoaded}
              linkedAccountCurrenciesMap={linkedAccountCurrenciesMap}
              t={t}
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
