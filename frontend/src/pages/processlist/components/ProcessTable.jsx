import React from "react";
import { assetUrl } from "../../../utils/apiUrl.js";

export default function ProcessTable({
  tableLoading,
  showAll,
  pageRows,
  currentPage,
  PAGE_SIZE,
  selectedIds,
  toggleStatus,
  openEdit,
  toggleSelectId,
}) {
  return (
    <div
      className="process-table-wrapper"
      id="processTableWrapper"
      style={showAll ? { overflow: "visible" } : undefined}
    >
      <div className="table-header" id="tableHeader">
        <div className="header-item">No</div>
        <div className="header-item">Process ID</div>
        <div className="header-item">Description</div>
        <div className="header-item">Status</div>
        <div className="header-item">Currency</div>
        <div className="header-item">Day Use</div>
        <div className="header-item">Action</div>
      </div>
      <div
        className="process-cards"
        id="processTableBody"
        style={
          showAll
            ? { maxHeight: "none", overflowY: "visible", overflowX: "visible", display: "block" }
            : undefined
        }
      >
        {tableLoading && (
          <div className="process-card">
            <div className="card-item">Loading...</div>
          </div>
        )}
        {!tableLoading &&
          pageRows.map((row, idx) => (
            <div
              className="process-card"
              key={row.id}
              style={showAll ? { flex: "none", minHeight: 26, alignItems: "center" } : undefined}
            >
              <div className="card-item">
                {(showAll ? idx : (currentPage - 1) * PAGE_SIZE + idx) + 1}
              </div>
              <div className="card-item">{row.process_name}</div>
              <div className="card-item">{row.description || "-"}</div>
              <div className="card-item">
                <span
                  className={`role-badge ${
                    row.status === "active" ? "status-active" : "status-inactive"
                  } status-clickable`}
                  title="Click to toggle status"
                  onClick={() => toggleStatus(row)}
                  role="button"
                >
                  {String(row.status || "").toUpperCase()}
                </span>
              </div>
              <div className="card-item">{row.currency || "-"}</div>
              <div className="card-item">{row.day_use || "-"}</div>
              <div className="card-item">
                <button
                  type="button"
                  className="edit-btn"
                  onClick={() => openEdit(row.id)}
                  aria-label="Edit"
                  title="Edit"
                >
                  <img src={assetUrl("images/edit.svg")} alt="Edit" />
                </button>
                {String(row.status || "").toLowerCase() === "inactive" && !row.has_transactions && (
                  <input
                    type="checkbox"
                    style={{ marginLeft: 10 }}
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelectId(row.id)}
                  />
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
