import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-tx-script="${safe}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.txScript = safe;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function formatDmy(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

function companyButtonStyle(comp, snapGroup) {
  const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
  if (snapGroup) {
    return cGid === snapGroup ? {} : { display: "none" };
  }
  return cGid ? { display: "none" } : {};
}

export default function TransactionPaymentPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);

  const todayDmy = useMemo(() => formatDmy(new Date()), []);
  const dateRangeText = useMemo(() => `${todayDmy} - ${todayDmy}`, [todayDmy]);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page");
    document.body.classList.add("dashboard-page", "transaction-page");
    return () => {
      document.body.classList.remove("transaction-page", "page-ready");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canPay = hasFull || perms.includes("payment");
        if (!canPay) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          }
        }

        const current = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && current?.group_id?.trim()) {
          selGroup = String(current.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            snapCompanies: snapRows,
            snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
            viewerRole: String(u.role || "").toLowerCase(),
          });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const canApproveContra = useMemo(() => {
    const r = filterSnapshot?.viewerRole || "";
    return ["manager", "admin", "owner"].includes(r);
  }, [filterSnapshot]);

  const bootstrapVanilla = useCallback(async (snap) => {
    const role = String(snap.viewerRole || "").toLowerCase();
    window.TRANSACTION_PAGE = {
      currentCompanyId: snap.companyId,
      viewerRole: role,
      canApproveContra: ["manager", "admin", "owner"].includes(role),
      showDescriptionColumn: true,
    };
    window.__TRANSACTION_SPA_MODE = true;
    window.__txApiHref = (path) => buildApiUrl(String(path || "").replace(/^\//, ""));
    window._sharedCompanyFilterInitialized = false;
    await injectStylesheet("https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap");
    await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
    await injectStylesheet(assetUrl("css/transaction.css"));
    await injectStylesheet(assetUrl("css/date-range-picker.css"));
    await injectStylesheet("https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css");
    await injectStylesheet(assetUrl("css/global-13inch.css"));

    await loadScriptOnce("https://cdn.jsdelivr.net/npm/flatpickr");
    await loadScriptOnce(assetUrl("js/date-range-picker.js"));
    await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
    window.__initSharedCompanyFilter?.();

    await loadScriptOnce(assetUrl("js/transaction.js"));

    window.onSharedCompanyFilterChanged = (companyId, companyCode) => {
      if (typeof window.switchCompany === "function") {
        window.switchCompany(companyId, companyCode);
      }
    };

    window.__initTransactionPage?.();
  }, []);

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await bootstrapVanilla(filterSnapshot);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      try {
        window.__transactionPageTeardown?.();
      } catch {
        /* ignore */
      }
      window.__TRANSACTION_SPA_MODE = false;
      try {
        delete window.__txApiHref;
      } catch {
        window.__txApiHref = undefined;
      }
    };
  }, [loading, forbidden, filterSnapshot, bootstrapVanilla]);

  if (forbidden) {
    return <Navigate to="/dashboard" replace />;
  }
  if (loading || !filterSnapshot) {
    return null;
  }

  const fs = filterSnapshot;

  return (
    <>
      <div className="transaction-container">
        <div className="transaction-header-bar">
          <div className="transaction-header-left">
            <h1 className="transaction-title">Transaction List</h1>
            {canApproveContra && (
              <div className="contra-inbox-wrap" id="contraInboxWrap">
                <button type="button" className="contra-inbox-btn contra-inbox-main" id="contraInboxBtn">
                  <svg className="contra-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  Contra Inbox
                  <span className="contra-inbox-badge" id="contraInboxCount">
                    0
                  </span>
                </button>
                <div className="contra-inbox-popover" id="contraInboxPopover" style={{ display: "none" }}>
                  <div className="contra-inbox-popover-header">
                    <div className="contra-inbox-popover-title">
                      Contra Inbox
                      <span className="contra-inbox-badge" id="contraInboxCount2">
                        0
                      </span>
                    </div>
                    <button type="button" className="contra-inbox-btn" id="contraInboxRefreshBtn">
                      Refresh
                    </button>
                  </div>
                  <div className="contra-inbox-popover-body">
                    <table className="contra-inbox-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Currency</th>
                          <th>Amount</th>
                          <th>Submitted By</th>
                          <th>Description</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="contraInboxTbody" />
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="transaction-separator-line" />

        <div className="transaction-main-content">
          <div className="transaction-search-section">
            <div className="transaction-form-group">
              <label className="transaction-label">Category</label>
              <div id="filter_category" className="transaction-category-multiselect">
                <div className="category-dropdown">
                  <button type="button" className="category-dropdown-button" id="category_dropdown_button">
                    <div id="category_selected_tags" className="category-selected-tags">
                      <span className="category-placeholder">--Select All--</span>
                    </div>
                    <i className="fas fa-chevron-down" />
                  </button>
                  <div className="category-dropdown-menu" id="category_dropdown_menu">
                    <div className="category-option">
                      <label className="category-checkbox-label">
                        <input type="checkbox" value="" className="category-checkbox" id="category_all" />
                        <span>--Select All--</span>
                      </label>
                    </div>
                    <div id="category_options_container" />
                  </div>
                </div>
              </div>
            </div>

            <div className="transaction-date-quick-row">
              <label className="transaction-label transaction-capture-date-label">Capture Date</label>
              <div className="transaction-date-range-group">
                <div className="date-range-picker" id="date-range-picker">
                  <i className="fas fa-calendar-alt" />
                  <span id="date-range-display">{dateRangeText}</span>
                </div>
                <input type="hidden" id="date_from" defaultValue={todayDmy} />
                <input type="hidden" id="date_to" defaultValue={todayDmy} />
              </div>
              <div className="quick-select-dropdown quick-select-dropdown-toggle">
                <button
                  type="button"
                  className="dropdown-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.toggleQuickSelectDropdown?.();
                  }}
                >
                  <i className="fas fa-calendar-alt" />
                  <span id="quick-select-text">Period</span>
                  <i className="fas fa-chevron-down" />
                </button>
                <div className="dropdown-menu" id="quick-select-dropdown">
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>
                    Today
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>
                    Yesterday
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>
                    This Week
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>
                    Last Week
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>
                    This Month
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>
                    Last Month
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>
                    This Year
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>
                    Last Year
                  </button>
                </div>
              </div>
            </div>

            <div className="transaction-checkboxes">
              <label className="transaction-checkbox-label">
                <input type="checkbox" id="show_name" className="transaction-checkbox" />
                Show Name
              </label>
              <label className="transaction-checkbox-label">
                <input type="checkbox" id="show_capture_only" className="transaction-checkbox" />
                Show Win/Loss Only
              </label>
              <label className="transaction-checkbox-label">
                <input type="checkbox" id="show_inactive" className="transaction-checkbox" />
                Show Payment Only
              </label>
              <label className="transaction-checkbox-label">
                <input type="checkbox" id="show_zero_balance" className="transaction-checkbox" />
                Show 0 balance
              </label>
            </div>

            <div className="transaction-bottom-filters">
              {fs.snapGroupIds.length > 0 && (
                <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
                  <span className="transaction-company-label">GroupID:</span>
                  <div id="group-buttons-container" className="transaction-company-buttons">
                    {fs.snapGroupIds.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`}
                        data-group-id={gid}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fs.snapCompanies.length > 0 && (
                <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
                  <span className="transaction-company-label">Company:</span>
                  <div id="company-buttons-container" className="transaction-company-buttons">
                    {fs.snapCompanies.map((comp) => (
                      <button
                        key={comp.id}
                        type="button"
                        style={companyButtonStyle(comp, fs.selectedGroup)}
                        className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`}
                        data-company-id={comp.id}
                        data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                        data-company-code={comp.company_id}
                      >
                        {comp.company_id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div id="currency-buttons-wrapper" className="transaction-company-filter">
                <span className="transaction-company-label">Currency:</span>
                <div id="currency-buttons-container" className="transaction-company-buttons" />
              </div>
            </div>
          </div>

          <div className="transaction-add-section">
            <div className="transaction-form-group">
              <label className="transaction-label">Type</label>
              <select id="transaction_type" className="transaction-select" defaultValue="CONTRA">
                <option value="CONTRA">CONTRA</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="RECEIVE">RECEIVE</option>
                <option value="CLAIM">CLAIM</option>
                <option value="PROFIT">PROFIT</option>
                <option value="RATE">RATE</option>
                <option value="CLEAR">CLEAR</option>
              </select>
            </div>

            <div id="standard-transaction-fields">
              <div className="transaction-form-group">
                <label className="transaction-label">Date</label>
                <input type="text" id="transaction_date" className="transaction-input" defaultValue={todayDmy} placeholder="dd/mm/yyyy" readOnly style={{ cursor: "pointer" }} />
              </div>

              <div className="transaction-form-group transaction-inline-row">
                <label className="transaction-label">Account</label>
                <div className="transaction-account-inputs">
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="action_account_from" data-placeholder="--Select To Account--">
                      --Select To Account--
                    </button>
                    <div className="custom-select-dropdown" id="action_account_from_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="action_account_id" data-placeholder="--Select From Account--">
                      --Select From Account--
                    </button>
                    <div className="custom-select-dropdown" id="action_account_id_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <button type="button" id="account_reverse_btn" className="transaction-account-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts">
                    Reverse
                  </button>
                </div>
              </div>

              <div className="transaction-form-group transaction-inline-row">
                <label className="transaction-label">Currency</label>
                <select id="transaction_currency" className="transaction-select" defaultValue="">
                  <option value="">--Select Currency--</option>
                </select>
              </div>

              <div className="transaction-form-group">
                <label className="transaction-label">Amount</label>
                <input type="number" step="0.01" id="action_amount" className="transaction-input" />
              </div>
            </div>

            <div id="rate-transaction-fields" className="rate-fields" style={{ display: "none" }}>
              <div className="rate-section">
                <label className="transaction-label">Date</label>
                <input type="text" id="rate_transaction_date" className="transaction-input" defaultValue={todayDmy} placeholder="dd/mm/yyyy" readOnly style={{ cursor: "pointer" }} />
              </div>

              <div className="rate-section">
                <label className="transaction-label">Account</label>
                <div className="rate-row rate-row-two-cols">
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="rate_account_from" data-placeholder="--Select To Account--">
                      --Select To Account--
                    </button>
                    <div className="custom-select-dropdown" id="rate_account_from_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="rate_account_to" data-placeholder="--Select From Account--">
                      --Select From Account--
                    </button>
                    <div className="custom-select-dropdown" id="rate_account_to_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <button type="button" id="rate_account_reverse_btn" className="transaction-account-reverse-btn rate-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts">
                    Reverse
                  </button>
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Currency</label>
                <div className="rate-row rate-row-five-cols">
                  <select id="rate_currency_from" className="transaction-select" defaultValue="">
                    <option value="">Currency</option>
                  </select>
                  <input type="number" step="0.01" id="rate_currency_from_amount" className="transaction-input" placeholder="Amount" />
                  <input type="text" inputMode="decimal" id="rate_exchange_rate" className="transaction-input" placeholder="Rate" />
                  <select id="rate_currency_to" className="transaction-select" defaultValue="">
                    <option value="">Currency</option>
                  </select>
                  <input type="number" step="0.01" id="rate_currency_to_amount" className="transaction-input" placeholder="Amount" readOnly />
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Account</label>
                <div className="rate-row rate-row-two-cols">
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="rate_transfer_from_account" data-placeholder="--Select To Account--">
                      --Select To Account--
                    </button>
                    <div className="custom-select-dropdown" id="rate_transfer_from_account_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="rate_transfer_to_account" data-placeholder="--Select From Account--">
                      --Select From Account--
                    </button>
                    <div className="custom-select-dropdown" id="rate_transfer_to_account_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <button type="button" id="rate_transfer_reverse_btn" className="transaction-account-reverse-btn rate-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts">
                    Reverse
                  </button>
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Middle-Man</label>
                <div className="rate-row rate-row-three-cols">
                  <div className="custom-select-wrapper">
                    <button type="button" className="custom-select-button" id="rate_middleman_account" data-placeholder="--Select Account--">
                      --Select Account--
                    </button>
                    <div className="custom-select-dropdown" id="rate_middleman_account_dropdown">
                      <div className="custom-select-search">
                        <input type="text" placeholder="Search account..." autoComplete="off" />
                      </div>
                      <div className="custom-select-options" />
                    </div>
                  </div>
                  <input type="number" step="0.0001" id="rate_middleman_rate" className="transaction-input" placeholder="Rate multiplier" />
                  <input type="number" step="0.01" id="rate_middleman_amount" className="transaction-input" placeholder="Amount" readOnly />
                </div>
              </div>
            </div>

            <div className="transaction-two-col">
              <div className="transaction-form-group" style={{ display: "none" }}>
                <label className="transaction-label">Description</label>
                <input type="text" id="action_description" className="transaction-input text-uppercase" />
              </div>
              <div className="transaction-form-group" id="remark_form_group">
                <label className="transaction-label">Remark</label>
                <input type="text" id="action_sms" className="transaction-input text-uppercase" />
              </div>
            </div>

            <div className="transaction-confirm-actions">
              <label className="transaction-checkbox-label transaction-confirm-label">
                <input type="checkbox" id="confirm_submit" className="transaction-checkbox" />
                Confirm Submit
              </label>
              <div className="transaction-action-btns">
                <button type="button" id="submit_btn" className="transaction-submit-btn" disabled>
                  Submit
                </button>
                <button type="button" id="action_search_btn" className="transaction-search-btn">
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="transaction-tables-section" style={{ display: "none" }}>
          <div id="transaction-tables-loading" className="transaction-tables-loading" style={{ display: "none" }} aria-live="polite">
            Loading...
          </div>
          <div id="default-tables-container" style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <h3 id="default-currency-title" style={{ margin: "10px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937", display: "none" }}>
              Currency:{" "}
            </h3>
            <div style={{ display: "flex", gap: 20, width: "100%" }}>
              <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                <table className="transaction-table" id="table_left">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th className="transaction-name-column" style={{ display: "none" }}>
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_left" />
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td className="transaction-name-column" style={{ display: "none" }} />
                      <td id="left_total_bf">
                        0.00
                      </td>
                      <td id="left_total_winloss">
                        0.00
                      </td>
                      <td id="left_total_crdr">
                        0.00
                      </td>
                      <td id="left_total_balance">
                        0.00
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                <table className="transaction-table" id="table_right">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th className="transaction-name-column" style={{ display: "none" }}>
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_right" />
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td className="transaction-name-column" style={{ display: "none" }} />
                      <td id="right_total_bf">
                        0.00
                      </td>
                      <td id="right_total_winloss">
                        0.00
                      </td>
                      <td id="right_total_crdr">
                        0.00
                      </td>
                      <td id="right_total_balance">
                        0.00
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
          <div id="currency-grouped-tables-container" style={{ display: "none" }} />
        </div>

        <div className="transaction-summary-section" style={{ display: "none" }}>
          <table className="transaction-summary-table">
            <thead>
              <tr className="transaction-table-header">
                <th colSpan={2}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">B/F</td>
                <td id="sum_total_bf">
                  0.00
                </td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Win/Loss</td>
                <td id="sum_total_winloss">
                  0.00
                </td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Cr/Dr</td>
                <td id="sum_total_crdr">
                  0.00
                </td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Balance</td>
                <td id="sum_total_balance">
                  0.00
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" defaultValue="0">
              <option value="0">Jan</option>
              <option value="1">Feb</option>
              <option value="2">Mar</option>
              <option value="3">Apr</option>
              <option value="4">May</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aug</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Dec</option>
            </select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div>
          <div className="calendar-weekday">Mon</div>
          <div className="calendar-weekday">Tue</div>
          <div className="calendar-weekday">Wed</div>
          <div className="calendar-weekday">Thu</div>
          <div className="calendar-weekday">Fri</div>
          <div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>

      <div id="notificationContainer" className="transaction-notification-container" />

      <div id="historyModal" className="transaction-modal" style={{ display: "none" }}>
        <div className="transaction-modal-content">
          <div className="transaction-modal-header">
            <h3 id="modal_title">Payment History</h3>
            <button type="button" id="modal_close" className="transaction-modal-close">
              ×
            </button>
          </div>
          <div className="transaction-modal-body">
            <div className="transaction-history-table-frame">
              <table className="transaction-table">
                <thead>
                  <tr className="transaction-table-header">
                    <th className="transaction-history-col-date">Date</th>
                    <th className="transaction-history-col-product">Id Product</th>
                    <th className="transaction-history-col-currency">Currency</th>
                    <th className="transaction-history-col-rate">Rate</th>
                    <th className="transaction-history-col-winloss">Win/Loss</th>
                    <th className="transaction-history-col-crdr">Cr/Dr</th>
                    <th className="transaction-history-col-balance">Balance</th>
                    <th className="transaction-history-col-description">Description</th>
                    <th className="transaction-history-col-remark">Remark</th>
                    <th className="transaction-history-col-created">Created by</th>
                  </tr>
                </thead>
                <tbody id="modal_tbody" />
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
