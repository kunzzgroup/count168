import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LOGIN_I18N } from "../../translateFile/loginTranslate.js";

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
  const [searchParams] = useSearchParams();
  const roleFromUrl = searchParams.get("role") === "member" ? "member" : "admin";

  const [role, setRole] = useState(roleFromUrl);
  const [companyId, setCompanyId] = useState("");
  const [userField, setUserField] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [maintenanceList, setMaintenanceList] = useState([]);
  const [modal, setModal] = useState({ open: false, title: "Notice", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem("login_lang") || "en");

  const verifyTimeoutRef = useRef(null);
  const i18n = useMemo(() => LOGIN_I18N[lang] || LOGIN_I18N.en, [lang]);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  useEffect(() => {
    localStorage.setItem("login_lang", lang);
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session/current_user_api.php", {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled || !res.ok || !json?.success || !json?.data) return;

        const user = json.data;
        const userType = String(user.user_type || "").toLowerCase();
        if (userType === "member") {
          navigate("/member", { replace: true });
          return;
        }
        if (user.needs_owner_secondary) {
          navigate("/owner-secondary-password", { replace: true });
          return;
        }
        if (user.needs_user_secondary) {
          navigate("/user-secondary-password", { replace: true });
          return;
        }
        navigate("/dashboard", { replace: true });
      } catch {
        // stay on login page when not authenticated
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const showNotice = useCallback(
    (message, title) => {
      setModal({ open: true, title: title || i18n.notice, message: message || "Unknown error" });
    },
    [i18n.notice]
  );

  useEffect(() => {
    // Ensure login page always restores the base background layout.
    document.body.classList.remove(
      "transaction-page",
      "member-winloss-page",
      "dashboard-page",
      "account-page",
      "announcement-page",
      "datacapture-page",
      "report-page",
      "process-page",
      "process-page--bank",
      "process-page--show-all",
      "process-page--bank-show-all",
      "user-page",
      "user-page--show-all",
      "page-ready",
    );
    document.body.classList.add("bg");
    return () => {
      document.body.classList.remove("bg");
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/maintenance/get_public_api.php", {
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
        await fetch("/api/company/verify_api.php", { method: "POST", body: fd });
      } catch {
        /* silent; login validates */
      }
    }, 500);

    return () => {
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
    };
  }, [companyId]);

  const userPlaceholder = useMemo(
    () => (role === "member" ? i18n.accountPlaceholder : i18n.usernamePlaceholder),
    [role, i18n.accountPlaceholder, i18n.usernamePlaceholder]
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

      const res = await fetch("/api/session/login_api.php", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (data.status === "success" && data.redirect) {
        const userType = String(data.user_type || "").toLowerCase();
        const redirect = String(data.redirect || "");
        const loginRole = role;

        // Smooth routing: do not follow legacy "dashboard.php -> member" chain.
        if (loginRole === "member" || userType === "member") {
          window.location.assign(new URL("/member", `${window.location.origin}/`).toString());
          return;
        }

        // Keep secondary-password flow if backend explicitly asks for it.
        if (/owner_secondary_password\.php/i.test(redirect)) {
          window.location.assign(new URL("/owner-secondary-password", window.location.origin).toString());
          return;
        }
        if (/user_secondary_password\.php/i.test(redirect)) {
          window.location.assign(new URL("/user-secondary-password", window.location.origin).toString());
          return;
        }

        // Non-member users always enter dashboard directly.
        if (loginRole !== "member") {
          window.location.assign(new URL("/dashboard", window.location.origin).toString());
          return;
        }

        if (redirect.startsWith("http://") || redirect.startsWith("https://")) {
          window.location.href = redirect;
        } else {
          window.location.assign(new URL(redirect, `${window.location.origin}/`).toString());
        }
        return;
      }
      showNotice(data.message || i18n.loginFailed);
    } catch {
      showNotice(i18n.loginError);
    } finally {
      setSubmitting(false);
    }
  };

  const maintenanceVisible = maintenanceList.length > 0;

  return (
    <>
      <div className="sc-login-shell">
        {maintenanceVisible && (
          <div className="sc-login-maintenance-wrapper">
            <div className="sc-login-maintenance-track">
              {[...maintenanceList, ...maintenanceList].map((item, index) => (
                <div className="sc-login-maintenance-item" key={`${item.id}-${index}`}>
                  <span className="sc-login-maintenance-dot" />
                  <span className="sc-login-maintenance-label">{i18n.maintenanceLabel}</span>
                  <span dangerouslySetInnerHTML={{ __html: escapeHtml(item.content) }} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sc-login-card">
          <div className="sc-login-role-tabs">
            <button
              type="button"
              className={`sc-login-role-tab${role === "admin" ? " active" : ""}`}
              onClick={() => setRole("admin")}
            >
              {i18n.admin}
            </button>
            <button
              type="button"
              className={`sc-login-role-tab${role === "member" ? " active" : ""}`}
              onClick={() => setRole("member")}
            >
              {i18n.member}
            </button>
          </div>

          <div className="sc-login-card-content">
            <form className="sc-login-form" onSubmit={onSubmit}>
              <div className="sc-login-input-row">
                <i className="fas fa-building sc-login-input-icon" />
                <input
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
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>{i18n.rememberMe}</span>
                </label>
                {role === "admin" && (
                  <a href="/reset-password" className="sc-login-forgot-link">
                    {i18n.forgotPassword}
                  </a>
                )}
              </div>

              <button type="submit" className="sc-login-btn sc-login-submit-btn" disabled={submitting}>
                <span>{submitting ? i18n.loggingIn : i18n.login}</span>
              </button>

              <div className="sc-login-lang-switch-wrap">
                <button
                  type="button"
                  className={`sc-login-lang-switch ${lang === "zh" ? "is-zh" : "is-en"}`}
                  onClick={() => setLang((prev) => (prev === "en" ? "zh" : "en"))}
                  aria-label="Switch language"
                >
                  <span className="sc-login-lang-option">EN</span>
                  <span className="sc-login-lang-option">中</span>
                  <span className="sc-login-lang-thumb" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <img src="/images/telegram.png" alt="Telegram" className="sc-login-telegram-icon" />

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
