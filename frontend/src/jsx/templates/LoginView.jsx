import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import "../../css/app/style.css";
import "../../css/app/index.css";
import "../../css/app/global-13inch.css";

export default function LoginView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [role, setRole] = useState("admin");
  const [companyId, setCompanyId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const showModal = useCallback((msg) => {
    setModalMessage(msg);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  useEffect(() => {
    document.body.classList.add("bg");
    return () => document.body.classList.remove("bg");
  }, []);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      showModal(err);
    }
    const c = searchParams.get("company_id");
    if (c != null && c !== "") {
      setCompanyId(c);
    }
    const lr = searchParams.get("login_role");
    if (lr === "member" || lr === "admin") {
      setRole(lr);
    }
    const lid = searchParams.get("login_id");
    const aid = searchParams.get("account_id");
    if (lr === "member") {
      if (aid != null && aid !== "") {
        setLoginId(aid);
      }
    } else if (lid != null && lid !== "") {
      setLoginId(lid);
    }
  }, [searchParams, showModal]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/auth/session")
      .then((r) => {
        if (cancelled) return;
        if (r.data?.authenticated) {
          if (r.data.secondaryPasswordVerified === false) {
            navigate("/secondary-password", { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await axios.post("/api/auth/login", {
        companyId,
        loginId,
        accountId: role === "member" ? loginId : undefined,
        password,
        loginRole: role,
        rememberMe
      });
      if (data.status === "success" && data.redirect) {
        navigate(data.redirect);
        return;
      }
      showModal(data.message ?? "Login failed");
    } catch (ex) {
      const msg = ex?.response?.data?.message ?? ex.message ?? "Login failed";
      showModal(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="login-container">
        <div className="maintenance-marquee-wrapper" id="maintenanceMarqueeWrapper" style={{ display: "none" }}>
          <div className="maintenance-marquee-track" id="maintenanceMarqueeTrack" />
        </div>

        <div className="role-tabs">
          <button
            type="button"
            className={`role-tab ${role === "admin" ? "active" : ""}`}
            id="admin-tab"
            onClick={() => setRole("admin")}
          >
            Admin
          </button>
          <button
            type="button"
            className={`role-tab ${role === "member" ? "active" : ""}`}
            id="member-tab"
            onClick={() => setRole("member")}
          >
            Member
          </button>
        </div>

        <div className="login-card">
          <div className="form-content">
            <form className="login-form" id="loginForm" onSubmit={onLogin}>
              <div className="input-group">
                <i className="fas fa-building input-icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Company / Group ID"
                  id="company-id"
                  name="company_id"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  required
                  autoComplete="organization"
                />
              </div>

              <div className="input-group">
                <i className={`fas ${role === "member" ? "fa-id-card" : "fa-user"} input-icon`} aria-hidden />
                <input
                  type="text"
                  placeholder={role === "member" ? "Account ID" : "Username"}
                  id="user-id"
                  name="login_id"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" aria-hidden />
                <input
                  type="password"
                  placeholder="Password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {role !== "member" && (
                <div className="form-options">
                  <label className="remember-switch">
                    <input
                      type="checkbox"
                      name="remember_me"
                      value="1"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="slider" />
                    <span className="remember-text">Remember me</span>
                  </label>
                  <Link to="#" className="forgot-link" onClick={(e) => e.preventDefault()}>
                    Forget Password?
                  </Link>
                </div>
              )}

              <button type="submit" className="login-btn" disabled={submitting}>
                <span>{submitting ? "Signing in…" : "Login"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <div
        id="alertModalOverlay"
        className={`modal-overlay${modalOpen ? " is-open" : ""}`}
        aria-hidden={!modalOpen}
        onClick={(e) => e.target === e.currentTarget && closeModal()}
        role="presentation"
      >
        <div className="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
          <div className="modal-icon-wrap">
            <i className="fas fa-exclamation-triangle modal-icon" aria-hidden />
          </div>
          <h3 id="modalTitle" className="modal-title">
            Notice
          </h3>
          <p id="modalMessage" className="modal-message">
            {modalMessage}
          </p>
          <div className="modal-actions">
            <button type="button" id="modalConfirmBtn" className="modal-btn modal-btn-primary" onClick={closeModal}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
