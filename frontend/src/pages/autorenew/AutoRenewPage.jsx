import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl } from "../../utils/core/apiUrl.js";
import { formatDate } from "../domain/domainHelpers.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import PageContentLoader from "../../components/PageContentLoader.jsx";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { getAutoRenewText } from "../../translateFile/pages/autoRenewTranslate.js";
import {
  fetchAutoRenewCompanies,
  fetchAutoRenewSettings,
  saveAutoRenewSettings,
} from "./autoRenewLogic.js";
import {
  AUTO_RENEW_FILTER_KEYS,
  AUTO_RENEW_PAGE_SIZE,
  filterAutoRenewRows,
  formatRemainingForRow,
  paginateRows,
  sortAutoRenewRows,
} from "./autoRenewPageHelpers.js";
import AutoRenewEditModal, { AutoRenewPeriodCell } from "./components/AutoRenewEditModal.jsx";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/auto_renew.css";
import "../../../public/css/domain.css";

function FilterChip({ active, label, onClick }) {
  return (
    <button type="button" className={`user-filter-chip${active ? " is-selected" : ""}`} aria-pressed={active} onClick={onClick}>
      <span className="user-filter-chip__dot" aria-hidden>
        {active ? (
          <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12l4 4 8-8" />
          </svg>
        ) : null}
      </span>
      <span className="user-filter-chip__label">{label}</span>
    </button>
  );
}

