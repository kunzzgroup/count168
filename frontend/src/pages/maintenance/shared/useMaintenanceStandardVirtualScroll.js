import { useProgressiveScrollExtent } from "./useProgressiveScrollExtent.js";

/** Progressive spacer growth for long lists; short lists use full native scroll (no cyclic rebound). */
const STANDARD_MIN_ROWS = 60;
const STANDARD_INITIAL_VIEWPORT_MULTIPLIER = 5;

/**
 * Payment / Bank Process maintenance tables: avoid cyclic scrollbar rebound
 * (scrollTop reset at track bottom causes twitching and hides last rows).
 */
export function useMaintenanceStandardVirtualScrollExtent({
  scrollRef,
  actualTotalH,
  rowCount,
  rowHeightEstimate,
  resetDeps = [],
  forceFullExtent = false,
}) {
  const extent = useProgressiveScrollExtent({
    scrollRef,
    actualTotalH,
    rowCount,
    rowHeightEstimate,
    resetDeps,
    minRows: STANDARD_MIN_ROWS,
    initialViewportMultiplier: STANDARD_INITIAL_VIEWPORT_MULTIPLIER,
    enableCyclicRebound: false,
    forceFullExtent,
  });

  return {
    displayTotalH: extent.displayTotalH,
    cyclicRowOffset: 0,
  };
}
