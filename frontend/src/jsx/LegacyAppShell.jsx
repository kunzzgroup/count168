import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import routes from "./routes.config.json";

const modules = import.meta.glob("./pages/**/*.jsx");

export default function LegacyAppShell() {
  const { "*": splat } = useParams();
  const key = splat && splat.length > 0 ? splat.replace(/\/$/, "") : "index";
  const cfg = routes.find((r) => r.urlPath === key);

  if (!cfg) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <p>
          Unknown page: <code>{key}</code>
        </p>
        <p>
          <Link to="/">Home</Link> · <Link to="/app/index">Legacy index</Link>
        </p>
      </div>
    );
  }

  const loader = modules[cfg.module];
  if (!loader) {
    return (
      <div style={{ padding: 24 }}>
        Missing module <code>{cfg.module}</code>
      </div>
    );
  }

  const Cmp = lazy(loader);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <nav
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          gap: 12,
          alignItems: "center"
        }}
      >
        <Link to="/" style={{ fontWeight: 600 }}>
          EazyCount
        </Link>
        <span style={{ color: "#9ca3af" }}>|</span>
        <Link to="/app/index">Legacy login placeholder</Link>
        <Link to="/dashboard">Dashboard</Link>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
          <code>/app/{cfg.urlPath}</code>
        </span>
      </nav>
      <Suspense
        fallback={<div style={{ padding: 24, color: "#6b7280" }}>Loading…</div>}
      >
        <Cmp />
      </Suspense>
    </div>
  );
}
