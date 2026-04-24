import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

export default function UserSecondaryPasswordPage() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.classList.add("bg");
    return () => document.body.classList.remove("bg");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json?.success || !json?.data) {
          if (!cancelled) navigate("/login", { replace: true });
          return;
        }
        const user = json.data;
        if (String(user.user_type || "").toLowerCase() !== "user") {
          if (!cancelled) navigate("/login", { replace: true });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onChange = (e) => {
    const numericOnly = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    setPassword(numericOnly);
    if (errorMessage) setErrorMessage("");
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const numericOnly = pasted.replace(/[^0-9]/g, "").slice(0, 6);
    setPassword(numericOnly);
    if (errorMessage) setErrorMessage("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const value = password.trim();
    if (!/^\d{6}$/.test(value)) {
      setErrorMessage("Please enter exactly 6 digits");
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("secondary_password", value);
      const res = await fetch(buildApiUrl("api/session/verify_user_secondary_password_api.php"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setErrorMessage(json?.message || "An error occurred. Please try again.");
      inputRef.current?.focus();
    } catch {
      setErrorMessage("An error occurred. Please try again.");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="form-content">
          <h2 style={{ textAlign: "center", marginBottom: 30, color: "#1e293b", fontSize: 24, fontWeight: 600 }}>
            Secondary Password Verification
          </h2>
          <p style={{ textAlign: "center", marginBottom: 30, color: "#64748b", fontSize: 14 }}>
            Please enter your 6-digit secondary password to continue
          </p>

          <form className="login-form" onSubmit={onSubmit}>
            <div className="input-group">
              <i className="fas fa-lock input-icon" />
              <input
                ref={inputRef}
                type="password"
                placeholder="Enter 6-digit password"
                maxLength={6}
                pattern="[0-9]{6}"
                autoComplete="off"
                required
                autoFocus
                value={password}
                onChange={onChange}
                onPaste={onPaste}
              />
            </div>

            {errorMessage ? (
              <div
                style={{
                  backgroundColor: "#fee2e2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 20,
                  fontSize: 14,
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            <button type="submit" className="login-btn" disabled={submitting}>
              <span>{submitting ? "Verifying..." : "Verify"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
