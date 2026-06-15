import { useCallback, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMaintenanceStandardVirtualScrollExtent } from "../../shared/useMaintenanceStandardVirtualScroll.js";
import { measureMaintenanceVirtualRow } from "../../shared/measureMaintenanceVirtualRow.js";
import BankprocessVirtualDataRow from "./BankprocessVirtualDataRow.jsx";

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

function isRowDeleted(row) {
  return row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
}

function BankprocessVirtualTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  const labels = [
    m.tblNo,
    m.tblDtsCreated,
    m.tblAccount,
    m.tblFrom,
    m.tblAmount,
    m.tblDescription,
    m.tblRemark,
    m.tblSubmittedBy,
  ];

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row bankprocess-virtual-head-row" role="row">
        {labels.map((label, i) => (
          <div
            key={label}
            role="columnheader"
            className={`maintenance-virtual-th bankprocess-virtual-th--left${i === 0 ? " bankprocess-virtual-th--no" : ""}${i === 4 ? " maintenance-header-amount" : ""}`}
          >
            {label}
          </div>
        ))}
        <div
          role="columnheader"
          className="maintenance-virtual-th bankprocess-virtual-th-checkbox maintenance-select-all-header"
        >
          <input
            type="checkbox"
            id={disableSelectAll ? undefined : "select_all_bankprocess"}
            ref={disableSelectAll ? undefined : selectAllRef}
            className="maintenance-row-checkbox maintenance-select-all-checkbox"
            checked={selectAll}
            onChange={toggleSelectAll}
            title={m.selectAll}
            disabled={disableSelectAll}
          />
        </div>
      </div>
    </div>
  );
}

export default function BankprocessVirtualRows({
  rows,
  rowHeight,
  rowKeyPrefix,
  selectedSet,
  onToggleRow,
  alreadyDeletedTitle,
  selectAllRef,
  selectAll,
  toggleSelectAll,
  m,
  disableSelectAll = false,
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
      const h = measureMaintenanceVirtualRow(el, rowHeight, ".bankprocess-virtual-data-row");
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
  const { displayTotalH, cyclicRowOffset } = useMaintenanceStandardVirtualScrollExtent({
    scrollRef,
    actualTotalH: totalH,
    rowCount: rows.length,
    rowHeightEstimate: rowHeight,
    resetDeps: [rows],
  });

  return (
    <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
      <BankprocessVirtualTableHead
        selectAllRef={selectAllRef}
        selectAll={selectAll}
        toggleSelectAll={toggleSelectAll}
        m={m}
        disableSelectAll={disableSelectAll}
      />
      <div className="maintenance-virtual-spacer" style={{ height: displayTotalH, position: "relative", width: "100%" }}>
        {vItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const tid = row.transaction_id;
          const isDeleted = isRowDeleted(row);

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
                height: `${virtualRow.size}px`,
                minHeight: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start - cyclicRowOffset}px)`,
              }}
            >
              <BankprocessVirtualDataRow
                row={row}
                index={virtualRow.index}
                selected={!isDeleted && selectedSet.has(tid)}
                onToggleRow={onToggleRow}
                alreadyDeletedTitle={alreadyDeletedTitle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
