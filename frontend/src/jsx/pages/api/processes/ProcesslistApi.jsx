/**
 * Migrated from legacy/api/processes/processlist_api.php
 * UI placeholder - replace with full React. Backend: Spring Boot /api/legacy/*
 */
import { useEffect, useState } from "react";
import axios from "axios";

export default function ProcesslistApi() {
  const [stub, setStub] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/legacy/stub", { params: { php: "api/processes/processlist_api.php" } })
      .then((r) => { if (!cancelled) setStub(r.data); })
      .catch((e) => { if (!cancelled) setErr(e?.message ?? "request failed"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section style={{ padding: "1rem", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem" }}>ProcesslistApi</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Original PHP: <code>legacy/api/processes/processlist_api.php</code>
      </p>
      <p style={{ fontSize: 14 }}>
        React route: <code>/app/api/processes/processlist_api</code>
      </p>
      <hr />
      <h2 style={{ fontSize: "1rem" }}>Spring Boot stub</h2>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {stub && (
        <pre style={{ background: "#f6f8fa", padding: 12, overflow: "auto", fontSize: 12 }}>
          {JSON.stringify(stub, null, 2)}
        </pre>
      )}
    </section>
  );
}
