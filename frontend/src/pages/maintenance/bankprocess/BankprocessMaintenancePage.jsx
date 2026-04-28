import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-bpm-script="${safe}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.bpmScript = safe;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

async function injectStylesheet(href) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(link);
  });
}

function formatDmy(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatAmount(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

export default function BankprocessMaintenancePage() {
  const navigate = useNavigate();
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState("");
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const today = useMemo(() => formatDmy(new Date()), []);
  const currentCompanyIdRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      return next.length > 2 ? next.slice(1) : next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");
    setDateFrom(today);
    setDateTo(today);

    const setup = async () => {
      const links = [
        "https://fonts.googleapis.com/css?family=Amaranth",
        "https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap",
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
        assetUrl("css/accountCSS.css"),
        assetUrl("css/bankprocess_maintenance.css"),
        assetUrl("css/date-range-picker.css"),
        assetUrl("css/global-13inch.css"),
      ];
      await Promise.all(links.map((href) => injectStylesheet(href).catch(() => null)));
      await loadScriptOnce(assetUrl("js/date-range-picker.js"));
      if (window?.MaintenanceDateRangePicker?.init) {
        window.MaintenanceDateRangePicker.init({
          onChange: () => {
            const nextFrom = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
            const nextTo = window.MaintenanceDateRangePicker.getDateTo?.() || "";
            setDateFrom(nextFrom);
            setDateTo(nextTo);
          },
        });
      }
    };

    setup().catch(() => null);
    return () => {
      document.body.classList.remove("maintenance-page");
    };
  }, [today]);

  const fetchPermissions = useCallback(async (nextCompanyCode) => {
    if (!nextCompanyCode) {
      setPermissions([]);
      setSelectedPermission("");
      return;
    }
    try {
      const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_company_permissions",
          company_id: nextCompanyCode,
        }),
      });
      const result = await response.json();
      const list = Array.isArray(result?.data?.permissions)
        ? result.data.permissions.filter((p) => p !== "Games")
        : ["Bank", "Loan", "Rate", "Money"];
      setPermissions(list);
      const saved = localStorage.getItem(`selectedPermission_${nextCompanyCode}`);
      if (saved && list.includes(saved)) {
        setSelectedPermission(saved);
      } else {
        setSelectedPermission(list[0] || "");
      }
    } catch {
      const fallback = ["Bank", "Loan", "Rate", "Money"];
      setPermissions(fallback);
      setSelectedPermission(fallback[0]);
    }
  }, []);

  const fetchCurrencies = useCallback(async (nextCompanyId) => {
    let url = buildApiUrl("api/transactions/get_company_currencies_api.php");
    if (nextCompanyId) {
      url += `?company_id=${encodeURIComponent(nextCompanyId)}`;
    }
    try {
      const response = await fetch(url);
      const data = await response.json();
      const list = data.success ? (data.data || []) : [];
      setCurrencies(list);
      setSelectedCurrency((prev) => {
        if (prev && list.some((x) => x.code === prev)) return prev;
        const myr = list.find((x) => x.code === "MYR");
        return myr?.code || list[0]?.code || null;
      });
    } catch {
      setCurrencies([]);
      setSelectedCurrency(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, compRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = meJson.data;
        if (String(user.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
        const hasFull = userPerms.length === 0;
        const canMaintenance = hasFull || userPerms.includes("maintenance");
        if (!canMaintenance || !user.company_has_bank) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const compJson = await compRes.json();
        const compRows = Array.isArray(compJson?.data) ? compJson.data.filter((c) => c.company_id) : [];
        setMe(user);
        setCompanies(compRows);

        let initialCompanyId = user.company_id ? Number(user.company_id) : (compRows[0]?.id ? Number(compRows[0].id) : null);
        if (initialCompanyId && !compRows.some((c) => Number(c.id) === Number(initialCompanyId))) {
          initialCompanyId = compRows[0]?.id ? Number(compRows[0].id) : null;
        }
        setCompanyId(initialCompanyId);
        currentCompanyIdRef.current = initialCompanyId;
        const currentComp = compRows.find((c) => Number(c.id) === Number(initialCompanyId));
        setCompanyCode(currentComp?.company_id || "");

        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(compRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && currentComp?.group_id && String(currentComp.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (currentComp?.group_id) {
          selGroup = String(currentComp.group_id).toUpperCase().trim();
        }
        setSelectedGroup(selGroup);
        if (selGroup) {
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        } else {
          sessionStorage.removeItem("dashboard_group_filter");
        }
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (bootLoading || !companyId || !companyCode) return;
    fetchPermissions(companyCode);
    fetchCurrencies(companyId);
  }, [bootLoading, companyId, companyCode, fetchPermissions, fetchCurrencies]);

  const searchData = useCallback(async (silent = false) => {
    if (!dateFrom || !dateTo) {
      if (!silent) notify("Please select date range", "error");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (companyId) params.set("company_id", String(companyId));
      if (selectedCurrency) params.set("currency", selectedCurrency);
      if (query.trim()) params.set("q", query.trim());

      const response = await fetch(buildApiUrl(`api/bankprocess_maintenance/search_api.php?${params.toString()}`));
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Search failed");
      }
      setRows(Array.isArray(result.data) ? result.data : []);
      setHasSearched(true);
      setSelectedIds([]);
      if (!silent) {
        if (result.data?.length) {
          notify(`Found ${result.data.length} record(s)`, "success");
        } else {
          notify("No bank process transactions found", "info");
        }
      }
    } catch (err) {
      setRows([]);
      setHasSearched(true);
      if (!silent) notify(err.message || "Search failed", "error");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, companyId, selectedCurrency, query, notify]);

  useEffect(() => {
    if (!bootLoading && companyId && selectedCurrency && dateFrom && dateTo) {
      searchData(true);
    }
  }, [bootLoading, companyId, selectedCurrency, dateFrom, dateTo, selectedPermission, searchData]);

  useEffect(() => {
    if (!selectedPermission || !companyCode) return;
    localStorage.setItem(`selectedPermission_${companyCode}`, selectedPermission);
  }, [selectedPermission, companyCode]);

  const handleSwitchCompany = useCallback(async (targetCompany) => {
    if (!targetCompany?.id) return;
    const nextId = Number(targetCompany.id);
    if (nextId === Number(currentCompanyIdRef.current)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextId}`));
      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || "Switch company failed");
      }
      setCompanyId(nextId);
      setCompanyCode(targetCompany.company_id || "");
      currentCompanyIdRef.current = nextId;
      notifyCompanySessionUpdated();
      notify(`Switched to ${targetCompany.company_id}`, "success");
    } catch (err) {
      notify(err.message || "Switch failed", "error");
    }
  }, [notify]);

  const onGroupClick = (gid) => {
    if (selectedGroup === gid) {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
      return;
    }
    setSelectedGroup(gid);
    sessionStorage.setItem("dashboard_group_filter", gid);
  };

  const visibleCompanies = useMemo(() => {
    if (selectedGroup) {
      return companies.filter((c) => String(c.group_id || "").toUpperCase().trim() === selectedGroup);
    }
    return companies.filter((c) => !String(c.group_id || "").trim());
  }, [companies, selectedGroup]);

  const groupedIds = useMemo(
    () => [...new Set(companies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
    [companies]
  );

  const selectableRows = useMemo(
    () => rows.filter((r) => !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)),
    [rows]
  );

  const selectAll = selectableRows.length > 0 && selectedIds.length === selectableRows.length;

  const onToggleSelectAll = (checked) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(selectableRows.map((r) => r.transaction_id));
  };

  const onToggleRow = (transactionId) => {
    setSelectedIds((prev) => (prev.includes(transactionId) ? prev.filter((id) => id !== transactionId) : [...prev, transactionId]));
  };

  const onDelete = async () => {
    if (!confirmDelete) {
      notify("Please confirm deletion by checking the checkbox", "error");
      return;
    }
    if (selectedIds.length === 0) {
      notify("Please select at least one record", "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      const response = await fetch(buildApiUrl("api/bankprocess_maintenance/delete_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_ids: selectedIds }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Delete failed");
      }
      try {
        localStorage.setItem("count168_tx_invalidate_ts", String(Date.now()));
        window.dispatchEvent(new CustomEvent("tx-data-changed", { detail: { ts: String(Date.now()), source: "bankprocess_maintenance_delete" } }));
      } catch {
        // ignore
      }
      notify(result.message || `Deleted ${selectedIds.length} record(s)`, "success");
      setSelectedIds([]);
      setConfirmDelete(false);
      await searchData(true);
    } catch (err) {
      notify(err.message || "Delete failed", "error");
    }
  };

  const pageTitle = `Maintenance - ${selectedPermission || "Process"}`;

  if (bootLoading || !me) return null;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{pageTitle}</h1>
        {permissions.length > 1 && (
          <div id="bankprocess-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">Category:</span>
            <div id="bankprocess-permission-buttons" className="maintenance-company-buttons">
              {permissions.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`maintenance-company-btn ${selectedPermission === p ? "active" : ""}`}
                  onClick={() => setSelectedPermission(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="maintenance-search-section">
        <div className="maintenance-filters">
          <div className="maintenance-form-group maintenance-date-inline">
            <label className="maintenance-label">Date Range</label>
            <div className="date-range-picker" id="date-range-picker">
              <i className="fas fa-calendar-alt" />
              <span id="date-range-display">Select date range</span>
            </div>
            <input type="hidden" id="date_from" value={dateFrom || today} readOnly />
            <input type="hidden" id="date_to" value={dateTo || today} readOnly />
          </div>
          <div className="maintenance-form-group maintenance-search-inline" id="from-search-row">
            <label className="maintenance-label" htmlFor="filter_from_search">Search</label>
            <div className="search-container maintenance-search-container">
              <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                id="filter_from_search"
                placeholder="e.g. TEST M16(CIMB) / CIMB"
                className="search-input maintenance-search-input"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchData();
                  }
                }}
              />
            </div>
          </div>
          <div className="maintenance-form-group quick-select-wrap">
            <label className="form-label"><i className="fas fa-clock" /> Quick Select</label>
            <div className="quick-select-dropdown quick-select-dropdown-toggle">
              <button type="button" className="dropdown-toggle" onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}>
                <i className="fas fa-calendar-alt" />
                <span id="quick-select-text">Period</span>
                <i className="fas fa-chevron-down" />
              </button>
              <div className="dropdown-menu" id="quick-select-dropdown">
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>Today</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>Yesterday</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>This Week</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>Last Week</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>This Month</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>Last Month</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>This Year</button>
                <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>Last Year</button>
              </div>
            </div>
          </div>
        </div>
        <div className="maintenance-filter-row">
          <div className="maintenance-filter-left">
            {groupedIds.length > 0 && (
              <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
                <span className="transaction-company-label">GroupID:</span>
                <div id="group-buttons-container" className="transaction-company-buttons">
                  {groupedIds.map((gid) => (
                    <button
                      key={gid}
                      type="button"
                      className={`transaction-company-btn shared-group-btn ${selectedGroup === gid ? "active" : ""}`}
                      data-group-id={gid}
                      onClick={() => onGroupClick(gid)}
                    >
                      {gid}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {companies.length > 0 && (
              <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
                <span className="transaction-company-label">Company:</span>
                <div id="company-buttons-container" className="transaction-company-buttons">
                  {visibleCompanies.map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(companyId) ? "active" : ""}`}
                      data-company-id={comp.id}
                      data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                      data-company-code={comp.company_id}
                      onClick={() => handleSwitchCompany(comp)}
                    >
                      {comp.company_id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div id="currency-buttons-wrapper" className="maintenance-company-filter" style={{ display: currencies.length > 0 ? "flex" : "none" }}>
              <span className="maintenance-company-label">Currency:</span>
              <div className="maintenance-company-buttons" id="currency-buttons-container">
                {currencies.map((currency) => (
                  <button
                    key={currency.code}
                    type="button"
                    className={`maintenance-company-btn ${selectedCurrency === currency.code ? "active" : ""}`}
                    onClick={() => setSelectedCurrency(currency.code)}
                  >
                    {currency.code}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="maintenance-actions">
            <button
              type="button"
              className="maintenance-delete-btn"
              id="deleteBtn"
              onClick={onDelete}
              disabled={selectedIds.length === 0 || !confirmDelete}
            >
              Delete
            </button>
            <label className="maintenance-confirm-delete-label">
              <input
                type="checkbox"
                id="confirmDelete"
                className="maintenance-checkbox"
                checked={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.checked)}
              />
              <span>Confirm Delete</span>
            </label>
          </div>
        </div>
      </div>
      {loading && (
        <div className="maintenance-list-container" id="tableContainer" style={{ display: "block" }}>
          <table className="maintenance-table">
            <thead>
              <tr>
                <th>No.</th><th>Dts Created</th><th>Account</th><th>From</th><th className="maintenance-header-amount">Amount</th><th>Description</th><th>Remark</th><th>Submitted By</th><th className="maintenance-select-all-header"><input type="checkbox" className="maintenance-checkbox" disabled /></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="maintenance-table-cell" colSpan="9" style={{ textAlign: "center", padding: "20px" }}>
                  Loading...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="maintenance-list-container" id="tableContainer" style={{ display: "block" }}>
          <table className="maintenance-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Dts Created</th>
                <th>Account</th>
                <th>From</th>
                <th className="maintenance-header-amount">Amount</th>
                <th>Description</th>
                <th>Remark</th>
                <th>Submitted By</th>
                <th className="maintenance-select-all-header">
                  <input
                    type="checkbox"
                    id="select_all_bankprocess"
                    className="maintenance-checkbox"
                    title="Select All"
                    checked={selectAll}
                    onChange={(e) => onToggleSelectAll(e.target.checked)}
                  />
                </th>
              </tr>
            </thead>
            <tbody id="dataTableBody">
              {rows.map((row, index) => {
                const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
                const trClass = `maintenance-row ${isDeleted ? "maintenance-row-deleted" : ""}`;
                const transactionId = row.transaction_id;
                const checked = selectedIds.includes(transactionId);
                const currency = row.currency ? `${row.currency} ` : "";
                return (
                  <tr key={transactionId || `${index}-${row.dts_created || "row"}`} className={trClass}>
                    <td className="maintenance-table-cell">{index + 1}</td>
                    <td className="maintenance-table-cell">{row.dts_created || "-"}</td>
                    <td className="maintenance-table-cell">{row.account || "-"}</td>
                    <td className="maintenance-table-cell">{toUpperDisplay(row.from_account)}</td>
                    <td className="maintenance-table-cell maintenance-cell-currency-amount">{row.amount !== null && row.amount !== undefined && row.amount !== "" ? `${currency}${formatAmount(row.amount)}` : "-"}</td>
                    <td className="maintenance-table-cell">{row.description || "-"}</td>
                    <td className="maintenance-table-cell text-uppercase">{toUpperDisplay(row.remark)}</td>
                    <td className="maintenance-table-cell">{row.created_by || "-"}</td>
                    <td className="maintenance-table-cell maintenance-cell-checkbox">
                      <input
                        type="checkbox"
                        className="maintenance-row-checkbox"
                        checked={checked}
                        disabled={isDeleted}
                        title={isDeleted ? "Already deleted" : ""}
                        onChange={() => onToggleRow(transactionId)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasSearched && rows.length === 0 && (
        <div className="empty-state-container" id="emptyState" style={{ display: "block" }}>
          <div className="empty-state">
            <p>No bank process transactions found. Please adjust your search criteria and try again.</p>
          </div>
        </div>
      )}

      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((t) => (
          <div key={t.id} className={`maintenance-notification maintenance-notification-${t.type} show`}>
            {t.message}
          </div>
        ))}
      </div>

      <div id="confirmDeleteModal" className="maintenance-modal" style={{ display: isDeleteModalOpen ? "flex" : "none" }}>
        <div className="maintenance-confirm-modal-content">
          <div className="maintenance-confirm-icon-container">
            <svg className="maintenance-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="maintenance-confirm-title">Confirm Delete</h2>
          <p id="confirmDeleteMessage" className="maintenance-confirm-message">
            {`Are you sure you want to delete the selected ${selectedIds.length} Bank process transaction(s)? This action cannot be undone.`}
          </p>
          <div className="maintenance-confirm-actions">
            <button type="button" className="maintenance-btn maintenance-btn-cancel confirm-cancel" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </button>
            <button type="button" className="maintenance-btn maintenance-btn-delete confirm-delete" onClick={onConfirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}><i className="fas fa-chevron-left" /></button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" defaultValue="0"><option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option><option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option><option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option></select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
