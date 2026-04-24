import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";
import { getApiData, getApiMessage, isApiConflict, isApiSuccess, rebuildGroupIds } from "./ownershipHelpers.js";

function applySliderBg(sliderEl, value) {
  if (!sliderEl) return;
  const min = Number(sliderEl.min) || 0;
  const max = Number(sliderEl.max) || 100;
  const pct = ((Number(value) || 0) - min) / (max - min || 1);
  const p = Math.max(0, Math.min(100, pct * 100));
  sliderEl.style.background = `linear-gradient(to right, var(--own-primary-blue) ${p}%, var(--own-gray-border) ${p}%)`;
}

function AccountEditorRow({
  companyId,
  idx,
  row,
  accounts,
  onUpdate,
  onRemove,
  onDragStart,
  onDrop,
  onDragEnd,
  dragContextRef,
  enableDrag = true,
}) {
  const sliderRef = useRef(null);
  const rowRef = useRef(null);
  const [dragEnabled, setDragEnabled] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => applySliderBg(sliderRef.current, row.percentage));
  }, [row.percentage]);

  useEffect(() => {
    if (!dragEnabled) return undefined;
    const up = () => setDragEnabled(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [dragEnabled]);

  const isPartnership = String(row.role || "").toLowerCase() === "partnership";
  const showRo = isPartnership || row.is_external_partner;

  const clearDragStyles = () => {
    const el = rowRef.current;
    if (!el) return;
    el.style.borderTop = "";
    el.style.borderBottom = "";
    el.style.transform = "";
  };

  return (
    <div
      ref={rowRef}
      className="own-account-row"
      data-index={idx}
      data-group-entry={String(row.account_id || "").startsWith("G_") ? "true" : undefined}
      draggable={enableDrag && dragEnabled}
      onDragStart={(e) => {
        if (!enableDrag || !dragEnabled) {
          e.preventDefault();
          return;
        }
        onDragStart?.(e);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
        window.setTimeout(() => rowRef.current?.classList.add("own-dragging"), 0);
      }}
      onDragOver={(e) => {
        if (!enableDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const d = dragContextRef?.current;
        if (!d || d.companyId !== companyId || d.idx === idx) return;
        const el = rowRef.current;
        if (!el) return;
        const bounding = el.getBoundingClientRect();
        const offset = bounding.y + bounding.height / 2;
        if (e.clientY > offset) {
          el.style.borderBottom = "2px solid var(--own-primary-blue)";
          el.style.borderTop = "";
          el.style.transform = "translateY(-2px)";
        } else {
          el.style.borderTop = "2px solid var(--own-primary-blue)";
          el.style.borderBottom = "";
          el.style.transform = "translateY(2px)";
        }
      }}
      onDragLeave={() => {
        clearDragStyles();
      }}
      onDrop={(e) => {
        e.preventDefault();
        clearDragStyles();
        onDrop?.(e);
      }}
      onDragEnd={() => {
        rowRef.current?.classList.remove("own-dragging");
        setDragEnabled(false);
        if (enableDrag && dragContextRef?.current?.companyId === companyId) {
          const container = rowRef.current?.parentElement;
          container?.querySelectorAll(".own-account-row").forEach((r) => {
            r.style.borderTop = "";
            r.style.borderBottom = "";
            r.style.transform = "";
          });
        }
        onDragEnd?.();
      }}
    >
      <div
        className="own-drag-handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          if (enableDrag) setDragEnabled(true);
        }}
        onMouseLeave={() => setDragEnabled(false)}
      >
        ⋮⋮
      </div>
      <select
        className="own-account-select"
        value={row.account_id}
        onChange={(e) => onUpdate(idx, "account_id", e.target.value)}
      >
        <option value="">-- SELECT ACCOUNT --</option>
        {accounts.map((acc) => {
          const mainStr = parseInt(acc.is_main_owner, 10) === 1 ? " - Main" : "";
          const t = String(acc.type || "").toLowerCase();
          const label =
            t === "group"
              ? `${acc.account_name}${mainStr}`
              : `${acc.account_name} (${acc.name})${mainStr}`;
          return (
            <option key={String(acc.id)} value={acc.id}>
              {label}
            </option>
          );
        })}
      </select>
      <div className="own-ownership-input-group">
        <input
          type="text"
          className="own-percent-input"
          id={`input-${companyId}-${idx}`}
          key={`pi-${companyId}-${idx}-${row.percentage}`}
          defaultValue={`${row.percentage}%`}
          onBlur={(e) => onUpdate(idx, "percent_input", e.target.value)}
        />
        <div className="own-slider-container">
          <input
            ref={sliderRef}
            type="range"
            className="own-slider"
            id={`slider-${companyId}-${idx}`}
            min={0}
            max={100}
            step={1}
            value={row.percentage}
            onInput={(e) => onUpdate(idx, "slider", e.target.value)}
          />
          <div className="own-slider-labels">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="own-row-actions">
        <div className="own-read-only-badge" style={{ display: "flex", visibility: showRo ? "visible" : "hidden" }}>
          <span className="own-read-only-text">Read Only</span>
          <label className="own-ro-toggle">
            <input
              type="checkbox"
              checked={row.read_only === 1}
              disabled={!showRo}
              onChange={(e) => onUpdate(idx, "read_only", e.target.checked ? 1 : 0)}
            />
            <span className="own-ro-slider" />
          </label>
        </div>
        <button type="button" className="own-btn-square own-btn-delete" title="Remove" onClick={() => onRemove(idx)}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function OwnershipPage() {
  const navigate = useNavigate();
  const [boot, setBoot] = useState(true);
  const [activeTab, setActiveTab] = useState("account-ownership");

  const [allCompanies, setAllCompanies] = useState([]);
  const [groupFilter, setGroupFilter] = useState(null);
  const [loadingList, setLoadingList] = useState(true);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(() => new Set());
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);
  const [companyStates, setCompanyStates] = useState({});
  const [loadingCompanyId, setLoadingCompanyId] = useState(null);
  const [savingCompanyId, setSavingCompanyId] = useState(null);
  const dragRef = useRef({ companyId: null, idx: null });
  const dragOverIdx = useRef(null);

  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);

  const [geGroups, setGeGroups] = useState([]);
  const [geLoaded, setGeLoaded] = useState(false);
  const [geLoading, setGeLoading] = useState(false);
  const [geExpanded, setGeExpanded] = useState(null);
  const [geStates, setGeStates] = useState({});
  const [geLoadingGid, setGeLoadingGid] = useState(null);
  const [geSavingGid, setGeSavingGid] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.__ownToastT);
    window.__ownToastT = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const allGroupIds = useMemo(() => rebuildGroupIds(allCompanies), [allCompanies]);

  useEffect(() => {
    if (!allCompanies.length) return;
    const ind = allCompanies.filter((c) => !String(c.group_id || "").trim());
    if (ind.length === 0 && allGroupIds.length >= 1) {
      setGroupFilter((prev) => (prev === null ? allGroupIds[0] : prev));
    }
  }, [allCompanies, allGroupIds]);

  const companiesData = useMemo(() => {
    if (groupFilter === null) {
      return allCompanies.filter((c) => !String(c.group_id || "").trim());
    }
    return allCompanies.filter((c) => String(c.group_id || "").toLowerCase() === String(groupFilter).toLowerCase());
  }, [allCompanies, groupFilter]);

  const fetchCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(buildApiUrl("api/ownership/get_companies_api.php?all=1"), { credentials: "include" });
      const json = await res.json();
      if (!isApiSuccess(json)) {
        showToast(getApiMessage(json, "Failed to load companies"), "error");
        setAllCompanies([]);
        return;
      }
      setAllCompanies(getApiData(json, []));
      setSelectedCompanyIds(new Set());
      setExpandedCompanyId(null);
      setCompanyStates({});
    } catch {
      showToast("Failed to fetch companies", "error");
    } finally {
      setLoadingList(false);
    }
  }, [showToast]);

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = assetUrl("css/ownership.css");
    document.head.appendChild(css);
    const g = document.createElement("link");
    g.rel = "stylesheet";
    g.href = assetUrl("css/global-13inch.css");
    document.head.appendChild(g);
    const font = document.createElement("link");
    font.href = "https://fonts.googleapis.com/css?family=Amaranth";
    font.rel = "stylesheet";
    document.head.appendChild(font);
    return () => {
      document.body.classList.add("bg");
      if (css.parentNode) css.parentNode.removeChild(css);
      if (g.parentNode) g.parentNode.removeChild(g);
      if (font.parentNode) font.parentNode.removeChild(font);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success) {
          navigate("/login", { replace: true });
          return;
        }
        if (String(meJson.data?.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(meJson.data?.permissions) ? meJson.data.permissions : [];
        const hasFull = perms.length === 0;
        if (!hasFull && !perms.includes("account")) {
          navigate("/dashboard", { replace: true });
          return;
        }
      } catch {
        navigate("/login", { replace: true });
        return;
      } finally {
        setBoot(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (boot) return;
    void fetchCompanies();
  }, [boot, fetchCompanies]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedCompanyIds(new Set());
  }, []);

  const toggleSelectionMode = () => {
    if (selectionMode) exitSelectionMode();
    else setSelectionMode(true);
  };

  const toggleCompanySelect = (comp, e) => {
    if (!selectionMode) return;
    if (e?.target?.closest?.("button, .own-group-panel")) return;
    const id = Number(comp.id);
    const gid = comp.group_id || null;
    const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
    if (!selectable) return;
    setSelectedCompanyIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const loadCompanyData = async (companyId) => {
    setLoadingCompanyId(companyId);
    try {
      const compData = allCompanies.find((c) => Number(c.id) === Number(companyId));
      const compGroupId = compData ? String(compData.group_id || "").trim() : "";

      const [accRes, ownRes] = await Promise.all([
        fetch(buildApiUrl(`api/ownership/get_available_accounts_api.php?company_id=${companyId}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/ownership/get_owners_api.php?company_id=${companyId}`), { credentials: "include" }),
      ]);
      const accountsJson = await accRes.json();
      const ownersJson = await ownRes.json();
      let accounts = isApiSuccess(accountsJson) ? getApiData(accountsJson, []) : [];
      if (compGroupId && !accounts.some((a) => String(a.id) === `G_${compGroupId}`)) {
        accounts = [
          ...accounts,
          {
            id: `G_${compGroupId}`,
            account_name: `Group: ${compGroupId}`,
            name: "Group Equity",
            role: "GROUP",
            type: "group",
            is_main_owner: 0,
          },
        ];
      }
      const seen = new Set();
      accounts = accounts.filter((acc) => {
        const k = String(acc.id || "");
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const rows = (isApiSuccess(ownersJson) ? getApiData(ownersJson, []) : []).map((o) => ({
        account_id: o.account_id,
        percentage: parseFloat(o.percentage),
        role: o.role || "",
        user_raw_id: o.user_raw_id || null,
        ownership_id: o.ownership_id || null,
        is_external_partner: parseInt(o.is_external_partner, 10) === 1,
        read_only: o.read_only != null ? parseInt(o.read_only, 10) : 1,
      }));
      setCompanyStates((s) => ({ ...s, [companyId]: { accounts, rows } }));
    } catch {
      showToast("Error loading data", "error");
    } finally {
      setLoadingCompanyId(null);
    }
  };

  const toggleCard = (companyId) => {
    const isExp = expandedCompanyId === companyId;
    if (isExp) {
      setExpandedCompanyId(null);
    } else {
      if (expandedCompanyId && expandedCompanyId !== companyId) {
        setExpandedCompanyId(null);
      }
      setExpandedCompanyId(companyId);
      void loadCompanyData(companyId);
    }
  };

  const updateRow = (companyId, idx, field, value) => {
    setCompanyStates((s) => {
      const st = s[companyId];
      if (!st) return s;
      const rows = [...st.rows];
      const r = { ...rows[idx] };
      if (field === "slider") {
        const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
        r.percentage = pct;
        rows[idx] = r;
      } else if (field === "percent_input") {
        let pct = parseFloat(String(value).replace("%", ""));
        if (Number.isNaN(pct)) pct = 0;
        pct = Math.max(0, Math.min(100, pct));
        r.percentage = pct;
        rows[idx] = r;
      } else if (field === "read_only") {
        r.read_only = value;
        rows[idx] = r;
      } else if (field === "account_id") {
        r.account_id = value;
        const acc = st.accounts.find((a) => String(a.id) === String(value));
        if (acc) {
          r.role = String(acc.role || "").toLowerCase();
          const isUser = String(value).startsWith("U_");
          r.user_raw_id = isUser ? parseInt(String(value).replace("U_", ""), 10) : null;
          r.read_only = 1;
        } else {
          r.role = "";
          r.user_raw_id = null;
        }
        rows[idx] = r;
      }
      return { ...s, [companyId]: { ...st, rows } };
    });
  };

  const addRow = (companyId) => {
    setCompanyStates((s) => {
      const st = s[companyId];
      if (!st) return s;
      return {
        ...s,
        [companyId]: {
          ...st,
          rows: [...st.rows, { account_id: "", percentage: 0, role: "", user_raw_id: null, read_only: 1, is_external_partner: false }],
        },
      };
    });
  };

  const removeRow = (companyId, idx) => {
    setCompanyStates((s) => {
      const st = s[companyId];
      if (!st) return s;
      const rows = st.rows.filter((_, i) => i !== idx);
      return { ...s, [companyId]: { ...st, rows } };
    });
  };

  const reorderRows = (companyId, fromIdx, toIdx, insertAfter) => {
    setCompanyStates((s) => {
      const st = s[companyId];
      if (!st) return s;
      const rows = [...st.rows];
      const [moved] = rows.splice(fromIdx, 1);
      let newIdx = toIdx;
      if (fromIdx < toIdx) newIdx = insertAfter ? toIdx : toIdx - 1;
      else newIdx = insertAfter ? toIdx + 1 : toIdx;
      rows.splice(newIdx, 0, moved);
      return { ...s, [companyId]: { ...st, rows } };
    });
  };

  const calcTotal = (rows) => rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);

  const confirmCompany = async (companyId) => {
    const st = companyStates[companyId];
    if (!st) return;
    const { rows } = st;
    let hasErr = false;
    rows.forEach((r) => {
      if (!r.account_id) {
        hasErr = true;
        showToast("Please select an account for all rows.", "error");
      }
    });
    const total = calcTotal(rows);
    if (total > 100) {
      showToast("Total percentage exceeds 100%", "error");
      return;
    }
    if (hasErr) return;
    const accIds = rows.map((r) => r.account_id);
    if (accIds.some((item, i) => accIds.indexOf(item) !== i)) {
      showToast("Duplicate accounts detected. Please combine them.", "error");
      return;
    }
    setSavingCompanyId(companyId);
    try {
      const res = await fetch(buildApiUrl("api/ownership/batch_save_owners_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_id: companyId,
          owners: rows.map((r) => ({
            account_id: r.account_id,
            percentage: parseFloat(r.percentage),
            read_only: r.read_only,
          })),
        }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(getApiMessage(json, "Saved successfully"), "success");
        setAllCompanies((list) => list.map((c) => (Number(c.id) === Number(companyId) ? { ...c, allocated_percentage: total } : c)));
        setExpandedCompanyId(null);
      } else {
        showToast(getApiMessage(json, "Save failed"), "error");
      }
    } catch {
      showToast("Server error", "error");
    } finally {
      setSavingCompanyId(null);
    }
  };

  const joinGroup = async (companyId, groupId, companyName) => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: companyId, group_id: groupId }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(`"${companyName}" joined group "${groupId}"`, "success");
        void fetchCompanies();
      } else showToast(getApiMessage(json, "Join group failed"), "error");
    } catch {
      showToast("Server error", "error");
    }
  };

  const ungroupCompany = async (companyId, companyName) => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: companyId, group_id: null }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(`"${companyName}" removed from group`, "success");
        void fetchCompanies();
      } else showToast(getApiMessage(json, "Ungroup failed"), "error");
    } catch {
      showToast("Server error", "error");
    }
  };

  const linkPartner = async (companyId, loginId, forceType = "") => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/add_external_partner_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: companyId, login_id: loginId, force_type: forceType }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(getApiMessage(json, "Partner linked successfully"), "success");
        setExpandedCompanyId(null);
        window.setTimeout(() => {
          setExpandedCompanyId(companyId);
          void loadCompanyData(companyId);
        }, 300);
        return true;
      }
      if (isApiConflict(json)) {
        setConflict({ companyId, data: getApiData(json, {}), loginId });
        return false;
      }
      showToast(getApiMessage(json, "Link partner failed"), "error");
      return false;
    } catch {
      showToast("Server error", "error");
      return false;
    }
  };

  const bulkJoin = async (groupId) => {
    if (!groupId) {
      showToast("Please select a group first", "error");
      return;
    }
    const ids = [...selectedCompanyIds];
    if (!ids.length) return;
    try {
      const results = await Promise.all(
        ids.map((cid) =>
          fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ company_id: cid, group_id: groupId }),
          }).then((r) => r.json())
        )
      );
      const failed = results.filter((r) => !isApiSuccess(r));
      if (failed.length === 0) showToast(`${ids.length} compan${ids.length > 1 ? "ies" : "y"} joined group "${groupId}"`, "success");
      else showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, "error");
      exitSelectionMode();
      void fetchCompanies();
    } catch {
      showToast("Server error during batch join", "error");
    }
  };

  const bulkUngroup = async () => {
    const ids = [...selectedCompanyIds];
    if (!ids.length) return;
    try {
      const results = await Promise.all(
        ids.map((cid) =>
          fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ company_id: cid, group_id: null }),
          }).then((r) => r.json())
        )
      );
      const failed = results.filter((r) => !isApiSuccess(r));
      if (failed.length === 0) showToast(`${ids.length} compan${ids.length > 1 ? "ies" : "y"} removed from group`, "success");
      else showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, "error");
      exitSelectionMode();
      void fetchCompanies();
    } catch {
      showToast("Server error during batch ungroup", "error");
    }
  };

  const fetchGroupEarnings = useCallback(async () => {
    setGeLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/ownership/get_group_earnings_api.php"), { credentials: "include" });
      const json = await res.json();
      if (!isApiSuccess(json)) {
        showToast(getApiMessage(json, "Failed to load groups"), "error");
        setGeGroups([]);
        return;
      }
      setGeGroups(getApiData(json, []));
    } catch {
      showToast("Failed to fetch group earnings", "error");
    } finally {
      setGeLoading(false);
      setGeLoaded(true);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === "group-earnings" && !geLoaded && !geLoading) void fetchGroupEarnings();
  }, [activeTab, geLoaded, geLoading, fetchGroupEarnings]);

  const loadGeData = async (groupId) => {
    setGeLoadingGid(groupId);
    try {
      const [aRes, oRes] = await Promise.all([
        fetch(buildApiUrl(`api/ownership/get_group_available_accounts_api.php?group_id=${encodeURIComponent(groupId)}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(groupId)}`), { credentials: "include" }),
      ]);
      const aj = await aRes.json();
      const oj = await oRes.json();
      const accounts = isApiSuccess(aj) ? getApiData(aj, []) : [];
      const rows = (isApiSuccess(oj) ? getApiData(oj, []) : []).map((o) => ({
        account_id: o.composite_id || o.account_id,
        percentage: parseFloat(o.percentage),
        role: o.role || "",
        user_raw_id: o.user_raw_id || null,
        ownership_id: o.ownership_id || null,
        is_external_partner: parseInt(o.is_external_partner, 10) === 1,
        read_only: o.read_only != null ? parseInt(o.read_only, 10) : 1,
      }));
      setGeStates((s) => ({ ...s, [groupId]: { accounts, rows } }));
    } catch {
      showToast("Error loading group data", "error");
    } finally {
      setGeLoadingGid(null);
    }
  };

  const geToggle = (gid) => {
    if (geExpanded === gid) setGeExpanded(null);
    else {
      if (geExpanded && geExpanded !== gid) setGeExpanded(null);
      setGeExpanded(gid);
      void loadGeData(gid);
    }
  };

  const geUpdateRow = (groupId, idx, field, value) => {
    setGeStates((s) => {
      const st = s[groupId];
      if (!st) return s;
      const rows = [...st.rows];
      const r = { ...rows[idx] };
      if (field === "slider") r.percentage = Math.max(0, Math.min(100, parseFloat(value) || 0));
      else if (field === "percent_input") {
        let pct = parseFloat(String(value).replace("%", ""));
        if (Number.isNaN(pct)) pct = 0;
        r.percentage = Math.max(0, Math.min(100, pct));
      } else if (field === "read_only") r.read_only = value;
      else if (field === "account_id") {
        r.account_id = value;
        const acc = st.accounts.find((a) => String(a.id) === String(value));
        if (acc) {
          r.role = String(acc.role || "").toLowerCase();
          const isUser = String(value).startsWith("U_");
          r.user_raw_id = isUser ? parseInt(String(value).replace("U_", ""), 10) : null;
          r.read_only = 1;
        } else {
          r.role = "";
          r.user_raw_id = null;
        }
      }
      rows[idx] = r;
      return { ...s, [groupId]: { ...st, rows } };
    });
  };

  const geAddRow = (gid) => {
    setGeStates((s) => {
      const st = s[gid];
      if (!st) return s;
      return { ...s, [gid]: { ...st, rows: [...st.rows, { account_id: "", percentage: 0, role: "", user_raw_id: null, read_only: 1, is_external_partner: false }] } };
    });
  };

  const geRemoveRow = (gid, idx) => {
    setGeStates((s) => {
      const st = s[gid];
      if (!st) return s;
      return { ...s, [gid]: { ...st, rows: st.rows.filter((_, i) => i !== idx) } };
    });
  };

  const geConfirm = async (groupId) => {
    const st = geStates[groupId];
    if (!st) return;
    const { rows } = st;
    let err = false;
    rows.forEach((r) => {
      if (!r.account_id) {
        err = true;
        showToast("Please select an account for all rows.", "error");
      }
    });
    const total = calcTotal(rows);
    if (total > 100) {
      showToast("Total percentage exceeds 100%", "error");
      return;
    }
    if (err) return;
    const ids = rows.map((r) => r.account_id);
    if (ids.some((item, i) => ids.indexOf(item) !== i)) {
      showToast("Duplicate accounts detected. Please combine them.", "error");
      return;
    }
    setGeSavingGid(groupId);
    try {
      const res = await fetch(buildApiUrl("api/ownership/batch_save_group_owners_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          group_id: groupId,
          owners: rows.map((r) => ({
            account_id: r.account_id,
            percentage: parseFloat(r.percentage),
            read_only: r.read_only,
          })),
        }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(getApiMessage(json, "Group ownership saved successfully"), "success");
        setGeGroups((g) => g.map((x) => (x.group_id === groupId ? { ...x, allocated_percentage: total } : x)));
        setGeExpanded(null);
      } else showToast(getApiMessage(json, "Save failed"), "error");
    } catch {
      showToast("Server error", "error");
    } finally {
      setGeSavingGid(null);
    }
  };

  const geLinkPartner = async (groupId, loginId, forceType = "") => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/add_group_external_partner_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ group_id: groupId, login_id: loginId, force_type: forceType }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(getApiMessage(json, "Partner linked successfully"), "success");
        setGeExpanded(null);
        window.setTimeout(() => {
          setGeExpanded(groupId);
          void loadGeData(groupId);
        }, 300);
        return true;
      }
      if (isApiConflict(json)) {
        showToast("Multiple matches found. Please specify login or group ID more precisely.", "error");
        return false;
      }
      showToast(getApiMessage(json, "Link partner failed"), "error");
      return false;
    } catch {
      showToast("Server error", "error");
      return false;
    }
  };

  const [bulkGroupSelect, setBulkGroupSelect] = useState("");
  const [openGroupForCompanyId, setOpenGroupForCompanyId] = useState(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest?.(".own-group-btn-wrap")) setOpenGroupForCompanyId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    exitSelectionMode();
  }, [groupFilter, exitSelectionMode]);

  if (boot) return null;

  const bulkBar =
    selectedCompanyIds.size > 0 ? (
      <div id="own-bulk-bar" className={`own-bulk-bar own-bulk-bar-visible${groupFilter !== null ? " own-bulk-bar-ungroup" : ""}`}>
        <div className="own-bulk-bar-left">
          <span className="own-bulk-count">{selectedCompanyIds.size}</span>
          <span className="own-bulk-label">selected</span>
        </div>
        <div className="own-bulk-bar-right">
          {groupFilter !== null ? (
            <>
              <button type="button" className="own-bulk-ungroup-btn" onClick={() => void bulkUngroup()}>
                Ungroup
              </button>
              <button type="button" className="own-bulk-cancel-btn" onClick={exitSelectionMode}>
                ✕ Cancel
              </button>
            </>
          ) : (
            <>
              <div className="own-bulk-group-wrap">
                <select className="own-bulk-group-select" value={bulkGroupSelect} onChange={(e) => setBulkGroupSelect(e.target.value)}>
                  <option value="">-- Select Group --</option>
                  {allGroupIds.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="own-bulk-join-btn" onClick={() => void bulkJoin(bulkGroupSelect)}>
                Join Group
              </button>
              <button type="button" className="own-bulk-cancel-btn" onClick={exitSelectionMode}>
                ✕ Cancel
              </button>
            </>
          )}
        </div>
      </div>
    ) : null;

  const renderCompanyCard = (comp) => {
    const id = Number(comp.id);
    const alloc = parseFloat(comp.allocated_percentage) || 0;
    const remaining = Math.max(0, 100 - alloc);
    const gid = comp.group_id || null;
    const expanded = expandedCompanyId === id;
    const st = companyStates[id];
    const totalLive = st ? calcTotal(st.rows) : alloc;
    const headerRemain =
      totalLive > 100 ? "Over limit!" : `${(100 - totalLive).toFixed(2)}% Remaining`;
    const headerPct = `${totalLive}%`;
    const barW = Math.min(totalLive, 100);
    const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
    const isSelected = selectedCompanyIds.has(id);

    let footerText = "100% Unallocated";
    let warn = { show: false, err: false, icon: "⚠️", msg: "" };
    let confirmDisabled = false;
    if (st) {
      const t = calcTotal(st.rows);
      const rem = 100 - t;
      if (t > 100) {
        warn = { show: true, err: true, icon: "❌", msg: "Total exceeds 100%!" };
        footerText = `${Math.abs(rem).toFixed(2)}% Over Allocated`;
        confirmDisabled = true;
      } else if (t < 100) {
        warn = { show: true, err: false, icon: "⚠️", msg: "Total is less than 100%" };
        footerText = `${rem.toFixed(2)}% Unallocated`;
      } else {
        footerText = "Fully Allocated";
      }
    }

    return (
      <div
        key={id}
        id={`card-${id}`}
        data-group-id={gid || undefined}
        data-selectable={selectable && selectionMode ? "true" : undefined}
        className={`own-card${expanded ? " expanded" : ""}${selectionMode && selectable ? " own-selection-mode" : ""}${isSelected ? ` own-selected${groupFilter !== null ? " own-ungroup-select" : ""}` : ""}`}
        onClick={(e) => toggleCompanySelect(comp, e)}
      >
        <div
          className="own-card-header"
          data-action="toggle"
          onClick={(e) => {
            if (e.target.closest(".own-group-btn-wrap")) return;
            toggleCard(id);
          }}
          role="presentation"
        >
          <div className="own-card-header-left">
            <div className="own-company-name">
              {comp.name}
              {gid ? <span className="own-group-badge">{gid}</span> : null}
            </div>
            <div className={`own-company-date${(() => {
              if (!comp.expiration_date) return "";
              const expStr = String(comp.expiration_date).split(" ")[0];
              const expDate = new Date(expStr);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
              if (daysLeft < 0) return " own-date-expired";
              if (daysLeft <= 30) return " own-date-warning";
              return "";
            })()}`}>
              {comp.expiration_date ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {String(comp.expiration_date).split(" ")[0]}
                </>
              ) : null}
            </div>
          </div>
          <div className="own-card-header-middle">
            <div className="own-allocation-info">
              <span className="own-allocation-label">Total Allocation</span>
              <span className="own-allocation-percentage" id={`header-percent-${id}`}>
                {headerPct}
              </span>
              <span className={`own-allocation-remaining${totalLive > 100 ? " own-over-limit" : ""}`} id={`header-remain-${id}`}>
                {headerRemain}
              </span>
            </div>
            <div className="own-progress-bar-container">
              <div className={`own-progress-bar-fill${totalLive > 100 ? " own-bar-danger" : ""}`} id={`header-bar-${id}`} style={{ width: `${barW}%` }} />
            </div>
          </div>
          <div className="own-card-header-right">
            {allGroupIds.length > 0 && !gid ? (
              <div className="own-group-btn-wrap">
                <button
                  type="button"
                  className="own-group-join-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenGroupForCompanyId((prev) => (prev === id ? null : id));
                  }}
                >
                  + Group
                </button>
                <div className={`own-group-panel${openGroupForCompanyId === id ? " open" : ""}`}>
                  {allGroupIds.map((g) => (
                    <div
                      key={g}
                      className="own-group-option"
                      role="presentation"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenGroupForCompanyId(null);
                        void joinGroup(id, g, comp.name);
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {allGroupIds.length > 0 && gid ? (
              <button type="button" className="own-group-ungroup-btn" onClick={(e) => { e.stopPropagation(); void ungroupCompany(id, comp.name); }}>
                Ungroup
              </button>
            ) : null}
            <button type="button" className="own-btn-outline" data-action="toggle" onClick={(e) => { e.stopPropagation(); toggleCard(id); }}>
              Manage
            </button>
            <button type="button" className="own-icon-btn" data-action="toggle" onClick={(e) => { e.stopPropagation(); toggleCard(id); }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="own-card-body" id={`card-body-${id}`}>
          {expanded && loadingCompanyId === id && !st ? (
            <div className="own-loader-container" id={`loader-${id}`}>
              <div className="own-loader" />
            </div>
          ) : null}
          <div className={expanded && st ? "" : "own-editor-hidden"} id={`editor-${id}`}>
            {expanded && st ? (
              <>
                <div className="own-table-headers">
                  <div>Account</div>
                  <div>Ownership%</div>
                </div>
                <div id={`rows-container-${id}`}>
                  {st.rows.map((row, idx) => (
                    <AccountEditorRow
                      key={`${id}-${idx}-${String(row.account_id)}-${row.ownership_id ?? "n"}`}
                      companyId={id}
                      idx={idx}
                      row={row}
                      accounts={st.accounts}
                      dragContextRef={dragRef}
                      onUpdate={(i, f, v) => {
                        if (f === "percent_input") updateRow(id, i, "percent_input", v);
                        else if (f === "slider") updateRow(id, i, "slider", v);
                        else if (f === "read_only") updateRow(id, i, "read_only", v);
                        else if (f === "account_id") updateRow(id, i, "account_id", v);
                      }}
                      onRemove={(i) => removeRow(id, i)}
                      onDragStart={() => {
                        dragRef.current = { companyId: id, idx };
                      }}
                      onDrop={(e) => {
                        const from = dragRef.current;
                        if (from.companyId !== id || from.idx === null || from.idx === idx) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const insertAfter = e.clientY > rect.top + rect.height / 2;
                        reorderRows(id, from.idx, idx, insertAfter);
                        dragRef.current = { companyId: null, idx: null };
                      }}
                      onDragEnd={() => {
                        dragRef.current = { companyId: null, idx: null };
                      }}
                    />
                  ))}
                </div>
                <button type="button" className="own-btn-add-account" onClick={(e) => { e.stopPropagation(); addRow(id); }}>
                  + Add Account
                </button>
                <PartnerLinkSection
                  inputId={`partner-login-${id}`}
                  onLink={async (login) => {
                    const ok = await linkPartner(id, login, "");
                    return ok;
                  }}
                />
                <div className="own-card-footer">
                  <div className="own-footer-left">
                    <div className={`own-warning-badge${warn.err ? " own-warning-error" : ""}`} id={`warning-${id}`} style={{ display: warn.show ? "flex" : "none" }}>
                      <span id={`warning-msg-icon-${id}`}>{warn.icon}</span>
                      <span id={`warning-msg-${id}`}>{warn.msg}</span>
                    </div>
                    <span className="own-unallocated-text" id={`footer-remain-${id}`}>
                      {footerText}
                    </span>
                  </div>
                  <div className="own-footer-right">
                    <button type="button" className="own-footer-btn own-btn-cancel" onClick={(e) => { e.stopPropagation(); setExpandedCompanyId(null); }}>
                      Cancel
                    </button>
                    <button type="button" className="own-footer-btn own-btn-confirm" id={`confirm-btn-${id}`} disabled={confirmDisabled || savingCompanyId === id} onClick={(e) => { e.stopPropagation(); void confirmCompany(id); }}>
                      {savingCompanyId === id ? "Saving..." : "Confirm"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="own-container">
        <h1 className="own-page-title">Account Ownership</h1>
        <div className="own-separator-line" />
        <div className="own-tab-bar">
          <button type="button" className={`own-tab-btn${activeTab === "account-ownership" ? " active" : ""}`} data-tab="account-ownership" onClick={() => setActiveTab("account-ownership")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Account Ownership
          </button>
          <button type="button" className={`own-tab-btn${activeTab === "group-earnings" ? " active" : ""}`} data-tab="group-earnings" onClick={() => setActiveTab("group-earnings")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Group Earnings
          </button>
        </div>

        <div id="tab-account-ownership" className="own-tab-panel" style={{ display: activeTab === "account-ownership" ? "" : "none" }}>
          {allGroupIds.length > 0 ? (
            <div id="own-group-filter-bar" className="own-group-filter-bar">
              <span className="own-gfb-label">Group</span>
              <div className="own-gfb-buttons" id="own-gfb-buttons">
                {allGroupIds.map((g) => {
                  const count = allCompanies.filter((c) => c.group_id && String(c.group_id).toLowerCase() === String(g).toLowerCase()).length;
                  const active = groupFilter === g;
                  return (
                    <button key={g} type="button" className={`own-gfb-btn${active ? " active" : ""}`} data-group={g} onClick={() => setGroupFilter((prev) => (prev === g ? null : g))}>
                      {g}
                      <span className="own-gfb-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="own-gfb-spacer" />
              <button id="own-select-mode-btn" type="button" className={`own-select-mode-btn${selectionMode ? " active" : ""}`} onClick={toggleSelectionMode}>
                {selectionMode ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    Cancel
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <path d="M14 17h7M17.5 14v7" />
                    </svg>
                    Select
                  </>
                )}
              </button>
            </div>
          ) : null}
          <div id="companyCardsContainer">
            {loadingList ? (
              <div className="own-loader-container">
                <div className="own-loader" />
              </div>
            ) : companiesData.length === 0 ? (
              <div className="own-empty-state">No companies found.</div>
            ) : (
              companiesData.map((c) => renderCompanyCard(c))
            )}
          </div>
        </div>

        <div id="tab-group-earnings" className="own-tab-panel" style={{ display: activeTab === "group-earnings" ? "" : "none" }}>
          <div id="groupEarningsContainer">
            {geLoading && !geGroups.length ? (
              <div className="own-loader-container">
                <div className="own-loader" />
              </div>
            ) : geGroups.length === 0 ? (
              <div className="own-empty-state">No groups found. Assign companies to groups in the Account Ownership tab first.</div>
            ) : (
              geGroups.map((grp) => {
                const gid = grp.group_id;
                const alloc = parseFloat(grp.allocated_percentage) || 0;
                const expanded = geExpanded === gid;
                const st = geStates[gid];
                const totalLive = st ? calcTotal(st.rows) : alloc;
                let footerText = "100% Unallocated";
                let warn = { show: false, err: false, icon: "⚠️", msg: "" };
                let confirmDisabled = false;
                if (st) {
                  const t = calcTotal(st.rows);
                  const r = 100 - t;
                  if (t > 100) {
                    warn = { show: true, err: true, icon: "❌", msg: "Total exceeds 100%!" };
                    footerText = `${Math.abs(r).toFixed(2)}% Over Allocated`;
                    confirmDisabled = true;
                  } else if (t < 100) {
                    warn = { show: true, err: false, icon: "⚠️", msg: "Total is less than 100%" };
                    footerText = `${r.toFixed(2)}% Unallocated`;
                  } else footerText = "Fully Allocated";
                }
                return (
                  <div
                    key={gid}
                    id={`ge-card-${gid}`}
                    className={`own-card ge-card${expanded ? " expanded" : ""}`}
                    onClick={(e) => {
                      const action = e.target.closest("[data-action]")?.dataset?.action;
                      if (!action) return;
                      e.stopPropagation();
                      if (action === "toggle") geToggle(gid);
                      else if (action === "add-row") geAddRow(gid);
                      else if (action === "cancel") setGeExpanded(null);
                      else if (action === "confirm") void geConfirm(gid);
                    }}
                    role="presentation"
                  >
                    <div className="own-card-header" style={{ cursor: "pointer" }} data-action="toggle" role="presentation">
                      <div className="own-card-header-left">
                        <div className="own-company-name">{gid}</div>
                        {Array.isArray(grp.companies) && grp.companies.length > 0 && (
                          <div className="own-company-date" style={{ marginTop: 2 }}>
                            {grp.companies.map((c) => {
                              const eq = parseFloat(c.group_equity) || 0;
                              return eq > 0 ? `${c.name} (${eq}%)` : c.name;
                            }).join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="own-card-header-middle">
                        <div className="own-allocation-info">
                          <span className="own-allocation-label">Total Allocation</span>
                          <span className="own-allocation-percentage">{totalLive}%</span>
                          <span className={`own-allocation-remaining${totalLive > 100 ? " own-over-limit" : ""}`}>{totalLive > 100 ? "Over limit!" : `${(100 - totalLive).toFixed(2)}% Remaining`}</span>
                        </div>
                        <div className="own-progress-bar-container">
                          <div className={`own-progress-bar-fill${totalLive > 100 ? " own-bar-danger" : ""}`} style={{ width: `${Math.min(totalLive, 100)}%` }} />
                        </div>
                      </div>
                      <div className="own-card-header-right">
                        <button type="button" className="own-btn-outline" data-action="toggle">
                          Manage
                        </button>
                        <button type="button" className="own-icon-btn" data-action="toggle">
                          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="own-card-body" id={`ge-card-body-${gid}`}>
                      {expanded && geLoadingGid === gid && !st ? (
                        <div className="own-loader-container">
                          <div className="own-loader" />
                        </div>
                      ) : null}
                      <div className={expanded && st ? "" : "own-editor-hidden"} id={`ge-editor-${gid}`}>
                        {expanded && st ? (
                          <>
                            <div className="own-table-headers">
                              <div>Account</div>
                              <div>Ownership%</div>
                            </div>
                            <div id={`ge-rows-container-${gid}`}>
                              {st.rows.map((row, idx) => (
                                <AccountEditorRow
                                  key={`ge-${gid}-${idx}-${String(row.account_id)}-${row.ownership_id ?? "n"}`}
                                  companyId={`ge-${gid}`}
                                  idx={idx}
                                  row={row}
                                  accounts={st.accounts}
                                  enableDrag={false}
                                  onUpdate={(i, f, v) => {
                                    if (f === "percent_input") geUpdateRow(gid, i, "percent_input", v);
                                    else if (f === "slider") geUpdateRow(gid, i, "slider", v);
                                    else if (f === "read_only") geUpdateRow(gid, i, "read_only", v);
                                    else if (f === "account_id") geUpdateRow(gid, i, "account_id", v);
                                  }}
                                  onRemove={(i) => geRemoveRow(gid, i)}
                                />
                              ))}
                            </div>
                            <button type="button" className="own-btn-add-account" data-action="add-row">
                              + Add Account
                            </button>
                            <GePartnerSection groupId={gid} onLink={(login) => geLinkPartner(gid, login, "")} />
                            <div className="own-card-footer">
                              <div className="own-footer-left">
                                <div className={`own-warning-badge${warn.err ? " own-warning-error" : ""}`} style={{ display: warn.show ? "flex" : "none" }}>
                                  <span>{warn.icon}</span>
                                  <span>{warn.msg}</span>
                                </div>
                                <span className="own-unallocated-text">{footerText}</span>
                              </div>
                              <div className="own-footer-right">
                                <button type="button" className="own-footer-btn own-btn-cancel" data-action="cancel">
                                  Cancel
                                </button>
                                <button type="button" className="own-footer-btn own-btn-confirm" data-action="confirm" disabled={confirmDisabled || geSavingGid === gid}>
                                  {geSavingGid === gid ? "Saving..." : "Confirm"}
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div id="ownToast" className={`own-toast${toast ? ` own-show ${toast.type === "success" ? "own-success" : "own-error"}` : ""}`}>
        <div id="ownToastIcon">
          {toast?.type === "success" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : toast ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--own-danger-red)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : null}
        </div>
        <div id="ownToastMessage">{toast?.message}</div>
      </div>

      {conflict ? (
        <div className="own-modal-overlay" role="presentation" onClick={() => setConflict(null)}>
          <div className="own-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="own-modal-header">
              <h3 className="own-modal-title">Multiple Matches Found</h3>
            </div>
            <div className="own-modal-body">
              <p className="own-modal-desc">This ID is used by two different partners. Which one do you want to link?</p>
              <div className="own-modal-options">
                <button type="button" className="own-btn-outline own-btn-conflict" onClick={async () => {
                  const c = conflict;
                  setConflict(null);
                  if (c) await linkPartner(c.companyId, c.loginId, "login");
                }}>
                  Link as Login ID:
                  <br />
                  <strong>{conflict?.data?.login_partner}</strong>
                </button>
                <button type="button" className="own-btn-outline own-btn-conflict" onClick={async () => {
                  const c = conflict;
                  setConflict(null);
                  if (c) await linkPartner(c.companyId, c.loginId, "group");
                }}>
                  Join Group:
                  <br />
                  <strong>{conflict?.data?.group_partner}</strong>
                </button>
              </div>
            </div>
            <div className="own-modal-footer">
              <button type="button" className="own-footer-btn own-btn-cancel" onClick={() => setConflict(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {typeof document !== "undefined" && bulkBar ? createPortal(bulkBar, document.body) : null}
    </>
  );
}

function PartnerLinkSection({ inputId, onLink }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="own-partner-section">
      <div className="own-partner-info">
        <div className="own-partner-title-row">
          <span className="own-partner-title">External Partner</span>
          <div className="own-partner-actions">
            <input id={inputId} type="text" className="own-partner-input" placeholder="Login ID/Group ID" autoComplete="off" autoCapitalize="characters" value={val} onChange={(e) => setVal(e.target.value.toUpperCase())} />
            <button
              type="button"
              className="own-partner-link-btn"
              disabled={busy}
              onClick={async () => {
                const login = val.trim();
                if (!login) return;
                setBusy(true);
                const ok = await onLink(login);
                setBusy(false);
                if (ok) setVal("");
              }}
            >
              {busy ? "Linking..." : "Link Partner"}
            </button>
          </div>
        </div>
        <span className="own-partner-desc">Share this company&apos;s read-only dashboard visibility with another independent owner.</span>
      </div>
    </div>
  );
}

function GePartnerSection({ groupId, onLink }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="own-partner-section">
      <div className="own-partner-info">
        <div className="own-partner-title-row">
          <span className="own-partner-title">External Partner</span>
          <div className="own-partner-actions">
            <input id={`ge-partner-login-${groupId}`} type="text" className="own-partner-input" placeholder="Login ID/Group ID" autoComplete="off" value={val} onChange={(e) => setVal(e.target.value.toUpperCase())} />
            <button
              type="button"
              className="own-partner-link-btn"
              disabled={busy}
              onClick={async () => {
                const login = val.trim();
                if (!login) return;
                setBusy(true);
                const ok = await onLink(login);
                setBusy(false);
                if (ok) setVal("");
              }}
            >
              {busy ? "Linking..." : "Link Partner"}
            </button>
          </div>
        </div>
        <span className="own-partner-desc">Share this group&apos;s read-only dashboard visibility with another independent owner.</span>
      </div>
    </div>
  );
}
