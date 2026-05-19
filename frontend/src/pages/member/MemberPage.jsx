import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { buildApiUrl } from "../../utils/apiUrl.js";
import "../../../public/css/member.css";
import MemberLayout from "./components/MemberLayout.jsx";
import useMemberWinLoss from "./useMemberWinLoss.js";
import MemberBalanceMiniGrid from "./MemberBalanceMiniGrid.jsx";
import MemberDashTotal from "./MemberDashTotal.jsx";
import MemberLinkedFilterModal from "./MemberLinkedFilterModal.jsx";
import MemberCurrencyTables from "./MemberCurrencyTables.jsx";
import { MINI_GRID_SHELL_CCY } from "./memberWinLossCore.js";

function dmy(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}/${m}/${y}`;
}

function parseDmy(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const QUICK_RANGE_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  thisYear: "This Year",
  lastYear: "Last Year",
};

export default function MemberPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [accountId, setAccountId] = useState(0);
  const [linkedListRootId, setLinkedListRootId] = useState(0);
  const [companyId, setCompanyId] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const [quickRangeLabel, setQuickRangeLabel] = useState("Period");
  const [notifications, setNotifications] = useState([]);
  const [draggingCurrency, setDraggingCurrency] = useState(null);

  const quickSelectRef = useRef(null);
  const dateRangeInputRef = useRef(null);
  const flatpickrRef = useRef(null);
  const lastRangeRef = useRef({ from: "", to: "" });

  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => {
    const t = new Date(today);
    const day = t.getDay();
    const toMonday = day === 0 ? 6 : day - 1;
    t.setDate(t.getDate() - toMonday);
    return t;
  }, [today]);

  const showNotification = useCallback((message, type = "info") => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((prev) => [...prev, { id, message, type }].slice(-2));
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  const wl = useMemberWinLoss({
    accountId,
    companyId,
    linkedListRootId,
    dateFrom,
    dateTo,
    showNotification,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() !== "member") {
          navigate("/dashboard", { replace: true });
          return;
        }
        if (!cancelled) {
          const loginId = Number(u.member_login_account_id || u.user_id) || 0;
          const viewId = Number(u.member_winloss_view_account_id || u.winloss_view_account_id || u.user_id) || 0;
          setMe(u);
          setLinkedListRootId(loginId);
          setAccountId(viewId);
          setCompanyId(Number(u.company_id) || 0);
          setDateFrom(dmy(monday));
          setDateTo(dmy(today));
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
  }, [navigate, monday, today]);

  useEffect(() => {
    if (loading || !me || !dateFrom || !dateTo) return;
    const inputEl = dateRangeInputRef.current;
    const fromDate = parseDmy(dateFrom);
    const toDate = parseDmy(dateTo);
    if (inputEl && fromDate && toDate) {
      flatpickrRef.current = flatpickr(inputEl, {
        mode: "range",
        dateFormat: "d/m/Y",
        defaultDate: [fromDate, toDate],
        onChange: (dates) => {
          if (dates.length === 2) {
            setDateFrom(dmy(dates[0]));
            setDateTo(dmy(dates[1]));
          }
        },
        onClose: (dates) => {
          if (dates.length === 1) {
            const single = dmy(dates[0]);
            setDateFrom(single);
            setDateTo(single);
            if (flatpickrRef.current) flatpickrRef.current.setDate([dates[0], dates[0]], false);
          }
        },
      });
    }
    return () => {
      if (flatpickrRef.current?.destroy) {
        flatpickrRef.current.destroy();
        flatpickrRef.current = null;
      }
    };
  }, [loading, me]);

  useEffect(() => {
    const fp = flatpickrRef.current;
    if (!fp || !dateFrom || !dateTo) return;
    const last = lastRangeRef.current;
    if (last.from === dateFrom && last.to === dateTo) return;
    const fromDate = parseDmy(dateFrom);
    const toDate = parseDmy(dateTo);
    if (fromDate && toDate) {
      fp.setDate([fromDate, toDate], false);
      lastRangeRef.current = { from: dateFrom, to: dateTo };
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target)) {
        setShowQuickSelect(false);
      }
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const gridDisplayCurrencies = useMemo(() => {
    if (wl.miniGridCurrencies.length > 0) return wl.miniGridCurrencies;
    if (wl.linkedAccountsList.length > 0) return MINI_GRID_SHELL_CCY;
    return [];
  }, [wl.miniGridCurrencies, wl.linkedAccountsList.length]);

  const gridShellOnly = wl.miniGridCurrencies.length === 0 || (wl.loadingTable && wl.miniGridBalances.size === 0);

  const switchCompany = async (nextCompanyId, label) => {
    if (!nextCompanyId || Number(nextCompanyId) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (json?.success) {
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && json?.data) {
          window.updateSidebarDataCaptureVisibility(json.data.has_gambling, json.data.has_bank);
        }
        setCompanyId(Number(nextCompanyId));
        setMe((prev) => (prev ? { ...prev, company_id: Number(nextCompanyId) } : prev));
        showNotification(`Switched to company ${label || nextCompanyId}`, "success");
        await wl.reloadBaseData();
      }
    } catch {
      showNotification("Failed to switch company", "error");
    }
  };

  const switchAccount = async (nextAccountId, code, name) => {
    if (!nextAccountId || Number(nextAccountId) === Number(accountId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_account_session_api.php?account_id=${nextAccountId}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (json?.success) {
        const payload = json.data || json;
        setAccountId(Number(payload.account_id || nextAccountId));
        showNotification(`Switched to account ${payload.account_code || code || name || nextAccountId}`, "success");
        await wl.reloadBaseData();
      }
    } catch {
      showNotification("Failed to switch account", "error");
    }
  };

  const applyQuickRange = (range) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    switch (range) {
      case "today":
        break;
      case "yesterday":
        start.setDate(start.getDate() - 1);
        end = new Date(start);
        break;
      case "thisWeek": {
        const dow = now.getDay();
        const toMon = dow === 0 ? 6 : dow - 1;
        start.setDate(start.getDate() - toMon);
        break;
      }
      case "lastWeek": {
        const dow = now.getDay();
        const toSun = dow === 0 ? 0 : dow;
        end.setDate(end.getDate() - toSun - 1);
        start = new Date(end);
        start.setDate(start.getDate() - 6);
        break;
      }
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "lastMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "thisYear":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "lastYear":
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }
    setQuickRangeLabel(QUICK_RANGE_LABELS[range] || "Period");
    setDateFrom(dmy(start));
    setDateTo(dmy(end));
    if (flatpickrRef.current) flatpickrRef.current.setDate([start, end], true);
    setShowQuickSelect(false);
  };

  const onCurrencyDrop = (targetCode, targetIndex) => {
    if (!draggingCurrency || draggingCurrency === targetCode) return;
    const from = wl.availableCurrencies.indexOf(draggingCurrency);
    if (from < 0 || targetIndex < 0) return;
    const next = [...wl.availableCurrencies];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    wl.persistCurrencyOrder(next);
    setDraggingCurrency(null);
  };

  if (loading || !me) return null;

  const noCurrencySelected = !wl.isAllSelected && wl.selectedCurrencies.size === 0;

  return (
    <MemberLayout me={me} notifications={notifications}>
      <div className="transaction-container">
        <h1 className="transaction-title">Win/Loss</h1>
        <div className="transaction-separator-line" />
        <div className="transaction-main-content member-winloss-dash">
          <div className="transaction-search-section member-dash-unified-bar">
            <div className={`member-dash-columns${wl.showMiniRail ? "" : " member-dash-columns--no-mini-rail"}`}>
              <div className="member-dash-col member-dash-col-filters">
                <div className="transaction-form-group transaction-capture-date-group">
                  <label className="transaction-label transaction-date-range-label">Capture Date</label>
                  <div className="transaction-capture-date-row">
                    <div className="transaction-date-range-wrap" id="capture_date_range_wrap">
                      <i className="fas fa-calendar-alt" aria-hidden="true" />
                      <input
                        ref={dateRangeInputRef}
                        type="text"
                        id="capture_date_range"
                        className="transaction-input transaction-date-range-input"
                        defaultValue={`${dateFrom} - ${dateTo}`}
                        placeholder="Select date range"
                        readOnly
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                    <div className="transaction-quick-select-wrap">
                      <div className="dropdown transaction-quick-select-dropdown" ref={quickSelectRef}>
                        <button
                          type="button"
                          className="btn btn-secondary dropdown-toggle transaction-quick-select-btn"
                          onClick={() => setShowQuickSelect((p) => !p)}
                        >
                          <i className="fas fa-calendar-alt" aria-hidden="true" />
                          <span id="quick-select-text">{quickRangeLabel}</span>
                          <i className="fas fa-chevron-down" aria-hidden="true" />
                        </button>
                        <div className={`dropdown-menu${showQuickSelect ? " show" : ""}`} id="quick-select-dropdown">
                          {Object.keys(QUICK_RANGE_LABELS).map((r) => (
                            <button key={r} type="button" className="dropdown-item" onClick={() => applyQuickRange(r)}>
                              {QUICK_RANGE_LABELS[r]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <input type="hidden" id="date_from" value={dateFrom} readOnly />
                  <input type="hidden" id="date_to" value={dateTo} readOnly />
                </div>

                {wl.companies.length > 1 && (
                  <div className="member-company-filter" id="member_company_filter" style={{ display: "flex", visibility: "visible" }}>
                    <span className="transaction-company-label">Company:</span>
                    <div id="member_company_buttons" className="transaction-company-buttons member-currency-buttons">
                      {wl.companies.map((company) => {
                        const compId = Number(company.company_id);
                        const compCode = String(company.company_code || "").toUpperCase();
                        return (
                          <button
                            key={compId}
                            type="button"
                            className={`transaction-company-btn${compId === Number(companyId) ? " active" : ""}`}
                            onClick={() => switchCompany(compId, compCode)}
                          >
                            {compCode}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {wl.companies.length === 0 && !wl.loadingTable && (
                  <div className="member-alert member-alert-error" style={{ display: "block", marginTop: 12 }}>
                    No associated companies found for this account.
                  </div>
                )}

                <div
                  className="member-account-filter transaction-company-filter"
                  id="member_account_filter"
                  style={{ display: wl.linkedAccountsList.length > 1 ? "flex" : "none" }}
                >
                  <span className="transaction-company-label">Account:</span>
                  <div id="member_account_buttons" className="transaction-company-buttons member-currency-buttons">
                    {wl.linkedAccountsList.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        className={`transaction-company-btn${Number(acc.id) === Number(accountId) ? " active" : ""}`}
                        onClick={() => switchAccount(acc.id, acc.account_id, acc.name)}
                      >
                        {String(acc.account_id || acc.name || acc.id)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="transaction-company-filter member-currency-filter" id="member_currency_filter" style={{ display: "flex", visibility: "visible" }}>
                  <span className="transaction-company-label">Currency:</span>
                  <div id="member_currency_buttons" className="transaction-company-buttons member-currency-buttons">
                    {(wl.availableCurrencies.length > 1 || wl.availableCurrencies.length === 0) && (
                      <button
                        type="button"
                        className={`transaction-company-btn member-currency-all${wl.isAllSelected ? " active" : ""}`}
                        onClick={wl.selectCurrencyAll}
                      >
                        All
                      </button>
                    )}
                    {wl.availableCurrencies.map((code, index) => (
                      <button
                        key={code}
                        type="button"
                        draggable
                        data-currency={code}
                        className={`transaction-company-btn${wl.selectedCurrencies.has(code) && !wl.isAllSelected ? " active" : ""}${draggingCurrency === code ? " member-currency-dragging" : ""}`}
                        onDragStart={(e) => {
                          setDraggingCurrency(code);
                          e.dataTransfer.setData("text/plain", code);
                        }}
                        onDragEnd={() => setDraggingCurrency(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          onCurrencyDrop(code, index);
                        }}
                        onClick={() => wl.toggleCurrency(code)}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {wl.showMiniRail && (
                <div className="member-dash-right-rail" aria-hidden="false">
                  <div className="member-dash-rail-toolbar">
                    <div className="member-dash-mini-toolbar">
                      {wl.linkedAccountsList.length > 0 && (
                        <button
                          type="button"
                          className="member-dash-filter-trigger"
                          id="member_linked_filter_btn"
                          title="Choose which linked accounts appear in the grid"
                          onClick={() => wl.setLinkedFilterOpen(true)}
                        >
                          <i className="fas fa-filter" aria-hidden="true" />
                          <span>Accounts</span>
                        </button>
                      )}
                      <span className="member-dash-grid-curr" id="member_balance_grid_currency_line" />
                    </div>
                  </div>
                  <div className="member-dash-col-split">
                    <div className="member-dash-rail-matrix member-dash-col member-dash-col-grid member-dash-col-split">
                      <MemberBalanceMiniGrid
                        linkedAccountsList={wl.linkedAccountsList}
                        gridSelectedIds={wl.gridSelectedIds}
                        currenciesUpper={gridDisplayCurrencies}
                        balanceMap={wl.miniGridBalances}
                        linkedAccountCurrenciesMap={wl.linkedAccountCurrenciesMap}
                        linkedCurrenciesLoaded={wl.linkedCurrenciesLoaded}
                        shellOnly={gridShellOnly}
                      />
                      <p id="member_balance_grid_hint" className="member-balance-mini-hint" style={{ margin: "4px 0 0" }}>
                        {wl.miniGridHint}
                      </p>
                    </div>
                    <div className="member-dash-rail-total member-dash-col member-dash-col-total-col member-dash-col-split">
                      <div className="member-dash-total-column-stack">
                        <div className="member-dash-total-matrix" role="region" aria-label="Balance totals">
                          <div className="member-dash-total-matrix-hd">Total</div>
                          <div className="member-dash-total-matrix-body">
                            <MemberDashTotal
                              linkedAccountsList={wl.linkedAccountsList}
                              gridSelectedIds={wl.gridSelectedIds}
                              currenciesUpper={gridDisplayCurrencies}
                              balanceMap={wl.miniGridBalances}
                              linkedAccountCurrenciesMap={wl.linkedAccountCurrenciesMap}
                              linkedCurrenciesLoaded={wl.linkedCurrenciesLoaded}
                              shellOnly={gridShellOnly}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <MemberCurrencyTables
          loading={wl.loadingTable}
          isAllSelected={wl.isAllSelected}
          noCurrencySelected={noCurrencySelected}
          historyGrouped={wl.historyGrouped}
          historyOrder={wl.historyOrder}
        />
      </div>

      <MemberLinkedFilterModal
        open={wl.linkedFilterOpen}
        linkedAccountsList={wl.linkedAccountsList}
        gridSelectedIds={wl.gridSelectedIds}
        onClose={() => wl.setLinkedFilterOpen(false)}
        onApply={wl.applyLinkedFilter}
      />
    </MemberLayout>
  );
}
