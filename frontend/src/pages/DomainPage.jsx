import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

export default function DomainPage() {
  const navigate = useNavigate();

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
        // Keep the same access gate as legacy domain.php.
        if (u.user_type === "member") {
          window.location.assign(new URL("member.php", window.location.origin).href);
          return;
        }
        if (!u.has_c168_domain_page_access) {
          navigate("/dashboard", { replace: true });
          return;
        }

        // Use full-page navigation to keep original domain.php frontend 100% unchanged.
        window.location.assign(new URL("domain.php", window.location.origin).href);
      } catch {
        navigate("/login", { replace: true });
      }
    })();

  }, [navigate]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "#334155" }}>
      Redirecting to Domain...
    </div>
  );
}

