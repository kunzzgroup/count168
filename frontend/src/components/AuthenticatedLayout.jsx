import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";
import ConfirmLogoutModal from "./ConfirmLogoutModal.jsx";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";

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

export default function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoverSection, setHoverSection] = useState(null);
  const [submenuPos, setSubmenuPos] = useState({ report: { top: 0, left: 0 }, maintenance: { top: 0, left: 0 } });
  const reportTitleRef = useRef(null);
  const maintenanceTitleRef = useRef(null);

  // --- Notification Panel State ---
  const [showNotifications, setShowNotifications] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [readAnnouncements, setReadAnnouncements] = useState(new Set());

  // --- Avatar Selector State ---
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const initialAvatarId = readCookie("selectedAvatar") || "male1";
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [selectedGender, setSelectedGender] = useState(initialAvatarId.startsWith("female") ? "female" : "male");
  const avatarContainerRef = useRef(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
    return () => {
      document.body.classList.remove("dashboard-page");
      document.body.classList.add("bg");
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") {
        setLang(e.newValue === "zh" ? "zh" : "en");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = json.data;
        if (u.user_type === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        if (u.needs_owner_secondary) {
          window.location.assign(new URL("/owner-secondary-password", window.location.origin).href);
          return;
        }
        setMe(u);
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    const onCompanySession = async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (res.ok && json.success && json.data) {
          setMe(json.data);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, []);

  // --- Click outside handlers ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarContainerRef.current && !avatarContainerRef.current.contains(e.target)) {
        setShowAvatarOptions(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // --- Notification Logic ---
  const toggleNotifications = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!showNotifications) {
      setShowNotifications(true);
      setAnnouncementsLoading(true);
      try {
        const res = await fetch(buildApiUrl("api/announcements/announcement_get_dashboard_api.php"), { credentials: "include" });
        const json = await res.json();
        if (json.success && json.data) {
          setAnnouncements(json.data);
        } else {
          setAnnouncements([]);
        }
      } catch {
        setAnnouncements([]);
      } finally {
        setAnnouncementsLoading(false);
      }
    } else {
      setShowNotifications(false);
    }
  };

  const markAnnouncementRead = (id) => {
    setReadAnnouncements(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // --- Avatar Logic ---
  const handleSelectAvatar = (avatarId) => {
    setSelectedAvatarId(avatarId);
    setShowAvatarOptions(false);
    try {
      localStorage.setItem("selectedAvatar", avatarId);
    } catch (e) {
      /* ignore */
    }
    document.cookie = `selectedAvatar=${encodeURIComponent(avatarId)}; path=/; max-age=31536000; SameSite=Lax`;
  };

  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
  const hasFullPermissions = permissions.length === 0;
  const canAccess = (key) => hasFullPermissions || permissions.includes(key);
  
  const avatarSrc = useMemo(() => AVATAR_MAP[selectedAvatarId] || AVATAR_MAP.male1, [selectedAvatarId]);
  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "";
  const webHref = (path) => new URL(path, window.location.origin).href;
  const processSpaPath = me?.company_has_bank && !me?.company_has_gambling ? "/bank-process-list" : "/process-list";
  const performLogout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await fetch(buildApiUrl("api/session/logout_api.php"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Even if request fails, clear client route to login.
    } finally {
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
      navigate("/login", { replace: true });
    }
  };
  const path = location.pathname;
  const isProcessPage = path === "/process-list" || path === "/bank-process-list";
  const applyLanguage = (nextLang) => {
    const normalized = nextLang === "zh" ? "zh" : "en";
    setLang(normalized);
    localStorage.setItem("login_lang", normalized);
    window.dispatchEvent(new CustomEvent("eazycount:language-updated", { detail: { lang: normalized } }));
  };
  const openHoverSubmenu = (section, el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSubmenuPos((prev) => ({
      ...prev,
      [section]: {
        top: Math.max(8, rect.top - 2),
        left: rect.right,
      },
    }));
    setHoverSection(section);
  };

  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;

  return (
    <>
      <div className="informationmenu-overlay" style={{ display: "none" }} aria-hidden="true" />
      <div className={`informationmenu ${lang === "zh" ? "is-zh" : ""}`}>
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src="/images/count_whitelogo.png" alt="EAZYCOUNT" className="header-logo" />
            <div className="notification-bell" title={i18n.notifications} onClick={toggleNotifications}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
                </svg>
            </div>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container" ref={avatarContainerRef}>
              <div className="current-avatar" onClick={() => setShowAvatarOptions(!showAvatarOptions)}>
                <img className="current-avatar-img" src={avatarSrc} alt="" width={36} height={36} />
              </div>
              
              <div className={`avatar-options ${showAvatarOptions ? "show" : ""}`} id="avatarOptions">
                  <div className="options-title">{i18n.chooseAvatar}</div>
                  <div className="gender-selection">
                      <button type="button" className={`gender-btn ${selectedGender === 'male' ? 'active' : ''}`} onClick={() => setSelectedGender('male')}>{i18n.male}</button>
                      <button type="button" className={`gender-btn ${selectedGender === 'female' ? 'active' : ''}`} onClick={() => setSelectedGender('female')}>{i18n.female}</button>
                  </div>
                  
                  <div className={`avatar-list ${selectedGender === 'male' ? 'show' : ''}`}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                          <div key={`male${num}`} className={`avatar-option ${selectedAvatarId === `male${num}` ? 'selected' : ''}`} onClick={() => handleSelectAvatar(`male${num}`)}>
                              <img src={`/images/avatar${num}.png`} alt={`Male Avatar ${num}`} className="avatar-option-img" />
                          </div>
                      ))}
                  </div>
                  <div className={`avatar-list ${selectedGender === 'female' ? 'show' : ''}`}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                          <div key={`female${num}`} className={`avatar-option ${selectedAvatarId === `female${num}` ? 'selected' : ''}`} onClick={() => handleSelectAvatar(`female${num}`)}>
                              <img src={`/images/female${num}.png`} alt={`Female Avatar ${num}`} className="avatar-option-img" />
                          </div>
                      ))}
                  </div>
              </div>
            </div>
            
            <div className="user-info">
              <div className="user-name">{me?.name || me?.login_id || "-"}</div>
              <div className="user-role">{roleLabel || i18n.user}</div>
              <div style={{ marginTop: lang === "zh" ? 2 : 6 }}>
                <div
                  role="group"
                  aria-label={i18n.switchLanguage}
                  style={{
                    display: "inline-flex",
                    border: "1px solid rgba(0, 79, 249, 0.25)",
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => applyLanguage("en")}
                    style={{
                      border: "none",
                      padding: lang === "zh" ? "1px 8px" : "2px 9px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      color: lang === "en" ? "#fff" : "#1f2937",
                      background: lang === "en" ? "#2563eb" : "transparent",
                    }}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => applyLanguage("zh")}
                    style={{
                      border: "none",
                      padding: lang === "zh" ? "1px 8px" : "2px 9px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      color: lang === "zh" ? "#fff" : "#1f2937",
                      background: lang === "zh" ? "#2563eb" : "transparent",
                    }}
                  >
                    中
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="informationmenu-content">
          <div className="content-separator" />
          {canAccess("home") && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/dashboard" ? "current-page" : "account-direct"}`} onClick={() => navigate("/dashboard")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                {i18n.sidebarHome}
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/domain" ? "current-page" : "account-direct"}`} onClick={() => navigate("/domain")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                </svg>
                {i18n.sidebarDomain}
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/announcement" ? "current-page" : "account-direct"}`} onClick={() => navigate("/announcement")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
                {i18n.sidebarAnnouncement}
              </div>
            </div>
          )}
          {canAccess("admin") && (
            <div className="informationmenu-section">
              <div className={`informationmenu-section-title ${path === "/userlist" ? "current-page" : "account-direct"}`} onClick={() => navigate("/userlist")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                {i18n.sidebarAdmin}
              </div>
            </div>
          )}
          {canAccess("account") && (
            <>
              <div className="informationmenu-section">
                <div
                  className={`informationmenu-section-title ${path === "/account-list" ? "current-page" : "account-direct"}`}
                  onClick={() => navigate("/account-list")}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  {i18n.sidebarAccount}
                </div>
              </div>
              <div className="informationmenu-section">
                <div
                  className={`informationmenu-section-title ${path === "/ownership" ? "current-page" : "account-direct"}`}
                  onClick={() => navigate("/ownership")}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  {i18n.sidebarOwnership}
                </div>
              </div>
            </>
          )}
          {canAccess("process") && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${isProcessPage ? "current-page" : "account-direct"}`}
                onClick={() => navigate(processSpaPath)}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                {i18n.sidebarProcess}
              </div>
            </div>
          )}
          {canAccess("datacapture") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${path === "/datacapture" ? "current-page" : "account-direct"}`}
                onClick={() => navigate("/datacapture")}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
                {i18n.sidebarDataCapture}
              </div>
            </div>
          )}
          {canAccess("payment") && (
            <div className="informationmenu-section">
              <div
                className={`informationmenu-section-title ${path === "/transaction" ? "current-page" : "account-direct"}`}
                onClick={() => navigate("/transaction")}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                </svg>
                {i18n.sidebarTransactionPayment}
              </div>
            </div>
          )}
          {canAccess("report") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper" onMouseLeave={() => setHoverSection(null)}>
                <div
                  ref={reportTitleRef}
                  className={`informationmenu-section-title ${(path === "/customer-report" || path === "/domain-report") ? "active" : ""}`}
                  data-section="report"
                  onMouseEnter={() => openHoverSubmenu("report", reportTitleRef.current)}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                  </svg>
                  {i18n.sidebarReport}
                  <span className="section-arrow">▶</span>
                </div>
                <div
                  className="submenu"
                  id="report-submenu"
                  style={
                    hoverSection === "report"
                      ? {
                          position: "fixed",
                          top: submenuPos.report.top,
                          left: submenuPos.report.left,
                          opacity: 1,
                          visibility: "visible",
                          transform: "translateX(0)",
                          pointerEvents: "auto",
                          zIndex: 4000,
                        }
                      : undefined
                  }
                  onMouseEnter={() => setHoverSection("report")}
                  onMouseLeave={() => setHoverSection(null)}
                >
                  <div className="submenu-content">
                    <a
                      href={webHref("/customer-report")}
                      className={`submenu-item ${path === "/customer-report" ? "current-page" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate("/customer-report");
                      }}
                    >
                      <span>{i18n.sidebarCustomerReport}</span>
                    </a>
                    <a
                      href={webHref("/domain-report")}
                      className={`submenu-item ${path === "/domain-report" ? "current-page" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate("/domain-report");
                      }}
                    >
                      <span>{i18n.sidebarDomainReport}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          {canAccess("maintenance") && (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper" onMouseLeave={() => setHoverSection(null)}>
                <div
                  ref={maintenanceTitleRef}
                  className={`informationmenu-section-title ${(["/payment-maintenance", "/capture-maintenance", "/transaction-maintenance", "/formula-maintenance", "/bankprocess-maintenance"].includes(path)) ? "active" : ""}`}
                  data-section="maintenance"
                  onMouseEnter={() => openHoverSubmenu("maintenance", maintenanceTitleRef.current)}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                  </svg>
                  {i18n.sidebarMaintenance}
                  <span className="section-arrow">▶</span>
                </div>
                <div
                  className="submenu"
                  id="maintenance-submenu"
                  style={
                    hoverSection === "maintenance"
                      ? {
                          position: "fixed",
                          top: submenuPos.maintenance.top,
                          left: submenuPos.maintenance.left,
                          opacity: 1,
                          visibility: "visible",
                          transform: "translateX(0)",
                          pointerEvents: "auto",
                          zIndex: 4000,
                        }
                      : undefined
                  }
                  onMouseEnter={() => setHoverSection("maintenance")}
                  onMouseLeave={() => setHoverSection(null)}
                >
                  <div className="submenu-content">
                    {me?.company_has_gambling && (
                      <a
                        href={webHref("/capture-maintenance")}
                        className={`submenu-item ${path === "/capture-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/capture-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarDataCapture}</span>
                      </a>
                    )}
                    {me?.company_has_gambling && (
                      <a
                        href={webHref("/transaction-maintenance")}
                        className={`submenu-item ${path === "/transaction-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/transaction-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarTransaction}</span>
                      </a>
                    )}
                    <a
                      href={webHref("/payment-maintenance")}
                      className={`submenu-item ${path === "/payment-maintenance" ? "current-page" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate("/payment-maintenance");
                      }}
                    >
                      <span>{i18n.sidebarPayment}</span>
                    </a>
                    {me?.company_has_gambling && (
                      <a
                        href={webHref("/formula-maintenance")}
                        className={`submenu-item ${path === "/formula-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/formula-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarFormula}</span>
                      </a>
                    )}
                    {me?.company_has_bank && (
                      <a
                        href={webHref("/bankprocess-maintenance")}
                        className={`submenu-item ${path === "/bankprocess-maintenance" ? "current-page" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate("/bankprocess-maintenance");
                        }}
                      >
                        <span>{i18n.sidebarProcess}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">{i18n.exp}</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span>
            </div>
          </div>
          <button type="button" className="btn logout-btn" onClick={() => setShowLogoutConfirm(true)}>
            {i18n.logout}
          </button>
        </div>
      </div>

      <div className={`notification-overlay ${showNotifications ? "show" : ""}`} id="notificationOverlay" onClick={toggleNotifications}></div>
      <div className={`notification-panel ${showNotifications ? "show" : ""}`} id="notificationPanel">
        <div className="notification-header">
            <h2>{i18n.announcements}</h2>
            <button className="notification-close" onClick={toggleNotifications} title={i18n.close}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div className="notification-content" id="notificationContent">
          {announcementsLoading ? (
            <div className="notification-empty"><p>{i18n.loadingAnnouncements}</p></div>
          ) : announcements.length > 0 ? (
            announcements.map((announcement, index) => (
              <div key={index} className={`notification-item ${readAnnouncements.has(index) ? '' : 'unread'}`} onClick={() => markAnnouncementRead(index)}>
                <div className="notification-title">{announcement.title}</div>
                <div className="notification-message">{announcement.content}</div>
                <div className="notification-time">{announcement.created_at}</div>
              </div>
            ))
          ) : (
            <div className="notification-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>
              <p>{i18n.noAnnouncements}</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmLogoutModal
        open={showLogoutConfirm}
        loading={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={performLogout}
        i18n={i18n}
      />

      <Outlet />
    </>
  );
}