export default function AutoRenewPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAutoRenewText(lang, key, params), [lang]);

  const [bootDone, setBootDone] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [canEditGlobal, setCanEditGlobal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState(() =>
    Object.fromEntries(AUTO_RENEW_FILTER_KEYS.map((key) => [key, false])),
  );
  const [sortColumn, setSortColumn] = useState("company");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [editRow, setEditRow] = useState(null);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editPeriod, setEditPeriod] = useState("1month");
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2500);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "auto-renew-page-body");
    return () => {
      document.body.classList.remove("auto-renew-page-body");
    };
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
        const listData = await fetchAutoRenewCompanies();
        if (cancelled) return;
        setCompanies(Array.isArray(listData?.companies) ? listData.companies : []);
        setCanEditGlobal(Boolean(listData?.can_edit));
        setBootDone(true);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || "load");
        setBootDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, navigate, sessionReady]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, sortColumn, sortDirection]);

  const toggleFilter = useCallback((key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSort = useCallback(
    (column) => {
      setSortDirection((dir) => (sortColumn === column && dir === "asc" ? "desc" : "asc"));
      setSortColumn(column);
    },
    [sortColumn],
  );

  const filteredRows = useMemo(
    () => sortAutoRenewRows(filterAutoRenewRows(companies, { searchTerm, filters }), sortColumn, sortDirection),
    [companies, filters, searchTerm, sortColumn, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredRows, currentPage, AUTO_RENEW_PAGE_SIZE),
    [filteredRows, currentPage],
  );

  const openEdit = useCallback(async (row) => {
    setEditRow(row);
    setEditEnabled(Boolean(row.auto_renew_enabled));
    setEditPeriod(row.auto_renew_period || "1month");
    setEditLoading(true);
    try {
      const fresh = await fetchAutoRenewSettings(row.company_numeric_id);
      setEditRow({ ...row, ...fresh });
      setEditEnabled(Boolean(fresh.auto_renew_enabled));
      setEditPeriod(fresh.auto_renew_period || "1month");
    } catch (err) {
      notify(t("loadFailed", { message: err.message }), "error");
      setEditRow(null);
    } finally {
      setEditLoading(false);
    }
  }, [notify, t]);

  const closeEdit = useCallback(() => {
    if (saving) return;
    setEditRow(null);
  }, [saving]);

  const handleSave = useCallback(async () => {
    if (!editRow || saving) return;
    setSaving(true);
    try {
      const saved = await saveAutoRenewSettings({
        targetCompanyId: editRow.company_numeric_id,
        autoRenewEnabled: editEnabled,
        autoRenewPeriod: editEnabled ? editPeriod : null,
      });
      setCompanies((prev) =>
        prev.map((row) =>
          row.company_numeric_id === editRow.company_numeric_id ? { ...row, ...saved } : row,
        ),
      );
      notify(t("saved"), "success");
      setEditRow(null);
    } catch (err) {
      notify(t("saveFailed", { message: err.message }), "error");
    } finally {
      setSaving(false);
    }
  }, [editEnabled, editPeriod, editRow, notify, saving, t]);

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

      <div className="container auto-renew-page-container">
        <div className="content">
          <div className="action-buttons-container">
            <div className="action-buttons">
              <div className="account-toolbar-top-row">
                <div className="action-controls-row account-toolbar-primary">
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
                  <div className="userlist-filter-chips" role="group" aria-label={t("filterGroupLabel")}>
                    <FilterChip active={filters.showAutoRenew} label={t("filterShowAutoRenew")} onClick={() => toggleFilter("showAutoRenew")} />
                    <FilterChip active={filters.autoRenewOff} label={t("filterAutoRenewOff")} onClick={() => toggleFilter("autoRenewOff")} />
                    <FilterChip active={filters.expiringSoon} label={t("filterExpiringSoon")} onClick={() => toggleFilter("expiringSoon")} />
                    <FilterChip active={filters.expired} label={t("filterExpired")} onClick={() => toggleFilter("expired")} />
                    <FilterChip active={filters.noExpiration} label={t("filterNoExpiration")} onClick={() => toggleFilter("noExpiration")} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="user-list-table auto-renew-table">
            <div className="user-list-table-inner">
              <div className="table-header user-list-table-header auto-renew-table-header">
                {renderHeader("company", t("colCompany"))}
                {renderHeader("group", t("colGroup"))}
                {renderHeader("expiration", t("colExpiration"))}
                {renderHeader("remaining", t("colRemaining"))}
                {renderHeader("autoRenew", t("colAutoRenew"))}
                {renderHeader("period", t("colPeriod"))}
                <div className="header-item header-item--action">
                  <span className="header-item__label">{t("colAction")}</span>
                </div>
              </div>

              <div className="user-cards" aria-busy={editLoading}>
                {pagination.rows.length === 0 ? (
                  <div className="user-card user-list-row auto-renew-table-empty show-card row-even" role="status">
                    {t("noResults")}
                  </div>
                ) : (
                  pagination.rows.map((row, idx) => (
                    <div
                      key={row.company_numeric_id}
                      className={`user-card user-list-row auto-renew-table-row show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`}
                    >
                      <div className="card-item card-item--strong">{row.company_code}</div>
                      <div className="card-item">{row.group_id || "-"}</div>
                      <div className="card-item">
                        {row.expiration_date ? formatDate(row.expiration_date) : t("notSet")}
                      </div>
                      <div className="card-item">
                        <span className={`auto-renew-status-badge ${row.expiration_status || "normal"}`}>
                          {formatRemainingForRow(row, t)}
                        </span>
                      </div>
                      <div className="card-item">
                        <span className={`auto-renew-pill${row.auto_renew_enabled ? " is-on" : ""}`}>
                          {row.auto_renew_enabled ? t("autoRenewOnShort") : t("autoRenewOffShort")}
                        </span>
                      </div>
                      <div className="card-item">
                        <AutoRenewPeriodCell period={row.auto_renew_period} t={t} />
                      </div>
                      <div className="card-item card-item--action">
                        <button
                          type="button"
                          className="btn btn-edit"
                          aria-label={t("edit")}
                          disabled={!canEditGlobal}
                          style={{ opacity: canEditGlobal ? 1 : 0.35 }}
                          onClick={() => openEdit(row)}
                        >
                          <img src={assetUrl("images/edit.svg")} alt="" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {pagination.totalPages > 1 && (
            <div className="auto-renew-pagination">
              <button
                type="button"
                className="auto-renew-page-btn"
                disabled={pagination.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                {t("prevPage")}
              </button>
              <span className="auto-renew-page-info">
                {t("pageInfo", { page: pagination.page, total: pagination.totalPages, count: pagination.total })}
              </span>
              <button
                type="button"
                className="auto-renew-page-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                {t("nextPage")}
              </button>
            </div>
          )}
        </div>
      </div>

      <AutoRenewEditModal
        open={Boolean(editRow) && !editLoading}
        row={editRow}
        enabled={editEnabled}
        period={editPeriod}
        saving={saving}
        canEdit={canEditGlobal}
        onEnabledChange={setEditEnabled}
        onPeriodChange={setEditPeriod}
        onClose={closeEdit}
        onSave={handleSave}
        t={t}
      />
    </>
  );
}
