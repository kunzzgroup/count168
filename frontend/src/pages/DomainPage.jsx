import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

export default function DomainPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!mounted) return;

        if (!res.ok || !json.success || !json.data) {
          navigate("/login", { replace: true });
          return;
        }

        const u = json.data;
        // Keep the same access gate as legacy domain.php.
        if (u.user_type === "member") {
          window.location.assign(new URL("member.php", window.location.origin).href);
          return;
        }
        if (!u.has_c168_domain_page_access) {
          navigate("/dashboard", { replace: true });
          return;
        }

        setAuthorized(true);
      } catch {
        navigate("/login", { replace: true });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "#334155" }}>
        Loading domain...
      </div>
    );
  }

  if (!authorized) return null;

  // Keep legacy domain frontend 100% unchanged while entering through SPA route.
  return (
    <iframe
      title="Domain"
      src="/domain.php"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}

