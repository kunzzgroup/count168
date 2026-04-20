import { useEffect } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

const boxStyle = {
  maxWidth: 480,
  margin: "0 auto",
  background: "#fff",
  padding: 28,
  borderRadius: 12,
  boxShadow: "0 4px 20px rgba(0,0,0,.08)"
};

export default function SecondaryPasswordView() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/auth/session")
      .then((r) => {
        if (cancelled) return;
        if (!r.data?.authenticated) {
          navigate("/login", { replace: true });
          return;
        }
        if (r.data.secondaryPasswordVerified !== false) {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => navigate("/login", { replace: true }));
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onLogout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f1f5f9", margin: 0, padding: "40px 16px", minHeight: "100vh" }}>
      <div style={boxStyle}>
        <h1 style={{ fontSize: "1.2rem", marginBottom: 12 }}>Secondary password</h1>
        <p style={{ color: "#64748b", lineHeight: 1.5 }}>
          Your account requires secondary password verification (C168). Port the logic from{" "}
          <code>api/users/user_secondary_password.php</code> here: POST form, verify, then set session{" "}
          <code>secondary_password_verified</code> and go to <Link to="/dashboard">/dashboard</Link>.
        </p>
        <p style={{ marginTop: 16 }}>
          <button type="button" onClick={onLogout} style={{ background: "none", border: "none", padding: 0, color: "#2563eb", cursor: "pointer", textDecoration: "underline" }}>
            Log out
          </button>
        </p>
      </div>
    </div>
  );
}
