import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import {
  getApiMessage,
  isApiConflict,
  isApiSuccess,
  rebuildGroupIds,
} from "./ownershipHelpers.js";

// Components
import CompanyCard from "./components/CompanyCard.jsx";
import GroupEarningCard from "./components/GroupEarningCard.jsx";
import BulkActionBar from "./components/BulkActionBar.jsx";
import ConflictModal from "./components/ConflictModal.jsx";

export default function OwnershipPage() {
  const [boot, setBoot] = useState(true);
  const [cssReady, setCssReady] = useState(false);

  useEffect(() => {
    // Force body classes for correct background (SPA parity)
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");

    const cssFiles = ["css/ownership.css", "css/global-13inch.css"];
    let loadedCount = 0;
    const links = cssFiles.map((file) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = assetUrl(file);
      link.onload = () => {
        loadedCount++;
        if (loadedCount === cssFiles.length) setCssReady(true);
      };
      // For cached or failing loads, ensure we eventually show something
      link.onerror = () => {
        loadedCount++;
        if (loadedCount === cssFiles.length) setCssReady(true);
      };
      document.head.appendChild(link);
      return link;
    });
    return () => {
      links.forEach((l) => {
        if (l.parentNode) l.parentNode.removeChild(l);
      });
    };
  }, []);

  const [activeTab, setActiveTab] = useState("account-ownership");
  const [loadingList, setLoadingList] = useState(false);
  const [allCompanies, setAllCompanies] = useState([]);
  const [groupFilter, setGroupFilter] = useState(null);

  // States for companies
  const [companyStates, setCompanyStates] = useState({});
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);
  const [loadingCompanyId, setLoadingCompanyId] = useState(null);
  const [savingCompanyId, setSavingCompanyId] = useState(null);

  // States for group earnings
  const [geGroups, setGeGroups] = useState([]);
  const [geLoading, setGeLoading] = useState(false);
  const [geStates, setGeStates] = useState({});
  const [geExpanded, setGeExpanded] = useState(null);
  const [geLoadingGid, setGeLoadingGid] = useState(null);
  const [geSavingGid, setGeSavingGid] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(new Set());
  const [bulkGroupSelect, setBulkGroupSelect] = useState("");
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [openGroupForCompanyId, setOpenGroupForCompanyId] = useState(null);

  const dragRef = useRef({ companyId: null, idx: null });
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(buildApiUrl("api/ownership/get_companies_api.php?all=1"), {
        credentials: "include",
      });
      const json = await res.json();
      if (isApiSuccess(json)) setAllCompanies(json.data || []);
      else showToast(getApiMessage(json, "Failed to load companies"), "error");
    } catch {
      showToast("Server error", "error");
    } finally {
      setLoadingList(false);
      setBoot(false);
    }
  }, [showToast]);

  const loadGeGroups = useCallback(async () => {
    setGeLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/ownership/get_group_earnings_api.php"), {
        credentials: "include",
      });
      const json = await res.json();
      if (isApiSuccess(json)) setGeGroups(json.data || []);
      else showToast(getApiMessage(json, "Failed to load groups"), "error");
    } catch {
      showToast("Server error", "error");
    } finally {
      setGeLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (activeTab === "group-earnings") void loadGeGroups();
  }, [activeTab, loadGeGroups]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest?.(".own-group-btn-wrap")) setOpenGroupForCompanyId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // Sync selection mode with filter
  useEffect(() => {
    setSelectedCompanyIds(new Set());
    setSelectionMode(false);
  }, [groupFilter]);

  const allGroupIds = useMemo(() => rebuildGroupIds(allCompanies), [allCompanies]);

  const companiesData = useMemo(() => {
    if (groupFilter === null) return allCompanies.filter((c) => !c.group_id);
    return allCompanies.filter(
      (c) => c.group_id && String(c.group_id).toLowerCase() === String(groupFilter).toLowerCase()
    );
  }, [allCompanies, groupFilter]);

  const calcTotal = (rows) => rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);

  if (boot || !cssReady) return null;

  // Handlers
  const toggleCard = async (cid) => {
    if (expandedCompanyId === cid) {
      setExpandedCompanyId(null);
      return;
    }
    setExpandedCompanyId(cid);
    if (!companyStates[cid]) {
      setLoadingCompanyId(cid);
      try {
        const compData = allCompanies.find((c) => Number(c.id) === cid);
        const compGid = compData?.group_id || "";
        const [aRes, oRes] = await Promise.all([
          fetch(buildApiUrl(`api/ownership/get_available_accounts_api.php?company_id=${cid}`), {
            credentials: "include",
          }).then((r) => r.json()),
          fetch(buildApiUrl(`api/ownership/get_owners_api.php?company_id=${cid}`), {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        const accounts = aRes.status === "success" ? aRes.data : [];
        if (compGid && !accounts.some((a) => String(a.id) === `G_${compGid}`)) {
          accounts.push({
            id: `G_${compGid}`,
            account_name: `Group: ${compGid}`,
            name: `Group Equity`,
            role: "GROUP",
            type: "group",
            is_main_owner: 0,
          });
        }
        setCompanyStates((prev) => ({
          ...prev,
          [cid]: {
            accounts,
            rows: (oRes.status === "success" ? oRes.data : []).map((o) => ({
              account_id: o.account_id,
              percentage: parseFloat(o.percentage),
              role: o.role || "",
              user_raw_id: o.user_raw_id || null,
              ownership_id: o.ownership_id || null,
              is_external_partner: parseInt(o.is_external_partner, 10) === 1,
              read_only: o.read_only !== null ? parseInt(o.read_only, 10) : 1,
            })),
          },
        }));
      } catch {
        showToast("Error loading data", "error");
      } finally {
        setLoadingCompanyId(null);
      }
    }
  };

  const updateRow = (cid, idx, field, val) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      const rows = [...st.rows];
      const r = { ...rows[idx] };
      if (field === "account_id") {
        r.account_id = val;
        const acc = st.accounts.find((a) => String(a.id) === String(val));
        if (acc) {
          r.role = (acc.role || "").toLowerCase();
          r.user_raw_id = String(val).startsWith("U_") ? parseInt(String(val).replace("U_", ""), 10) : null;
          r.read_only = 1;
        } else {
          r.role = "";
          r.user_raw_id = null;
        }
      } else if (field === "percent_input") {
        let p = parseFloat(String(val).replace("%", ""));
        if (isNaN(p)) p = 0;
        r.percentage = Math.max(0, Math.min(100, p));
      } else if (field === "slider") {
        r.percentage = parseFloat(val);
      } else if (field === "read_only") {
        r.read_only = val;
      }
      rows[idx] = r;
      return { ...prev, [cid]: { ...st, rows } };
    });
  };

  const addRow = (cid) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      return {
        ...prev,
        [cid]: {
          ...st,
          rows: [...st.rows, { account_id: "", percentage: 0, role: "", user_raw_id: null, read_only: 1 }],
        },
      };
    });
  };

  const removeRow = (cid, idx) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      const rows = [...st.rows];
      rows.splice(idx, 1);
      return { ...prev, [cid]: { ...st, rows } };
    });
  };

  const reorderRows = (cid, from, to, insertAfter) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      const rows = [...st.rows];
      const [moved] = rows.splice(from, 1);
      let newIdx = to;
      if (from < to) newIdx = insertAfter ? to : to - 1;
      else newIdx = insertAfter ? to + 1 : to;
      rows.splice(newIdx, 0, moved);
      return { ...prev, [cid]: { ...st, rows } };
    });
  };

  const linkPartner = async (cid, loginId, forceType = "") => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/add_external_partner_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: cid, login_id: loginId, force_type: forceType }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(getApiMessage(json, "Partner linked successfully"), "success");
        setExpandedCompanyId(null);
        window.setTimeout(() => void toggleCard(cid), 300);
        return true;
      }
      if (isApiConflict(json)) {
        setConflict({ companyId: cid, loginId, data: json.data });
        return false;
      }
      showToast(getApiMessage(json, "Link partner failed"), "error");
      return false;
    } catch {
      showToast("Server error", "error");
      return false;
    }
  };

  const confirmCompany = async (cid) => {
    const st = companyStates[cid];
    if (!st) return;
    const { rows } = st;
    if (rows.some((r) => !r.account_id)) {
      showToast("Please select an account for all rows.", "error");
      return;
    }
    const total = calcTotal(rows);
    if (total > 100) {
      showToast("Total percentage exceeds 100%", "error");
      return;
    }
    const ids = rows.map((r) => r.account_id);
    if (new Set(ids).size !== ids.length) {
      showToast("Duplicate accounts detected.", "error");
      return;
    }
    setSavingCompanyId(cid);
    try {
      const res = await fetch(buildApiUrl("api/ownership/batch_save_owners_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_id: cid,
          owners: rows.map((r) => ({
            account_id: r.account_id,
            percentage: r.percentage,
            read_only: r.read_only,
          })),
        }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(getApiMessage(json, "Saved successfully"), "success");
        setAllCompanies((prev) => prev.map((c) => (Number(c.id) === cid ? { ...c, allocated_percentage: total } : c)));
        setExpandedCompanyId(null);
      } else showToast(getApiMessage(json, "Save failed"), "error");
    } catch {
      showToast("Server error", "error");
    } finally {
      setSavingCompanyId(null);
    }
  };

  const joinGroup = async (cid, gid, companyName) => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/join_group_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: cid, group_id: gid }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(`"${companyName}" joined group "${gid}"`, "success");
        void fetchCompanies();
      } else showToast(getApiMessage(json, "Join group failed"), "error");
    } catch {
      showToast("Server error", "error");
    }
  };

  const ungroupCompany = async (cid, companyName) => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/ungroup_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_id: cid }),
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

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedCompanyIds(new Set());
  };

  const toggleCompanySelect = (comp, e) => {
    if (!selectionMode) return;
    const id = Number(comp.id);
    const gid = comp.group_id || null;
    const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
    if (!selectable) return;
    if (e.target.closest("button, .own-group-panel")) return;
    e.stopPropagation();
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkJoin = async (gid) => {
    if (!gid) {
      showToast("Please select a group", "error");
      return;
    }
    try {
      const res = await fetch(buildApiUrl("api/ownership/bulk_join_group_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_ids: Array.from(selectedCompanyIds), group_id: gid }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(`Added ${selectedCompanyIds.size} companies to ${gid}`, "success");
        setSelectedCompanyIds(new Set());
        setSelectionMode(false);
        void fetchCompanies();
      } else showToast(getApiMessage(json, "Bulk join failed"), "error");
    } catch {
      showToast("Server error", "error");
    }
  };

  const bulkUngroup = async () => {
    try {
      const res = await fetch(buildApiUrl("api/ownership/bulk_ungroup_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ company_ids: Array.from(selectedCompanyIds) }),
      });
      const json = await res.json();
      if (isApiSuccess(json)) {
        showToast(`Removed ${selectedCompanyIds.size} companies from group`, "success");
        setSelectedCompanyIds(new Set());
        setSelectionMode(false);
        void fetchCompanies();
      } else showToast(getApiMessage(json, "Bulk ungroup failed"), "error");
    } catch {
      showToast("Server error", "error");
    }
  };

  // Group Earnings handlers
  const geToggle = async (gid) => {
    if (geExpanded === gid) {
      setGeExpanded(null);
      return;
    }
    setGeExpanded(gid);
    if (!geStates[gid]) {
      setGeLoadingGid(gid);
      try {
        const [aRes, oRes] = await Promise.all([
          fetch(buildApiUrl(`api/ownership/get_group_available_accounts_api.php?group_id=${encodeURIComponent(gid)}`), {
            credentials: "include",
          }).then((r) => r.json()),
          fetch(buildApiUrl(`api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(gid)}`), {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        setGeStates((prev) => ({
          ...prev,
          [gid]: {
            accounts: aRes.status === "success" ? aRes.data : [],
            rows: (oRes.status === "success" ? oRes.data : []).map((o) => ({
              account_id: o.composite_id || o.account_id,
              percentage: parseFloat(o.percentage),
              role: o.role || "",
              user_raw_id: o.user_raw_id || null,
              ownership_id: o.ownership_id || null,
              is_external_partner: parseInt(o.is_external_partner, 10) === 1,
              read_only: o.read_only !== null ? parseInt(o.read_only, 10) : 1,
            })),
          },
        }));
      } catch {
        showToast("Error loading group data", "error");
      } finally {
        setGeLoadingGid(null);
      }
    }
  };

  const geUpdateRow = (gid, idx, field, val) => {
    setGeStates((prev) => {
      const st = prev[gid];
      if (!st) return prev;
      const rows = [...st.rows];
      const r = { ...rows[idx] };
      if (field === "account_id") {
        r.account_id = val;
        const acc = st.accounts.find((a) => String(a.id) === String(val));
        if (acc) {
          r.role = (acc.role || "").toLowerCase();
          r.user_raw_id = String(val).startsWith("U_") ? parseInt(String(val).replace("U_", ""), 10) : null;
          r.read_only = 1;
        } else {
          r.role = "";
          r.user_raw_id = null;
        }
      } else if (field === "percent_input") {
        let p = parseFloat(String(val).replace("%", ""));
        if (isNaN(p)) p = 0;
        r.percentage = Math.max(0, Math.min(100, p));
      } else if (field === "slider") r.percentage = parseFloat(val);
      else if (field === "read_only") r.read_only = val;
      rows[idx] = r;
      return { ...prev, [gid]: { ...st, rows } };
    });
  };

  const geAddRow = (gid) => {
    setGeStates((prev) => {
      const st = prev[gid];
      if (!st) return prev;
      return {
        ...prev,
        [gid]: {
          ...st,
          rows: [...st.rows, { account_id: "", percentage: 0, role: "", user_raw_id: null, read_only: 1 }],
        },
      };
    });
  };

  const geRemoveRow = (gid, idx) => {
    setGeStates((prev) => {
      const st = prev[gid];
      if (!st) return prev;
      const rows = [...st.rows];
      rows.splice(idx, 1);
      return { ...prev, [gid]: { ...st, rows } };
    });
  };

  const geConfirm = async (groupId) => {
    const st = geStates[groupId];
    if (!st) return;
    const { rows } = st;
    if (rows.some((r) => !r.account_id)) {
      showToast("Please select an account.", "error");
      return;
    }
    const total = calcTotal(rows);
    if (total > 100) {
      showToast("Total percentage exceeds 100%", "error");
      return;
    }
    const ids = rows.map((r) => r.account_id);
    if (new Set(ids).size !== ids.length) {
      showToast("Duplicate accounts detected.", "error");
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
          owners: rows.map((r) => ({ account_id: r.account_id, percentage: r.percentage, read_only: r.read_only })),
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
          void geToggle(groupId);
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

  if (boot) return null;

  return (
    <>
      <div className="own-container">
        <h1 className="own-page-title">Account Ownership</h1>
        <div className="own-separator-line" />
        <div className="own-tab-bar">
          <button
            type="button"
            className={`own-tab-btn${activeTab === "account-ownership" ? " active" : ""}`}
            onClick={() => setActiveTab("account-ownership")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Account Ownership
          </button>
          <button
            type="button"
            className={`own-tab-btn${activeTab === "group-earnings" ? " active" : ""}`}
            onClick={() => setActiveTab("group-earnings")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Group Earnings
          </button>
        </div>

        <div className="own-tab-panel" style={{ display: activeTab === "account-ownership" ? "" : "none" }}>
          {allGroupIds.length > 0 ? (
            <div className="own-group-filter-bar">
              <span className="own-gfb-label">Group</span>
              <div className="own-gfb-buttons">
                {allGroupIds.map((g) => {
                  const count = allCompanies.filter(
                    (c) => c.group_id && String(c.group_id).toLowerCase() === String(g).toLowerCase()
                  ).length;
                  const active = groupFilter === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      className={`own-gfb-btn${active ? " active" : ""}`}
                      onClick={() => setGroupFilter((prev) => (prev === g ? null : g))}
                    >
                      {g}
                      <span className="own-gfb-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="own-gfb-spacer" />
              <button
                type="button"
                className={`own-select-mode-btn${selectionMode ? " active" : ""}`}
                onClick={toggleSelectionMode}
              >
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
              companiesData.map((c) => (
                <CompanyCard
                  key={c.id}
                  comp={c}
                  expanded={expandedCompanyId === Number(c.id)}
                  loading={loadingCompanyId === Number(c.id)}
                  companyState={companyStates[Number(c.id)]}
                  allGroupIds={allGroupIds}
                  selectionMode={selectionMode}
                  isSelected={selectedCompanyIds.has(Number(c.id))}
                  groupFilter={groupFilter}
                  savingCompanyId={savingCompanyId}
                  openGroupPanelId={openGroupForCompanyId}
                  dragRef={dragRef}
                  onToggle={toggleCard}
                  onToggleSelect={toggleCompanySelect}
                  onJoinGroup={joinGroup}
                  onUngroup={ungroupCompany}
                  onSetOpenGroupPanel={setOpenGroupForCompanyId}
                  onUpdateRow={updateRow}
                  onAddRow={addRow}
                  onRemoveRow={removeRow}
                  onReorderRows={reorderRows}
                  onLinkPartner={linkPartner}
                  onConfirm={confirmCompany}
                  onCancel={() => setExpandedCompanyId(null)}
                  calcTotal={calcTotal}
                />
              ))
            )}
          </div>
        </div>

        <div className="own-tab-panel" style={{ display: activeTab === "group-earnings" ? "" : "none" }}>
          <div id="groupEarningsContainer">
            {geLoading && !geGroups.length ? (
              <div className="own-loader-container">
                <div className="own-loader" />
              </div>
            ) : geGroups.length === 0 ? (
              <div className="own-empty-state">
                No groups found. Assign companies to groups in the Account Ownership tab first.
              </div>
            ) : (
              geGroups.map((grp) => (
                <GroupEarningCard
                  key={grp.group_id}
                  grp={grp}
                  expanded={geExpanded === grp.group_id}
                  loadingGid={geLoadingGid}
                  geState={geStates[grp.group_id]}
                  geSavingGid={geSavingGid}
                  onToggle={geToggle}
                  onAddRow={geAddRow}
                  onUpdateRow={geUpdateRow}
                  onRemoveRow={geRemoveRow}
                  onConfirm={geConfirm}
                  onCancel={() => setGeExpanded(null)}
                  onLinkPartner={(login) => geLinkPartner(grp.group_id, login)}
                  calcTotal={calcTotal}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div
        id="ownToast"
        className={`own-toast${toast ? ` own-show ${toast.type === "success" ? "own-success" : "own-error"}` : ""}`}
      >
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

      <ConflictModal
        conflict={conflict}
        onResolve={async (type) => {
          const c = conflict;
          setConflict(null);
          if (c) await linkPartner(c.companyId, c.loginId, type);
        }}
        onCancel={() => setConflict(null)}
      />

      {typeof document !== "undefined" && (
        <BulkActionBar
          selectedCount={selectedCompanyIds.size}
          groupFilter={groupFilter}
          allGroupIds={allGroupIds}
          bulkGroupSelect={bulkGroupSelect}
          setBulkGroupSelect={setBulkGroupSelect}
          onBulkUngroup={bulkUngroup}
          onBulkJoin={bulkJoin}
          onExitSelectionMode={() => {
            setSelectionMode(false);
            setSelectedCompanyIds(new Set());
          }}
        />
      )}
    </>
  );
}
