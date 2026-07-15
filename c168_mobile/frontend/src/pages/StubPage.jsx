import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MobileShell from "../components/layout/MobileShell.jsx";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import { fetchJson } from "../lib/fetchJson.js";
import "./stub.css";

export default function StubPage({ title, backTo = "/dashboard" }) {
  const [me, setMe] = useState(null);
  const lang = localStorage.getItem("login_lang") || "en";
  const i18n = DASHBOARD_I18N[lang] || DASHBOARD_I18N.en;

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { res, json } = await fetchJson(buildApiUrl("api/session/current_user_api.php"), {
          signal: ac.signal,
        });
        if (res.ok && json?.success && json?.data) setMe(json.data);
      } catch {
        /* stub still usable */
      }
    })();
    return () => ac.abort();
  }, []);

  const companyCode = String(me?.company_code || me?.company_id || "").toUpperCase();

  return (
    <MobileShell i18n={i18n} me={me} companyCode={companyCode} showBottomNav>
      <div className="mobile-stub">
        <h1>{title}</h1>
        <p>{lang === "zh" ? "此页面即将在 Mobile 版中实现。" : "Coming soon on mobile."}</p>
        <Link to={backTo} className="mobile-stub__link">
          {lang === "zh" ? "返回" : "Back"}
        </Link>
      </div>
    </MobileShell>
  );
}
