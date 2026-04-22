import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

const PAGE_SIZE = 20;
const ROLE_PRIORITY = ["CAPITAL", "BANK", "CASH", "PROFIT", "EXPENSES", "COMPANY", "PARTNER", "STAFF", "SUPPLIER", "AGENT", "MEMBER", "DEBTOR"];
const DEFAULT_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

function toUpper(v) {
  return String(v || "").toUpperCase();
}

function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (Number.isNaN(num)) return "";
  if (num > 0) return `-${num}`;
  return String(num);
}

function roleSortOrder(role, knownRoles) {
  const base = [...ROLE_PRIORITY];
  knownRoles.forEach((r) => {
    const key = toUpper(r) === "UPLINE" ? "SUPPLIER" : toUpper(r);
    if (!base.includes(key)) base.push(key);
  });
  return base.indexOf(toUpper(role) === "UPLINE" ? "SUPPLIER" : toUpper(role));
}

export default function AccountListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("account");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [currencySettingOpen, setCurrencySettingOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [linkAccountId, setLinkAccountId] = useState(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkType, setLinkType] = useState("bidirectional");
  const [linkedSelectedIds, setLinkedSelectedIds] = useState(new Set());
  const [linkedInitialIds, setLinkedInitialIds] = useState(new Set());
  const [linkTypesMap, setLinkTypesMap] = useState({});
  const [settingCurrencyId, setSettingCurrencyId] = useState(null);
  const [settingLinked, setSettingLinked] = useState(new Set());
  const [settingInitial, setSettingInitial] = useState(new Set());
  const [settingSearch, setSettingSearch] = useState("");
  const [settingRole, setSettingRole] = useState("");
  const [settingAddCurrency, setSettingAddCurrency] = useState("");

  const notify = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.__accountListToastTimer);
    window.__accountListToastTimer = window.setTimeout(() => setToast(null), 1800);
  };

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("account-page");
    const cssA = document.createElement("link");
    cssA.rel = "stylesheet";
    cssA.href = assetUrl("css/account-list.css");
    document.head.appendChild(cssA);
    const cssB = document.createElement("link");
    cssB.rel = "stylesheet";
    cssB.href = assetUrl("css/accountCSS.css");
    document.head.appendChild(cssB);
    return () => {
      document.body.classList.remove("account-page");
      document.body.classList.add("bg");
      if (cssA.parentNode) cssA.parentNode.removeChild(cssA);
      if (cssB.parentNode) cssB.parentNode.removeChild(cssB);
    };
  }, []);

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
          window.location.assign(new URL("member.php", window.location.origin).href);
          return;
        }

        const [companiesRes, editDataRes] = await Promise.all([
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
          fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" }),
        ]);
        const companiesJson = await companiesRes.json();
        const editJson = await editDataRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(rows);
        setRoles(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);
        setCurrencies(Array.isArray(editJson?.data?.currencies) ? editJson.data.currencies : []);

        const url = new URL(window.location.href);
        const showInactiveParam = url.searchParams.get("showInactive") === "1";
        const showAllParam = url.searchParams.get("showAll") === "1";
        const searchParam = url.searchParams.get("search") || "";
        const companyFromQuery = url.searchParams.get("company_id");
        const effectiveCompany = companyFromQuery || meJson.data.company_id || rows[0]?.id || null;
        setShowInactive(showInactiveParam);
        setShowAll(showAllParam);
        setSearchTerm(searchParam);
        setCompanyId(effectiveCompany ? Number(effectiveCompany) : null);

        const currentCompany = rows.find((r) => Number(r.id) === Number(effectiveCompany));
        setSelectedGroup(currentCompany?.group_id ? String(currentCompany.group_id).toUpperCase() : null);
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (loading || !companyId) return;
    const t = window.setTimeout(() => {
      fetchAccounts();
    }, 220);
    return () => window.clearTimeout(t);
  }, [searchTerm, showInactive, showAll]);

  useEffect(() => {
    if (!companyId || loading) return;
    fetchAccounts();
  }, [companyId, loading]);

  useEffect(() => {
    if (!loading && location.pathname === "/add-account") {
      openAdd();
    }
  }, [loading, location.pathname]);

  const syncUrl = () => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (searchTerm.trim()) url.searchParams.set("search", searchTerm.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  };

  const fetchAccounts = async () => {
    if (!companyId) return;
    setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
      url.searchParams.set("company_id", String(companyId));
      if (searchTerm.trim()) url.searchParams.set("search", searchTerm.trim());
      if (showInactive) url.searchParams.set("showInactive", "1");
      if (showAll) url.searchParams.set("showAll", "1");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Failed to load accounts", "danger");
        return;
      }
      setAccounts(Array.isArray(json?.data?.accounts) ? json.data.accounts : []);
      setSelectedDeleteIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      notify("Network connection failed", "danger");
    } finally {
      setTableLoading(false);
    }
  };

  const orderedRoles = useMemo(() => {
    const map = new Map();
    roles.forEach((r) => {
      const t = String(r || "").trim();
      if (t) map.set(toUpper(t), t);
    });
    ["PARTNER", "STAFF", "DEBTOR"].forEach((r) => {
      if (!map.has(r)) map.set(r, r);
    });
    const out = [];
    ROLE_PRIORITY.forEach((p) => {
      if (map.has(p)) {
        out.push(map.get(p));
        map.delete(p);
      } else if (p === "SUPPLIER" && map.has("UPLINE")) {
        out.push(map.get("UPLINE"));
        map.delete("UPLINE");
      }
    });
    return [...out, ...Array.from(map.values()).sort((a, b) => a.localeCompare(b))];
  }, [roles]);

  const allCompanyButtons = useMemo(
    () => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""),
    [companies]
  );
  const groupIds = useMemo(
    () => [...new Set(allCompanyButtons.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [allCompanyButtons]
  );
  const companyButtons = useMemo(() => {
    if (!selectedGroup) return allCompanyButtons.filter((c) => !c.group_id || String(c.group_id).trim() === "");
    return allCompanyButtons.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup);
  }, [allCompanyButtons, selectedGroup]);

  const sortedAccounts = useMemo(() => {
    const arr = [...accounts];
    arr.sort((a, b) => {
      if (sortColumn === "role") {
        const ao = roleSortOrder(a.role, roles);
        const bo = roleSortOrder(b.role, roles);
        if (ao !== bo) return sortDirection === "asc" ? ao - bo : bo - ao;
      }
      const ak = String(a.account_id || "").toLowerCase();
      const bk = String(b.account_id || "").toLowerCase();
      const base = ak.localeCompare(bk);
      return sortDirection === "asc" ? base : -base;
    });
    return arr;
  }, [accounts, sortColumn, sortDirection, roles]);

  const filteredForMode = useMemo(() => {
    if (showAll) return sortedAccounts.filter((a) => a.status === "active");
    return sortedAccounts;
  }, [sortedAccounts, showAll]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredForMode.length / PAGE_SIZE)), [filteredForMode]);
  const pageRows = useMemo(() => {
    if (showAll) return filteredForMode;
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return filteredForMode.slice(start, start + PAGE_SIZE);
  }, [filteredForMode, showAll, currentPage, totalPages]);

  const toggleSort = (col) => {
    if (sortColumn === col) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId) || switchingCompany) return;
    setSwitchingCompany(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Failed to switch company", "danger");
        return;
      }
      setCompanyId(Number(c.id));
      setCurrentPage(1);
      notify(`Switched to ${c.company_id}`, "success");
    } catch {
      notify("Failed to switch company", "danger");
    } finally {
      setSwitchingCompany(false);
    }
  };

  const togglePaymentAlert = async (id) => {
    const fd = new FormData();
    fd.append("id", id);
    try {
      const res = await fetch(buildApiUrl("api/accounts/toggle_payment_alert_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notify(json.error || "Payment alert toggle failed", "danger");
      setAccounts((prev) => prev.map((a) => (Number(a.id) === Number(id) ? { ...a, payment_alert: json.newPaymentAlert } : a)));
    } catch {
      notify("Payment alert toggle failed", "danger");
    }
  };

  const toggleAccountStatus = async (id) => {
    const fd = new FormData();
    fd.append("id", id);
    try {
      const res = await fetch(buildApiUrl("api/accounts/toggle_account_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      const next = json.newStatus || json?.data?.newStatus;
      if (!json.success || !next) return notify(json.error || "Status toggle failed", "danger");
      setAccounts((prev) => prev.filter((a) => {
        if (Number(a.id) !== Number(id)) return true;
        if (showAll) return true;
        if (showInactive) return next === "inactive";
        return next === "active";
      }).map((a) => (Number(a.id) === Number(id) ? { ...a, status: next } : a)));
    } catch {
      notify("Status toggle failed", "danger");
    }
  };

  const onDeleteSelected = async () => {
    const ids = Array.from(selectedDeleteIds);
    if (!ids.length) return notify("Please select accounts to delete.", "danger");
    setConfirmDeleteOpen(false);
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_accounts_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return notify(json.message || json.error || "Failed to delete accounts", "danger");
      setAccounts((prev) => prev.filter((a) => !selectedDeleteIds.has(Number(a.id))));
      setSelectedDeleteIds(new Set());
      notify("Accounts deleted successfully", "success");
    } catch {
      notify("Failed to delete accounts", "danger");
    }
  };

  const openAdd = async () => {
    setIsEditMode(false);
    setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]);
    setSelectedCompanyIds(companyId ? [Number(companyId)] : []);
    setCurrencyInput("");
    setAddModalOpen(true);
    await loadSelectionMeta(null, false);
  };

  const openEdit = async (id) => {
    try {
      const res = await fetch(buildApiUrl(`getaccountapi.php?id=${id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success || !json.data) return notify(json.error || "Failed to load account", "danger");
      const d = json.data;
      setIsEditMode(true);
      setForm({
        id: d.id,
        account_id: toUpper(d.account_id),
        name: toUpper(d.name),
        role: d.role || "",
        password: d.password || "",
        remark: toUpper(d.remark),
        payment_alert: String(d.payment_alert == 1 ? "1" : "0"),
        alert_type: d.alert_type || d.alert_day || "",
        alert_start_date: d.alert_start_date || d.alert_specific_date || "",
        alert_amount: d.alert_amount || "",
      });
      await loadSelectionMeta(id, true);
      setEditModalOpen(true);
    } catch {
      notify("Failed to load account", "danger");
    }
  };

  const loadSelectionMeta = async (accountId, isEdit) => {
    try {
      const [curRes, compRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/account_currency_api.php?action=get_available_currencies${accountId ? `&account_id=${accountId}` : ""}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/accounts/account_company_api.php?action=get_available_companies${accountId ? `&account_id=${accountId}` : ""}`), { credentials: "include" }),
      ]);
      const curJson = await curRes.json();
      const compJson = await compRes.json();
      if (Array.isArray(curJson?.data)) {
        setCurrencies(curJson.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
        if (isEdit) setSelectedCurrencyIds(curJson.data.filter((c) => c.is_linked).map((c) => Number(c.id)));
      }
      if (Array.isArray(compJson?.data)) {
        const selected = compJson.data.filter((c) => c.is_linked).map((c) => Number(c.id));
        setSelectedCompanyIds(selected.length ? selected : companyId ? [Number(companyId)] : []);
      }
    } catch {
      // silent
    }
  };

  const saveForm = async (e) => {
    e.preventDefault();
    const alertAmount = normalizeAlertAmount(form.alert_amount);
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      return notify("When Payment Alert is Yes, Alert Type and Start Date are required.", "danger");
    }
    if (form.payment_alert === "1" && alertAmount && Number(alertAmount) >= 0) {
      return notify("Alert Amount must be negative.", "danger");
    }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === "alert_amount") fd.append(k, alertAmount);
      else fd.append(k, v ?? "");
    });
    if (form.payment_alert === "0") {
      fd.set("alert_type", "");
      fd.set("alert_start_date", "");
      fd.set("alert_amount", "");
    }
    if (selectedCompanyIds.length) fd.set("company_ids", JSON.stringify(selectedCompanyIds));
    if (!isEditMode) {
      if (companyId) fd.set("company_id", String(companyId));
      if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));
    }

    try {
      const endpoint = isEditMode ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notify(json.message || json.error || "Save failed", "danger");

      if (!isEditMode && json?.data?.id && selectedCompanyIds.length) {
        await Promise.all(
          selectedCompanyIds.map((cid) =>
            fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, company_id: cid }),
              credentials: "include",
            })
          )
        );
      }
      if (!isEditMode && json?.data?.id && selectedCurrencyIds.length) {
        await Promise.all(
          selectedCurrencyIds.map((cur) =>
            fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, currency_id: cur }),
              credentials: "include",
            })
          )
        );
      }
      setAddModalOpen(false);
      setEditModalOpen(false);
      notify(isEditMode ? "Account updated successfully" : "Account added successfully", "success");
      await fetchAccounts();
    } catch {
      notify("Save failed", "danger");
    }
  };

  const createCurrency = async () => {
    const code = toUpper(currencyInput).trim();
    if (!code) return;
    const targetCompany = selectedCompanyIds[0] || companyId;
    if (!targetCompany) return notify("Please select a company first", "danger");
    try {
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: targetCompany }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success || !json.data) return notify(json.message || json.error || "Failed to create currency", "danger");
      setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code, is_linked: false }]);
      setCurrencyInput("");
      notify(`Currency ${code} created`, "success");
    } catch {
      notify("Failed to create currency", "danger");
    }
  };

  const removeCurrency = async (cid) => {
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cid }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return notify(json.error || "Failed to delete currency", "danger");
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
    } catch {
      notify("Failed to delete currency", "danger");
    }
  };

  const openLinkModal = async (accountId) => {
    setLinkAccountId(accountId);
    setLinkType("bidirectional");
    setLinkedSelectedIds(new Set());
    setLinkedInitialIds(new Set());
    setLinkTypesMap({});
    setLinkSearch("");
    setLinkModalOpen(true);
    try {
      const res = await fetch(buildApiUrl(`api/accounts/account_link_api.php?action=get_linked_accounts&account_id=${accountId}&company_id=${companyId}`), { credentials: "include" });
      const json = await res.json();
      const data = json.data || {};
      const arr = data.accounts || [];
      const ids = new Set(arr.map((a) => Number(a.id)));
      setLinkedInitialIds(ids);
      setLinkedSelectedIds(ids);
      setLinkTypesMap(data.link_types_map || {});
    } catch {
      notify("Failed to load linked accounts", "danger");
    }
  };

  const saveLinks = async () => {
    const selected = Array.from(linkedSelectedIds);
    const initial = Array.from(linkedInitialIds);
    const toAdd = selected.filter((id) => !initial.includes(id));
    const toRemove = initial.filter((id) => !selected.includes(id));
    try {
      await Promise.all(
        toRemove.map((id) =>
          fetch(buildApiUrl("api/accounts/account_link_api.php?action=unlink_accounts"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id_1: linkAccountId, account_id_2: id, company_id: companyId }),
            credentials: "include",
          })
        )
      );
      await Promise.all(
        toAdd.map((id) =>
          fetch(buildApiUrl("api/accounts/account_link_api.php?action=link_accounts"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id_1: linkAccountId,
              account_id_2: id,
              company_id: companyId,
              link_type: linkType,
              source_account_id: linkType === "unidirectional" ? linkAccountId : null,
            }),
            credentials: "include",
          })
        )
      );
      setLinkModalOpen(false);
      notify("Account links saved successfully", "success");
    } catch {
      notify("Failed to save links", "danger");
    }
  };

  const openCurrencySetting = async () => {
    setCurrencySettingOpen(true);
    setSettingCurrencyId(null);
    setSettingLinked(new Set());
    setSettingInitial(new Set());
    setSettingSearch("");
    setSettingRole("");
  };

  const loadCurrencyLinks = async (currencyId) => {
    try {
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?action=get_linked_accounts_by_currency&currency_id=${currencyId}`), {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      const linked = new Set((json?.data?.linked_account_ids || []).map((id) => Number(id)));
      setSettingLinked(linked);
      setSettingInitial(new Set(linked));
    } catch {
      notify("Error fetching linked accounts", "danger");
    }
  };

  const saveCurrencySetting = async () => {
    if (!settingCurrencyId) return notify("No currency selected to save", "info");
    const linked = [];
    const unlinked = [];
    accounts.forEach((a) => {
      const id = Number(a.id);
      const was = settingInitial.has(id);
      const now = settingLinked.has(id);
      if (now && !was) linked.push(id);
      if (!now && was) unlinked.push(id);
    });
    if (!linked.length && !unlinked.length) {
      setCurrencySettingOpen(false);
      return notify("No changes detected", "info");
    }
    try {
      const res = await fetch(buildApiUrl("api/accounts/bulk_account_currency_api.php?action=bulk_update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency_id: settingCurrencyId, linked_account_ids: linked, unlinked_account_ids: unlinked }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return notify(json.message || "Error saving settings", "danger");
      setCurrencySettingOpen(false);
      notify("Currency settings saved successfully", "success");
      await fetchAccounts();
    } catch {
      notify("Network error saving settings", "danger");
    }
  };

  const visibleLinkAccounts = useMemo(() => {
    const q = toUpper(linkSearch).trim();
    return accounts.filter((a) => Number(a.id) !== Number(linkAccountId)).filter((a) => !q || toUpper(a.account_id).includes(q));
  }, [accounts, linkSearch, linkAccountId]);

  const settingAccounts = useMemo(() => {
    const q = settingSearch.toLowerCase().trim();
    return accounts.filter((a) => {
      const text = `${a.account_id || ""} ${a.name || ""}`.toLowerCase();
      const role = String(a.role || "").toLowerCase().trim();
      const matchesQ = !q || text.includes(q);
      const matchesRole = !settingRole || role === settingRole;
      return matchesQ && matchesRole;
    });
  }, [accounts, settingRole, settingSearch]);

  if (loading) return null;

  return (
    <>
      <div className="container">
        <div className="content">
          <h1 className="account-page-title">Account List</h1>
          <div className="account-separator-line" />
          <div className="account-action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="account-action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="account-btn account-btn-add" onClick={openAdd}>Add Account</button>
                <div className="account-search-container">
                  <svg className="account-search-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
                  <input className="account-search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by Account or Name" />
                </div>
                <div className="account-checkbox-section"><input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); if (e.target.checked) setShowAll(false); }} /><label>Show Inactive</label></div>
                <div className="account-checkbox-section"><input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); if (e.target.checked) setShowInactive(false); }} /><label>Show All</label></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="account-btn account-btn-setting" onClick={openCurrencySetting}>Currency Setting</button>
                <button className="account-btn account-btn-delete" disabled={!selectedDeleteIds.size} onClick={() => setConfirmDeleteOpen(true)}>
                  {selectedDeleteIds.size ? `Delete (${selectedDeleteIds.size})` : "Delete"}
                </button>
              </div>
            </div>

            {groupIds.length > 0 && (
              <div className="transaction-company-filter" style={{ display: "flex", marginTop: 10 }}>
                <span className="transaction-company-label">GroupID:</span>
                <div className="transaction-company-buttons">
                  {groupIds.map((gid) => (
                    <button key={gid} type="button" className={`transaction-company-btn ${selectedGroup === gid ? "active" : ""}`} onClick={() => setSelectedGroup((p) => (p === gid ? null : gid))}>{gid}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="transaction-company-filter" style={{ display: "flex" }}>
              <span className="transaction-company-label">Company:</span>
              <div className="transaction-company-buttons">
                {companyButtons.map((c) => (
                  <button key={c.id} type="button" className={`transaction-company-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`} onClick={() => onSwitchCompany(c)} disabled={switchingCompany}>
                    {c.company_id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="account-table-wrapper">
            <div className="account-table-header">
              <div className="account-header-item">No</div>
              <div className="account-header-item account-header-sortable" onClick={() => toggleSort("account")}>Account <span className="account-sort-indicator">{sortColumn === "account" ? (sortDirection === "asc" ? "▲" : "▼") : "▲"}</span></div>
              <div className="account-header-item">Name</div>
              <div className="account-header-item account-header-sortable" onClick={() => toggleSort("role")}>Role <span className="account-sort-indicator">{sortColumn === "role" ? (sortDirection === "asc" ? "▲" : "▼") : "▲"}</span></div>
              <div className="account-header-item">Alert</div>
              <div className="account-header-item">Status</div>
              <div className="account-header-item">Last Login</div>
              <div className="account-header-item">Remark</div>
              <div className="account-header-item">Action</div>
            </div>
            <div className="account-cards">
              {(tableLoading || switchingCompany) && <div className="account-card"><div className="account-card-item" style={{ gridColumn: "1 / -1" }}>Loading...</div></div>}
              {!tableLoading && !switchingCompany && pageRows.map((a, idx) => {
                const alertOn = a.payment_alert == 1 || a.payment_alert === true || String(a.payment_alert) === "1";
                const isInactive = String(a.status || "").toLowerCase() === "inactive";
                return (
                  <div className="account-card" key={a.id}>
                    <div className="account-card-item">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                    <div className="account-card-item">{toUpper(a.account_id)}</div>
                    <div className="account-card-item">{toUpper(a.name)}</div>
                    <div className="account-card-item"><span className={`account-role-badge account-role-${String(a.role || "").toLowerCase().replace(/\s+/g, "-")}`}>{toUpper(a.role) === "UPLINE" ? "SUPPLIER" : toUpper(a.role)}</span></div>
                    <div className="account-card-item"><span className={`account-role-badge ${alertOn ? "account-status-active" : "account-status-inactive"} account-status-clickable`} onClick={() => togglePaymentAlert(a.id)}>{alertOn ? "ON" : "OFF"}</span></div>
                    <div className="account-card-item"><span className={`account-role-badge ${isInactive ? "account-status-inactive" : "account-status-active"} account-status-clickable`} onClick={() => toggleAccountStatus(a.id)}>{toUpper(a.status)}</span></div>
                    <div className="account-card-item">{toUpper(a.last_login)}</div>
                    <div className="account-card-item">{toUpper(a.remark)}</div>
                    <div className="account-card-item">
                      <button className="account-edit-btn" onClick={() => openEdit(a.id)}><img src="/images/edit.svg" alt="Edit" /></button>
                      <button className="account-edit-btn" style={{ marginLeft: 5 }} onClick={() => openLinkModal(a.id)}><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
                      {isInactive && (
                        <input
                          type="checkbox"
                          style={{ marginLeft: 10 }}
                          checked={selectedDeleteIds.has(Number(a.id))}
                          onChange={(e) => {
                            setSelectedDeleteIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(Number(a.id));
                              else next.delete(Number(a.id));
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!showAll && (
            <div className="account-pagination-container" id="paginationContainer">
              <button className="account-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button>
              <span className="account-pagination-info">{Math.min(currentPage, totalPages)} of {totalPages}</span>
              <button className="account-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button>
            </div>
          )}
        </div>
      </div>

      {toast && <div id="accountNotificationContainer" className="account-notification-container"><div className={`account-notification account-notification-${toast.type} show`}>{toast.message}</div></div>}

      {(addModalOpen || editModalOpen) && (
        <div className="account-modal" style={{ display: "block" }}>
          <div className="account-modal-content">
            <div className="account-modal-header"><h2>{isEditMode ? "Edit Account" : "Add Account"}</h2><span className="account-close" onClick={() => { setAddModalOpen(false); setEditModalOpen(false); }}>&times;</span></div>
            <div className="account-modal-body">
              <form className="account-form" onSubmit={saveForm}>
                <div className="account-form-columns">
                  <div className="account-form-column">
                    <h3 className="account-section-header">Personal Information</h3>
                    <div className="account-form-group"><label>Account ID *</label><input value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: toUpper(e.target.value) }))} disabled={isEditMode} required /></div>
                    <div className="account-form-group"><label>Name *</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: toUpper(e.target.value) }))} required /></div>
                    <div className="account-form-group"><label>Role *</label><select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} required><option value="">Select Role</option>{orderedRoles.map((r) => <option key={r} value={r}>{toUpper(r) === "UPLINE" ? "SUPPLIER" : r}</option>)}</select></div>
                    <div className="account-form-group"><label>Password {isEditMode ? "" : "*"}</label><input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required={!isEditMode} /></div>
                  </div>
                  <div className="account-form-column">
                    <h3 className="account-section-header">Payment</h3>
                    <div className="account-form-group">
                      <label>Payment Alert</label>
                      <div className="account-radio-group">
                        <label className="account-radio-label"><input type="radio" checked={form.payment_alert === "1"} onChange={() => setForm((f) => ({ ...f, payment_alert: "1" }))} />Yes</label>
                        <label className="account-radio-label"><input type="radio" checked={form.payment_alert === "0"} onChange={() => setForm((f) => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))} />No</label>
                      </div>
                    </div>
                    {form.payment_alert === "1" && (
                      <>
                        <div className="account-form-row" style={{ display: "flex" }}>
                          <div className="account-form-group"><label>Alert Type</label><select value={form.alert_type} onChange={(e) => setForm((f) => ({ ...f, alert_type: e.target.value }))}><option value="">Select Type</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1} Days</option>)}</select></div>
                          <div className="account-form-group"><label>Start Date</label><input type="date" value={form.alert_start_date} onChange={(e) => setForm((f) => ({ ...f, alert_start_date: e.target.value }))} /></div>
                        </div>
                        <div className="account-form-group"><label>Alert (Amount)</label><input type="number" step="0.01" value={form.alert_amount} onChange={(e) => setForm((f) => ({ ...f, alert_amount: e.target.value }))} /></div>
                      </>
                    )}
                    <div className="account-form-group"><label>Remark</label><textarea rows={1} style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: toUpper(e.target.value) }))} /></div>
                  </div>
                </div>
                <div className="account-form-section">
                  <div className="account-advance-section">
                    <h3>Advanced Account</h3>
                    <div className="account-other-currency">
                      <label>Other Currency:</label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}><input value={currencyInput} onChange={(e) => setCurrencyInput(e.target.value)} placeholder="Enter new currency code" /><button type="button" className="account-btn-add-currency" onClick={createCurrency}>Create Currency</button></div>
                      <div className="account-currency-list">
                        {currencies.map((c) => (
                          <div key={c.id} className={`account-currency-item currency-toggle-item ${selectedCurrencyIds.includes(Number(c.id)) ? "selected" : ""}`}>
                            <span className="currency-code-text" onClick={() => setSelectedCurrencyIds((prev) => prev.includes(Number(c.id)) ? prev.filter((x) => Number(x) !== Number(c.id)) : [...prev, Number(c.id)])}>{toUpper(c.code)}</span>
                            <button type="button" className="currency-delete-btn" onClick={() => removeCurrency(c.id)}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="account-other-currency" style={{ marginTop: 20 }}>
                      <label>Company:</label>
                      <div className="account-currency-list">
                        {allCompanyButtons.map((c) => (
                          <div key={c.id} className={`account-currency-item currency-toggle-item ${selectedCompanyIds.includes(Number(c.id)) ? "selected" : ""}`} onClick={() => setSelectedCompanyIds((prev) => prev.includes(Number(c.id)) ? prev.filter((x) => Number(x) !== Number(c.id)) : [...prev, Number(c.id)])}>{toUpper(c.company_id)}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="account-form-actions"><button className="account-btn account-btn-save" type="submit">{isEditMode ? "Update Account" : "Add Account"}</button><button className="account-btn account-btn-cancel" type="button" onClick={() => { setAddModalOpen(false); setEditModalOpen(false); }}>Cancel</button></div>
              </form>
            </div>
          </div>
        </div>
      )}

      {linkModalOpen && (
        <div className="account-modal" style={{ display: "block" }}>
          <div className="account-modal-content">
            <div className="account-modal-header"><h2>Link Account</h2><span className="account-close" onClick={() => setLinkModalOpen(false)}>&times;</span></div>
            <div className="link-account-fixed-area">
              <div className="link-type-section">
                <div className="link-type-pills">
                  <label className="link-type-pill"><input className="link-type-radio" type="radio" checked={linkType === "bidirectional"} onChange={() => setLinkType("bidirectional")} /><span className="link-type-pill-check">&#10003;</span><span className="link-type-pill-text">Bidirectional</span></label>
                  <label className="link-type-pill"><input className="link-type-radio" type="radio" checked={linkType === "unidirectional"} onChange={() => setLinkType("unidirectional")} /><span className="link-type-pill-check">&#10003;</span><span className="link-type-pill-text">Unidirectional</span></label>
                </div>
                <p className="link-type-desc">{linkType === "bidirectional" ? "Bidirectional: Data syncs both ways." : "Unidirectional flows from A to B."}</p>
              </div>
              <div className="link-account-search-wrap"><div className="link-account-search-inner"><input className="link-account-search-input" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Search account..." /></div></div>
            </div>
            <div className="account-modal-body link-account-modal-body">
              <div className="link-account-list">
                {visibleLinkAccounts.map((a) => {
                  const checked = linkedSelectedIds.has(Number(a.id));
                  return (
                    <div key={a.id} className="account-item-compact" style={{ display: "flex", alignItems: "center", padding: "6px 8px", border: "1px solid #eee", borderRadius: 6 }}>
                      <input type="checkbox" checked={checked} onChange={(e) => {
                        setLinkedSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(Number(a.id));
                          else next.delete(Number(a.id));
                          return next;
                        });
                      }} />
                      <label style={{ marginLeft: 8 }}>{toUpper(a.account_id)}</label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="account-form-actions link-account-form-actions"><button className="account-btn account-btn-save" onClick={saveLinks}>Save</button><button className="account-btn account-btn-cancel" onClick={() => setLinkModalOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {currencySettingOpen && (
        <div className="currency-fullscreen-modal" style={{ display: "block" }}>
          <div className="currency-fullscreen-modal-content">
            <div className="currency-fullscreen-modal-header-bar"><h2>Currency Setting</h2><button type="button" className="currency-btn-back" onClick={() => setCurrencySettingOpen(false)}>Back</button></div>
            <div className="currency-fullscreen-modal-body">
              <div className="currency-left-panel">
                <div className="currency-setting-add-row-stacked" style={{ marginTop: 10 }}>
                  <label>Add Currency :</label>
                  <div style={{ display: "flex", gap: 10, width: "100%" }}>
                    <input className="currency-setting-input" value={settingAddCurrency} onChange={(e) => setSettingAddCurrency(e.target.value)} />
                    <button type="button" className="account-btn account-btn-add currency-setting-add-btn" onClick={async () => {
                      const code = toUpper(settingAddCurrency).trim();
                      if (!code) return;
                      try {
                        const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ code, company_id: companyId }),
                          credentials: "include",
                        });
                        const json = await res.json();
                        if (!json.success) return notify(json.message || json.error || "Failed to add currency", "danger");
                        setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code }]);
                        setSettingAddCurrency("");
                        notify(`Currency ${code} added`, "success");
                      } catch {
                        notify("Network error adding currency", "danger");
                      }
                    }}>Add</button>
                  </div>
                </div>
                <div className="currency-setting-divider" />
                <div className="currency-setting-list-row-stacked">
                  <label>Currency :</label>
                  <div className="currency-setting-pill-list">
                    {currencies.map((c) => (
                      <div key={c.id} className={`currency-setting-pill ${Number(settingCurrencyId) === Number(c.id) ? "selected" : ""}`} onClick={async () => {
                        if (Number(settingCurrencyId) === Number(c.id)) {
                          setSettingCurrencyId(null);
                          setSettingLinked(new Set());
                          setSettingInitial(new Set());
                          return;
                        }
                        setSettingCurrencyId(Number(c.id));
                        await loadCurrencyLinks(Number(c.id));
                      }}>{toUpper(c.code)}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="currency-right-panel" style={{ paddingTop: 24 }}>
                <div className="currency-setting-filter-row">
                  <div className="currency-setting-search-wrap"><input className="currency-setting-search-input" value={settingSearch} onChange={(e) => setSettingSearch(e.target.value)} placeholder="Search Bar" /></div>
                  <div className="currency-setting-role-filter"><select className="currency-setting-select" value={settingRole} onChange={(e) => setSettingRole(e.target.value)}><option value="">Filter Row</option>{orderedRoles.map((r) => <option key={r} value={String(r).toLowerCase()}>{toUpper(r) === "UPLINE" ? "SUPPLIER" : r}</option>)}</select></div>
                </div>
                <div className="currency-setting-selectall-row">
                  <button type="button" className="account-btn currency-setting-selectall-btn" onClick={() => {
                    const allSelected = settingAccounts.length > 0 && settingAccounts.every((a) => settingLinked.has(Number(a.id)));
                    setSettingLinked((prev) => {
                      const next = new Set(prev);
                      if (allSelected) settingAccounts.forEach((a) => next.delete(Number(a.id)));
                      else settingAccounts.forEach((a) => next.add(Number(a.id)));
                      return next;
                    });
                  }}>
                    {settingAccounts.length > 0 && settingAccounts.every((a) => settingLinked.has(Number(a.id))) ? "Deselect All" : "Select All"}
                  </button>
                  <span className="currency-setting-selected-count">{settingLinked.size} selected</span>
                </div>
                <div className="currency-setting-account-list">
                  {settingAccounts.map((a) => (
                    <div key={a.id} className={`currency-setting-account-item ${settingLinked.has(Number(a.id)) ? "selected" : ""}`} onClick={() => {
                      if (!settingCurrencyId) return notify("Please select a Currency first", "info");
                      setSettingLinked((prev) => {
                        const next = new Set(prev);
                        if (next.has(Number(a.id))) next.delete(Number(a.id));
                        else next.add(Number(a.id));
                        return next;
                      });
                    }}>
                      {toUpper(a.account_id)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="currency-fullscreen-bottom-bar"><button className="account-btn account-btn-save currency-setting-submit-btn" onClick={saveCurrencySetting}>Save</button><button className="account-btn account-btn-cancel currency-setting-cancel-btn" onClick={() => setCurrencySettingOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="account-modal" style={{ display: "block" }}>
          <div className="account-confirm-modal-content">
            <h2 className="account-confirm-title">Confirm Delete</h2>
            <p className="account-confirm-message">Are you sure you want to delete {selectedDeleteIds.size} selected inactive account(s)?</p>
            <div className="account-confirm-actions"><button className="account-btn account-btn-cancel" onClick={() => setConfirmDeleteOpen(false)}>Cancel</button><button className="account-btn account-btn-delete" onClick={onDeleteSelected}>Delete</button></div>
          </div>
        </div>
      )}
    </>
  );
}

