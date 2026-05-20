import React, { useLayoutEffect, useRef } from "react";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import {
  BANK_GRID_TEMPLATE_COLUMNS,
  BANK_GRID_TEMPLATE_COLUMNS_WITH_SELECT,
  canShowBankResend,
  normalizeBankProcessStatus,
  notifyTransactionDataChanged,
  formatBankProcessContractLabel,
  bankProcessContractBadgeKey,
  formatBankMoneyFixed2,
  isValidBankMoneyInput,
} from "../bankProcessHelpers.js";

function formatBankMoneyCell(value) {
  const raw = value != null ? String(value).trim() : "";
  if (!raw) return "-";
  if (!isValidBankMoneyInput(raw)) return raw;
  return formatBankMoneyFixed2(raw);
}
import BankProcessStatusControl from "./BankProcessStatusControl.jsx";

function BankSortIcon({ column, sortColumn, sortDirection }) {
  return (
    <span
      className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`}
      aria-hidden="true"
    >
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );
}

function getContractStateClass(dayStart, dayEnd) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const hasDayStart = dayStart != null && String(dayStart).trim() !== '';
  if (!hasDayStart) return 'contract-pending';
  const start = String(dayStart).substring(0, 10);
  const end = dayEnd ? String(dayEnd).substring(0, 10) : null;
  if (todayStr < start) return 'contract-pending';
  if (end && todayStr > end) return 'contract-expired';
  if (start && end && todayStr >= start && todayStr <= end) return 'contract-active';
  if (start && todayStr >= start) return 'contract-active';
  return 'contract-expired';
}

function renderBankContract(value, dayStart, dayEnd, lang) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const contractBadgeKey = bankProcessContractBadgeKey(text);
  const displayLabel = formatBankProcessContractLabel(lang, text);

  const baseContractClass = getContractStateClass(dayStart || null, dayEnd || null);
  const grayContracts = ["1 MONTH", "1+1 MONTH", "1+2 MONTHS", "1+3 MONTHS"];
  const contractClass =
    grayContracts.indexOf(contractBadgeKey) !== -1 && baseContractClass === "contract-active"
      ? "contract-1month-active"
      : baseContractClass;

  return (
    <span className={`contract-badge ${contractClass} bank-contract-pill`}>
      {displayLabel}
    </span>
  );
}

export default function BankProcessTable({
  tableLoading,
  showAll,
  showSelectColumn,
  pageRows,
  currentPage,
  PAGE_SIZE,
  selectedIds,
  setSelectedIds,
  notify,
  fetchRows,
  openEdit,
  openRemarkModal,
  openResendModal,
  sortColumn,
  sortDirection,
  onSort,
  showHeaderSelectAll,
  lang,
  t,
}) {
  const deletableRows = pageRows.filter(
    (r) => normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions
  );
  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((r) => selectedIds.has(r.id));
  const toggleHeaderSelectAll = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) deletableRows.forEach((r) => next.add(r.id));
      else deletableRows.forEach((r) => next.delete(r.id));
      return next;
    });
  };
  const headerRef = useRef(null);
  const cardsRef = useRef(null);

  useLayoutEffect(() => {
    const syncHeaderWidth = () => {
      const headerEl = headerRef.current;
      const cardsEl = cardsRef.current;
      const wrapperEl = headerEl?.parentElement;
      if (!headerEl || !cardsEl) return;
      const width = Math.ceil(Math.max(headerEl.scrollWidth, headerEl.offsetWidth, headerEl.getBoundingClientRect().width));
      const widthPx = `${width}px`;
      cardsEl.style.setProperty("--table-header-width", widthPx);
      headerEl.style.setProperty("--table-header-width", widthPx);
      if (wrapperEl) wrapperEl.style.setProperty("--table-header-width", widthPx);
    };

    const raf1 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncHeaderWidth);
    });

    const onResize = () => syncHeaderWidth();
    window.addEventListener("resize", onResize);
    window.addEventListener("ec:sidebar-layout-changed", onResize);

    let ro = null;
    const observeEl = headerRef.current?.parentElement;
    if (typeof window.ResizeObserver === "function" && observeEl) {
      ro = new window.ResizeObserver(() => syncHeaderWidth());
      ro.observe(observeEl);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("ec:sidebar-layout-changed", onResize);
      if (ro) ro.disconnect();
    };
  }, [pageRows.length, showAll, sortColumn, sortDirection, showSelectColumn]);

  const gridCols = showSelectColumn ? BANK_GRID_TEMPLATE_COLUMNS_WITH_SELECT : BANK_GRID_TEMPLATE_COLUMNS;

  const bankColClass = (key) => `bank-col bank-col-${key}`;

  const bankHeaderDefs = [
    { key: "no", labelText: t("no"), sortable: true },
    { key: "supplier", labelText: t("supplier"), sortable: true },
    { key: "ccy", labelText: t("country"), sortable: true },
    { key: "bank", labelText: t("bank"), sortable: true },
    { key: "types", labelText: t("types"), sortable: true },
    { key: "owner", labelText: t("cardOwner"), sortable: true },
    { key: "contract", labelText: t("contract"), sortable: true },
    { key: "insurance", labelText: t("insurance"), sortable: true },
    { key: "customer", labelText: t("customer"), sortable: true },
    { key: "cost", labelText: t("cost"), sortable: true },
    { key: "price", labelText: t("price"), sortable: true },
    { key: "profit", labelText: t("profit"), sortable: true },
    { key: "status", labelText: t("status"), sortable: true },
    { key: "date", labelText: t("date"), sortable: true },
    { key: "action", labelText: t("action"), sortable: false },
  ];

  const bankHeaders = [...bankHeaderDefs];
  if (showSelectColumn) {
    bankHeaders.push({
      key: "bulk",
      isSelect: true,
      label:
        showHeaderSelectAll && deletableRows.length > 0 ? (
          <input
            type="checkbox"
            className="header-action-checkbox"
            title={t("selectAll")}
            aria-label={t("selectAllDeletableOnPage")}
            checked={allDeletableSelected}
            onChange={(e) => toggleHeaderSelectAll(e.target.checked)}
          />
        ) : null,
    });
  }

  const renderSortableHeader = (h) => (
    <div
      key={h.key}
      className={`header-item bank-header header-item--with-sort-icon header-sortable ${bankColClass(h.key)}`}
      role="button"
      tabIndex={0}
      onClick={() => onSort(h.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(h.key);
        }
      }}
    >
      <span className="header-item__label">{h.labelText}</span>
      <BankSortIcon column={h.key} sortColumn={sortColumn} sortDirection={sortDirection} />
    </div>
  );

  return (
    <div className={`process-table-wrapper${showSelectColumn ? " process-table-wrapper--select-col" : ""}`}>
      <div ref={headerRef} className="table-header" style={{ gridTemplateColumns: gridCols }}>
        {bankHeaders.map((h) => {
          if (h.isSelect) {
            return (
              <div key={h.key} className={`header-item bank-header header-item--select ${bankColClass("bulk")}`}>
                {h.label}
              </div>
            );
          }
          if (h.sortable) {
            return renderSortableHeader(h);
          }
          return (
            <div
              key={h.key}
              className={`header-item bank-header ${bankColClass(h.key)}${h.key === "action" ? " bank-action-header" : ""}`}
            >
              <span className="header-item__label">{h.labelText}</span>
            </div>
          );
        })}
      </div>
      <div ref={cardsRef} className="process-cards bank-mode">
        {tableLoading && (
          <div className="process-card">
            <div className="card-item" style={{ gridColumn: "1 / -1" }}>{t("loadData")}</div>
          </div>
        )}
        {!tableLoading && pageRows.length === 0 && (
          <div className="process-card">
            <div className="card-item" style={{ textAlign: "left", padding: 20, gridColumn: "1 / -1" }}>
              {t("noProcessDataFound")}
            </div>
          </div>
        )}
        {!tableLoading && pageRows.map((r, i) => (
          <div key={r.id} className="process-card" style={{ gridTemplateColumns: gridCols }}>
            <div className={`card-item ${bankColClass("no")}`}>{(showAll ? i : (currentPage - 1) * PAGE_SIZE + i) + 1}</div>
            <div className={`card-item ${bankColClass("supplier")}`}>{r.card_lower || "-"}</div>
            <div className={`card-item ${bankColClass("ccy")}`}>{r.country || "-"}</div>
            <div className={`card-item ${bankColClass("bank")}`}>{r.bank || "-"}</div>
            <div className={`card-item ${bankColClass("types")}`}>{r.type || "-"}</div>
            <div className={`card-item ${bankColClass("owner")}`}>{r.supplier || "-"}</div>
            <div className={`card-item bank-contract-cell ${bankColClass("contract")}`}>{renderBankContract(r.contract, r.day_start || r.date, r.day_end, lang)}</div>
            <div className={`card-item ${bankColClass("insurance")}`}>{r.insurance || "-"}</div>
            <div className={`card-item ${bankColClass("customer")}`}>{r.customer || "-"}</div>
            <div className={`card-item ${bankColClass("cost")}`}>{formatBankMoneyCell(r.cost)}</div>
            <div className={`card-item ${bankColClass("price")}`}>{formatBankMoneyCell(r.price)}</div>
            <div className={`card-item ${bankColClass("profit")}`}>{formatBankMoneyCell(r.profit)}</div>
            <div className={`card-item bank-status-cell ${bankColClass("status")}`}>
              <BankProcessStatusControl
                row={r}
                lang={lang}
                notify={notify}
                buildApiUrl={buildApiUrl}
                t={t}
                onUpdated={() => {
                  notifyTransactionDataChanged("bank-process-list-react");
                  void fetchRows();
                }}
              />
            </div>
            <div className={`card-item ${bankColClass("date")}`}>{r.date || "-"}</div>
            {showSelectColumn ? (
              <>
                <div className={`card-item bank-action-cell card-item--action ${bankColClass("action")}`}>
                  <span className="bank-action-tools">
                    <button type="button" className="edit-btn" aria-label={t("edit")} title={t("edit")} onClick={() => openEdit(r.id)}><img src={assetUrl("images/edit.svg")} alt={t("edit")} /></button>
                    <button type="button" className="edit-btn remark-action-btn" aria-label={t("remark")} title={t("remark")} onClick={() => openRemarkModal(r)} style={{ marginLeft: 6 }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 14, height: 14 }}>
                        <path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {canShowBankResend(r) ? (
                      <button type="button" className="bank-resend-btn" aria-label={t("resendToAccountingDue")} title={t("resend")} onClick={() => openResendModal(r)} style={{ marginLeft: 6 }}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 16, height: 16 }}>
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : null}
                  </span>
                </div>
                <div className="card-item card-item--select bank-row-select-cell">
                  {normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions ? (
                    <input
                      type="checkbox"
                      className="row-checkbox bank-checkbox"
                      checked={selectedIds.has(r.id)}
                      title={t("selectForDeletion")}
                      aria-label={t("selectForDeletion")}
                      onChange={() =>
                        setSelectedIds((prev) => {
                          const n = new Set(prev);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                  ) : (
                    <span className="user-row-select-placeholder" aria-hidden="true" />
                  )}
                </div>
              </>
            ) : (
              <div className={`card-item ${bankColClass("action")}`}>
                <span className="bank-action-tools">
                  <button type="button" className="edit-btn" aria-label={t("edit")} title={t("edit")} onClick={() => openEdit(r.id)}><img src={assetUrl("images/edit.svg")} alt={t("edit")} /></button>
                  <button type="button" className="edit-btn remark-action-btn" aria-label={t("remark")} title={t("remark")} onClick={() => openRemarkModal(r)} style={{ marginLeft: 6 }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 14, height: 14 }}>
                      <path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {canShowBankResend(r) ? (
                    <button type="button" className="bank-resend-btn" aria-label={t("resendToAccountingDue")} title={t("resend")} onClick={() => openResendModal(r)} style={{ marginLeft: 6 }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 16, height: 16 }}>
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : null}
                </span>
                {normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions ? (
                  <input type="checkbox" className="row-checkbox bank-checkbox" style={{ marginLeft: 10 }} checked={selectedIds.has(r.id)} title={t("selectForDeletion")} onChange={() => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
