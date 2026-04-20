/**
 * Migrated from legacy/index.php
 * Login UI calls Spring Boot (replaces login_process.php).
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Index() {
  const navigate = useNavigate();
  const [stub, setStub] = useState(null);
  const [err, setErr] = useState(null);
  const [role, setRole] = useState("admin");
  const [companyId, setCompanyId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginMsg, setLoginMsg] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/legacy/stub", { params: { php: "index.php" } })
      .then((r) => {
        if (!cancelled) setStub(r.data);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? "request failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLogin = async (e) => {
    e.preventDefault();
    setLoginMsg(null);
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
      setLoginMsg(data.message ?? "Login failed");
    } catch (ex) {
      setLoginMsg(ex?.response?.data?.message ?? ex.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ padding: "1rem", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.35rem" }}>EazyCount</h1>
      <p style={{ color: "#555", fontSize: 14 }}>React ??(? index.php + login_process.php)</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setRole("admin")}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 8,
            border: role === "admin" ? "2px solid #2563eb" : "1px solid #ccc",
            background: role === "admin" ? "#eff6ff" : "#fff"
          }}
        >
          Admin
        </button>
        <button
          type="button"
          onClick={() => setRole("member")}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 8,
            border: role === "member" ? "2px solid #2563eb" : "1px solid #ccc",
            background: role === "member" ? "#eff6ff" : "#fff"
          }}
        >
          Member
        </button>
      </div>

      <form
        onSubmit={onLogin}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
          Company / Group ID
          <input
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
          {role === "member" ? "Account ID" : "Username"}
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            required
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>
        {role !== "member" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me (30 days)
          </label>
        )}
        {loginMsg && <p style={{ color: "crimson", fontSize: 14, margin: 0 }}>{loginMsg}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer"
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <details style={{ marginTop: 20, fontSize: 13 }}>
        <summary>???? / Spring stub</summary>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
        {stub && (
          <pre
            style={{
              background: "#f6f8fa",
              padding: 12,
              overflow: "auto",
              fontSize: 12
            }}
          >
            {JSON.stringify(stub, null, 2)}
          </pre>
        )}
      </details>
    </section>
  );
}
