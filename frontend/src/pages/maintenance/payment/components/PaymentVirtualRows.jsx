import { useCallback, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import PaymentVirtualDataRow from "./PaymentVirtualDataRow.jsx";
import { isPaymentMaintenanceRowSelectable } from "../paymentMaintenanceLogic.js";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

export default function PaymentVirtualRows({
  rows,
  rowHeight,
  rowKeyPrefix,
  selectedSet,
  onToggleRow,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());
  const rowsRef = useRef(rows);

  if (rowsRef.current !== rows) {
    sizeCacheRef.current.clear();
    rowsRef.current = rows;
  }

  const getItemKey = useCallback(
    (index) => {
      const row = rows[index];
      const tid = row?.transaction_id;
      if (tid != null && rowKeyPrefix) return `${rowKeyPrefix}-${tid}`;
      return tid != null ? tid : index;
    },
    [rows, rowKeyPrefix],
  );

  const measureElement = useCallback(
    (el) => {
      if (!el) return rowHeight;
      const idx = Number(el.dataset?.index);
      const inner = el.querySelector(".payment-virtual-data-row");
      const target = inner ?? el;
      const h = Math.max(rowHeight, Math.ceil(target.scrollHeight || target.getBoundingClientRect().height || rowHeight));
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
    scrollRef.current?.scrollTo(0, 0);
    sizeCacheRef.current.clear();
    rowVirtualizer.measure();
  }, [rows, rowVirtualizer]);

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <div className="maintenance-virtual-spacer" style={{ height: totalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const tid = row.transaction_id;
          const canSelect = isPaymentMaintenanceRowSelectable(row);
          const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;

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
              <PaymentVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={canSelect && !isDeleted && selectedSet.has(tid)}
                onToggleRow={onToggleRow}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
