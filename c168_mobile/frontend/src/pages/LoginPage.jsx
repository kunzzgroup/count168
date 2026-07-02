import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LOGIN_I18N, localizeAuthApiMessage } from "../translateFile/auth/authTranslate.js";
import { apiUrl, spaPath } from "../lib/api.js";
import { useAuthBackground } from "./login/useAuthBackground.js";

const LOGIN_ASSET_RETRY_KEY = "ec_login_asset_retry";
const RESET_PASSWORD_PATH = "/reset-password/d56cf733-0468-4ca0-a14a-231425bc3e83";

function tryLoginPageReloadOnce() {
  if (sessionStorage.getItem(LOGIN_ASSET_RETRY_KEY)) {
    sessionStorage.removeItem(LOGIN_ASSET_RETRY_KEY);
    return false;
  }
  sessionStorage.setItem(LOGIN_ASSET_RETRY_KEY, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("_", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function AlertModal({ open, title, message, confirmText, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`sc-login-modal-overlay${open ? " is-open" : ""}`}
      aria-hidden={open ? "false" : "true"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sc-login-modal-box"
        role="dialog"
        aria-labelledby="modalTitle"
        aria-describedby="modalMessage"
      >
        <div className="sc-login-modal-icon-wrap">
          <i className="fas fa-exclamation-triangle sc-login-modal-icon" aria-hidden="true" />
        </div>
        <h3 id="modalTitle" className="sc-login-modal-title">
          {title}
        </h3>
        <p id="modalMessage" className="sc-login-modal-message">
          {message}
        </p>
        <div className="sc-login-modal-actions">
          <button type="button" className="sc-login-btn sc-login-btn-primary" onClick={onClose}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const roleFromUrl = searchParams.get("role") === "member" ? "member" : "admin";

  const [role, setRole] = useState(roleFromUrl);

  const setLoginRole = useCallback(
    (nextRole) => {
      setRole(nextRole);
      const next = new URLSearchParams(searchParams);
      if (nextRole === "member") {
        next.set("role", "member");
      } else {
        next.delete("role");
      }
      const qs = next.toString();
      navigate(qs ? `${spaPath("login")}?${qs}` : spaPath("login"), { replace: true });
    },
    [navigate, searchParams],
  );

  const [companyId, setCompanyId] = useState("");
  const [userField, setUserField] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [maintenanceList, setMaintenanceList] = useState([]);
  const [modal, setModal] = useState({ open: false, title: "Notice", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem("login_lang") || "en");

  const verifyTimeoutRef = useRef(null);
  const langThumbRef = useRef(null);
  const prevLangRef = useRef(lang);
  const i18n = useMemo(() => LOGIN_I18N[lang] || LOGIN_I18N.en, [lang]);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  useEffect(() => {
    localStorage.setItem("login_lang", lang);
  }, [lang]);

  useEffect(() => {
    const thumb = langThumbRef.current;
    const prevLang = prevLangRef.current;
    if (!thumb || prevLang === lang) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      prevLangRef.current = lang;
      return;
    }

    const fromX = prevLang === "zh" ? "100%" : "0%";
    const toX = lang === "zh" ? "100%" : "0%";
    const overshootX = lang === "zh" ? "112%" : "-12%";
    const reboundX1 = lang === "zh" ? "97%" : "3%";
    const reboundX2 = lang === "zh" ? "101.2%" : "-1.2%";

    thumb.animate(
      [
        { transform: `translateX(${fromX}) scaleX(1) scaleY(1)` },
        { transform: `translateX(${overshootX}) scaleX(1.1) scaleY(0.9)`, offset: 0.46 },
        { transform: `translateX(${reboundX1}) scaleX(0.95) scaleY(1.05)`, offset: 0.68 },
        { transform: `translateX(${reboundX2}) scaleX(1.03) scaleY(0.97)`, offset: 0.86 },
        { transform: `translateX(${toX}) scaleX(0.99) scaleY(1.01)`, offset: 0.94 },
        { transform: `translateX(${toX}) scaleX(1) scaleY(1)` },
      ],
      {
        duration: 980,
        easing: "cubic-bezier(0.34, 1.72, 0.64, 1)",
        fill: "none",
      },
    );

    prevLangRef.current = lang;
  }, [lang]);

  useEffect(() => {
    sessionStorage.removeItem(LOGIN_ASSET_RETRY_KEY);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(apiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (cancelled || !res.ok || !json?.success || !json?.data) return;

        const user = json.data;
        if (user.needs_owner_secondary) {
          window.location.href = "/owner-secondary-password/41ed85ee-645d-4cb9-b269-10dfc9e9ccdc";
          return;
        }
        if (user.needs_user_secondary) {
          window.location.href = "/user-secondary-password/d6bcd362-fad8-4124-9225-f6d3adc9b70d";
          return;
        }
        const redirect = location.state?.from || "/home";
        navigate(redirect, { replace: true });
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [navigate, location.state]);

  const showNotice = useCallback(
    (message, title) => {
      setModal({
        open: true,
        title: title || i18n.notice,
        message: message || i18n.unknownError,
      });
    },
    [i18n.notice, i18n.unknownError],
  );

  useAuthBackground();

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(apiUrl("api/maintenance/get_public_api.php"), {
          signal: ac.signal,
          credentials: "include",
        });
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setMaintenanceList(result.data);
        } else {
          setMaintenanceList([]);
        }
      } catch (e) {
        if (e.name !== "AbortError") setMaintenanceList([]);
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const v = companyId.trim();
    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
    if (!v) return undefined;

    verifyTimeoutRef.current = setTimeout(async () => {
      try {
        const fd = new FormData();
        fd.append("company_id", v);
        await fetch(apiUrl("api/company/verify_api.php"), { method: "POST", body: fd });
      } catch {
        /* silent */
      }
    }, 500);

    return () => {
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
    };
  }, [companyId]);

  const userPlaceholder = useMemo(
    () => (role === "member" ? i18n.accountPlaceholder : i18n.usernamePlaceholder),
    [role, i18n.accountPlaceholder, i18n.usernamePlaceholder],
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("action", "login");
      fd.append("company_id", companyId.toUpperCase().trim());
      fd.append("password", password);
      fd.append("login_role", role);
      if (role === "member") {
        fd.append("account_id", userField.toUpperCase().trim());
      } else {
        fd.append("login_id", userField.toUpperCase().trim());
        if (rememberMe) fd.append("remember_me", "1");
      }

      const res = await fetch(apiUrl("api/session/login_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
        cache: "no-store",
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        const msg = res.ok
          ? i18n.loginInvalidResponse
          : i18n.loginServerError.replace("{status}", String(res.status));
        if (tryLoginPageReloadOnce()) return;
        showNotice(msg);
        return;
      }

      if (data.status === "success") {
        sessionStorage.removeItem(LOGIN_ASSET_RETRY_KEY);
        const redirect = String(data.redirect || "");
        if (/owner[-_]secondary[-_]password/i.test(redirect)) {
          window.location.href = "/owner-secondary-password/41ed85ee-645d-4cb9-b269-10dfc9e9ccdc";
          return;
        }
        if (/user[-_]secondary[-_]password/i.test(redirect)) {
          window.location.href = "/user-secondary-password/d6bcd362-fad8-4124-9225-f6d3adc9b70d";
          return;
        }
        navigate(location.state?.from || "/home", { replace: true });
        return;
      }

      showNotice(localizeAuthApiMessage(data.message, lang) || i18n.loginFailed);
    } catch {
      if (tryLoginPageReloadOnce()) return;
      showNotice(i18n.loginError);
    } finally {
      setSubmitting(false);
    }
  };

  const maintenanceVisible = maintenanceList.length > 0;

  return (
    <>
      <div className="sc-login-column">
        <div className="sc-login-shell">
          {maintenanceVisible && (
            <div className="sc-login-maintenance-wrapper">
              <div className="sc-login-maintenance-track">
                {[...maintenanceList, ...maintenanceList].map((item, index) => (
                  <div className="sc-login-maintenance-item" key={`${item.id}-${index}`}>
                    <span className="sc-login-maintenance-dot" />
                    <span className="sc-login-maintenance-label">
                      {item.prefix || i18n.maintenanceLabel}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: escapeHtml(item.content) }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sc-login-card">
            <div className="sc-login-role-tabs">
              <button
                id="admin-tab"
                type="button"
                className={`sc-login-role-tab${role === "admin" ? " active" : ""}`}
                onClick={() => setLoginRole("admin")}
              >
                {i18n.admin}
              </button>
              <button
                id="member-tab"
                type="button"
                className={`sc-login-role-tab${role === "member" ? " active" : ""}`}
                onClick={() => setLoginRole("member")}
              >
                {i18n.member}
              </button>
            </div>

            <div className="sc-login-card-content">
              <form className="sc-login-form" onSubmit={onSubmit}>
                <div className="sc-login-input-row">
                  <i className="fas fa-building sc-login-input-icon" />
                  <input
                    id="company-id"
                    type="text"
                    className="sc-login-input"
                    placeholder={i18n.companyPlaceholder}
                    required
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="sc-login-input-row">
                  <i className="fas fa-user sc-login-input-icon" />
                  <input
                    id="user-id"
                    type="text"
                    className="sc-login-input"
                    placeholder={userPlaceholder}
                    required
                    value={userField}
                    onChange={(e) => setUserField(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="sc-login-input-row">
                  <i className="fas fa-lock sc-login-input-icon" />
                  <input
                    id="password"
                    type="password"
                    className="sc-login-input"
                    placeholder={i18n.passwordPlaceholder}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="sc-login-options">
                  <label className="sc-login-remember">
                    <input
                      type="checkbox"
                      className="sc-login-remember-check"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="sc-login-remember-slider" aria-hidden="true" />
                    <span className="sc-login-remember-text">{i18n.rememberMe}</span>
                  </label>
                  {role === "admin" && (
                    <a href={RESET_PASSWORD_PATH} className="sc-login-forgot-link">
                      {i18n.forgotPassword}
                    </a>
                  )}
                </div>

                <button type="submit" className="sc-login-btn sc-login-submit-btn" disabled={submitting}>
                  <span>{submitting ? i18n.loggingIn : i18n.login}</span>
                </button>

                <div className="sc-login-lang-ios-wrap">
                  <div
                    className={`sc-login-lang-ios ${lang === "zh" ? "is-zh" : "is-en"}`}
                    role="group"
                    aria-label="Switch language"
                  >
                    <span ref={langThumbRef} className="sc-login-lang-ios-thumb" />
                    <button
                      type="button"
                      className={`sc-login-lang-seg${lang === "en" ? " active" : ""}`}
                      onClick={() => setLang("en")}
                      aria-pressed={lang === "en"}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      className={`sc-login-lang-seg${lang === "zh" ? " active" : ""}`}
                      onClick={() => setLang("zh")}
                      aria-pressed={lang === "zh"}
                    >
                      中
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <AlertModal
        open={modal.open}
        title={modal.title}
        message={modal.message}
        confirmText={i18n.confirm}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </>
  );
}
