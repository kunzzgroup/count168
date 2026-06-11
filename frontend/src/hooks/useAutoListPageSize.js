import { useLayoutEffect, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const HEADER_MARGIN_TOP_PX = 12;
const PAGINATION_RESERVE_PX = 44;
const VIEWPORT_BOTTOM_GAP_PX = 6;
const TABLE_TOP_MARGIN_PX = 0;
const ABSOLUTE_ROW_HEIGHT_CAP = 52;
const MIN_ROWS = 4;
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

function cellMinHeight(region) {
  return readCssPx(region, "--bank-list-cell-min-height", DEFAULT_FALLBACK_ROW_HEIGHT);
}

function dataRowEstimate(region) {
  const est = readCssPx(region, "--bank-list-data-row-estimate", 0);
  return est > 0 ? est : cellMinHeight(region);
}

function measureRowHeight(region, rowSelector) {
  const cellMin = cellMinHeight(region);
  const rowEstimate = dataRowEstimate(region);

  const rows = region.querySelectorAll(rowSelector);
  if (rows.length > 0) {
    let total = 0;
    let count = 0;
    rows.forEach((row, idx) => {
      if (idx >= 5) return;
      const rawH = row.getBoundingClientRect().height;
      const h = rawH > 0 ? Math.min(rawH, ABSOLUTE_ROW_HEIGHT_CAP) : 0;
      if (h > 0) {
        total += h;
        count += 1;
      }
    });
    if (count > 0) {
      return Math.max(cellMin * 0.88, rowEstimate * 0.92, total / count);
    }
  }

  return Math.max(cellMin, rowEstimate * 0.92);
}

/** 用视口剩余高度（表头下方 → 屏幕底），避免 flex 容器 clientHeight 跟内容一起缩 */
function measureBudget(region, headerSelector) {
  const header = region.querySelector(headerSelector);
  if (!header) return 0;

  const headerBottom = header.getBoundingClientRect().bottom;
  const viewportH = window.visualViewport?.height ?? window.innerHeight;

  return Math.max(
    0,
    viewportH - headerBottom - PAGINATION_RESERVE_PX - VIEWPORT_BOTTOM_GAP_PX - TABLE_TOP_MARGIN_PX,
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
      if (budget < cellMinHeight(el)) return;

      const rowH = Math.max(1, measureRowHeight(el, rowSelector));
      let rows = Math.floor(budget / rowH + 0.4);

      while (rows < maxRows && (rows + 1) * rowH <= budget + rowH * 0.2) {
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
    window.visualViewport?.addEventListener("resize", onWindow);
    window.visualViewport?.addEventListener("scroll", onWindow);

    return () => {
      window.cancelAnimationFrame(raf1);
      ro.disconnect();
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("ec:sidebar-layout-changed", onWindow);
      window.visualViewport?.removeEventListener("resize", onWindow);
      window.visualViewport?.removeEventListener("scroll", onWindow);
    };
  }, [enabled, listRegionRef, headerSelector, rowSelector, minRows, maxRows, ...remeasureDeps]);

  return enabled ? pageSize : maxRows;
}
