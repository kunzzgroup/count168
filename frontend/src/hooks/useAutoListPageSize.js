import { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const PAGINATION_RESERVE_PX = 52;
const VIEWPORT_BOTTOM_GAP_PX = 6;
const CLIP_BOTTOM_GAP_PX = 10;
const ABSOLUTE_ROW_HEIGHT_CAP = 72;
const ROW_BOTTOM_TOLERANCE_PX = 2;
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

function rowHeightPx(row) {
  const h = row.getBoundingClientRect().height;
  if (h <= 0) return 0;
  return Math.min(h, ABSOLUTE_ROW_HEIGHT_CAP);
}

/** 以 clip 实际高度为准（overflow 裁剪边界），pag 仅作 fallback */
function measureBudget(region, headerSelector) {
  const minH = cellMinHeight(region);
  const clip = region.querySelector(".bank-virtual-scroll-clip");
  const clipBudget = clip?.getBoundingClientRect().height ?? 0;

  if (clipBudget >= minH) {
    return Math.max(0, clipBudget - CLIP_BOTTOM_GAP_PX);
  }

  const header = region.querySelector(headerSelector);
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const listBody = region.closest(".bank-process-list-body");
  const pagination = listBody?.querySelector(".pagination-container");

  if (pagination && headerBottom > 0) {
    const pagTop = pagination.getBoundingClientRect().top;
    if (pagTop > headerBottom) {
      return Math.max(0, pagTop - headerBottom - CLIP_BOTTOM_GAP_PX);
    }
  }

  if (!header) return 0;
  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(0, viewportH - headerBottom - PAGINATION_RESERVE_PX - VIEWPORT_BOTTOM_GAP_PX);
}

/** 按 clip 下沿统计完整可见行（最可靠，避免末行被裁切） */
function countRowsFullyVisible(region, rowSelector) {
  const clip = region.querySelector(".bank-virtual-scroll-clip");
  if (!clip) return null;

  const limit = clip.getBoundingClientRect().bottom - ROW_BOTTOM_TOLERANCE_PX;
  const rows = region.querySelectorAll(rowSelector);
  let count = 0;

  for (const row of rows) {
    if (row.getBoundingClientRect().bottom <= limit) {
      count += 1;
    } else {
      break;
    }
  }

  return count;
}

function computePageSize(region, budget, rowSelector, minRows, maxRows) {
  const cellMin = cellMinHeight(region);
  const rows = [...region.querySelectorAll(rowSelector)];

  if (rows.length === 0) {
    return Math.max(minRows, Math.min(maxRows, Math.floor(budget / cellMin)));
  }

  let used = 0;
  let fit = 0;

  for (const row of rows) {
    const h = rowHeightPx(row);
    if (h <= 0) continue;
    if (used + h > budget) break;
    used += h;
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
  const pageSizeRef = useRef(DEFAULT_FALLBACK_PAGE_SIZE);

  useLayoutEffect(() => {
    if (!enabled) return undefined;

    const region = listRegionRef?.current;
    if (!region) return undefined;

    const measure = () => {
      const el = listRegionRef.current;
      if (!el) return;

      const budget = measureBudget(el, headerSelector);
      if (budget < cellMinHeight(el)) return;

      const rows = [...el.querySelectorAll(rowSelector)];
      const prev = pageSizeRef.current;
      let next = computePageSize(el, budget, rowSelector, minRows, maxRows);

      const fullyVisible = countRowsFullyVisible(el, rowSelector);
      if (fullyVisible !== null && fullyVisible > 0) {
        next = Math.min(next, fullyVisible);
      }

      const isPartialPage = rows.length > 0 && rows.length < prev - 1;
      if (isPartialPage && next < prev) {
        next = prev;
      }

      pageSizeRef.current = next;
      setPageSize((p) => (p === next ? p : next));
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
