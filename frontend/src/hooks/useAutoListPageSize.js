import { useLayoutEffect, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const HEADER_MARGIN_TOP_PX = 12;
const PAGINATION_RESERVE_PX = 52;
const TABLE_TOP_MARGIN_PX = 6;
const MIN_BUDGET_PX = 120;
const MIN_ROWS = 6;
const MAX_ROWS = 80;

function readCssPx(el, varName, fallback) {
  if (!el || typeof window === "undefined") return fallback;
  const raw = getComputedStyle(el).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.height = raw;
  document.body.appendChild(probe);
  const px = probe.offsetHeight;
  probe.remove();
  return px > 0 ? px : fallback;
}

function cssRowEstimate(region, rowHeightVar) {
  return (
    readCssPx(region, rowHeightVar, 0) ||
    readCssPx(region, "--bank-list-cell-min-height", DEFAULT_FALLBACK_ROW_HEIGHT)
  );
}

function measureRowHeight(region, rowSelector, rowHeightVar) {
  const cssEstimate = cssRowEstimate(region, rowHeightVar);
  /** 拉伸行（fill-page）会把 DOM 高度撑满视口，必须用 CSS 估算避免 pageSize 塌缩为 1 */
  if (region.querySelector(".bank-process-fill-rows")) {
    return cssEstimate;
  }

  const rowCap = Math.max(cssEstimate * 1.5, DEFAULT_FALLBACK_ROW_HEIGHT);
  const rows = region.querySelectorAll(rowSelector);
  if (rows.length > 0) {
    let total = 0;
    let count = 0;
    rows.forEach((row, idx) => {
      if (idx >= 3) return;
      const rawH = row.getBoundingClientRect().height;
      const h = rawH > 0 ? Math.min(rawH, rowCap) : 0;
      if (h > 0) {
        total += h;
        count += 1;
      }
    });
    if (count > 0) return Math.max(total / count, DEFAULT_FALLBACK_ROW_HEIGHT * 0.85);
  }
  return cssEstimate;
}

function measureBudget(region, headerSelector) {
  if (region.clientHeight < MIN_BUDGET_PX) return 0;

  const header = region.querySelector(headerSelector);
  const headerH = header ? header.getBoundingClientRect().height + HEADER_MARGIN_TOP_PX : 48;

  return Math.max(
    0,
    region.clientHeight - headerH - PAGINATION_RESERVE_PX - TABLE_TOP_MARGIN_PX,
  );
}

/**
 * Fit as many table rows as the list region can show without vertical scroll (non-Show-All).
 */
export function useAutoListPageSize({
  listRegionRef,
  enabled = true,
  rowSelector = ".bank-virtual-data-row:not(.bank-virtual-data-row--message)",
  headerSelector = ".bank-virtual-head-row.table-header",
  rowHeightVar = "--bank-list-data-row-estimate",
  minRows = MIN_ROWS,
  maxRows = MAX_ROWS,
  remeasureDeps = [],
}) {
  const [pageSize, setPageSize] = useState(DEFAULT_FALLBACK_PAGE_SIZE);

  useLayoutEffect(() => {
    if (!enabled) return undefined;

    const region = listRegionRef?.current;
    if (!region) return undefined;

    const measure = () => {
      const el = listRegionRef.current;
      if (!el) return;

      const budget = measureBudget(el, headerSelector);
      if (budget <= 0) return;

      const rowH = Math.max(1, measureRowHeight(el, rowSelector, rowHeightVar));
      let rows = Math.floor(budget / rowH);

      while (rows < maxRows && (rows + 1) * rowH <= budget + 1) {
        rows += 1;
      }

      const next = Math.max(minRows, Math.min(maxRows, rows));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    measure();
    const raf1 = window.requestAnimationFrame(() => {
      measure();
      window.requestAnimationFrame(measure);
    });

    const ro = new ResizeObserver(() => measure());
    ro.observe(region);
    const wrapper = region.querySelector(".process-table-wrapper.bank-process-table-region");
    if (wrapper) ro.observe(wrapper);

    const onWindow = () => measure();
    window.addEventListener("resize", onWindow);
    window.addEventListener("ec:sidebar-layout-changed", onWindow);

    return () => {
      window.cancelAnimationFrame(raf1);
      ro.disconnect();
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("ec:sidebar-layout-changed", onWindow);
    };
  }, [enabled, listRegionRef, headerSelector, rowSelector, rowHeightVar, minRows, maxRows, ...remeasureDeps]);

  return enabled ? pageSize : maxRows;
}
