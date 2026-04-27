import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function loadScriptOnce(src, key) {
  return new Promise((resolve, reject) => {
    const marker = key || src;
    const existing = document.querySelector(`script[data-member-script="${marker}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.memberScript = marker;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function dmy(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}/${m}/${y}`;
}

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const AVATAR_MAP = {
  male1: "/images/avatar1.png",
  male2: "/images/avatar2.png",
  male3: "/images/avatar3.png",
  male4: "/images/avatar4.png",
  male5: "/images/avatar5.png",
  male6: "/images/avatar6.png",
  male7: "/images/avatar7.png",
  male8: "/images/avatar8.png",
  male9: "/images/avatar9.png",
  female1: "/images/female1.png",
  female2: "/images/female2.png",
  female3: "/images/female3.png",
  female4: "/images/female4.png",
  female5: "/images/female5.png",
  female6: "/images/female6.png",
  female7: "/images/female7.png",
  female8: "/images/female8.png",
  female9: "/images/female9.png",
};

export default function MemberPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const initialAvatarId = readCookie("selectedAvatar") || "male1";
  const avatarSrc = useMemo(() => AVATAR_MAP[initialAvatarId] || AVATAR_MAP.male1, [initialAvatarId]);

  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => {
    const t = new Date(today);
    const day = t.getDay();
    const toMonday = day === 0 ? 6 : day - 1;
    t.setDate(t.getDate() - toMonday);
    return t;
  }, [today]);

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("transaction-page", "member-winloss-page");
    return () => {
      document.body.classList.remove("transaction-page", "member-winloss-page");
    };
  }, []);

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
        const cRes = await fetch(
          buildApiUrl(`api/accounts/account_company_api.php?action=get_account_companies&account_id=${u.user_id}`),
          { credentials: "include" },
        );
        const cJson = await cRes.json();
        if (!cancelled) {
          setMe(u);
          setCompanies(Array.isArray(cJson?.data) ? cJson.data : []);
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

  useEffect(() => {
    if (loading || !me) return;
    let cancelled = false;
    (async () => {
      await Promise.all([
        injectStylesheet(assetUrl("css/member.css")),
        injectStylesheet(assetUrl("css/sidebar.css")),
        injectStylesheet(assetUrl("css/global-13inch.css")),
        injectStylesheet("https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css"),
      ]);
      if (cancelled) return;
      window.MEMBER_ACCOUNT_ID = Number(me.user_id) || 0;
      window.MEMBER_ACCOUNT_CODE = me.login_id || "";
      window.MEMBER_ACCOUNT_NAME = me.name || "";
      window.MEMBER_COMPANY_ID = Number(me.company_id) || 0;
      await loadScriptOnce(assetUrl("js/decimal.min.js"));
      await loadScriptOnce(assetUrl("js/money-decimal.js"));
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/flatpickr", "flatpickr-cdn");
      await loadScriptOnce(assetUrl("js/member.js"));
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, me]);

  const switchCompany = async (companyId) => {
    if (!companyId || Number(companyId) === Number(me?.company_id || 0)) return;
    try {
      await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), { credentials: "include" });
      window.location.reload();
    } catch {
      // Keep member.js behavior for API errors after reload attempts.
    }
  };

  const logout = async () => {
    try {
      await fetch(buildApiUrl("api/session/logout_api.php"), { method: "POST", credentials: "include" });
    } finally {
      navigate("/login", { replace: true });
    }
  };

  if (loading || !me) return null;
  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "Member";

  return (
    <>
      <div className="informationmenu-overlay" style={{ display: "none" }} />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src="/images/count_whitelogo.png" alt="EAZYCOUNT Logo" className="header-logo" />
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container">
              <div className="current-avatar">
                <img id="currentAvatarImg" className="current-avatar-img" src={avatarSrc} alt="Avatar" />
              </div>
            </div>
            <div className="user-avatar-dropdown">
              <div className="user-info">
                <div className="user-name">{me.login_id || "-"}</div>
                <div className="user-role">{roleLabel}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="informationmenu-content">
          <div className="content-separator" />
          <div className="informationmenu-section">
            <div className="informationmenu-section-title current-page" data-page="member">
              Win/Loss
            </div>
          </div>
        </div>
        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">Exp:</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span>
            </div>
          </div>
          <button className="btn logout-btn" onClick={logout} type="button">
            Logout
          </button>
        </div>
      </div>

      <div className="transaction-container">
        <h1 className="transaction-title">Win/Loss</h1>
        <div className="transaction-separator-line" />
        <div className="transaction-main-content">
          <div className="transaction-search-section" style={{ flex: 1 }}>
            <div className="transaction-form-group transaction-capture-date-group">
              <label className="transaction-label transaction-date-range-label">Capture Date</label>
              <div className="transaction-capture-date-row">
                <div className="transaction-date-range-wrap" id="capture_date_range_wrap">
                  <i className="fas fa-calendar-alt" aria-hidden="true" />
                  <input
                    type="text"
                    id="capture_date_range"
                    className="transaction-input transaction-date-range-input"
                    defaultValue={`${dmy(monday)} - ${dmy(today)}`}
                    placeholder="Select date range"
                    readOnly
                    style={{ cursor: "pointer" }}
                  />
                </div>
                <div className="transaction-quick-select-wrap">
                  <div className="dropdown transaction-quick-select-dropdown">
                    <button type="button" className="btn btn-secondary dropdown-toggle transaction-quick-select-btn">
                      <i className="fas fa-calendar-alt" />
                      <span id="quick-select-text">Period</span>
                      <i className="fas fa-chevron-down" />
                    </button>
                    <div className="dropdown-menu" id="quick-select-dropdown">
                      <button type="button" className="dropdown-item">Today</button>
                      <button type="button" className="dropdown-item">Yesterday</button>
                      <button type="button" className="dropdown-item">This Week</button>
                      <button type="button" className="dropdown-item">Last Week</button>
                      <button type="button" className="dropdown-item">This Month</button>
                      <button type="button" className="dropdown-item">Last Month</button>
                      <button type="button" className="dropdown-item">This Year</button>
                      <button type="button" className="dropdown-item">Last Year</button>
                    </div>
                  </div>
                </div>
              </div>
              <input type="hidden" id="date_from" defaultValue={dmy(monday)} />
              <input type="hidden" id="date_to" defaultValue={dmy(today)} />
            </div>
            {companies.length > 1 && (
              <div className="member-company-filter" id="member_company_filter" style={{ display: "flex", visibility: "visible" }}>
                <span className="transaction-company-label">Company:</span>
                <div id="member_company_buttons" className="transaction-company-buttons member-currency-buttons">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className={`transaction-company-btn ${Number(company.company_id) === Number(me.company_id) ? "active" : ""}`}
                      data-company-id={company.company_id}
                      data-company-label={String(company.company_code || "").toUpperCase()}
                      onClick={() => switchCompany(company.company_id)}
                    >
                      {String(company.company_code || "").toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="member-account-filter transaction-company-filter" id="member_account_filter" style={{ display: "none" }}>
              <span className="transaction-company-label">Account:</span>
              <div id="member_account_buttons" className="transaction-company-buttons member-currency-buttons">
                <span className="member-account-loading" id="member_account_loading">Loading...</span>
              </div>
            </div>
            <div className="transaction-company-filter member-currency-filter" id="member_currency_filter" style={{ display: "flex", visibility: "visible" }}>
              <span className="transaction-company-label">Currency:</span>
              <div id="member_currency_buttons" className="transaction-company-buttons member-currency-buttons" />
            </div>
          </div>
        </div>
        <div className="member-currency-section" id="member_currency_tables_section" style={{ display: "flex", visibility: "visible" }}>
          <div id="member_currency_tables" className="member-currency-tables">
            <p className="member-currency-empty" style={{ margin: 0 }}>Loading...</p>
          </div>
        </div>
        <div id="notificationContainer" className="transaction-notification-container" />
      </div>
    </>
  );
}
