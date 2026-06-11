import { useLayoutEffect, useState } from "react";

const DEFAULT_FALLBACK_ROW_HEIGHT = 30;
const DEFAULT_FALLBACK_PAGE_SIZE = 15;
const PAGINATION_RESERVE_PX = 8;
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
      if (!el || el.clientHeight <= 0) return;

      const header = el.querySelector(headerSelector);
      const sampleRow = el.querySelector(rowSelector);
      const headerH = header?.offsetHeight ?? 0;
      const regionH = el.clientHeight;
      const available = regionH - headerH - PAGINATION_RESERVE_PX;

      if (available <= 0) return;

      const rowH =
        sampleRow?.offsetHeight ||
        readCssPx(el, rowHeightVar, readCssPx(el, "--bank-list-cell-min-height", DEFAULT_FALLBACK_ROW_HEIGHT));

      const rows = Math.floor(available / Math.max(rowH, 1));
      const next = Math.max(minRows, Math.min(maxRows, rows));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(region);

    const onWindow = () => measure();
    window.addEventListener("resize", onWindow);
    window.addEventListener("ec:sidebar-layout-changed", onWindow);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("ec:sidebar-layout-changed", onWindow);
    };
  }, [enabled, listRegionRef, headerSelector, rowSelector, rowHeightVar, minRows, maxRows, ...remeasureDeps]);

  return enabled ? pageSize : maxRows;
}
