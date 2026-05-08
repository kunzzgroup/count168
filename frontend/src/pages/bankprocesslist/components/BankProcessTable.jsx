import React, { useLayoutEffect, useRef } from "react";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import { BANK_GRID_TEMPLATE_COLUMNS, canShowBankResend, normalizeBankProcessStatus, notifyTransactionDataChanged } from "../bankProcessHelpers.js";
import BankProcessStatusControl from "./BankProcessStatusControl.jsx";

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

function renderBankContract(value, dayStart, dayEnd) {
  const text = String(value || "").trim();
  if (!text) return "-";
  
  const contractMap = { '1': '1 MONTH', '1 month': '1 MONTH', '2': '2 MONTHS', '2 months': '2 MONTHS', '3': '3 MONTHS', '3 months': '3 MONTHS', '6': '6 MONTHS', '6 months': '6 MONTHS', '1+1': '1+1 MONTH', '1+2': '1+2 MONTHS', '1+3': '1+3 MONTHS' };
  const contractRaw = contractMap[text] || text;
  
  const baseContractClass = getContractStateClass(dayStart || null, dayEnd || null);
  const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
  const contractClass = (grayContracts.indexOf(contractRaw) !== -1 && baseContractClass === 'contract-active')
      ? 'contract-1month-active'
      : baseContractClass;

  return (
    <span className={`contract-badge ${contractClass} bank-contract-pill`}>
      {contractRaw}
    </span>
  );
}

export default function BankProcessTable({
  tableLoading,
  showAll,
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
  supplierSortDir,
  setSupplierSortDir,
  showHeaderSelectAll,
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
      if (!headerEl || !cardsEl) return;
      const rect = headerEl.getBoundingClientRect();
      cardsEl.style.setProperty("--table-header-width", `${rect.width}px`);
    };

    // Keep Bank list row width exactly aligned with the rendered header width.
    const raf1 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncHeaderWidth);
    });

    const onResize = () => syncHeaderWidth();
    window.addEventListener("resize", onResize);

    let ro = null;
    if (typeof window.ResizeObserver === "function" && headerRef.current) {
      ro = new window.ResizeObserver(() => syncHeaderWidth());
      ro.observe(headerRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [pageRows.length, showAll, supplierSortDir]);

  const bankHeaders = [
    { key: "no", label: t("no") },
    {
      key: "supplier",
      label: (
        <span className="bank-header-sortable" onClick={() => setSupplierSortDir((d) => (d === "asc" ? "desc" : "asc"))} role="presentation">
          {t("supplier")} <span className="bank-sort-indicator">{supplierSortDir === "asc" ? "▲" : "▼"}</span>
        </span>
      ),
    },
    { key: "ccy", label: t("country") },
    { key: "bank", label: t("bank") },
    { key: "types", label: t("types") },
    { key: "owner", label: t("cardOwner") },
    { key: "contract", label: t("contract") },
    { key: "insurance", label: t("insurance") },
    { key: "customer", label: t("customer") },
    { key: "cost", label: t("cost") },
    { key: "price", label: t("price") },
    { key: "profit", label: t("profit") },
    { key: "status", label: t("status") },
    { key: "date", label: t("date") },
    {
      key: "action",
      label: (
        <>
          {t("action")}
          {showHeaderSelectAll && deletableRows.length > 0 ? (
            <input
              type="checkbox"
              className="header-action-checkbox"
              title={t("selectAll")}
              aria-label={t("selectAllDeletableOnPage")}
              checked={allDeletableSelected}
              onChange={(e) => toggleHeaderSelectAll(e.target.checked)}
              style={{ marginLeft: 10, cursor: "pointer" }}
            />
          ) : null}
        </>
      ),
    },
  ];

  return (
    <div className="process-table-wrapper">
      <div ref={headerRef} className="table-header" style={{ gridTemplateColumns: BANK_GRID_TEMPLATE_COLUMNS }}>
        {bankHeaders.map((h) => (
          <div key={h.key} className={`header-item bank-header${h.key === "action" ? " bank-action-header" : ""}`}>
            {h.label}
          </div>
        ))}
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
          <div key={r.id} className="process-card" style={{ gridTemplateColumns: BANK_GRID_TEMPLATE_COLUMNS }}>
            <div className="card-item">{(showAll ? i : (currentPage - 1) * PAGE_SIZE + i) + 1}</div>
            <div className="card-item">{r.card_lower || "-"}</div>
            <div className="card-item">{r.country || "-"}</div>
            <div className="card-item">{r.bank || "-"}</div>
            <div className="card-item">{r.type || "-"}</div>
            <div className="card-item">{r.supplier || "-"}</div>
            <div className="card-item bank-contract-cell">{renderBankContract(r.contract, r.day_start || r.date, r.day_end)}</div>
            <div className="card-item">{r.insurance || "-"}</div>
            <div className="card-item">{r.customer || "-"}</div>
            <div className="card-item">{r.cost || "-"}</div>
            <div className="card-item">{r.price || "-"}</div>
            <div className="card-item">{r.profit || "-"}</div>
            <div className="card-item bank-status-cell">
              <BankProcessStatusControl
                row={r}
                notify={notify}
                buildApiUrl={buildApiUrl}
                t={t}
                onUpdated={() => {
                  notifyTransactionDataChanged("bank-process-list-react");
                  void fetchRows();
                }}
              />
            </div>
            <div className="card-item">{r.date || "-"}</div>
            <div className="card-item">
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
          </div>
        ))}
      </div>
    </div>
  );
}
