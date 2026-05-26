import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import PageContentLoader from "../../components/PageContentLoader.jsx";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { getAutoRenewText } from "../../translateFile/pages/autoRenewTranslate.js";
import { formatDate, formatDomainFeeDisplay2 } from "../domain/domainHelpers.js";
import {
  approveAutoRenew,
  AUTO_RENEW_PERIODS,
  fetchAutoRenewApprovals,
  rejectAutoRenew,
} from "./autoRenewLogic.js";
import {
  AUTO_RENEW_PAGE_SIZE,
  canApproveRow,
  filterAutoRenewRows,
  formatRemainingForRow,
  getRowDraftValues,
  paginateRows,
  periodToLabelKey,
  sortAutoRenewRows,
} from "./autoRenewPageHelpers.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/admin-responsive.css";
import "../../../public/css/auto_renew.css";

function FilterChip({ active, label, count, onClick }) {
  return (
    <button type="button" className={`user-filter-chip${active ? " is-selected" : ""}`} aria-pressed={active} onClick={onClick}>
      <span className="user-filter-chip__dot" aria-hidden>
        {active ? (
          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12l4 4 8-8" />
          </svg>
        ) : null}
      </span>
      <span className="user-filter-chip__label">
        {label}
        {count != null ? <span className="auto-renew-chip-count">{count}</span> : null}
      </span>
    </button>
  );
}

function EmptyState({ statusFilter, searchTerm, t }) {
  const hintKey =
    searchTerm.trim() !== ""
      ? "noResults"
      : statusFilter === "approved"
        ? "emptyHintApproved"
        : statusFilter === "rejected"
          ? "emptyHintRejected"
          : statusFilter === "all"
            ? "emptyHintAll"
            : "emptyHintPending";

  return (
    <div className="auto-renew-empty-state" role="status">
      <div className="auto-renew-empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="auto-renew-empty-state__title">
        {searchTerm.trim() ? t("noResults") : t("emptyTitle")}
      </p>
      <p className="auto-renew-empty-state__hint">{t(hintKey)}</p>
    </div>
  );
}

function AccountSelect({ value, accounts, placeholder, disabled, onChange }) {
  return (
    <select
      className="auto-renew-inline-select"
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
    >
      <option value="">{placeholder}</option>
      {(accounts || []).map((acc) => (
        <option key={acc.id} value={acc.id}>
          {acc.account_code}{acc.name ? ` — ${acc.name}` : ""}
        </option>
      ))}
    </select>
  );
}

