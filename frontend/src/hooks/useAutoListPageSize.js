import { useLayoutEffect, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const PAGINATION_RESERVE_PX = 56;
const VIEWPORT_BOTTOM_GAP_PX = 8;
const CLIP_BOTTOM_GAP_PX = 6;
const ABSOLUTE_ROW_HEIGHT_CAP = 72;
const ROW_HEIGHT_BUFFER_PX = 2;
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
      return Math.max(cellMin, rowEstimate, total / count) + ROW_HEIGHT_BUFFER_PX;
    }
  }

  return Math.max(cellMin, rowEstimate) + ROW_HEIGHT_BUFFER_PX;
}

/** 优先用裁剪区实际高度；其次表头到分页条之间；最后视口估算 */
function measureBudget(region, headerSelector) {
  const clip = region.querySelector(".bank-virtual-scroll-clip");
  if (clip) {
    const clipH = clip.getBoundingClientRect().height;
    if (clipH >= cellMinHeight(region)) {
      return Math.max(0, clipH - CLIP_BOTTOM_GAP_PX);
    }
  }

  const header = region.querySelector(headerSelector);
  if (!header) return 0;

  const headerBottom = header.getBoundingClientRect().bottom;
  const listBody = region.closest(".bank-process-list-body");
  const pagination = listBody?.querySelector(".pagination-container");
  if (pagination) {
    const pagTop = pagination.getBoundingClientRect().top;
    if (pagTop > headerBottom) {
      return Math.max(0, pagTop - headerBottom - CLIP_BOTTOM_GAP_PX);
    }
  }

  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(
    0,
    viewportH - headerBottom - PAGINATION_RESERVE_PX - VIEWPORT_BOTTOM_GAP_PX,
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
      const rows = Math.floor(budget / rowH);

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
    const clip = region.querySelector(".bank-virtual-scroll-clip");
    if (clip) ro.observe(clip);

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
