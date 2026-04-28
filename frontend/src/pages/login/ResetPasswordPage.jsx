import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendResetTac, submitResetPassword } from "./resetPassword.js";

function AlertModal({ open, title, message, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`modal-overlay${open ? " is-open" : ""}`}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
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

export default function ResetPasswordPage() {
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [tac, setTac] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSendingTac, setIsSendingTac] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "Notice", message: "" });
  const tacInputRef = useRef(null);

  useEffect(() => {
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
      "page-ready"
    );
    document.body.classList.add("bg");

    return () => {
      document.body.classList.remove("bg");
    };
  }, []);

  const showModal = useCallback((title, message) => {
    setModal({
      open: true,
      title: title || "Notice",
      message: message || "",
    });
  }, []);

  const passwordMatched = useMemo(() => {
    if (!confirmPassword) return true;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const onSendTac = async () => {
    const normalizedCompanyId = companyId.toUpperCase().trim();
    const trimmedEmail = email.trim();

    if (!normalizedCompanyId) {
      showModal("Notice", "Please enter Company ID first");
      return;
    }
    if (!trimmedEmail) {
      showModal("Notice", "Please enter your email address first");
      return;
    }

    setIsSendingTac(true);
    try {
      const data = await sendResetTac({
        companyId: normalizedCompanyId,
        email: trimmedEmail,
      });

      if (data.success) {
        let message = data.message || "TAC code has been sent to your email";
        if (data.tac) {
          message += `\n\nYour verification code: ${data.tac}`;
          setTac(data.tac);
        }
        showModal("Success", message);
        requestAnimationFrame(() => {
          tacInputRef.current?.focus();
        });
      } else {
        showModal("Notice", data.message || "Failed to send TAC. Please try again.");
      }
    } catch (error) {
      console.error("Send TAC error:", error);
      showModal("Notice", "Network error. Please try again.");
    } finally {
      setIsSendingTac(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isResetting) return;

    if (!passwordMatched) {
      showModal("Notice", "Passwords do not match");
      return;
    }

    const normalizedCompanyId = companyId.toUpperCase().trim();
    const trimmedEmail = email.trim();
    const trimmedTac = tac.trim();

    if (!trimmedTac) {
      showModal("Notice", "Please enter the TAC code");
      return;
    }

    if (!normalizedCompanyId || !trimmedEmail) {
      showModal("Notice", "Company ID and email are required");
      return;
    }

    setIsResetting(true);
    try {
      const data = await submitResetPassword({
        companyId: normalizedCompanyId,
        email: trimmedEmail,
        tac: trimmedTac,
        newPassword,
      });

      if (data.success) {
        showModal("Success", "Password reset successful! Redirecting to login...");
        setTimeout(() => {
          window.location.assign("/login");
        }, 1500);
        return;
      }

      showModal("Notice", data.message || "Failed to reset password. Please try again.");
      setIsResetting(false);
    } catch (error) {
      console.error("Reset password error:", error);
      showModal("Notice", "Network error. Please try again.");
      setIsResetting(false);
    }
  };

  return (
    <>
      <div className="login-container">
        <div className="login-header">
          <h2>Reset Password</h2>
        </div>
        <div className="login-card">
          <div className="form-content">
            <form className="login-form" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-building input-icon" />
                <input
                  type="text"
                  placeholder="Company / Group ID (or Owner Code)"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="input-group">
                <i className="fas fa-envelope input-icon" />
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="tac-container">
                <div className="input-group">
                  <i className="fas fa-key input-icon" />
                  <input
                    ref={tacInputRef}
                    type="text"
                    placeholder="TAC"
                    value={tac}
                    onChange={(event) => setTac(event.target.value)}
                  />
                </div>
                <button type="button" className="tac-btn" onClick={onSendTac} disabled={isSendingTac}>
                  {isSendingTac ? "Sending..." : "SEND"}
                </button>
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={{ borderColor: passwordMatched ? "#e1e5e9" : "#dc3545" }}
                  required
                />
              </div>

              <button type="submit" className="login-btn" disabled={isResetting}>
                <span>{isResetting ? "Resetting..." : "Reset Password"}</span>
              </button>

              <div className="language-switch-container">
                <a href="/cn/reset-password.php" className="lang-switch" title="Switch Language">
                  <span className="lang-option">中文</span>
                  <span className="lang-option active">English</span>
                </a>
              </div>

              <div className="back-to-login">
                <a href="/login" className="back-link">
                  <i className="fas fa-arrow-left" />
                  Back to Login
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>

      <AlertModal
        open={modal.open}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((state) => ({ ...state, open: false }))}
      />
    </>
  );
}
