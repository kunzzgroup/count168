import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import FormulaVirtualDataRow from "./FormulaVirtualDataRow.jsx";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

function measureRowWrap(el, rowHeight) {
  if (!el) return rowHeight;
  const inner = el.querySelector(".formula-virtual-data-row");
  const target = inner ?? el;
  return Math.max(
    rowHeight,
    Math.ceil(target.scrollHeight || target.getBoundingClientRect().height || rowHeight),
  );
}

export default function FormulaVirtualRows({
  rows,
  rowHeight,
  isRowSelected,
  onToggleSelect,
  onEdit,
  m,
  onScrollingChange,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());
  const rowsRef = useRef(rows);

  if (rowsRef.current !== rows) {
    sizeCacheRef.current.clear();
    rowsRef.current = rows;
  }

  const getItemKey = useCallback((index) => {
    const row = rows[index];
    return row?.id != null ? row.id : index;
  }, [rows]);

  const measureElement = useCallback(
    (el) => {
      const idx = Number(el?.dataset?.index);
      const h = measureRowWrap(el, rowHeight);
      if (Number.isFinite(idx)) {
        sizeCacheRef.current.set(idx, h);
      }
      return h;
    },
    [rowHeight],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeCacheRef.current.get(index) ?? rowHeight,
    overscan: pickOverscan(rows.length),
    getItemKey,
    measureElement,
  });

  useLayoutEffect(() => {
    sizeCacheRef.current.clear();
    rowVirtualizer.measure();
  }, [rows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScrollingChange) return undefined;

    let endTimer;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      if (Math.abs(el.scrollTop - lastTop) > 1) {
        onScrollingChange(true);
        lastTop = el.scrollTop;
      }
      clearTimeout(endTimer);
      endTimer = setTimeout(() => onScrollingChange(false), 120);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(endTimer);
    };
  }, [onScrollingChange]);

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <div className="maintenance-virtual-spacer" style={{ height: totalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="maintenance-virtual-row-wrap"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FormulaVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={isRowSelected(row.id)}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                m={m}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
