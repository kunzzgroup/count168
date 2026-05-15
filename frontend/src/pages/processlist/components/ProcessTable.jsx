import React from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { GAMES_PROCESS_GRID_COLUMNS, GAMES_PROCESS_GRID_COLUMNS_WITH_SELECT } from "../processListHelpers.js";

function upperCell(val) {
  if (val == null || val === "") return "";
  return String(val).toUpperCase();
}

function ProcessTableSortIcon() {
  return (
    <span className="account-sort-icon is-active is-asc" aria-hidden="true">
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );
}

export default function ProcessTable({
  tableLoading,
  showAll,
  showSelectColumn,
  pageRows,
  currentPage,
  PAGE_SIZE,
  selectedIds,
  toggleStatus,
  openEdit,
  toggleSelectId,
  toggleSelectAll,
  mutationsBlocked,
  t,
}) {
  const deletableRows = pageRows.filter(
    (r) => String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions
  );
  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((r) => selectedIds.has(r.id));

  const gridCols = showSelectColumn ? GAMES_PROCESS_GRID_COLUMNS_WITH_SELECT : GAMES_PROCESS_GRID_COLUMNS;
  const headerStyle = { gridTemplateColumns: gridCols };
  const rowStyle = { gridTemplateColumns: gridCols };

  return (
    <div
      className={`process-table-wrapper${showSelectColumn ? " process-table-wrapper--select-col" : ""}`}
      id="processTableWrapper"
      style={showAll ? { overflow: "visible" } : undefined}
    >
      <div className="table-header" id="tableHeader" style={headerStyle}>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("noColumn")}</span>
          <ProcessTableSortIcon />
        </div>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("processId")}</span>
          <ProcessTableSortIcon />
        </div>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("description")}</span>
          <ProcessTableSortIcon />
        </div>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("status")}</span>
          <ProcessTableSortIcon />
        </div>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("currencyColumn")}</span>
          <ProcessTableSortIcon />
        </div>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("dayUse")}</span>
          <ProcessTableSortIcon />
        </div>
        <div className="header-item gambling-header header-item--with-sort-icon">
          <span className="header-item__label">{t("action")}</span>
          <ProcessTableSortIcon />
        </div>
        {showSelectColumn ? (
          <div className="header-item gambling-header header-item--select">
            {deletableRows.length > 0 ? (
              <input
                type="checkbox"
                title={t("selectAll")}
                aria-label={t("selectAllInactiveOnPage")}
                checked={allDeletableSelected}
                disabled={mutationsBlocked}
                onChange={(e) => toggleSelectAll(e.target.checked)}
              />
            ) : null}
          </div>
        ) : null}
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
                  }${mutationsBlocked ? "" : " status-clickable"}`}
                  title={mutationsBlocked ? t("readOnlyActionBlocked") : t("clickToggleStatus")}
                  onClick={mutationsBlocked ? undefined : () => toggleStatus(row)}
                  role="button"
                  style={mutationsBlocked ? { cursor: "not-allowed" } : undefined}
                >
                  {String(row.status || "").toUpperCase()}
                </span>
              </div>
              <div className="card-item">{upperCell(row.currency)}</div>
              <div className="card-item">{upperCell(row.day_use)}</div>
              <div className="card-item card-item--action">
                <button
                  type="button"
                  className="btn btn-edit edit-btn"
                  disabled={mutationsBlocked}
                  onClick={() => openEdit(row.id)}
                  aria-label={t("edit")}
                  title={t("edit")}
                >
                  <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                </button>
              </div>
              {showSelectColumn ? (
                <div className="card-item card-item--select">
                  {String(row.status || "").toLowerCase() === "inactive" && !row.has_transactions ? (
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      title={t("selectForDeletion")}
                      aria-label={t("selectForDeletion")}
                      checked={selectedIds.has(row.id)}
                      disabled={mutationsBlocked}
                      onChange={() => toggleSelectId(row.id)}
                    />
                  ) : (
                    <span className="user-row-select-placeholder" aria-hidden="true" />
                  )}
                </div>
              ) : null}
            </div>
          ))}
      </div>
    </div>
  );
}
