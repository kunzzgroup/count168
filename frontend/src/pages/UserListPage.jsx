import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";
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

const PERMISSION_ICONS = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  admin: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
  account: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  process: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  datacapture: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  payment: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  report: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  maintenance: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
};

function roleBadgeClass(role) {
  return `role-${String(role || "").toLowerCase().replace(/\s+/g, "-")}`;
}

export default function UserListPage() {
  const navigate = useNavigate();
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
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

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({
    id: "",
    login_id: "",
    name: "",
    email: "",
    role: "",
    password: "",
    secondary_password: "",
    status: "active",
    read_only: true,
  });
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
    window.clearTimeout(window.__ulToast);
    window.__ulToast = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const currentUserId = me?.user_id ?? null;
  const currentUserRole = normRole(me?.role);

  const isC168Company = useMemo(() => {
    const c = companies.find((x) => Number(x.id) === Number(companyId));
    return c && String(c.company_id || "").toUpperCase() === "C168";
  }, [companies, companyId]);

  const allCompanyButtons = useMemo(() => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""), [companies]);
  const groupIds = useMemo(
    () => [...new Set(allCompanyButtons.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [allCompanyButtons]
  );
  const companyButtons = useMemo(() => {
    if (!selectedGroup) return allCompanyButtons.filter((c) => !c.group_id || String(c.group_id).trim() === "");
    return allCompanyButtons.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup);
  }, [allCompanyButtons, selectedGroup]);

  const filteredSorted = useMemo(() => {
    const f = applyUserFilters(usersRaw, { search, showInactive, showAll, viewerRole: currentUserRole });
    return sortUsers(f, sortColumn, sortDirection);
  }, [usersRaw, search, showInactive, showAll, currentUserRole, sortColumn, sortDirection]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE)), [filteredSorted.length]);

  useEffect(() => {
    if (showAll) return;
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages, showAll]);
  const pageRows = useMemo(() => {
    if (showAll) return filteredSorted;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, currentPage, showAll]);

  const permDisabledMap = useMemo(() => {
    const allowed = new Set(getCurrentUserRolePermissions(currentUserRole));
    const m = {};
    PERMISSION_KEYS.forEach((k) => {
      m[k] = currentUserRole !== "owner" && !allowed.has(k);
    });
    return m;
  }, [currentUserRole]);

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("user-page");
    const cssA = document.createElement("link");
    cssA.rel = "stylesheet";
    cssA.href = assetUrl("css/userlist.css");
    document.head.appendChild(cssA);
    const cssB = document.createElement("link");
    cssB.rel = "stylesheet";
    cssB.href = assetUrl("css/global-13inch.css");
    document.head.appendChild(cssB);
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css?family=Amaranth";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.body.classList.remove("user-page", "user-page--show-all");
      document.body.classList.add("bg");
      if (cssA.parentNode) cssA.parentNode.removeChild(cssA);
      if (cssB.parentNode) cssB.parentNode.removeChild(cssB);
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);

  useEffect(() => {
    if (showAll) document.body.classList.add("user-page--show-all");
    else document.body.classList.remove("user-page--show-all");
  }, [showAll]);

  const fetchUsers = useCallback(async () => {
    if (!companyId || !me) return;
    setTableLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || "Failed to load users", "danger");
        setUsersRaw([]);
        return;
      }
      let list = Array.isArray(json.data) ? json.data.map((u) => ({ ...u, is_owner_shadow: false })) : [];
      if (normRole(me.role) === "owner" && me.user_id) {
        try {
          const r2 = await fetch(buildApiUrl("api/users/userlist_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "get", id: me.user_id }),
          });
          const j2 = await r2.json();
          if (j2.success && j2.data && normRole(j2.data.role) === "owner") {
            const shadow = { ...j2.data, is_owner_shadow: true };
            if (!list.some((u) => Number(u.id) === Number(shadow.id))) {
              list = [shadow, ...list];
            }
          }
        } catch {
          /* ignore */
        }
      }
      setUsersRaw(list);
      setCurrentPage(1);
      setSelectedDeleteIds(new Set());
      setSelectAllUsers(false);
    } catch {
      notify("Failed to load users", "danger");
    } finally {
      setTableLoading(false);
    }
  }, [companyId, me, notify]);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        if (String(meJson.data.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(meJson.data.permissions) ? meJson.data.permissions : [];
        const hasFull = perms.length === 0;
        if (!hasFull && !perms.includes("admin")) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(meJson.data);
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);
        const url = new URL(window.location.href);
        const showAllParam = url.searchParams.get("showAll") === "1";
        const q = url.searchParams.get("search") || "";
        const cid = url.searchParams.get("company_id");
        const effective = cid || meJson.data.company_id || rows[0]?.id || null;
        setCompanyId(effective ? Number(effective) : null);
        setSearch(q);
        setShowAll(showAllParam);
        const cur = rows.find((r) => Number(r.id) === Number(effective));
        setSelectedGroup(cur?.group_id ? String(cur.group_id).toUpperCase() : null);
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (bootLoading || !companyId || !me) return;
    void fetchUsers();
  }, [bootLoading, companyId, me, fetchUsers]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (search.trim()) url.searchParams.set("search", search.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, search, showInactive, showAll]);

  useEffect(() => {
    if (bootLoading) return;
    const t = window.setTimeout(syncUrl, 100);
    return () => window.clearTimeout(t);
  }, [bootLoading, syncUrl]);

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    setSwitchingCompany(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) {
        notify(json.error || json.message || "Could not switch company", "danger");
        return;
      }
      setCompanyId(Number(c.id));
      notifyCompanySessionUpdated();
      setSelectedGroup(c.group_id ? String(c.group_id).toUpperCase() : null);
    } catch {
      notify("Company switch failed", "danger");
    } finally {
      setSwitchingCompany(false);
    }
  };

  const fetchModalAccountsProcesses = async (cid) => {
    try {
      const [accRes, procRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/accountlistapi.php?company_id=${cid}`), { credentials: "include" }),
        fetch(
          buildApiUrl(`api/processes/processlist_api.php?permission=Games&company_id=${cid}&showAll=1`),
          { credentials: "include" }
        ),
      ]);
      const accJ = await accRes.json();
      const procJ = await procRes.json();
      const accs = (accJ?.data?.accounts || [])
        .filter((a) => String(a.status || "").toLowerCase() === "active")
        .map((a) => ({ id: a.id, account_id: a.account_id }));
      const prows = Array.isArray(procJ?.data) ? procJ.data : [];
      const procs = prows
        .filter((p) => String(p.status || "").toLowerCase() === "active")
        .map((p) => ({
          id: p.id,
          process_id: p.process_name || p.process_id || "",
          description: p.description_name || p.description || "",
        }));
      setModalAccounts(accs);
      setModalProcesses(procs);
      return { accounts: accs, processes: procs };
    } catch {
      setModalAccounts([]);
      setModalProcesses([]);
      return { accounts: [], processes: [] };
    }
  };

  const loadCompaniesForModal = async () => {
    try {
      const res = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : [];
      setModalCompanies(list);
      return list;
    } catch {
      setModalCompanies([]);
      return [];
    }
  };

  const openAdd = async () => {
    if (!companyId) return;
    const avail = getAvailableRolesForCreation(currentUserRole);
    if (avail.length === 0) {
      notify("You do not have permission to create new accounts", "danger");
      return;
    }
    setIsEditMode(false);
    setEditingRow(null);
    setForm({
      id: "",
      login_id: "",
      name: "",
      email: "",
      role: "",
      password: "",
      secondary_password: "",
      status: "active",
      read_only: true,
    });
    setRoleSelectDisabled(false);
    setLoginDisabled(false);
    setFieldLocks({ name: false, email: false, role: false, password: false, sidebar: false, company: false });
    const allP = new Set(PERMISSION_KEYS.filter((k) => !permDisabledMap[k]));
    setPermSelected(allP);
    setSelectedAccountIds(new Set());
    setSelectedProcessIds(new Set());
    setSelectedCompanyIds([]);
    const { accounts: accList, processes: procList } = await fetchModalAccountsProcesses(companyId);
    const compList = await loadCompaniesForModal();
    setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
    setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
    if (currentUserRole === "admin" || currentUserRole === "owner") {
      const cur = companyId ? [Number(companyId)] : compList[0]?.id ? [Number(compList[0].id)] : [];
      setSelectedCompanyIds(cur);
    }
    setModalOpen(true);
  };

  const applyPermTemplate = (role, force) => {
    if (isEditMode && !force) return;
    const next = new Set();
    getRoleTemplateSidebarList(role).forEach((k) => next.add(k));
    setPermSelected(next);
  };

  const openEdit = async (row) => {
    if (!companyId) return;
    if (row.is_owner_shadow && currentUserRole !== "owner") {
      notify("Only the owner can edit owner records", "danger");
      return;
    }
    setIsEditMode(true);
    setEditingRow(row);
    setForm({
      id: String(row.id),
      login_id: row.login_id || "",
      name: row.name || "",
      email: row.email || "",
      role: normRole(row.role),
      password: "",
      secondary_password: "",
      status: normRole(row.status) || "active",
      read_only: true,
    });
    const { accounts: accList, processes: procList } = await fetchModalAccountsProcesses(companyId);
    await loadCompaniesForModal();
    setRoleSelectDisabled(!!row.is_owner_shadow);
    setLoginDisabled(true);
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    const curLevel = ROLE_HIERARCHY[currentUserRole] ?? 999;
    const editLevel = ROLE_HIERARCHY[normRole(row.role)] ?? 999;
    const isSelf = caps.isSelf;
    const isUpper = !isSelf && curLevel < editLevel;
    const isSame = !isSelf && curLevel === editLevel;
    const isLower = !isSelf && curLevel > editLevel;
    setFieldLocks({
      name: isSame || isLower,
      email: isSame || isLower,
      role: isSame || isLower,
      password: false,
      sidebar: isSelf || isSame || isLower,
      company: isSelf || isSame || isLower || !(currentUserRole === "admin" || currentUserRole === "owner"),
    });
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get", id: row.id }),
      });
      const json = await res.json();
      if (!json.success || !json.data) {
        notify(json.message || "Load user failed", "danger");
        setModalOpen(false);
        setEditingRow(null);
        return;
      }
      const d = json.data;
      let perms = [];
      try {
        perms = d.permissions ? JSON.parse(d.permissions) : [];
        if (!Array.isArray(perms)) perms = [];
      } catch {
        perms = [];
      }
      setPermSelected(new Set(perms.map((p) => String(p).toLowerCase())));
      const ro = d.read_only !== undefined ? parseInt(d.read_only, 10) === 1 : true;
      setForm((f) => ({ ...f, read_only: ro }));
      let ap = null;
      let pp = null;
      try {
        if (d.account_permissions != null) ap = typeof d.account_permissions === "string" ? JSON.parse(d.account_permissions) : d.account_permissions;
      } catch {
        ap = [];
      }
      try {
        if (d.process_permissions != null) pp = typeof d.process_permissions === "string" ? JSON.parse(d.process_permissions) : d.process_permissions;
      } catch {
        pp = [];
      }
      if (ap === null) setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
      else setSelectedAccountIds(new Set((Array.isArray(ap) ? ap : []).map((x) => Number(x.id || x))));

      if (pp === null) setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
      else setSelectedProcessIds(new Set((Array.isArray(pp) ? pp : []).map((x) => Number(x.id || x))));

      if (Array.isArray(d.company_ids) && (currentUserRole === "admin" || currentUserRole === "owner")) {
        setSelectedCompanyIds(d.company_ids.map(Number));
      } else {
        setSelectedCompanyIds(companyId ? [Number(companyId)] : []);
      }
      if (row.is_owner_shadow) {
        setPermSelected(new Set(PERMISSION_KEYS));
        setSelectedAccountIds(new Set(accList.map((a) => Number(a.id))));
        setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
        setSelectedCompanyIds([]);
      }
    } catch {
      notify("Load user failed", "danger");
      setModalOpen(false);
      setEditingRow(null);
      return;
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRow(null);
  };

  const toggleSortLogin = () => {
    if (sortColumn !== "loginId") {
      setSortColumn("loginId");
      setSortDirection("asc");
    } else {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    }
  };
  const toggleSortRole = () => {
    if (sortColumn !== "role") {
      setSortColumn("role");
      setSortDirection("asc");
    } else {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const toggleUserStatus = async (row) => {
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    if (!caps.canToggleStatus) return;
    if (!row.is_owner_shadow) {
      const ur = normRole(row.role);
      if (currentUserRole === "admin" && ur === "admin" && Number(row.id) !== Number(currentUserId)) {
        notify("Admin accounts cannot toggle status of other admin accounts", "danger");
        return;
      }
      const low = ["manager", "supervisor", "accountant", "audit", "customer service"];
      if (low.includes(currentUserRole) && (ur === "admin" || ur === "owner")) {
        notify("You do not have permission to toggle status of admin or owner accounts", "danger");
        return;
      }
    }
    try {
      const fd = new FormData();
      fd.append("id", String(row.id));
      const res = await fetch(buildApiUrl("api/users/toggle_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      const newStatus = json?.data?.newStatus || json?.newStatus;
      if (!json.success || !newStatus) {
        notify(json.message || "Toggle failed", "danger");
        return;
      }
      setUsersRaw((prev) => prev.map((u) => (Number(u.id) === Number(row.id) ? { ...u, status: newStatus } : u)));
      notify("Status updated", "success");
    } catch {
      notify("Toggle failed", "danger");
    }
  };

  const runDeleteBatch = async (ids) => {
    const results = await Promise.all(
      ids.map((id) =>
        fetch(buildApiUrl("api/users/userlist_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "delete", id }),
        }).then((r) => r.json().catch(() => ({ success: false })))
      )
    );
    const ok = results.filter((r) => r.success).length;
    if (ok === ids.length) notify(`Successfully deleted ${ok} users!`, "success");
    else notify(`Deletion: ${ok} succeeded, ${ids.length - ok} failed`, "danger");
    setUsersRaw((prev) => prev.filter((u) => !ids.includes(Number(u.id))));
    setSelectedDeleteIds(new Set());
    setSelectAllUsers(false);
  };

  const deleteSelected = () => {
    const ids = Array.from(selectedDeleteIds);
    if (!ids.length) {
      notify("Please select users to delete first", "danger");
      return;
    }
    if (ids.some((id) => Number(id) === Number(currentUserId))) {
      notify("You cannot delete your own account", "danger");
      return;
    }
    const curLevel = ROLE_HIERARCHY[currentUserRole] ?? 999;
    const rows = filteredSorted;
    const byId = Object.fromEntries(rows.map((r) => [Number(r.id), r]));
    if (ids.some((id) => Number(id) !== Number(currentUserId) && curLevel === (ROLE_HIERARCHY[normRole(byId[id]?.role)] ?? 999))) {
      notify("You cannot delete accounts with the same role level", "danger");
      return;
    }
    if (ids.some((id) => (ROLE_HIERARCHY[normRole(byId[id]?.role)] ?? 999) < curLevel)) {
      notify("You cannot delete accounts with higher role level", "danger");
      return;
    }
    if (ids.some((id) => byId[id]?.is_owner_shadow) && currentUserRole !== "owner") {
      notify("Only the owner can delete owner records", "danger");
      return;
    }
    const low = ["manager", "supervisor", "accountant", "audit", "customer service"];
    if (low.includes(currentUserRole) && ids.some((id) => ["admin", "owner"].includes(normRole(byId[id]?.role)))) {
      notify("You do not have permission to delete admin or owner accounts", "danger");
      return;
    }
    const names = ids.map((id) => byId[id]?.name || id).join(", ");
    setConfirmMessage(`Are you sure you want to delete the following ${ids.length} user(s)?\n\n${names}`);
    setConfirmOpen(true);
    window.__pendingDeleteIds = ids;
  };

  const confirmDelete = async () => {
    const ids = window.__pendingDeleteIds || [];
    setConfirmOpen(false);
    if (ids.length) await runDeleteBatch(ids);
  };

  const toggleSelectAllHeader = (checked) => {
    const eligible = pageRows
      .map((r) => {
        const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
        const st = getDeleteCheckboxState(r, caps);
        return st.show && !st.disabled ? Number(r.id) : null;
      })
      .filter(Boolean);
    if (checked) setSelectedDeleteIds(new Set(eligible));
    else setSelectedDeleteIds(new Set());
    setSelectAllUsers(checked);
  };

  useEffect(() => {
    const eligible = pageRows
      .map((r) => {
        const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
        const st = getDeleteCheckboxState(r, caps);
        return st.show && !st.disabled ? Number(r.id) : null;
      })
      .filter(Boolean);
    if (!eligible.length) {
      setSelectAllUsers(false);
      return;
    }
    const allOn = eligible.every((id) => selectedDeleteIds.has(id));
    setSelectAllUsers(allOn);
  }, [pageRows, selectedDeleteIds, currentUserId, currentUserRole]);

  const buildSubmitPayload = () => {
    const row = editingRow;
    const editingUserId = parseInt(form.id, 10);
    const isSelf = currentUserId && editingUserId === Number(currentUserId);
    const editingUserRole = row ? normRole(row.role) : normRole(form.role);
    const curLevel = ROLE_HIERARCHY[currentUserRole] ?? 999;
    const editLevel = ROLE_HIERARCHY[editingUserRole] ?? 999;
    const isUpperLevel = !isSelf && curLevel < editLevel;
    const isSameLevel = !isSelf && curLevel === editLevel;
    const isLowerLevel = !isSelf && curLevel > editLevel;

    const accountPerms = Array.from(selectedAccountIds).map((id) => {
      const a = modalAccounts.find((x) => Number(x.id) === Number(id));
      return { id: Number(id), account_id: a?.account_id || "" };
    });
    const processPerms = Array.from(selectedProcessIds).map((id) => {
      const p = modalProcesses.find((x) => Number(x.id) === Number(id));
      return { id: Number(id), process_id: p?.process_id || "", description: p?.description || "" };
    });

    let data = {
      action: isEditMode ? "update" : "create",
      id: form.id || undefined,
      login_id: form.login_id.trim(),
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      status: form.status,
    };
    if (form.password.trim()) data.password = form.password;
    if (isC168Company && form.secondary_password.trim()) {
      if (!/^\d{6}$/.test(form.secondary_password.trim())) {
        notify("Secondary password must be exactly 6 digits", "danger");
        return null;
      }
      data.secondary_password = form.secondary_password.trim();
    }
    if (normRole(form.role) === "partnership" || normRole(row?.role) === "partnership") {
      data.read_only = form.read_only ? 1 : 0;
    }
    if (row?.is_owner_shadow) {
      delete data.role;
      return data;
    }
    if (!isEditMode) {
      data.permissions = getFinalPermissionsForCreation(form.role, Array.from(permSelected), currentUserRole);
      data.account_permissions = accountPerms;
      data.process_permissions = processPerms;
      if ((currentUserRole === "admin" || currentUserRole === "owner") && selectedCompanyIds.length) {
        data.company_ids = selectedCompanyIds;
      }
      return data;
    }
    if (isSelf) {
      data.account_permissions = accountPerms;
      data.process_permissions = processPerms;
    } else if (isUpperLevel) {
      data.permissions = Array.from(permSelected);
      data.account_permissions = accountPerms;
      data.process_permissions = processPerms;
      if ((currentUserRole === "admin" || currentUserRole === "owner") && selectedCompanyIds.length && !fieldLocks.company) {
        data.company_ids = selectedCompanyIds;
      }
    } else if (isSameLevel || isLowerLevel) {
      data.account_permissions = accountPerms;
      data.process_permissions = processPerms;
      if (row) {
        data.name = row.name;
        data.email = row.email;
        data.role = normRole(row.role);
        delete data.password;
        delete data.secondary_password;
      }
    }
    return data;
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (!isEditMode && !form.password.trim()) {
      notify("Password is required when creating a new user", "danger");
      return;
    }
    if (!isEditMode) {
      const avail = getAvailableRolesForCreation(currentUserRole);
      if (!avail.find((r) => r.value === normRole(form.role))) {
        notify("You do not have permission to create accounts with role " + form.role, "danger");
        return;
      }
      if ((currentUserRole === "admin" || currentUserRole === "owner") && !selectedCompanyIds.length) {
        notify("Please select at least one company", "danger");
        return;
      }
    }
    const payload = buildSubmitPayload();
    if (!payload) return;
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        notify(json.message || "Save failed", "danger");
        return;
      }
      notify(json.message || "Saved", "success");
      closeModal();
      if (isEditMode && json.data?.will_lose_access) {
        setUsersRaw((prev) => prev.filter((u) => Number(u.id) !== Number(form.id)));
      } else if (isEditMode && json.data) {
        setUsersRaw((prev) => prev.map((u) => (Number(u.id) === Number(json.data.id) ? { ...u, ...json.data, is_owner_shadow: u.is_owner_shadow } : u)));
      } else if (!isEditMode && json.data) {
        setUsersRaw((prev) => [...prev, { ...json.data, is_owner_shadow: false }]);
      } else {
        void fetchUsers();
      }
    } catch {
      notify("Save failed", "danger");
    }
  };

  if (bootLoading || !me) return null;

  const deleteEligibleOnPage = pageRows.filter((r) => {
    const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
    const st = getDeleteCheckboxState(r, caps);
    return st.show && !st.disabled;
  });

  return (
    <>
      <div className="container">
        <div className="content">
          <h1>User List</h1>
          <div className="separator-line" />
          <div className="action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-add" onClick={() => void openAdd()}>
                  Add User
                </button>
                <div className="search-container">
                  <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input type="text" className="search-input" placeholder="Search by Login Id or Name" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="checkbox-section">
                  <input
                    type="checkbox"
                    id="showInactive"
                    checked={showInactive}
                    onChange={(e) => {
                      setShowInactive(e.target.checked);
                      if (e.target.checked) setShowAll(false);
                    }}
                  />
                  <label htmlFor="showInactive">Show Inactive</label>
                </div>
                <div className="checkbox-section">
                  <input
                    type="checkbox"
                    id="showAll"
                    checked={showAll}
                    onChange={(e) => {
                      setShowAll(e.target.checked);
                      if (e.target.checked) setShowInactive(false);
                    }}
                  />
                  <label htmlFor="showAll">Show All</label>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" className="btn btn-delete" id="deleteSelectedBtn" disabled={!selectedDeleteIds.size} onClick={deleteSelected}>
                  {selectedDeleteIds.size ? `Delete (${selectedDeleteIds.size})` : "Delete"}
                </button>
              </div>
            </div>
            <div id="user-list-company-filter-wrapper" style={{ padding: "0 20px 15px 20px", width: "100%", overflowX: "auto", boxSizing: "border-box" }}>
              {groupIds.length > 0 && (
                <div className="transaction-company-filter shared-group-wrapper">
                  <span className="transaction-company-label">GroupID:</span>
                  <div className="transaction-company-buttons">
                    {groupIds.map((g) => (
                      <button key={g} type="button" className={`transaction-company-btn shared-group-btn ${selectedGroup === g ? "active" : ""}`} onClick={() => setSelectedGroup((p) => (p === g ? null : g))}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="transaction-company-filter shared-company-wrapper">
                <span className="transaction-company-label">Company:</span>
                <div className="transaction-company-buttons">
                  {companyButtons.map((c) => (
                    <button key={c.id} type="button" className={`transaction-company-btn shared-company-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`} onClick={() => onSwitchCompany(c)} disabled={switchingCompany}>
                      {c.company_id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="user-table-wrapper" id="userTableWrapper">
            <div className="table-header">
              <div className="header-item">No</div>
              <div className="header-item header-sortable" onClick={toggleSortLogin} role="presentation">
                Login Id<span className="sort-indicator">{sortColumn === "loginId" ? (sortDirection === "asc" ? "▲" : "▼") : "▲"}</span>
              </div>
              <div className="header-item">Name</div>
              <div className="header-item">Email</div>
              <div className="header-item header-sortable" onClick={toggleSortRole} role="presentation">
                Role<span className="sort-indicator">{sortColumn === "role" ? (sortDirection === "asc" ? "▲" : "▼") : ""}</span>
              </div>
              <div className="header-item">Status</div>
              <div className="header-item">Last Login</div>
              <div className="header-item">Created By</div>
              <div className="header-item">
                Action
                {deleteEligibleOnPage.length > 0 ? (
                  <input type="checkbox" title="Select all" style={{ marginLeft: 10, cursor: "pointer" }} checked={selectAllUsers} onChange={(e) => toggleSelectAllHeader(e.target.checked)} />
                ) : null}
              </div>
            </div>
            <div className="user-cards" id="userTableBody">
              {(tableLoading || switchingCompany) && (
                <div className="user-card show-card row-even" style={{ display: "grid" }}>
                  <div className="card-item" style={{ gridColumn: "1 / -1" }}>
                    Loading...
                  </div>
                </div>
              )}
              {!tableLoading &&
                !switchingCompany &&
                pageRows.map((r, idx) => {
                  const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
                  const del = getDeleteCheckboxState(r, caps);
                  const rowClass = idx % 2 === 0 ? "row-even" : "row-odd";
                  const showCard = showAll ? "show-card" : "show-card";
                  const no = showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1;
                  return (
                    <div key={`${r.id}-${r.is_owner_shadow ? "o" : "u"}`} className={`user-card ${showCard} ${rowClass}`}>
                      <div className="card-item">{no}</div>
                      <div className="card-item">{r.login_id}</div>
                      <div className="card-item">{r.name}</div>
                      <div className="card-item">{r.email || "-"}</div>
                      <div className="card-item uppercase-text">
                        <span className={`role-badge ${roleBadgeClass(r.role)}`}>{String(r.role || "").toUpperCase()}</span>
                      </div>
                      <div className="card-item uppercase-text">
                        {caps.canToggleStatus ? (
                          <span
                            className={`role-badge ${normRole(r.status) === "active" ? "status-active" : "status-inactive"} status-clickable`}
                            onClick={() => void toggleUserStatus(r)}
                            title="Click to toggle status"
                            role="presentation"
                          >
                            {String(r.status || "").toUpperCase()}
                          </span>
                        ) : (
                          <span
                            className={`role-badge ${normRole(r.status) === "active" ? "status-active" : "status-inactive"}`}
                            style={{ cursor: "not-allowed", opacity: 0.6 }}
                            title={caps.isSelf ? "You cannot toggle your own status" : "No permission to toggle status"}
                          >
                            {String(r.status || "").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="card-item">{formatLastLogin(r.last_login)}</div>
                      <div className="card-item uppercase-text">{String(r.created_by || "-").toUpperCase()}</div>
                      <div className="card-item">
                        {caps.canEditDelete ? (
                          <button type="button" className="btn btn-edit edit-btn" aria-label="Edit" onClick={() => void openEdit(r)}>
                            <img src={assetUrl("images/edit.svg")} alt="Edit" />
                          </button>
                        ) : (
                          <button type="button" className="btn btn-edit edit-btn" disabled style={{ opacity: 0.3, cursor: "not-allowed" }} aria-label="Edit Disabled">
                            <img src={assetUrl("images/edit.svg")} alt="Edit Disabled" />
                          </button>
                        )}
                        {del.show ? (
                          <input
                            type="checkbox"
                            className="user-checkbox"
                            style={{ marginLeft: 10 }}
                            disabled={del.disabled}
                            title={del.title}
                            checked={selectedDeleteIds.has(Number(r.id))}
                            onChange={(e) => {
                              setSelectedDeleteIds((prev) => {
                                const n = new Set(prev);
                                if (e.target.checked) n.add(Number(r.id));
                                else n.delete(Number(r.id));
                                return n;
                              });
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          {!showAll && (
            <div className="pagination-container" id="paginationContainer">
              <button type="button" className="pagination-btn" id="prevBtn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                ◀
              </button>
              <span className="pagination-info" id="paginationInfo">
                {currentPage} of {totalPages}
              </span>
              <button type="button" className="pagination-btn" id="nextBtn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                ▶
              </button>
            </div>
          )}
        </div>
      </div>

      <div id="notificationContainer" className="notification-container">
        {toast ? <div className={`notification notification-${toast.type} show`}>{toast.message}</div> : null}
      </div>

      <div id="confirmModal" className="modal" style={{ display: confirmOpen ? "block" : "none" }}>
        <div className="confirm-modal-content">
          <div className="confirm-icon-container">
            <svg className="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="confirm-title">Confirm Delete</h2>
          <p className="confirm-message" style={{ whiteSpace: "pre-line" }}>
            {confirmMessage}
          </p>
          <div className="confirm-actions">
            <button type="button" className="btn btn-cancel confirm-cancel" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-delete confirm-delete" onClick={() => void confirmDelete()}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <div id="userModal" className="modal" style={{ display: modalOpen ? "block" : "none" }}>
        <div className="modal-content">
          <div className="modal-header-bar">
            <h2 id="modalTitle">{isEditMode ? (editingRow?.is_owner_shadow ? "Edit Owner" : "Edit User") : "Add User"}</h2>
            <button type="button" className="btn-back" onClick={closeModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          </div>
          <div className="modal-body">
            <div className="user-info-panel">
              <h3>User Information</h3>
              <form id="userForm" onSubmit={saveUser}>
                <input type="hidden" name="id" value={form.id} />
                <input type="hidden" name="status" value={form.status} />
                <div className="user-info-grid">
                  <div className="form-group user-info-field">
                    <label htmlFor="login_id">Login ID *</label>
                    <input
                      id="login_id"
                      required
                      disabled={loginDisabled}
                      value={form.login_id}
                      onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  {isC168Company ? (
                    <div className="form-group user-info-field password-row-container" id="passwordRowContainer" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <div className="password-field-wrapper" id="passwordGroup">
                        <label htmlFor="password">{isEditMode ? "Password" : "Password *"}</label>
                        <input id="password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                      </div>
                      <div className="password-field-wrapper" id="secondaryPasswordGroup">
                        <label htmlFor="secondary_password">Secondary Password (6 digits)</label>
                        <input
                          id="secondary_password"
                          type="password"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          placeholder="Enter 6-digit password"
                          value={form.secondary_password}
                          onChange={(e) => setForm((f) => ({ ...f, secondary_password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="form-group user-info-field" id="passwordGroup">
                      <label htmlFor="password">{isEditMode ? "Password" : "Password *"}</label>
                      <input id="password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    </div>
                  )}
                  <div className="form-group user-info-field">
                    <label htmlFor="name">Name *</label>
                    <input id="name" required disabled={fieldLocks.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="form-group user-info-field">
                    <label htmlFor="role">Role *</label>
                    <select id="role" required disabled={roleSelectDisabled || fieldLocks.role} value={form.role} onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, role: v }));
                      applyPermTemplate(v, true);
                    }}>
                      <option value="">Select Role</option>
                      {editingRow?.is_owner_shadow ? (
                        <option value="owner">Owner</option>
                      ) : (
                        <>
                          {(isEditMode ? getAvailableRolesForEdit(currentUserRole, editingRow?.role) : getAvailableRolesForCreation(currentUserRole)).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                          {isEditMode && form.role && !getAvailableRolesForEdit(currentUserRole, editingRow?.role).find((x) => x.value === form.role) ? (
                            <option value={form.role}>{ALL_ROLE_OPTIONS.find((x) => x.value === form.role)?.label || String(form.role).toUpperCase()}</option>
                          ) : null}
                        </>
                      )}
                    </select>
                  </div>
                  <div className="form-group user-info-field">
                    <label htmlFor="email">Email *</label>
                    <input id="email" type="email" required disabled={fieldLocks.email} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.toLowerCase() }))} />
                  </div>
                  {(currentUserRole === "admin" || currentUserRole === "owner") && (
                    <div className="form-group user-info-field company-field-group">
                      <label>Company *</label>
                      <div id="user-company-buttons-container" className="transaction-company-buttons" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {modalCompanies.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`transaction-company-btn${selectedCompanyIds.includes(Number(c.id)) ? " active" : ""}`}
                            disabled={fieldLocks.company || !!editingRow?.is_owner_shadow}
                            onClick={() =>
                              setSelectedCompanyIds((prev) => {
                                const id = Number(c.id);
                                if (prev.includes(id)) return prev.filter((x) => x !== id);
                                return [...prev, id];
                              })
                            }
                          >
                            {c.company_id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div id="sidebarPermissionsWrapper" className="sidebar-permissions-section">
                  <h3 className="sidebar-permissions-title">
                    Permissions
                    {normRole(form.role) === "partnership" || normRole(editingRow?.role) === "partnership" ? (
                      <span id="readOnlyToggleWrapper" className="read-only-toggle-inline" style={{ marginLeft: 12 }}>
                        <span className="read-only-label">Read Only</span>
                        <label className="toggle-switch" htmlFor="readOnlyToggle">
                          <input type="checkbox" id="readOnlyToggle" checked={form.read_only} onChange={(e) => setForm((f) => ({ ...f, read_only: e.target.checked }))} />
                          <span className="toggle-slider" />
                        </label>
                      </span>
                    ) : null}
                  </h3>
                  <div className="permissions-container">
                    {PERMISSION_KEYS.map((key) => (
                      <div key={key} className="permission-item" style={{ opacity: permDisabledMap[key] ? 0.6 : 1 }}>
                        <label className="permission-label">
                          <input
                            type="checkbox"
                            className="permission-checkbox"
                            value={key}
                            disabled={fieldLocks.sidebar || permDisabledMap[key] || !!editingRow?.is_owner_shadow}
                            checked={permSelected.has(key)}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setPermSelected((prev) => {
                                const n = new Set(prev);
                                if (on) n.add(key);
                                else n.delete(key);
                                return n;
                              });
                            }}
                          />
                          <span className="permission-name">
                            <svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24">
                              <path d={PERMISSION_ICONS[key]} />
                            </svg>
                            {key === "datacapture" ? "Data Capture" : key === "payment" ? "Transaction Payment" : key.charAt(0).toUpperCase() + key.slice(1)}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="permissions-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={fieldLocks.sidebar || !!editingRow?.is_owner_shadow}
                      onClick={() => {
                        const cur = getCurrentUserRolePermissions(currentUserRole);
                        const n = new Set();
                        PERMISSION_KEYS.forEach((k) => {
                          if ((currentUserRole === "owner" || cur.includes(k)) && !permDisabledMap[k]) n.add(k);
                        });
                        setPermSelected(n);
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="btn-clearall"
                      disabled={fieldLocks.sidebar || !!editingRow?.is_owner_shadow}
                      onClick={() => {
                        const cur = getCurrentUserRolePermissions(currentUserRole);
                        setPermSelected((prev) => {
                          const n = new Set(prev);
                          PERMISSION_KEYS.forEach((k) => {
                            if ((currentUserRole === "owner" || cur.includes(k)) && !permDisabledMap[k]) n.delete(k);
                          });
                          return n;
                        });
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {!isEditMode ? (
                  <div className="form-actions add-mode-actions">
                    <button type="submit" className="btn btn-save">
                      Save
                    </button>
                    <button type="button" className="btn btn-cancel" onClick={closeModal}>
                      Cancel
                    </button>
                  </div>
                ) : null}
              </form>
            </div>

            <div className="permissions-panel" id="editModeRightPanel" style={{ display: "flex" }}>
              <div id="accountProcessPermissionsSection" style={{ display: "flex", width: "100%", gap: 16 }}>
                <div className="account-process-col">
                  <label className="acc-proc-label">Account</label>
                  <div className="account-grid" id="accountGrid">
                    {modalAccounts.map((a) => (
                      <div key={a.id} className="account-item-compact" data-search={String(a.account_id || "").toLowerCase()} style={{ display: "flex", alignItems: "center", padding: "clamp(0px, 0.1vw, 2px) clamp(2px, 0.21vw, 4px)", borderRadius: 4, backgroundColor: "white", border: "1px solid #eee" }}>
                        <input
                          type="checkbox"
                          id={`account_${a.id}`}
                          checked={selectedAccountIds.has(Number(a.id))}
                          disabled={!!editingRow?.is_owner_shadow}
                          style={{ margin: "1px 3px 1px 4px", width: "clamp(8px, 0.73vw, 14px)", height: "clamp(8px, 0.73vw, 14px)", flexShrink: 0 }}
                          onChange={(e) => {
                            setSelectedAccountIds((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(Number(a.id));
                              else n.delete(Number(a.id));
                              return n;
                            });
                          }}
                        />
                        <label htmlFor={`account_${a.id}`} className="account-label" style={{ fontSize: "small", fontWeight: 800, color: "#333", cursor: "pointer", flex: 1, minWidth: 0, wordBreak: "break-all", lineHeight: 1.2 }}>
                          {a.account_id}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="account-control-buttons">
                    <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedAccountIds(new Set(modalAccounts.map((x) => Number(x.id))))}>
                      Select All
                    </button>
                    <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedAccountIds(new Set())}>
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="account-process-col">
                  <label className="acc-proc-label">Process</label>
                  <div className="account-grid" id="processGrid">
                    {modalProcesses.map((p) => (
                      <div key={p.id} className="account-item-compact" data-search={String(p.process_id + " " + (p.description || "")).toLowerCase()} style={{ display: "flex", alignItems: "center", padding: "clamp(0px, 0.1vw, 2px) clamp(2px, 0.21vw, 4px)", borderRadius: 4, backgroundColor: "white", border: "1px solid #eee" }}>
                        <input
                          type="checkbox"
                          id={`process_${p.id}`}
                          checked={selectedProcessIds.has(Number(p.id))}
                          disabled={!!editingRow?.is_owner_shadow}
                          style={{ margin: "1px 3px 1px 4px", width: "clamp(8px, 0.73vw, 14px)", height: "clamp(8px, 0.73vw, 14px)", flexShrink: 0 }}
                          onChange={(e) => {
                            setSelectedProcessIds((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(Number(p.id));
                              else n.delete(Number(p.id));
                              return n;
                            });
                          }}
                        />
                        <label htmlFor={`process_${p.id}`} className="account-label" style={{ fontSize: "small", fontWeight: 800, color: "#333", cursor: "pointer", flex: 1, minWidth: 0, wordBreak: "break-all", lineHeight: 1.2 }}>
                          {p.process_id}
                          {p.description ? (
                            <>
                              <br />
                              {p.description}
                            </>
                          ) : null}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="account-control-buttons">
                    <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedProcessIds(new Set(modalProcesses.map((x) => Number(x.id))))}>
                      Select All
                    </button>
                    <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedProcessIds(new Set())}>
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {isEditMode ? (
            <div className="edit-mode-bottom-bar" id="editModeBottomBar" style={{ display: "flex" }}>
              <button type="submit" form="userForm" className="btn btn-save">
                Save
              </button>
              <button type="button" className="btn btn-cancel" onClick={closeModal}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
