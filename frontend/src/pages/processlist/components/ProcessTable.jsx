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
  t,
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
        <div className="header-item gambling-header">{t("noColumn")}</div>
        <div className="header-item gambling-header">{t("processId")}</div>
        <div className="header-item gambling-header">{t("description")}</div>
        <div className="header-item gambling-header">{t("status")}</div>
        <div className="header-item gambling-header">{t("currency")}</div>
        <div className="header-item gambling-header">{t("dayUse")}</div>
        <div className="header-item gambling-header">
          {t("action")}
          {deletableRows.length > 0 ? (
            <input
              type="checkbox"
              title={t("selectAll")}
              aria-label={t("selectAllInactiveOnPage")}
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
              {t("loadingData")}
            </div>
          </div>
        )}
        {!tableLoading && pageRows.length === 0 && (
          <div className="process-card">
            <div className="card-item" style={{ textAlign: "left", padding: 20, gridColumn: "1 / -1" }}>
              {t("noProcessData")}
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
                  title={t("clickToggleStatus")}
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
                  aria-label={t("edit")}
                  title={t("edit")}
                >
                  <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                </button>
                {String(row.status || "").toLowerCase() === "inactive" && !row.has_transactions && (
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    title={t("selectForDeletion")}
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
