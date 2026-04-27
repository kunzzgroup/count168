import React, { useLayoutEffect, useRef } from "react";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import { BANK_GRID_TEMPLATE_COLUMNS, canShowBankResend, normalizeBankProcessStatus, notifyTransactionDataChanged } from "../bankProcessHelpers.js";
import BankProcessStatusControl from "./BankProcessStatusControl.jsx";

function renderBankContract(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return (
    <span className="contract-badge contract-active bank-contract-pill">
      {text}
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
}) {
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
    { key: "no", label: "No" },
    {
      key: "supplier",
      label: (
        <span className="bank-header-sortable" onClick={() => setSupplierSortDir((d) => (d === "asc" ? "desc" : "asc"))} role="presentation">
          Supplier <span className="bank-sort-indicator">{supplierSortDir === "asc" ? "▲" : "▼"}</span>
        </span>
      ),
    },
    { key: "ccy", label: "Country" },
    { key: "bank", label: "Bank" },
    { key: "types", label: "Types" },
    { key: "owner", label: "Card Owner" },
    { key: "contract", label: "Contract" },
    { key: "insurance", label: "Insurance" },
    { key: "customer", label: "Customer" },
    { key: "cost", label: "Cost" },
    { key: "price", label: "Price" },
    { key: "profit", label: "Profit" },
    { key: "status", label: "Status" },
    { key: "date", label: "Date" },
    { key: "action", label: "Action" },
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
        {tableLoading && <div className="process-card"><div className="card-item">Loading...</div></div>}
        {!tableLoading && pageRows.map((r, i) => (
          <div key={r.id} className="process-card" style={{ gridTemplateColumns: BANK_GRID_TEMPLATE_COLUMNS }}>
            <div className="card-item">{(showAll ? i : (currentPage - 1) * PAGE_SIZE + i) + 1}</div>
            <div className="card-item">{r.card_lower || "-"}</div>
            <div className="card-item">{r.country || "-"}</div>
            <div className="card-item">{r.bank || "-"}</div>
            <div className="card-item">{r.type || "-"}</div>
            <div className="card-item">{r.supplier || "-"}</div>
            <div className="card-item bank-contract-cell">{renderBankContract(r.contract)}</div>
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
                onUpdated={() => {
                  notifyTransactionDataChanged("bank-process-list-react");
                  void fetchRows();
                }}
              />
            </div>
            <div className="card-item">{r.date || "-"}</div>
            <div className="card-item">
              <span className="bank-action-tools">
                <button type="button" className="edit-btn" aria-label="Edit" title="Edit" onClick={() => openEdit(r.id)}><img src={assetUrl("images/edit.svg")} alt="Edit" /></button>
                <button type="button" className="edit-btn remark-action-btn" aria-label="Remark" title="Remark" onClick={() => openRemarkModal(r)} style={{ marginLeft: 6 }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 14, height: 14 }}>
                    <path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {canShowBankResend(r) ? (
                  <button type="button" className="bank-resend-btn" aria-label="Resend to Accounting Due" title="Resend" onClick={() => openResendModal(r)} style={{ marginLeft: 6 }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 16, height: 16 }}>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : null}
              </span>
              {normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions ? (
                <input type="checkbox" className="row-checkbox bank-checkbox" style={{ marginLeft: 10 }} checked={selectedIds.has(r.id)} title="Select for deletion" onChange={() => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