export default function AutoRenewPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAutoRenewText(lang, key, params), [lang]);

  const [bootDone, setBootDone] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [canEditGlobal, setCanEditGlobal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState("expiration");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowDrafts, setRowDrafts] = useState({});
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2500);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("user-page", "auto-renew-page-body");
    return () => {
      document.body.classList.remove("user-page", "auto-renew-page-body");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  const loadList = useCallback(async (status) => {
    const data = await fetchAutoRenewApprovals(status);
    setRows(Array.isArray(data?.rows) ? data.rows : []);
    setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    setCounts(data?.counts || { pending: 0, approved: 0, rejected: 0, total: 0 });
    setCanEditGlobal(Boolean(data?.can_edit));
    setRowDrafts({});
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootDone(false);
    setLoadError("");

    (async () => {
      if (!me.has_c168_auto_renew_access) {
        navigate("/dashboard", { replace: true });
        return;
      }

      try {
        await loadList(statusFilter);
        if (!cancelled) setBootDone(true);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || "load");
        setBootDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, navigate, sessionReady, statusFilter, loadList]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortColumn, sortDirection]);

  const updateDraft = useCallback((requestId, patch) => {
    setRowDrafts((prev) => ({
      ...prev,
      [requestId]: { ...(prev[requestId] || {}), ...patch },
    }));
  }, []);

  const handleApprove = useCallback(async (row) => {
    if (!canEditGlobal || busyRequestId) return;
    const { period, fromAccountId, toAccountId } = getRowDraftValues(row, rowDrafts);
    if (!canApproveRow(row, rowDrafts)) return;

    if (!window.confirm(t("confirmApprove", { company: row.company_code }))) return;

    setBusyRequestId(row.request_id);
    try {
      await approveAutoRenew({
        requestId: row.request_id,
        period,
        fromAccountId,
        toAccountId,
      });
      notify(t("approvedSuccess"), "success");
      await loadList(statusFilter);
    } catch (err) {
      notify(t("approveFailed", { message: err.message }), "error");
    } finally {
      setBusyRequestId(null);
    }
  }, [busyRequestId, canEditGlobal, loadList, notify, rowDrafts, statusFilter, t]);

  const handleReject = useCallback(async (row) => {
    if (!canEditGlobal || busyRequestId) return;
    if (!window.confirm(t("confirmReject", { company: row.company_code }))) return;

    setBusyRequestId(row.request_id);
    try {
      await rejectAutoRenew({ requestId: row.request_id });
      notify(t("rejectedSuccess"), "success");
      await loadList(statusFilter);
    } catch (err) {
      notify(t("rejectFailed", { message: err.message }), "error");
    } finally {
      setBusyRequestId(null);
    }
  }, [busyRequestId, canEditGlobal, loadList, notify, statusFilter, t]);

  const handleSort = useCallback(
    (column) => {
      setSortDirection((dir) => (sortColumn === column && dir === "asc" ? "desc" : "asc"));
      setSortColumn(column);
    },
    [sortColumn],
  );

  const filteredRows = useMemo(
    () => sortAutoRenewRows(filterAutoRenewRows(rows, { searchTerm }), sortColumn, sortDirection),
    [rows, searchTerm, sortColumn, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredRows, currentPage, AUTO_RENEW_PAGE_SIZE),
    [filteredRows, currentPage],
  );

  const renderSortIcon = (column) => (
    <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );

  const renderHeader = (column, label) => (
    <div
      className="header-item header-item--with-sort-icon header-sortable"
      role="button"
      tabIndex={0}
      onClick={() => handleSort(column)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSort(column);
        }
      }}
    >
      <span className="header-item__label">{label}</span>
      {renderSortIcon(column)}
    </div>
  );

  const renderStatusCell = (row) => {
    if (row.status === "pending" && canEditGlobal) {
      const approveEnabled = canApproveRow(row, rowDrafts) && busyRequestId !== row.request_id;
      return (
        <div className="auto-renew-action-btns">
          <button
            type="button"
            className="auto-renew-btn auto-renew-btn-primary auto-renew-btn--sm"
            disabled={!approveEnabled}
            title={!row.price ? t("noPriceHint") : undefined}
            onClick={() => handleApprove(row)}
          >
            {busyRequestId === row.request_id ? t("processing") : t("approve")}
          </button>
          <button
            type="button"
            className="auto-renew-btn auto-renew-btn-secondary auto-renew-btn--sm"
            disabled={busyRequestId === row.request_id}
            onClick={() => handleReject(row)}
          >
            {t("reject")}
          </button>
        </div>
      );
    }

    const statusClass =
      row.status === "approved" ? "is-approved" : row.status === "rejected" ? "is-rejected" : "is-pending";
    return (
      <span className={`auto-renew-approval-badge ${statusClass}`}>
        {t(`status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`)}
      </span>
    );
  };

  if (!sessionReady || !bootDone) {
    return <PageContentLoader />;
  }

  if (loadError) {
    return (
      <div className="auto-renew-page">
        <div className="auto-renew-notice warn">{t("loadFailed", { message: loadError })}</div>
      </div>
    );
  }

  return (
    <>
      <div className="auto-renew-toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`auto-renew-toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      <div className="container auto-renew-page">
        <div className="content">
          <header className="auto-renew-page-header">
            <h1 className="auto-renew-page-title">{t("pageTitle")}</h1>
            <p className="auto-renew-page-subtitle">{t("pageSubtitle")}</p>
          </header>

          <div className="auto-renew-toolbar-panel">
            <div className="action-buttons-container">
              <div className="action-buttons">
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div className="search-container userlist-search-bar">
                    <span className="userlist-search-bar__icon" aria-hidden="true">
                      <svg fill="currentColor" viewBox="0 0 24 24">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      className="search-input userlist-search-input"
                      placeholder={t("searchPlaceholder")}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="userlist-filter-chips auto-renew-filter-chips" role="group" aria-label={t("filterGroupLabel")}>
                    <FilterChip
                      active={statusFilter === "pending"}
                      label={t("filterPending")}
                      count={counts.pending}
                      onClick={() => setStatusFilter("pending")}
                    />
                    <FilterChip
                      active={statusFilter === "approved"}
                      label={t("filterApproved")}
                      count={counts.approved}
                      onClick={() => setStatusFilter("approved")}
                    />
                    <FilterChip
                      active={statusFilter === "rejected"}
                      label={t("filterRejected")}
                      count={counts.rejected}
                      onClick={() => setStatusFilter("rejected")}
                    />
                    <FilterChip
                      active={statusFilter === "all"}
                      label={t("filterShowAll")}
                      count={counts.total}
                      onClick={() => setStatusFilter("all")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!canEditGlobal && (
            <div className="auto-renew-notice warn">{t("readOnlyNotice")}</div>
          )}

          <div className="auto-renew-table-panel">
          <div className="user-list-table auto-renew-table">
            <div className="user-list-table-inner">
              <div className="table-header user-list-table-header auto-renew-table-header">
                <div className="header-item"><span className="header-item__label">{t("colNo")}</span></div>
                {renderHeader("company", t("colCompany"))}
                {renderHeader("name", t("colName"))}
                {renderHeader("price", t("colPrice"))}
                {renderHeader("expiration", t("colExpiration"))}
                {renderHeader("remaining", t("colRemaining"))}
                {renderHeader("period", t("colPeriod"))}
                {renderHeader("status", t("colStatus"))}
                <div className="header-item"><span className="header-item__label">{t("colFromAccount")}</span></div>
                <div className="header-item"><span className="header-item__label">{t("colToAccount")}</span></div>
              </div>

              <div className="user-cards auto-renew-cards" aria-busy={Boolean(busyRequestId)}>
                {pagination.rows.length === 0 ? (
                  <EmptyState statusFilter={statusFilter} searchTerm={searchTerm} t={t} />
                ) : (
                  pagination.rows.map((row, idx) => {
                    const globalIdx = (pagination.page - 1) * AUTO_RENEW_PAGE_SIZE + idx + 1;
                    const isPendingEditable = row.status === "pending" && canEditGlobal;
                    const draft = getRowDraftValues(row, rowDrafts);
                    const rowBusy = busyRequestId === row.request_id;

                    return (
                      <div
                        key={row.request_id}
                        className={`user-card user-list-row auto-renew-table-row show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`}
                      >
                        <div className="card-item auto-renew-table-muted">{globalIdx}</div>
                        <div className="card-item card-item--strong">{row.company_code}</div>
                        <div className="card-item">{row.owner_name || "-"}</div>
                        <div className="card-item">
                          {row.price ? formatDomainFeeDisplay2(row.price) : <span className="auto-renew-table-muted">—</span>}
                        </div>
                        <div className="card-item">{row.expiration_date ? formatDate(row.expiration_date) : "-"}</div>
                        <div className="card-item">
                          <span className={`auto-renew-status-badge ${row.expiration_status || "normal"}`}>
                            {formatRemainingForRow(row, t)}
                          </span>
                        </div>
                        <div className="card-item">
                          {isPendingEditable ? (
                            <select
                              className="auto-renew-inline-select"
                              value={draft.period}
                              disabled={rowBusy}
                              onChange={(e) => updateDraft(row.request_id, { period: e.target.value })}
                            >
                              <option value="">{t("selectPeriod")}</option>
                              {AUTO_RENEW_PERIODS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {t(p.labelKey)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{row.period ? t(periodToLabelKey(row.period)) : "-"}</span>
                          )}
                        </div>
                        <div className="card-item">{renderStatusCell(row)}</div>
                        <div className="card-item">
                          {isPendingEditable ? (
                            <AccountSelect
                              value={draft.fromAccountId}
                              accounts={accounts}
                              placeholder={t("selectFromAccount")}
                              disabled={rowBusy}
                              onChange={(val) => updateDraft(row.request_id, { fromAccountId: val })}
                            />
                          ) : (
                            <span className="auto-renew-table-muted">
                              {accounts.find((a) => a.id === row.from_account_id)?.account_code || "-"}
                            </span>
                          )}
                        </div>
                        <div className="card-item">
                          {isPendingEditable ? (
                            <AccountSelect
                              value={draft.toAccountId}
                              accounts={accounts}
                              placeholder={t("selectToAccount")}
                              disabled={rowBusy}
                              onChange={(val) => updateDraft(row.request_id, { toAccountId: val })}
                            />
                          ) : (
                            <span className="auto-renew-table-muted">
                              {accounts.find((a) => a.id === row.to_account_id)?.account_code || "-"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {filteredRows.length > 0 && (
            <div className="pagination-container auto-renew-pagination">
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label={t("prevPage")}
              >
                ◀
              </button>
              <span className="pagination-info">
                {t("pageInfo", { page: pagination.page, total: pagination.totalPages, count: filteredRows.length })}
              </span>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                aria-label={t("nextPage")}
              >
                ▶
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </>
  );
}
