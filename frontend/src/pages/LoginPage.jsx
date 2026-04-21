import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function AlertModal({ open, title, message, onClose }) {
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
      className={`modal-overlay${open ? " is-open" : ""}`}
      aria-hidden={open ? "false" : "true"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box"
        role="dialog"
        aria-labelledby="modalTitle"
        aria-describedby="modalMessage"
      >
        <div className="modal-icon-wrap">
          <i className="fas fa-exclamation-triangle modal-icon" aria-hidden="true" />
        </div>
        <h3 id="modalTitle" className="modal-title">
          {title}
        </h3>
        <p id="modalMessage" className="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-primary" onClick={onClose}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
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

  const verifyTimeoutRef = useRef(null);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  const showNotice = useCallback((message, title = "Notice") => {
    setModal({ open: true, title, message: message || "Unknown error" });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/maintenance/get_public_api.php", { signal: ac.signal });
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
    () => (role === "member" ? "Account Id" : "Username"),
    [role]
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

      const res = await fetch("/login_process.php", { method: "POST", body: fd });
      const data = await res.json();
      if (data.status === "success" && data.redirect) {
        const redirect = String(data.redirect);
        if (redirect.startsWith("http://") || redirect.startsWith("https://")) {
          window.location.href = redirect;
        } else {
          window.location.assign(new URL(redirect, `${window.location.origin}/`).toString());
        }
        return;
      }
      showNotice(data.message || "Login failed");
    } catch {
      showNotice("An error occurred during login");
    } finally {
      setSubmitting(false);
    }
  };

  const maintenanceVisible = maintenanceList.length > 0;

  return (
    <>
      <div className="login-container">
        {maintenanceVisible && (
          <div className="maintenance-marquee-wrapper">
            <div className="maintenance-marquee-track">
              {[...maintenanceList, ...maintenanceList].map((item, index) => (
                <div className="maintenance-marquee-item" key={`${item.id}-${index}`}>
                  <span className="maintenance-marquee-dot" />
                  <span className="maintenance-marquee-label">系统维护中:</span>
                  <span dangerouslySetInnerHTML={{ __html: escapeHtml(item.content) }} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="role-tabs">
          <button
            type="button"
            className={`role-tab${role === "admin" ? " active" : ""}`}
            onClick={() => setRole("admin")}
          >
            Admin
          </button>
          <button
            type="button"
            className={`role-tab${role === "member" ? " active" : ""}`}
            onClick={() => setRole("member")}
          >
            Member
          </button>
        </div>

        <div className="login-card">
          <div className="form-content">
            <form className="login-form" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-building input-icon" />
                <input
                  type="text"
                  placeholder="Company / Group ID"
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value.toUpperCase())}
                />
              </div>

              <div className="input-group">
                <i className="fas fa-user input-icon" />
                <input
                  type="text"
                  placeholder={userPlaceholder}
                  required
                  value={userField}
                  onChange={(e) => setUserField(e.target.value.toUpperCase())}
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="form-options">
                <label className="remember-switch">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="slider" />
                  <span className="remember-text">Remember me</span>
                </label>
                {role === "admin" && (
                  <a href="/reset-password.php" className="forgot-link">
                    Forget Password?
                  </a>
                )}
              </div>

              <button type="submit" className="login-btn" disabled={submitting}>
                <span>{submitting ? "Logging in..." : "Login"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <img src="/images/telegram.png" alt="Telegram" className="telegram-icon" />

      <AlertModal
        open={modal.open}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </>
  );
}
