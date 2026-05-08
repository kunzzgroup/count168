import React from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { GAMES_PROCESS_GRID_COLUMNS } from "../processListHelpers.js";

function upperCell(val) {
  if (val == null || val === "") return "";
  return String(val).toUpperCase();
}

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
  toggleSelectAll,
}) {
  const deletableRows = pageRows.filter(
    (r) => String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions
  );
  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((r) => selectedIds.has(r.id));

  const headerStyle = { gridTemplateColumns: GAMES_PROCESS_GRID_COLUMNS };
  const rowStyle = { gridTemplateColumns: GAMES_PROCESS_GRID_COLUMNS };

  return (
    <div
      className="process-table-wrapper"
      id="processTableWrapper"
      style={showAll ? { overflow: "visible" } : undefined}
    >
      <div className="table-header" id="tableHeader" style={headerStyle}>
        <div className="header-item gambling-header">No</div>
        <div className="header-item gambling-header">Process ID</div>
        <div className="header-item gambling-header">Description</div>
        <div className="header-item gambling-header">Status</div>
        <div className="header-item gambling-header">Currency</div>
        <div className="header-item gambling-header">Day Use</div>
        <div className="header-item gambling-header">
          Action
          {deletableRows.length > 0 ? (
            <input
              type="checkbox"
              title="Select all"
              aria-label="Select all inactive processes on this page"
              checked={allDeletableSelected}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              style={{ marginLeft: 10, cursor: "pointer", display: "inline-block" }}
            />
          ) : null}
        </div>
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
            <div className="card-item" style={{ gridColumn: "1 / -1" }}>
              Load the Data...
            </div>
          </div>
        )}
        {!tableLoading && pageRows.length === 0 && (
          <div className="process-card">
            <div className="card-item" style={{ textAlign: "left", padding: 20, gridColumn: "1 / -1" }}>
              No process data found
            </div>
          </div>
        )}
        {!tableLoading &&
          pageRows.map((row, idx) => (
            <div
              className="process-card"
              key={row.id}
              data-id={row.id}
              style={
                showAll
                  ? { flex: "none", minHeight: 26, alignItems: "center", ...rowStyle }
                  : rowStyle
              }
            >
              <div className="card-item">
                {(showAll ? idx : (currentPage - 1) * PAGE_SIZE + idx) + 1}
              </div>
              <div className="card-item">{upperCell(row.process_name)}</div>
              <div className="card-item">{upperCell(row.description)}</div>
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
              <div className="card-item">{upperCell(row.currency)}</div>
              <div className="card-item">{upperCell(row.day_use)}</div>
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
                    className="row-checkbox"
                    title="Select for deletion"
                    style={{ marginLeft: 10, cursor: "pointer" }}
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
