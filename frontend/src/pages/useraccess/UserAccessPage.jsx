import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../utils/apiUrl.js";

const PERMISSION_OPTIONS = [
  "home",
  "admin",
  "account",
  "ownership",
  "process",
  "datacapture",
  "payment",
  "report",
  "maintenance",
];

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function UserAccessPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [sourceType, setSourceType] = useState("template");
  const [templateUserId, setTemplateUserId] = useState("");
  const [manualPermissions, setManualPermissions] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson?.success || !meJson?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const companyId = Number(meJson.data.company_id || 0);

        const usersRes = await fetch(buildApiUrl("api/useraccess/useraccess_api.php"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_all_users" }),
        });
        const usersJson = await usersRes.json();
        const list = Array.isArray(usersJson?.data) ? usersJson.data : [];

        const [accRes, procRes] = await Promise.all([
          fetch(buildApiUrl(`api/accounts/accountlistapi.php?company_id=${companyId}&showAll=1`), { credentials: "include" }),
          fetch(buildApiUrl(`api/processes/processlist_api.php?company_id=${companyId}&showAll=1`), { credentials: "include" }),
        ]);
        const accJson = await accRes.json();
        const procJson = await procRes.json();

        if (!cancelled) {
          setUsers(list);
          setAccounts(Array.isArray(accJson?.data?.accounts) ? accJson.data.accounts : []);
          setProcesses(Array.isArray(procJson?.data) ? procJson.data : []);
        }
      } catch {
        if (!cancelled) setNotice("Failed to load user access data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const templateUser = useMemo(
    () => users.find((u) => String(u.id) === String(templateUserId)) || null,
    [users, templateUserId],
  );

  const templatePermissions = useMemo(
    () => parseJsonArray(templateUser?.permissions),
    [templateUser],
  );
  const templateAccountPermissions = useMemo(
    () => parseJsonArray(templateUser?.account_permissions),
    [templateUser],
  );
  const templateProcessPermissions = useMemo(
    () => parseJsonArray(templateUser?.process_permissions),
    [templateUser],
  );

  useEffect(() => {
    if (sourceType !== "template") return;
    setSelectedAccountIds(new Set(templateAccountPermissions.map((x) => Number(x.id || x))));
    setSelectedProcessIds(new Set(templateProcessPermissions.map((x) => Number(x.id || x))));
  }, [sourceType, templateAccountPermissions, templateProcessPermissions]);

  const effectivePermissions = sourceType === "template" ? templatePermissions : manualPermissions;

  function toggleSet(setter, value) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleUpdate() {
    if (sourceType === "template" && !templateUserId) {
      setNotice("Please select a template user");
      return;
    }
    if (!selectedUserIds.size) {
      setNotice("Please select at least one affected user");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const accountPermissions = Array.from(selectedAccountIds).map((id) => {
        const row = accounts.find((a) => Number(a.id) === Number(id));
        return { id: Number(id), account_id: row?.account_id || "" };
      });
      const processPermissions = Array.from(selectedProcessIds).map((id) => {
        const row = processes.find((p) => Number(p.id) === Number(id));
        return { id: Number(id), process_id: row?.process_name || row?.process_id || "", process_description: row?.description_name || row?.description || "" };
      });

      const res = await fetch(buildApiUrl("api/useraccess/useraccess_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_permissions",
          source_type: sourceType,
          template_user_id: sourceType === "template" ? Number(templateUserId) : null,
          affected_user_ids: Array.from(selectedUserIds).map(Number),
          permissions: effectivePermissions,
          account_permissions: accountPermissions,
          process_permissions: processPermissions,
        }),
      });
      const json = await res.json();
      setNotice(json?.message || (json?.success ? "Updated successfully" : "Update failed"));
      if (json?.success) {
        setSelectedUserIds(new Set());
      }
    } catch {
      setNotice("Failed to update permissions");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <div style={{ marginLeft: 260, padding: 16 }}>
      <h1>User Access</h1>
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button onClick={() => navigate("/userlist")}>Back</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <label>
              <input type="radio" checked={sourceType === "template"} onChange={() => setSourceType("template")} />
              Copy from user
            </label>
            <label style={{ marginLeft: 12 }}>
              <input type="radio" checked={sourceType === "manual"} onChange={() => setSourceType("manual")} />
              Manual
            </label>
          </div>

          {sourceType === "template" ? (
            <select value={templateUserId} onChange={(e) => setTemplateUserId(e.target.value)} style={{ width: "100%" }}>
              <option value="">-- Select user --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.login_id})</option>
              ))}
            </select>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
              {PERMISSION_OPTIONS.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={manualPermissions.includes(p)}
                    onChange={(e) => {
                      setManualPermissions((prev) => e.target.checked ? [...prev, p] : prev.filter((x) => x !== p));
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
            <div>Permissions Preview</div>
            <div>{effectivePermissions.length ? effectivePermissions.join(", ") : "No permissions"}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div>Affected Users</div>
            <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {users
                .filter((u) => String(u.id) !== String(templateUserId))
                .map((u) => (
                  <label key={u.id} style={{ display: "block" }}>
                    <input type="checkbox" checked={selectedUserIds.has(Number(u.id))} onChange={() => toggleSet(setSelectedUserIds, Number(u.id))} />
                    {u.name} ({u.login_id})
                  </label>
                ))}
            </div>
          </div>
        </div>

        <div>
          <div>
            <div>Accounts</div>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {accounts.map((a) => (
                <label key={a.id} style={{ display: "inline-block", width: "20%" }}>
                  <input type="checkbox" checked={selectedAccountIds.has(Number(a.id))} onChange={() => toggleSet(setSelectedAccountIds, Number(a.id))} />
                  {a.account_id}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div>Processes</div>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {processes.map((p) => (
                <label key={p.id} style={{ display: "inline-block", width: "20%" }}>
                  <input type="checkbox" checked={selectedProcessIds.has(Number(p.id))} onChange={() => toggleSet(setSelectedProcessIds, Number(p.id))} />
                  {p.process_name || p.process_id}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button disabled={submitting} onClick={handleUpdate}>{submitting ? "Updating..." : "Update"}</button>
            <button onClick={() => navigate("/userlist")}>Cancel</button>
          </div>
          {notice && <div style={{ marginTop: 8 }}>{notice}</div>}
        </div>
      </div>
    </div>
  );
}

