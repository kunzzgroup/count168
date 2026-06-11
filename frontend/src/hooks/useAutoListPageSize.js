import { useLayoutEffect, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const PAGINATION_RESERVE_PX = 52;
const VIEWPORT_BOTTOM_GAP_PX = 6;
const ABSOLUTE_ROW_HEIGHT_CAP = 72;
const FIT_FUDGE_PX = 1;
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

function rowHeightPx(row) {
  const h = row.getBoundingClientRect().height;
  if (h <= 0) return 0;
  return Math.min(h, ABSOLUTE_ROW_HEIGHT_CAP);
}

/** 表头下沿 → 分页条上沿；其次 clip 高度；最后视口估算 */
function measureBudget(region, headerSelector) {
  const header = region.querySelector(headerSelector);
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;

  const listBody = region.closest(".bank-process-list-body");
  const pagination = listBody?.querySelector(".pagination-container");
  let pagBudget = 0;
  if (pagination && headerBottom > 0) {
    const pagTop = pagination.getBoundingClientRect().top;
    if (pagTop > headerBottom) {
      pagBudget = pagTop - headerBottom;
    }
  }

  const clip = region.querySelector(".bank-virtual-scroll-clip");
  const clipBudget = clip?.getBoundingClientRect().height ?? 0;

  const minH = cellMinHeight(region);
  if (pagBudget >= minH && clipBudget >= minH) {
    return Math.min(pagBudget, clipBudget);
  }
  if (pagBudget >= minH) return pagBudget;
  if (clipBudget >= minH) return clipBudget;

  if (!header) return 0;
  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(0, viewportH - headerBottom - PAGINATION_RESERVE_PX - VIEWPORT_BOTTOM_GAP_PX);
}

/**
 * 用已渲染行的实测高度累加，填满 budget；无数据时用 CSS 估算。
 * 比 budget/rowH 更准，避免 rowEstimate 偏大导致少算行数。
 */
function computePageSize(region, budget, rowSelector, minRows, maxRows) {
  const safeBudget = Math.max(0, budget - FIT_FUDGE_PX);
  const fallbackH = Math.max(cellMinHeight(region), dataRowEstimate(region));
  const rows = [...region.querySelectorAll(rowSelector)];

  if (rows.length === 0) {
    return Math.max(minRows, Math.min(maxRows, Math.floor(safeBudget / fallbackH)));
  }

  let used = 0;
  let fit = 0;
  let totalMeasured = 0;

  for (const row of rows) {
    const h = rowHeightPx(row);
    if (h <= 0) continue;
    if (used + h > safeBudget) break;
    used += h;
    totalMeasured += h;
    fit += 1;
  }

  const avgH = fit > 0 ? totalMeasured / fit : fallbackH;

  while (fit < maxRows && used + avgH <= safeBudget) {
    used += avgH;
    fit += 1;
  }

  return Math.max(minRows, Math.min(maxRows, fit));
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

      const next = computePageSize(el, budget, rowSelector, minRows, maxRows);
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
    const clip = region.querySelector(".bank-virtual-scroll-clip");
    if (clip) ro.observe(clip);

    const listBody = region.closest(".bank-process-list-body");
    const pagination = listBody?.querySelector(".pagination-container");
    if (pagination) ro.observe(pagination);

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
