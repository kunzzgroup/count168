import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import "../../../public/css/userlist.css";
import {
  ALL_ROLE_OPTIONS,
  PAGE_SIZE,
  PERMISSION_KEYS,
  ROLE_HIERARCHY,
  applyUserFilters,
  computeRowCapabilities,
  formatLastLogin,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  getCurrentUserRolePermissions,
  getDeleteCheckboxState,
  getFinalPermissionsForCreation,
  getRoleTemplateSidebarList,
  normRole,
  sortUsers,
} from "./userListLogic.js";

// Components
import UserModal from "./components/UserModal.jsx";
import UserConfirmModal from "./components/UserConfirmModal.jsx";
import { getUserListText } from "../../translateFile/userListTranslate.js";

function roleBadgeClass(role) {
  return `role-${String(role || "").toLowerCase().replace(/\s+/g, "-")}`;
}

function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

export default function UserListPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getUserListText(lang, key, params), [lang]);
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [usersRaw, setUsersRaw] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("loginId");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());
  const [selectAllUsers, setSelectAllUsers] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [cssReady, setCssReady] = useState(false);
  const toastTimerRef = useRef(null);
  const pendingDeleteRef = useRef(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
  const [permSelected, setPermSelected] = useState(() => new Set());
  const [modalCompanies, setModalCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [modalAccounts, setModalAccounts] = useState([]);
  const [modalProcesses, setModalProcesses] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(new Set());
  const [roleSelectDisabled, setRoleSelectDisabled] = useState(false);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const [fieldLocks, setFieldLocks] = useState({ name: false, email: false, role: false, password: false, sidebar: false, company: false });

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const currentUserId = me?.user_id ?? null;
  const currentUserRole = normRole(me?.role);

  const isC168Company = useMemo(() => {
    const c = companies.find((x) => Number(x.id) === Number(companyId));
    return c && String(c.company_id || "").toUpperCase() === "C168";
  }, [companies, companyId]);

  const allCompanyButtons = useMemo(() => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""), [companies]);
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons
        .map((c) => String(c.group_id || "").trim().toUpperCase())
        .filter(Boolean))]
        .sort(),
    [allCompanyButtons]
  );
  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(companyId)) || null,
    [allCompanyButtons, companyId]
  );
  const selectedGroupKey = useMemo(
    () => String(selectedCompany?.group_id || "").trim().toUpperCase(),
    [selectedCompany?.group_id]
  );
  const companiesForPicker = useMemo(() => {
    if (groupIds.length === 0) return allCompanyButtons;
    if (!selectedGroupKey) {
      const ung = allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
      return ung.length ? ung : allCompanyButtons;
    }
    const inG = allCompanyButtons.filter((c) => String(c.group_id || "").trim().toUpperCase() === selectedGroupKey);
    return inG.length ? inG : allCompanyButtons;
  }, [allCompanyButtons, groupIds.length, selectedGroupKey]);
  const filteredSorted = useMemo(() => {
    const f = applyUserFilters(usersRaw, { search, showInactive, showAll, viewerRole: currentUserRole });
    return sortUsers(f, sortColumn, sortDirection);
  }, [usersRaw, search, showInactive, showAll, currentUserRole, sortColumn, sortDirection]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE)), [filteredSorted.length]);

  const pageRows = useMemo(() => {
    if (showAll) return filteredSorted;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, currentPage, showAll]);

  const permDisabledMap = useMemo(() => {
    const allowed = new Set(getCurrentUserRolePermissions(currentUserRole));
    const m = {};
    PERMISSION_KEYS.forEach((k) => { m[k] = currentUserRole !== "owner" && !allowed.has(k); });
    return m;
  }, [currentUserRole]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    if (search.trim()) url.searchParams.set("search", search.trim()); else url.searchParams.delete("search");
    if (showAll) url.searchParams.set("showAll", "1"); else url.searchParams.delete("showAll");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [companyId, search, showAll]);

  useEffect(() => { if (!bootLoading) syncUrl(); }, [bootLoading, syncUrl]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("user-page");
    setCssReady(true);
    return () => {
      document.body.classList.remove("user-page", "user-page--show-all", "bg");
      document.body.classList.add("dashboard-page");
      setCssReady(false);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!companyId || !me) return;
    setTableLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "get" }) });
      const json = await res.json();
      if (!res.ok || !json.success) { notify(json.message || t("failedToLoadUsers"), "danger"); setUsersRaw([]); return; }
      let list = Array.isArray(json.data) ? json.data.map((u) => ({ ...u, is_owner_shadow: false })) : [];
      if (normRole(me.role) === "owner" && me.user_id) {
        try {
          const r2 = await fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "get", id: me.user_id }) });
          const j2 = await r2.json();
          if (j2.success && j2.data && normRole(j2.data.role) === "owner") { const shadow = { ...j2.data, is_owner_shadow: true }; if (!list.some((u) => Number(u.id) === Number(shadow.id))) { list = [shadow, ...list]; } }
        } catch { /* ignore */ }
      }
      setUsersRaw(list); setCurrentPage(1); setSelectedDeleteIds(new Set()); setSelectAllUsers(false);
    } catch { notify(t("failedToLoadUsers"), "danger"); } finally { setTableLoading(false); }
  }, [companyId, me, notify, t]);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) { navigate("/login", { replace: true }); return; }
        if (String(meJson.data.user_type || "").toLowerCase() === "member") { window.location.assign(new URL("/member", window.location.origin).href); return; }
        const perms = Array.isArray(meJson.data.permissions) ? meJson.data.permissions : [];
        if (perms.length > 0 && !perms.includes("admin")) { navigate("/dashboard", { replace: true }); return; }
        setMe(meJson.data);
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data.map(normalizeCompanyRow) : [];
        setCompanies(rows);
        const url = new URL(window.location.href);
        const cid = url.searchParams.get("company_id");
        const effective = cid || meJson.data.company_id || rows[0]?.id || null;
        setCompanyId(effective ? Number(effective) : null);
        setSearch(String(url.searchParams.get("search") || "").toUpperCase());
        setShowAll(url.searchParams.get("showAll") === "1");
      } catch { navigate("/login", { replace: true }); } finally { setBootLoading(false); }
    })();
  }, [navigate]);

  useEffect(() => { if (!bootLoading && companyId && me) void fetchUsers(); }, [bootLoading, companyId, me, fetchUsers]);

  const onSwitchCompany = async (c) => {
    if (!c?.id || (Number(c.id) === Number(companyId) && !switchingCompany)) {
      return;
    }
    setSwitchingCompany(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) { notify(json.error || json.message || t("couldNotSwitchCompany"), "danger"); return; }
      setCompanyId(Number(c.id));
      notifyCompanySessionUpdated();
    } catch { notify(t("companySwitchFailed"), "danger"); } finally { setSwitchingCompany(false); }
  };

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g || g === selectedGroupKey) return;
      const first = allCompanyButtons.find((c) => String(c.group_id || "").trim().toUpperCase() === g);
      if (first) void onSwitchCompany(first);
    },
    [allCompanyButtons, onSwitchCompany, selectedGroupKey]
  );

  const fetchModalAccountsProcesses = async (cid) => {
    try {
      const [accRes, procRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/accountlistapi.php?company_id=${cid}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/processes/processlist_api.php?company_id=${cid}&showAll=1`), { credentials: "include" }),
      ]);
      const accJ = await accRes.json(); const procJ = await procRes.json();
      const accs = (accJ?.data?.accounts || []).filter((a) => String(a.status || "").toLowerCase() === "active").map((a) => ({ id: a.id, account_id: a.account_id }));
      const procs = (Array.isArray(procJ?.data) ? procJ.data : []).filter((p) => String(p.status || "").toLowerCase() === "active").map((p) => ({ id: p.id, process_id: p.process_name || p.process_id || "", description: p.description_name || p.description || "" }));
      setModalAccounts(accs); setModalProcesses(procs); return { accounts: accs, processes: procs };
    } catch { setModalAccounts([]); setModalProcesses([]); return { accounts: [], processes: [] }; }
  };

  const loadCompaniesForModal = async () => {
    try {
      const res = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : [];
      const seen = new Set();
      const list = raw.filter((c) => {
        const key = String(c?.company_id || "").trim().toUpperCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setModalCompanies(list); return list;
    } catch { setModalCompanies([]); return []; }
  };

  const openAdd = async () => {
    if (!companyId) return;
    const avail = getAvailableRolesForCreation(currentUserRole);
    if (avail.length === 0) { notify(t("noPermissionCreateAccounts"), "danger"); return; }
    setIsEditMode(false); setEditingRow(null);
    setForm({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
    setRoleSelectDisabled(false); setLoginDisabled(false);
    setFieldLocks({ name: false, email: false, role: false, password: false, sidebar: false, company: false });
    const allP = new Set(PERMISSION_KEYS.filter((k) => !permDisabledMap[k])); setPermSelected(allP);
    await loadCompaniesForModal();
    const { accounts: accList, processes: procList } = await fetchModalAccountsProcesses(companyId);
    setSelectedAccountIds(new Set(accList.map((a) => Number(a.id)))); setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
    if (currentUserRole === "admin" || currentUserRole === "owner") { setSelectedCompanyIds(companyId ? [Number(companyId)] : []); }
    setModalOpen(true);
  };

  const applyPermTemplate = (role, force) => {
    if (isEditMode && !force) return;
    const next = new Set(); getRoleTemplateSidebarList(role).forEach((k) => next.add(k)); setPermSelected(next);
  };

  const openEdit = async (row) => {
    if (!companyId) return;
    if (row.is_owner_shadow && currentUserRole !== "owner") { notify(t("onlyOwnerCanEditOwner"), "danger"); return; }
    setIsEditMode(true); setEditingRow(row);
    setForm({ id: String(row.id), login_id: row.login_id || "", name: row.name || "", email: row.email || "", role: normRole(row.role), password: "", secondary_password: "", status: normRole(row.status) || "active", read_only: true });
    const { accounts: accList, processes: procList } = await fetchModalAccountsProcesses(companyId);
    await loadCompaniesForModal();
    setRoleSelectDisabled(!!row.is_owner_shadow); setLoginDisabled(true);
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    const curLevel = ROLE_HIERARCHY[currentUserRole] ?? 999; const editLevel = ROLE_HIERARCHY[normRole(row.role)] ?? 999;
    const isSelf = caps.isSelf; const isSame = !isSelf && curLevel === editLevel; const isLower = !isSelf && curLevel > editLevel;
    setFieldLocks({ name: isSame || isLower, email: isSame || isLower, role: isSame || isLower, password: false, sidebar: isSelf || isSame || isLower, company: isSelf || isSame || isLower || !(currentUserRole === "admin" || currentUserRole === "owner") });
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "get", id: row.id }) });
      const json = await res.json(); if (!json.success || !json.data) { notify(json.message || t("loadUserFailed"), "danger"); setModalOpen(false); return; }
      const d = json.data; let perms = []; try { perms = d.permissions ? JSON.parse(d.permissions) : []; } catch { perms = []; }
      setPermSelected(new Set(perms.map((p) => String(p).toLowerCase())));
      setForm((f) => ({ ...f, read_only: d.read_only !== undefined ? parseInt(d.read_only, 10) === 1 : true }));
      let ap = null, pp = null; try { if (d.account_permissions != null) ap = typeof d.account_permissions === "string" ? JSON.parse(d.account_permissions) : d.account_permissions; } catch { ap = []; }
      try { if (d.process_permissions != null) pp = typeof d.process_permissions === "string" ? JSON.parse(d.process_permissions) : d.process_permissions; } catch { pp = []; }
      setSelectedAccountIds(ap === null ? new Set(accList.map(a => Number(a.id))) : new Set((Array.isArray(ap) ? ap : []).map(x => Number(x.id || x))));
      setSelectedProcessIds(pp === null ? new Set(procList.map(p => Number(p.id))) : new Set((Array.isArray(pp) ? pp : []).map(x => Number(x.id || x))));
      if (Array.isArray(d.company_ids) && (currentUserRole === "admin" || currentUserRole === "owner")) { setSelectedCompanyIds(d.company_ids.map(Number)); } else { setSelectedCompanyIds(companyId ? [Number(companyId)] : []); }
      if (row.is_owner_shadow) { setPermSelected(new Set(PERMISSION_KEYS)); setSelectedAccountIds(new Set(accList.map(a => Number(a.id)))); setSelectedProcessIds(new Set(procList.map(p => Number(p.id)))); setSelectedCompanyIds([]); }
    } catch { notify(t("loadUserFailed"), "danger"); setModalOpen(false); }
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingRow(null); };

  const toggleUserStatus = async (row) => {
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    if (!caps.canToggleStatus) return;
    try {
      const fd = new FormData(); fd.append("id", String(row.id));
      const res = await fetch(buildApiUrl("api/users/toggle_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json(); const newStatus = json?.data?.newStatus || json?.newStatus;
      if (!json.success || !newStatus) { notify(json.message || t("toggleFailed"), "danger"); return; }
      setUsersRaw((prev) => prev.map((u) => (Number(u.id) === Number(row.id) ? { ...u, status: newStatus } : u))); notify(t("statusUpdated"), "success");
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const confirmDelete = async () => {
    const ids = pendingDeleteRef.current || []; pendingDeleteRef.current = []; setConfirmOpen(false);
    if (!ids.length) return;
    const results = await Promise.all(ids.map((id) => fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "delete", id }) }).then((r) => r.json().catch(() => ({ success: false })))));
    const ok = results.filter((r) => r.success).length;
    if (ok === ids.length) notify(t("deletedUsersSuccess", { count: ok }), "success"); else notify(t("deletionResult", { ok, fail: ids.length - ok }), "danger");
    setUsersRaw((prev) => prev.filter((u) => !ids.includes(Number(u.id)))); setSelectedDeleteIds(new Set()); setSelectAllUsers(false);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (!isEditMode && !form.password.trim()) { notify(t("passwordRequired"), "danger"); return; }
    const accountPerms = Array.from(selectedAccountIds).map(id => { const a = modalAccounts.find(x => Number(x.id) === Number(id)); return { id: Number(id), account_id: a?.account_id || "" }; });
    const processPerms = Array.from(selectedProcessIds).map(id => { const p = modalProcesses.find(x => Number(x.id) === Number(id)); return { id: Number(id), process_id: p?.process_id || "", description: p?.description || "" }; });
    let payload = { action: isEditMode ? "update" : "create", id: form.id || undefined, login_id: form.login_id.trim(), name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, status: form.status };
    if (form.password.trim()) payload.password = form.password;
    if (isC168Company && form.secondary_password.trim()) { if (!/^\d{6}$/.test(form.secondary_password.trim())) { notify(t("secondaryPasswordMustBe6Digits"), "danger"); return; } payload.secondary_password = form.secondary_password.trim(); }
    if (normRole(form.role) === "partnership" || normRole(editingRow?.role) === "partnership") payload.read_only = form.read_only ? 1 : 0;
    if (editingRow?.is_owner_shadow) { delete payload.role; } else if (!isEditMode) { payload.permissions = getFinalPermissionsForCreation(form.role, Array.from(permSelected), currentUserRole); payload.account_permissions = accountPerms; payload.process_permissions = processPerms; if ((currentUserRole === "admin" || currentUserRole === "owner")) payload.company_ids = selectedCompanyIds; } else {
      const caps = computeRowCapabilities(editingRow, currentUserId, currentUserRole);
      if (caps.isSelf || caps.isHigherLevel || caps.isSameLevel) {
        payload.account_permissions = accountPerms;
        payload.process_permissions = processPerms;
      } else {
        payload.permissions = Array.from(permSelected);
        payload.account_permissions = accountPerms;
        payload.process_permissions = processPerms;
      }
      if ((currentUserRole === "admin" || currentUserRole === "owner") && !fieldLocks.company) payload.company_ids = selectedCompanyIds;
    }
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
      const json = await res.json(); if (!json.success) { notify(json.message || t("saveFailed"), "danger"); return; }
      notify(json.message || t("saved"), "success"); closeModal();
      if (isEditMode && json.data?.will_lose_access) { setUsersRaw((prev) => prev.filter((u) => Number(u.id) !== Number(form.id))); }
      else if (json.data) { setUsersRaw((prev) => isEditMode ? prev.map((u) => (Number(u.id) === Number(json.data.id) ? { ...u, ...json.data, is_owner_shadow: u.is_owner_shadow } : u)) : [...prev, { ...json.data, is_owner_shadow: false }]); }
      else { void fetchUsers(); }
    } catch { notify(t("saveFailed"), "danger"); }
  };

  if (bootLoading || !me || !cssReady) return null;

  return (
    <>
      <div className="container">
        <div className="content">
          <h1>{t("userList")}</h1>
          <div className="separator-line" />
          <div className="action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    id="userlist-search-input"
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="userlist-filter-chips" role="group">
                  <button
                    type="button"
                    className={`user-filter-chip${showInactive && !showAll ? " is-selected" : ""}`}
                    aria-pressed={showInactive && !showAll}
                    onClick={() => {
                      if (showInactive && !showAll) setShowInactive(false);
                      else {
                        setShowInactive(true);
                        setShowAll(false);
                      }
                    }}
                  >
                    <span className="user-filter-chip__dot" aria-hidden>
                      {showInactive && !showAll ? (
                        <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 12l4 4 8-8" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="user-filter-chip__label">{t("showInactive")}</span>
                  </button>
                  <button
                    type="button"
                    className={`user-filter-chip${showAll ? " is-selected" : ""}`}
                    aria-pressed={showAll}
                    onClick={() => {
                      if (showAll) setShowAll(false);
                      else {
                        setShowAll(true);
                        setShowInactive(false);
                      }
                    }}
                  >
                    <span className="user-filter-chip__dot" aria-hidden>
                      {showAll ? (
                        <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 12l4 4 8-8" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="user-filter-chip__label">{t("showAll")}</span>
                  </button>
                </div>
              </div>
              <div className="user-toolbar-actions-right">
                <button type="button" className="btn btn-add" onClick={openAdd}>
                  <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  {t("addUser")}
                </button>
                <button
                  type="button"
                  className="btn btn-delete"
                  disabled={!selectedDeleteIds.size}
                  onClick={() => {
                    const ids = Array.from(selectedDeleteIds);
                    pendingDeleteRef.current = ids;
                    const selectedUserNames = usersRaw
                      .filter((u) => ids.includes(Number(u.id)))
                      .map((u) => String(u.login_id || u.name || u.email || u.id || "").trim())
                      .filter(Boolean);
                    const details = selectedUserNames.length ? `\n\n${selectedUserNames.join("\n")}` : "";
                    setConfirmMessage(`${t("deleteConfirmWithCount", { count: ids.length })}${details}`);
                    setConfirmOpen(true);
                  }}
                >
                  {t("deleteWithCount", { count: selectedDeleteIds.size })}
                </button>
              </div>
            </div>
            <div className="user-gc-inline-panel">
              {groupIds.length > 0 && (
                <div className="user-gc-inline-row">
                  <span className="user-gc-inline-label">{t("groupId")}</span>
                  <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                    <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
                      {groupIds.map((gid) => (
                        <button
                          key={gid}
                          type="button"
                          disabled={switchingCompany}
                          className={`user-gc-segment${gid === selectedGroupKey ? " is-on" : ""}`}
                          onClick={() => handlePickGroup(gid)}
                        >
                          {gid}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("company")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
                    {companiesForPicker.map((c) => {
                      const active = Number(companyId) === Number(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={switchingCompany}
                          className={`user-gc-segment${active ? " is-on" : ""}`}
                          onClick={() => {
                            if (!active) void onSwitchCompany(c);
                          }}
                        >
                          {String(c.company_id || "").toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="user-table-wrapper">
            <div className="table-header">
              <div className="header-item header-item--no">{t("no")}</div>
              <div
                className="header-item header-sortable"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  setSortColumn("loginId");
                  setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
                }}
                onClick={() => {
                  setSortColumn("loginId");
                  setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
                }}
              >
                {t("loginId")}
                {sortColumn === "loginId" && <span className="sort-indicator">{sortDirection === "asc" ? "▲" : "▼"}</span>}
              </div>
              <div className="header-item">{t("name")}</div>
              <div className="header-item">{t("email")}</div>
              <div
                className="header-item header-sortable"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  setSortColumn("role");
                  setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
                }}
                onClick={() => {
                  setSortColumn("role");
                  setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
                }}
              >
                {t("role")}
                {sortColumn === "role" && <span className="sort-indicator">{sortDirection === "asc" ? "▲" : "▼"}</span>}
              </div>
              <div className="header-item">{t("status")}</div>
              <div className="header-item">{t("lastLogin")}</div>
              <div className="header-item">{t("createdBy")}</div>
              <div className="header-item header-item--action">
                {t("action")}
                <input type="checkbox" checked={selectAllUsers} onChange={(e) => { const on = e.target.checked; const eligible = pageRows.filter(r => { const c = computeRowCapabilities(r, currentUserId, currentUserRole); return getDeleteCheckboxState(r, c).show; }).map(r => Number(r.id)); setSelectedDeleteIds(on ? new Set(eligible) : new Set()); setSelectAllUsers(on); }} />
              </div>
            </div>
            <div className="user-cards">
              {(tableLoading || switchingCompany) ? <div className="user-card user-card--loading show-card">{t("loading")}</div> : pageRows.map((r, idx) => {
                const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
                const del = getDeleteCheckboxState(r, caps);
                return (
                  <div key={`${r.id}-${r.is_owner_shadow ? "o" : "u"}`} className={`user-card show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`}>
                    <div className="card-item card-item--no">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                    <div className="card-item card-item--login">{r.login_id}</div>
                    <div className="card-item card-item--name">{r.name}</div>
                    <div className="card-item card-item--email">{r.email || "-"}</div>
                    <div className="card-item"><span className={`role-badge ${roleBadgeClass(r.role)}`}>{String(r.role || "").toUpperCase()}</span></div>
                    <div className="card-item"><span className={`role-badge ${normRole(r.status) === "active" ? "status-active" : "status-inactive"} ${caps.canToggleStatus ? "status-clickable" : ""}`} onClick={() => caps.canToggleStatus && toggleUserStatus(r)}>{String(r.status || "").toUpperCase()}</span></div>
                    <div className="card-item card-item--muted">{formatLastLogin(r.last_login)}</div>
                    <div className="card-item card-item--created-by">{String(r.created_by || "-").toUpperCase()}</div>
                    <div className="card-item card-item--action">
                      <button className="btn btn-edit" onClick={() => openEdit(r)} disabled={!caps.canEditDelete} style={{ opacity: caps.canEditDelete ? 1 : 0.3 }}><img src={assetUrl("images/edit.svg")} alt="Edit" /></button>
                      {del.show && <input type="checkbox" style={{ marginLeft: 10 }} disabled={del.disabled} checked={selectedDeleteIds.has(Number(r.id))} onChange={(e) => setSelectedDeleteIds(prev => { const n = new Set(prev); if (e.target.checked) n.add(Number(r.id)); else n.delete(Number(r.id)); return n; })} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {!showAll && (
            <div className="pagination-container">
              <button className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
            <span className="pagination-info">{t("paginationOf", { page: currentPage, total: totalPages })}</span>
              <button className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
            </div>
          )}
        </div>
      </div>
      {toast && <div id="notificationContainer" className="notification-container"><div className={`notification notification-${toast.type} show`}>{toast.message}</div></div>}
      <UserModal open={modalOpen} onClose={closeModal} isEditMode={isEditMode} editingRow={editingRow} form={form} setForm={setForm} isC168Company={isC168Company} currentUserRole={currentUserRole} roleSelectDisabled={roleSelectDisabled} loginDisabled={loginDisabled} fieldLocks={fieldLocks} permDisabledMap={permDisabledMap} permSelected={permSelected} setPermSelected={setPermSelected} modalCompanies={modalCompanies} selectedCompanyIds={selectedCompanyIds} setSelectedCompanyIds={setSelectedCompanyIds} modalAccounts={modalAccounts} selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIds} modalProcesses={modalProcesses} selectedProcessIds={selectedProcessIds} setSelectedProcessIds={setSelectedProcessIds} applyPermTemplate={applyPermTemplate} onSave={saveUser} t={t} />
      <UserConfirmModal open={confirmOpen} message={confirmMessage} onConfirm={confirmDelete} onClose={() => setConfirmOpen(false)} t={t} />
    </>
  );
}
