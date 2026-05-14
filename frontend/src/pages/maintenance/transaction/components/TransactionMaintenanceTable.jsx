import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatAmount } from "../transactionMaintenanceLogic.js";

const SKELETON_ROW_COUNT = 10;

const HEADER_LABELS = (m) => [
  m.tblNo,
  m.tblCreatedAt,
  m.tblProcess,
  m.tblIdProduct,
  m.tblAccount,
  m.tblDescription,
  m.tblRemark,
  m.tblPercent,
  m.tblCurrency,
  m.tblRate,
  m.tblCr,
  m.tblDr,
  m.tblSubmitter,
];

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
        <tr key={`skel-${i}`} className="maintenance-table-skeleton-row" aria-hidden>
          {Array.from({ length: 13 }, (_, j) => (
            <td key={j} className="maintenance-table-cell">
              <span className="maintenance-skel-bar" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function VirtualDataRow({ row, index }) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row maintenance-row ${stripe} ${isDeleted ? "maintenance-row-deleted" : ""}`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center">
        {row.no || index + 1}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--mono">
        {row.dts_created || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.process || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.id_product || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.account || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.description || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.remark || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center">
        {row.percent || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-cell-currency">
        {row.currency || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--right">
        {row.rate || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--right">
        {formatAmount(row.cr)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--right">
        {formatAmount(row.dr)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.created_by || "-"}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array} props.data
 * @param {boolean} props.showSkeleton — 无上一屏数据时的整表骨架（切换公司时若有占位数据则为 false）
 * @param {boolean} props.isFetching
 * @param {boolean} props.isPlaceholderData — 正在拉取新 query，界面仍为上一查询数据
 * @param {boolean} props.isError
 * @param {Error | null} props.error
 * @param {object} props.m
 */
export default function TransactionMaintenanceTable({
  data,
  showSkeleton,
  isFetching,
  isPlaceholderData,
  isError,
  error,
  m,
}) {
  const scrollRef = useRef(null);
  const rows = Array.isArray(data) ? data : [];

  useEffect(() => {
    scrollRef.current?.scrollTo?.(0, 0);
  }, [data]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 46,
    overscan: 14,
  });

  if (showSkeleton) {
    return (
      <div className="maintenance-list-container maintenance-list-container--loading" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              {HEADER_LABELS(m).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="maintenance-table-loading-caption-row">
              <td className="maintenance-table-cell maintenance-table-loading-caption" colSpan="13">
                {m.loading}
              </td>
            </tr>
            <SkeletonRows />
          </tbody>
        </table>
      </div>
    );
  }

  if (isError && rows.length === 0) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{error?.message || m.searchFailed}</p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{m.noDataAdjustSearch}</p>
        </div>
      </div>
    );
  }

  const vItems = rowVirtualizer.getVirtualItems();
  const totalH = rowVirtualizer.getTotalSize();

  return (
    <div
      className={`maintenance-list-container maintenance-virtual-table${
        isFetching ? " maintenance-virtual-table--refreshing" : ""
      }`}
      style={{ display: "block" }}
    >
      <div className="maintenance-virtual-table-inner" role="table" aria-label={m.pageTitleTransaction}>
        <div className="maintenance-virtual-thead" role="rowgroup">
          <div className="maintenance-virtual-head-row" role="row">
            {HEADER_LABELS(m).map((label) => (
              <div key={label} role="columnheader" className="maintenance-virtual-th">
                {label}
              </div>
            ))}
          </div>
        </div>
        {isPlaceholderData && rows.length > 0 ? (
          <div className="maintenance-virtual-stale-hint" role="status" aria-live="polite">
            {m.loading}
          </div>
        ) : null}
        <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
          <div className="maintenance-virtual-spacer" style={{ height: totalH, position: "relative", width: "100%" }}>
            {vItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.transaction_id ?? `r-${virtualRow.index}`}
                  className="maintenance-virtual-row-wrap"
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <VirtualDataRow row={row} index={virtualRow.index} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
