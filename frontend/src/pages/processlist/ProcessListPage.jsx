import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { isBankCategoryCompany } from "../bankprocesslist/bankProcessHelpers.js";
import "../../../public/css/processCSS.css";
import "../../../public/css/processlist.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import CompanyExpirationModal from "../domain/components/CompanyExpirationModal.jsx";
import {
  PAGE_SIZE,
  EMPTY_FORM,
  normalizeRows,
  sortProcessRows,
  notifyTransactionDataChanged,
  parseRemarkForForm,
  buildEditDescriptionSelection,
} from "./processListHelpers.js";
import ProcessTable from "./components/ProcessTable.jsx";
import ProcessFormModal from "./components/ProcessFormModal.jsx";
import DescriptionPickerModal from "./components/DescriptionPickerModal.jsx";
import ProcessDeleteConfirmModal from "./components/ProcessDeleteConfirmModal.jsx";
import { getProcessListText } from "../../translateFile/processListTranslate.js";

function filterSearchInput(raw) {
  return String(raw || "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .toUpperCase();
}

function ProcessToastStack({ items }) {
  return (
    <div id="processNotificationContainer" className="process-notification-container">
      {items.map((t) => (
        <div
          key={t.id}
          className={`process-notification process-notification-${t.type} ${t.visible ? "show" : ""}`.trim()}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function ProcessListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getProcessListText(lang, key, params), [lang]);
  const [cssReady, setCssReady] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currencies, setCurrencies] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [days, setDays] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toasts, setToasts] = useState([]);
  const [descriptionPickerOpen, setDescriptionPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [expirationCompanies, setExpirationCompanies] = useState(null);
  const fetchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const rowsRef = useRef([]);

  const [existingProcesses, setExistingProcesses] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, visible: false }].slice(-2));
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    });
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 1500);
  }, []);

  // Layout phase (with BankProcessListPage): avoid deferred useEffect cleanup stripping body.process-page after route swap.
  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page", "account-page", "announcement-page");
    document.body.classList.add("process-page");
    setCssReady(true);
    return () => {
      document.body.classList.remove("process-page");
      document.body.classList.add("dashboard-page");
    };
  }, []);

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
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(searchDebounceRef.current);
  }, [search]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const loadFormMeta = useCallback(async (cid) => {
    if (!cid) return;
    try {
      const u = new URL(buildApiUrl("api/processes/addprocess_api.php"));
      u.searchParams.set("company_id", String(cid));
      const formRes = await fetch(u.toString(), { credentials: "include" });
      const formJson = await formRes.json();
      setCurrencies(Array.isArray(formJson?.data?.currencies) ? formJson.data.currencies : formJson?.currencies || []);
      setDescriptions(Array.isArray(formJson?.data?.descriptions) ? formJson.data.descriptions : formJson?.descriptions || []);
      setDays(Array.isArray(formJson?.data?.days) ? formJson.data.days : formJson?.days || []);
      setExistingProcesses(
        Array.isArray(formJson?.data?.existingProcesses) ? formJson.data.existingProcesses : formJson?.existingProcesses || []
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    (async () => {
      let skipLoadingDone = false;
      try {
        const routePrefetch = location.state?.processListPrefetch;
        const prefetchCompanyId = routePrefetch?.companyId ? Number(routePrefetch.companyId) : null;
        const currentUrl = new URL(window.location.href);
        const prefetchQueryCompany = currentUrl.searchParams.get("company_id");

        if (routePrefetch && prefetchCompanyId && (!prefetchQueryCompany || Number(prefetchQueryCompany) === prefetchCompanyId)) {
          const prefetchedCompanies = Array.isArray(routePrefetch.companies) ? routePrefetch.companies : [];
          const prefetchedMeta = routePrefetch.meta || {};
          setCompanies(prefetchedCompanies);
          setCompanyId(prefetchCompanyId);
          setSelectedGroup(routePrefetch.selectedGroup || null);

          const normalizedSearch = filterSearchInput(currentUrl.searchParams.get("search") || "");
          setSearch(normalizedSearch);
          setDebouncedSearch(normalizedSearch);

          const showAllChecked = currentUrl.searchParams.has("showAll");
          const showInactiveChecked = !showAllChecked && currentUrl.searchParams.has("showInactive");
          setShowAll(showAllChecked);
          setShowInactive(showInactiveChecked);

          setCurrencies(Array.isArray(prefetchedMeta.currencies) ? prefetchedMeta.currencies : []);
          setDescriptions(Array.isArray(prefetchedMeta.descriptions) ? prefetchedMeta.descriptions : []);
          setDays(Array.isArray(prefetchedMeta.days) ? prefetchedMeta.days : []);
          setExistingProcesses(Array.isArray(prefetchedMeta.existingProcesses) ? prefetchedMeta.existingProcesses : []);

          if (Array.isArray(routePrefetch.rows)) {
            setRows(sortProcessRows(normalizeRows(routePrefetch.rows)));
            skipNextFetchRef.current = true;
            setTableLoading(false);
          } else {
            setTableLoading(true);
          }
          setLoading(false);
          return;
        }

        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          window.location.assign(new URL("/login", window.location.origin).toString());
          return;
        }
        const companiesJson = await companiesRes.json();
        const cs = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(cs);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effectiveCompany = queryCompany || meJson.data.company_id || cs[0]?.id || null;
        effectiveCompany = effectiveCompany ? Number(effectiveCompany) : null;

        if (queryCompany && effectiveCompany && Number(effectiveCompany) !== Number(meJson.data.company_id)) {
          try {
            const syncRes = await fetch(
              buildApiUrl(`api/session/update_company_session_api.php?company_id=${effectiveCompany}`),
              { credentials: "include" }
            );
            const syncJson = await syncRes.json();
            if (!syncJson.success) {
              effectiveCompany = meJson.data.company_id ? Number(meJson.data.company_id) : effectiveCompany;
            }
          } catch {
            effectiveCompany = meJson.data.company_id ? Number(meJson.data.company_id) : effectiveCompany;
          }
        }

        const currentCompanyRow = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        if (currentCompanyRow?.company_id) {
          const bankCategory = await isBankCategoryCompany(currentCompanyRow.company_id, buildApiUrl);
          if (bankCategory) {
            navigate(`/bank-process-list?company_id=${effectiveCompany}`, { replace: true });
            skipLoadingDone = true;
            return;
          }
        }

        setCompanyId(effectiveCompany);
        setSelectedGroup(currentCompanyRow?.group_id ? String(currentCompanyRow.group_id).toUpperCase() : null);

        const rawSearch = url.searchParams.get("search") || "";
        const normalizedSearch = filterSearchInput(rawSearch);
        setSearch(normalizedSearch);
        setDebouncedSearch(normalizedSearch);

        const showAllChecked = url.searchParams.has("showAll");
        const showInactiveChecked = !showAllChecked && url.searchParams.has("showInactive");
        setShowAll(showAllChecked);
        setShowInactive(showInactiveChecked);

        await loadFormMeta(effectiveCompany);
      } catch {
        window.location.assign(new URL("/login", window.location.origin).toString());
      } finally {
        if (!skipLoadingDone) setLoading(false);
      }
    })();
  }, [loadFormMeta, location.state, navigate]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (debouncedSearch.trim()) url.searchParams.set("search", debouncedSearch.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, debouncedSearch, showInactive, showAll]);

  const fetchRows = useCallback(async () => {
    if (!companyId) return;
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    if (rowsRef.current.length === 0) setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("permission", "Games");
      url.searchParams.set("company_id", String(companyId));
      if (debouncedSearch.trim()) url.searchParams.set("search", debouncedSearch.trim());
      if (showInactive) url.searchParams.set("showInactive", "1");
      if (showAll) url.searchParams.set("showAll", "1");
      const res = await fetch(url.toString(), { credentials: "include", signal: ac.signal });
      const json = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("failedLoadProcessList"), "danger");
        return;
      }
      setRows(sortProcessRows(normalizeRows(json.data)));
      setSelectedIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      if (ac.signal.aborted) return;
      notify(t("failedLoadProcessList"), "danger");
    } finally {
      if (!ac.signal.aborted) setTableLoading(false);
    }
  }, [companyId, debouncedSearch, showInactive, showAll, notify, syncUrl]);

  useEffect(() => {
    if (loading || !companyId) return;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    void fetchRows();
  }, [loading, companyId, debouncedSearch, showInactive, showAll, fetchRows]);

  useEffect(() => {
    if (loading || !companyId) return;
    void loadFormMeta(companyId);
  }, [loading, companyId, loadFormMeta]);

  const reloadDescriptions = async () => {
    if (!companyId) return;
    try {
      const u = new URL(buildApiUrl("api/processes/addprocess_api.php"));
      u.searchParams.set("company_id", String(companyId));
      const formRes = await fetch(u.toString(), { credentials: "include" });
      const formJson = await formRes.json();
      setDescriptions(Array.isArray(formJson?.data?.descriptions) ? formJson.data.descriptions : formJson?.descriptions || []);
    } catch {
      /* ignore */
    }
  };

  /** @returns {Promise<{ id: number|string, name: string }|null>} */
  const handleAddDescription = async (descName) => {
    try {
      const fd = new FormData();
      fd.append("action", "add_description");
      fd.append("description_name", descName);
      if (companyId) fd.append("company_id", String(companyId));
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json?.data?.duplicate || String(json?.message || json?.error || "").includes("already exists")) {
          notify(t("descExists"), "danger");
        } else {
          notify(json.message || json.error || t("failedAddDescription"), "danger");
        }
        return null;
      }
      notify(t("descAdded"), "success");
      await reloadDescriptions();
      const newId = json?.data?.description_id ?? json?.description_id;
      return newId != null ? { id: newId, name: descName } : null;
    } catch {
      notify(t("failedAddDescription"), "danger");
      return null;
    }
  };

  const handleDeleteDescription = async (descId) => {
    try {
      const fd = new FormData();
      fd.append("action", "delete_description");
      fd.append("description_id", String(descId));
      if (companyId) fd.append("company_id", String(companyId));
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("failedDeleteDescription"), "danger");
        return;
      }
      notify(t("descDeleted"), "success");
      await reloadDescriptions();
      setForm((prev) => ({
        ...prev,
        selected_descriptions: prev.selected_descriptions.filter((d) => String(d.id) !== String(descId)),
      }));
    } catch {
      notify(t("failedDeleteDescription"), "danger");
    }
  };

  useEffect(() => {
    if (showAll) document.body.classList.add("process-page--show-all");
    else document.body.classList.remove("process-page--show-all");
    return () => document.body.classList.remove("process-page--show-all");
  }, [showAll]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!modalOpen && !descriptionPickerOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (descriptionPickerOpen) setDescriptionPickerOpen(false);
      else setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, descriptionPickerOpen]);

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows]);
  const pageRows = useMemo(() => {
    if (showAll) return rows.filter((r) => String(r.status || "").toLowerCase() === "active");
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage, totalPages, showAll]);

  const toggleSelectAll = useCallback(
    (checked) => {
      const deletable = pageRows.filter(
        (r) => String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) deletable.forEach((r) => next.add(r.id));
        else deletable.forEach((r) => next.delete(r.id));
        return next;
      });
    },
    [pageRows]
  );

  const onSwitchCompany = async (company) => {
    if (!company?.id || Number(company.id) === Number(companyId)) return;
    setSelectedIds(new Set());
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${company.id}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const reason = json?.data?.reason;
        if (reason === "expired" || reason === "no_set") {
          setExpirationCompanies([
            { company_id: company.company_id, expiration_date: company.expiration_date ?? null },
          ]);
          return;
        }
        notify(json.message || json.error || t("switchCompanyFailed"), "danger");
        return;
      }
      setCurrentPage(1);
      notifyCompanySessionUpdated();
      const bankCategory = await isBankCategoryCompany(company.company_id, buildApiUrl);
      if (bankCategory) {
        navigate(`/bank-process-list?company_id=${company.id}`, { replace: true });
        return;
      }
      setCompanyId(Number(company.id));
      setSelectedGroup(company.group_id ? String(company.group_id).toUpperCase() : null);
    } catch {
      notify(t("switchCompanyFailed"), "danger");
    }
  };

  const openAdd = () => {
    setEditMode(false);
    setForm({ ...EMPTY_FORM, existingProcesses });
    setDescriptionPickerOpen(false);
    setModalOpen(true);
  };

  const confirmDescriptionSelection = (selectedDescriptions) => {
    setForm((prev) => ({ ...prev, selected_descriptions: selectedDescriptions }));
    setDescriptionPickerOpen(false);
  };

  const openEdit = async (id) => {
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(id));
      url.searchParams.set("permission", "Games");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        notify(json.message || json.error || t("failedLoadProcess"), "danger");
        return;
      }
      const p = json.data;

      let currencyId = String(p.currency_id || "");
      if (currencyId) {
        const exists = currencies.some((c) => String(c.id) === currencyId);
        if (!exists) {
          if (p.currency_warning) notify(t("currencyWarningNoCompany"), "danger");
          currencyId = "";
        }
      }
      if (!currencyId && p.currency_code) {
        const code = String(p.currency_code).toUpperCase();
        const matchingOption = currencies.find((opt) => String(opt.code || "").toUpperCase() === code);
        if (matchingOption) {
          currencyId = String(matchingOption.id);
        } else if (p.currency_warning) {
          notify(t("currencyWarningWithCode", { code }), "danger");
        }
      }

      const dtsModified = p.dts_modified || "";
      const dtsCreated = p.dts_created || "";
      let displayModifiedDate = "";
      let displayModifiedBy = "";
      if (dtsModified && dtsModified !== dtsCreated) {
        displayModifiedDate = dtsModified;
        displayModifiedBy = p.modified_by || "";
      }

      const selectedDescriptions = buildEditDescriptionSelection(p, descriptions);

      setEditMode(true);
      setForm({
        id: String(p.id || ""),
        process_name: p.process_name || "",
        selected_descriptions: selectedDescriptions,
        currency_id: currencyId,
        day_use: String(p.day_use || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        remove_word: p.remove_word || "",
        replace_word_from: p.replace_word_from || "",
        replace_word_to: p.replace_word_to || "",
        remark: parseRemarkForForm(p.remarks),
        status: p.status || "active",
        dts_modified: dtsModified,
        modified_by: p.modified_by || "",
        dts_created: dtsCreated,
        created_by: p.created_by || "",
        dts_modified_display: displayModifiedDate,
        dts_modified_user_display: displayModifiedBy,
        currency_warning: p.currency_warning || null,
        existingProcesses,
      });
      setDescriptionPickerOpen(false);
      setModalOpen(true);
    } catch {
      notify(t("failedLoadProcess"), "danger");
    }
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!form.selected_descriptions || form.selected_descriptions.length === 0) {
      notify(t("needAtLeastOneDescription"), "danger");
      return;
    }

    if (!editMode) {
      if (!form.is_multi_process && (!form.process_name || !String(form.process_name).trim())) {
        notify(t("needProcessIdOrMulti"), "danger");
        return;
      }
      if (form.is_multi_process && (!form.selected_processes || form.selected_processes.length === 0)) {
        notify(t("needOneMultiProcess"), "danger");
        return;
      }
    }

    const fd = new FormData();
    if (editMode) {
      fd.append("id", form.id);
      fd.append("process_name", form.process_name);
      fd.append("status", form.status || "active");
      const names = form.selected_descriptions.map((d) => d.name).filter(Boolean);
      fd.append("selected_descriptions", JSON.stringify(names.length ? names : [form.selected_descriptions[0].name]));
      fd.append("description", form.selected_descriptions[0].name);
      fd.append("day_use", form.day_use.join(","));
      fd.append("remove_word", form.remove_word || "");
      fd.append("replace_word_from", form.replace_word_from || "");
      fd.append("replace_word_to", form.replace_word_to || "");
      fd.append("remark", form.remark || "");
      fd.append("currency_id", form.currency_id);
      try {
        const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=update_process"), {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          notify(json.message || json.error || t("updateFailed"), "danger");
          return;
        }
        notify(json.message || t("processUpdated"), "success");
        notifyTransactionDataChanged("processlist-react");
        setModalOpen(false);
        fetchRows();
      } catch {
        notify(t("updateFailed"), "danger");
      }
      return;
    }

    if (form.is_multi_process && form.selected_processes?.length > 0) {
      fd.append("selected_processes", JSON.stringify(form.selected_processes));
    } else {
      fd.append("process_id", form.process_name);
    }
    fd.append("selected_descriptions", JSON.stringify(form.selected_descriptions.map((d) => d.name)));
    fd.append("currency_id", form.currency_id);
    fd.append("day_use", form.day_use.join(","));
    fd.append("remove_word", form.remove_word || "");
    fd.append("replace_word_from", form.replace_word_from || "");
    fd.append("replace_word_to", form.replace_word_to || "");
    fd.append("remark", form.remark || "");
    if (form.copy_from) fd.append("copy_from", form.copy_from);
    fd.append("permission", "Games");
    if (companyId) fd.append("company_id", String(companyId));

    try {
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("createFailed"), "danger");
        return;
      }
      let message = json.message || t("processAdded");
      const d = json.data;
      if (d && typeof d === "object") {
        if (d.copy_from_used && Number(d.source_templates_found) === 0) message += ` (${t("copyNoTemplates")})`;
        if (d.copy_from_used && d.sync_source_set) message += ` [${t("copySyncEnabled")}]`;
        else if (d.copy_from_used && !d.sync_source_set) message += ` (${t("copySyncNotSet")})`;
        if (Array.isArray(d.errors) && d.errors.length > 0) {
          message += `. ${t("processSkippedConflicts", { count: d.errors.length })}`;
        }
      }
      notify(message, "success");
      notifyTransactionDataChanged("processlist-react");
      setModalOpen(false);
      fetchRows();
    } catch {
      notify(t("createFailed"), "danger");
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    if (!selectedIds.size) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProcesses = async () => {
    if (!selectedIds.size) {
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Games" }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("deleteFailed"), "danger");
        return;
      }
      const n = json?.data?.deleted ?? selectedIds.size;
      notify(n === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: n }), "success");
      notifyTransactionDataChanged("processlist-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      fetchRows();
    } catch {
      notify(t("deleteFailed"), "danger");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const toggleStatus = async (row) => {
    if (!row?.id) return;
    try {
      const fd = new FormData();
      fd.append("id", String(row.id));
      fd.append("permission", "Games");
      const res = await fetch(buildApiUrl("api/processes/toggle_process_status_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("statusUpdateFailed"), "danger");
        return;
      }
      const newStatus = String(json?.data?.newStatus || "").toLowerCase();
      if (!newStatus) {
        notifyTransactionDataChanged("processlist-react");
        fetchRows();
        return;
      }

      const shouldShow = showAll ? true : showInactive ? newStatus === "inactive" : newStatus === "active";

      if (!shouldShow) {
        setRows((prev) => prev.filter((r) => Number(r.id) !== Number(row.id)));
      } else {
        setRows((prev) => prev.map((r) => (Number(r.id) === Number(row.id) ? { ...r, status: newStatus } : r)));
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (newStatus === "active") next.delete(row.id);
        return next;
      });

      const statusText = newStatus === "active" ? t("activated") : t("deactivated");
      notify(t("statusChangedTo", { status: statusText }), "success");
      notifyTransactionDataChanged("processlist-react");
    } catch {
      notify(t("statusUpdateFailed"), "danger");
    }
  };

  const onSearchChange = (e) => {
    setSearch(filterSearchInput(e.target.value));
  };

  if (loading || !cssReady) return null;

  return (
    <div className="container">
      <div className="content" style={showAll ? { height: "auto", overflow: "visible" } : undefined}>
        <h1 className="page-title">{t("pageTitle")}</h1>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" onClick={openAdd}>
                <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18v-2H6V4h7V2zm5 7V3.5L18.5 1 21 3.5V9h2v2h-2v6h-2v-6h-6v-2h6z" />
                </svg>
                {t("addProcess")}
              </button>
              <div className="search-container">
                <input
                  className="search-input"
                  placeholder={t("search")}
                  value={search}
                  onChange={onSearchChange}
                />
              </div>
              <label className="checkbox-section">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowAll(v);
                    if (v) setShowInactive(false);
                  }}
                />
                <span>{t("showAll")}</span>
              </label>
              <label className="checkbox-section">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowInactive(v);
                    if (v) setShowAll(false);
                  }}
                />
                <span>{t("showInactive")}</span>
              </label>
            </div>
            <button
              type="button"
              className="btn btn-delete"
              id="processDeleteSelectedBtn"
              disabled={!selectedIds.size}
              onClick={deleteSelected}
            >
              {selectedIds.size ? t("deleteWithCount", { count: selectedIds.size }) : t("delete")}
            </button>
          </div>
          <div className="user-gc-inline-panel">
            {groupIds.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("groupId")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
                    {groupIds.map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={tableLoading}
                        className={`user-gc-segment${selectedGroup === g ? " is-on" : ""}`}
                        onClick={() => setSelectedGroup(g)}
                      >
                        {g}
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
                  {companyButtons.map((c) => {
                    const active = Number(c.id) === Number(companyId);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={tableLoading}
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

        <ProcessTable
          tableLoading={tableLoading}
          showAll={showAll}
          pageRows={pageRows}
          currentPage={currentPage}
          PAGE_SIZE={PAGE_SIZE}
          selectedIds={selectedIds}
          toggleStatus={toggleStatus}
          openEdit={openEdit}
          toggleSelectId={toggleSelectId}
          toggleSelectAll={toggleSelectAll}
          t={t}
        />

        {!showAll && (
          <div className="pagination-container" id="paginationContainer">
            <button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              ◀
            </button>
            <span className="pagination-info">
              {t("pageOf", { current: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              className="pagination-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <ProcessFormModal
          editMode={editMode}
          form={form}
          setForm={setForm}
          currencies={currencies}
          days={days}
          onClose={() => {
            setDescriptionPickerOpen(false);
            setModalOpen(false);
          }}
          onSubmit={submitForm}
          onOpenDescriptionPicker={() => setDescriptionPickerOpen(true)}
          t={t}
        />
      )}

      {modalOpen && descriptionPickerOpen && (
        <DescriptionPickerModal
          descriptions={descriptions}
          form={form}
          onConfirm={confirmDescriptionSelection}
          onClose={() => setDescriptionPickerOpen(false)}
          onAddDescription={handleAddDescription}
          onDeleteDescription={handleDeleteDescription}
          t={t}
        />
      )}

      <ProcessDeleteConfirmModal
        open={deleteConfirmOpen}
        count={selectedIds.size}
        deleting={deleteSubmitting}
        onCancel={() => !deleteSubmitting && setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteProcesses}
        t={t}
      />

      {expirationCompanies && (
        <CompanyExpirationModal companies={expirationCompanies} onClose={() => setExpirationCompanies(null)} lang={lang} />
      )}

      <ProcessToastStack items={toasts} />
    </div>
  );
}
