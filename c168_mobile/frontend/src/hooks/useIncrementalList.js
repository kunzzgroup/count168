import { useEffect, useRef, useState } from "react";

/**
 * Incremental rendering for long mobile lists (poor man's virtualization):
 * render the first chunk only, then grow as the sentinel scrolls into view.
 * Prevents the page from freezing when a query returns thousands of rows.
 */
export function useIncrementalList(items, pageSize = 60) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setCount(pageSize);
  }, [items, pageSize]);

  const hasMore = items.length > count;

  useEffect(() => {
    if (!hasMore) return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((n) => n + pageSize);
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pageSize, items, count]);

  return {
    visible: hasMore ? items.slice(0, count) : items,
    hasMore,
    sentinelRef,
    shown: Math.min(count, items.length),
    total: items.length,
  };
}
