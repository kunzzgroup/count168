import { useLayoutEffect, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const HEADER_MARGIN_TOP_PX = 12;
const MIN_ROWS = 1;
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

function measureRowHeight(region, rowSelector, rowHeightVar) {
  const rows = region.querySelectorAll(rowSelector);
  if (rows.length > 0) {
    let total = 0;
    let count = 0;
    rows.forEach((row, idx) => {
      if (idx >= 3) return;
      const h = row.getBoundingClientRect().height;
      if (h > 0) {
        total += h;
        count += 1;
      }
    });
    if (count > 0) return total / count;
  }
  return (
    readCssPx(region, rowHeightVar, 0) ||
    readCssPx(region, "--bank-list-cell-min-height", DEFAULT_FALLBACK_ROW_HEIGHT)
  );
}

function measureBudget(region, headerSelector) {
  const wrapper = region.querySelector(".process-table-wrapper.bank-process-table-region");
  if (!wrapper || wrapper.clientHeight <= 0) return 0;

  const header = region.querySelector(headerSelector);
  const headerH = header ? header.getBoundingClientRect().height + HEADER_MARGIN_TOP_PX : 0;
  const padBottom = parseFloat(getComputedStyle(wrapper).paddingBottom) || 0;
  const wrapperMarginTop = parseFloat(getComputedStyle(wrapper).marginTop) || 0;

  return Math.max(0, wrapper.clientHeight - headerH - padBottom - wrapperMarginTop);
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
  totalRowCount = 0,
  remeasureDeps = [],
}) {
  const [pageSize, setPageSize] = useState(DEFAULT_FALLBACK_PAGE_SIZE);

  useLayoutEffect(() => {
    if (!enabled) return undefined;

    const region = listRegionRef?.current;
    if (!region) return undefined;

    const measure = () => {
      const el = listRegionRef.current;
      if (!el || el.clientHeight <= 0) return;

      const budget = measureBudget(el, headerSelector);
      if (budget <= 0) return;

      const rowH = Math.max(1, measureRowHeight(el, rowSelector, rowHeightVar));
      let rows = Math.floor(budget / rowH);

      while (rows < maxRows && rows < totalRowCount && (rows + 1) * rowH <= budget + 0.5) {
        rows += 1;
      }

      const next = Math.max(minRows, Math.min(maxRows, rows));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    measure();
    const raf = window.requestAnimationFrame(measure);

    const ro = new ResizeObserver(() => measure());
    ro.observe(region);
    const wrapper = region.querySelector(".process-table-wrapper.bank-process-table-region");
    if (wrapper) ro.observe(wrapper);

    const onWindow = () => measure();
    window.addEventListener("resize", onWindow);
    window.addEventListener("ec:sidebar-layout-changed", onWindow);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("ec:sidebar-layout-changed", onWindow);
    };
  }, [
    enabled,
    listRegionRef,
    headerSelector,
    rowSelector,
    rowHeightVar,
    minRows,
    maxRows,
    totalRowCount,
    ...remeasureDeps,
  ]);

  return enabled ? pageSize : maxRows;
}
