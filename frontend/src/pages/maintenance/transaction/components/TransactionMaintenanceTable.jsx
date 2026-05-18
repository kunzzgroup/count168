import { useCallback, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatAmount } from "../transactionMaintenanceLogic.js";

const ROW_HEIGHT = 52;

function pickOverscan(count) {
  if (count > 2000) return 2;
  if (count > 800) return 3;
  return 4;
}

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

function VirtualTableHeader({ m }) {
  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row" role="row">
        {HEADER_LABELS(m).map((label) => (
          <div key={label} role="columnheader" className="maintenance-virtual-th">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopLoadingBar({ label }) {
  return (
    <div className="maintenance-virtual-stale-hint" role="status" aria-live="polite">
      {label}
    </div>
  );
}

function WrapCell({ children, align = "left", className = "", title }) {
  const alignClass =
    align === "center"
      ? "maintenance-virtual-cell--center"
      : align === "right"
        ? "maintenance-virtual-cell--right"
        : "maintenance-virtual-cell--left";
  return (
    <div
      role="cell"
      className={`maintenance-virtual-cell ${alignClass} transaction-virtual-cell--wrap ${className}`}
      title={title}
    >
      <span className="transaction-cell-clamp-2">{children}</span>
    </div>
  );
}

function VirtualDataRow({ row, index }) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row transaction-virtual-data-row maintenance-row ${stripe}${
        isDeleted ? " maintenance-row-deleted" : ""
      }`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center transaction-virtual-cell--no">
        {row.no || index + 1}
      </div>
      <WrapCell className="maintenance-virtual-cell--mono" align="center">
        {row.dts_created ? (
          <span className="transaction-created-at-display">
            <span className="transaction-created-at-date">{row.dts_created.split(" ")[0]}</span>
            <br />
            <span className="transaction-created-at-time">({row.dts_created.split(" ").slice(1).join(" ")})</span>
          </span>
        ) : (
          "-"
        )}
      </WrapCell>
      <WrapCell align="center" title={row.process || "-"}>{row.process || "-"}</WrapCell>
      <WrapCell align="center" title={row.id_product || "-"}>{row.id_product || "-"}</WrapCell>
      <WrapCell align="center" title={row.account || "-"}>{row.account || "-"}</WrapCell>
      <WrapCell align="center" title={row.description || "-"}>{row.description || "-"}</WrapCell>
      <WrapCell align="center" title={row.remark || "-"}>{row.remark || "-"}</WrapCell>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center" title={row.percent || "-"}>
        {row.percent || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-cell-currency" title={row.currency || "-"}>
        {row.currency || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--right" title={row.rate || "-"}>
        {row.rate || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--right" title={formatAmount(row.cr)}>
        {formatAmount(row.cr)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--right" title={formatAmount(row.dr)}>
        {formatAmount(row.dr)}
      </div>
      <WrapCell align="center" title={row.created_by || "-"}>{row.created_by || "-"}</WrapCell>
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array} props.data
 * @param {boolean} props.showSkeleton — 无上一屏数据时的初次加载（显示表头 + 顶部蓝条，非居中 Loading 文案）
 * @param {boolean} props.isPlaceholderData — 正在拉取新 query，界面仍为上一查询数据
 * @param {boolean} props.isError
 * @param {Error | null} props.error
 * @param {object} props.m
 */
export default function TransactionMaintenanceTable({
  data,
  showSkeleton,
  isPlaceholderData,
  isError,
  error,
  m,
}) {
  const scrollRef = useRef(null);
  const sizeCacheRef = useRef(new Map());
  const rowsRef = useRef([]);
  const rows = Array.isArray(data) ? data : [];

  if (rowsRef.current !== rows) {
    sizeCacheRef.current.clear();
    rowsRef.current = rows;
  }

  const getItemKey = useCallback(
    (index) => {
      const row = rows[index];
      const tid = row?.transaction_id;
      return tid != null ? tid : index;
    },
    [rows],
  );

  const measureElement = useCallback((el) => {
    if (!el) return ROW_HEIGHT;
    const idx = Number(el.dataset?.index);
    const inner = el.querySelector(".transaction-virtual-data-row");
    const target = inner ?? el;
    const h = Math.max(
      ROW_HEIGHT,
      Math.ceil(target.scrollHeight || target.getBoundingClientRect().height || ROW_HEIGHT),
    );
    if (Number.isFinite(idx)) {
      sizeCacheRef.current.set(idx, h);
    }
    return h;
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeCacheRef.current.get(index) ?? ROW_HEIGHT,
    overscan: pickOverscan(rows.length),
    getItemKey,
    measureElement,
  });

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    sizeCacheRef.current.clear();
    rowVirtualizer.measure();
  }, [rows, rowVirtualizer]);

  if (isError && rows.length === 0 && !showSkeleton) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{error?.message || m.searchFailed}</p>
        </div>
      </div>
    );
  }

  if (rows.length === 0 && !showSkeleton) {
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
  const showBlueBar = showSkeleton || Boolean(isPlaceholderData);

  return (
    <div className="maintenance-list-container maintenance-virtual-table" style={{ display: "block" }}>
      <div className="maintenance-virtual-table-inner" role="table" aria-label={m.pageTitleTransaction}>
        {showBlueBar ? <TopLoadingBar label={m.loading} /> : null}
        <div ref={scrollRef} className="maintenance-virtual-scroll" tabIndex={0}>
          <VirtualTableHeader m={m} />
          {rows.length > 0 ? (
            <div className="maintenance-virtual-spacer" style={{ height: totalH, position: "relative", width: "100%" }}>
              {vItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    className="maintenance-virtual-row-wrap"
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      minHeight: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <VirtualDataRow row={row} index={virtualRow.index} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="maintenance-virtual-empty-loading" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
