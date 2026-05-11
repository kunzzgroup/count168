import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AccountModal from "../../components/AccountModal.jsx";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { ensureMaintenanceDateRangePicker } from "../../utils/maintenanceDateRangePicker.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import "../../../public/css/processCSS.css";
import "../../../public/css/processlist.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/account-list.css";
import "../../../public/css/date-range-picker.css";

import { DEFAULT_FORM as ACCOUNT_DEFAULT_FORM, getOrderedRoles, normalizeAlertAmount, toUpper } from "../account/accountLogic.js";
import { getAccountText } from "../../translateFile/accountTranslate.js";
import { getBankProcessText } from "../../translateFile/bankProcessTranslate.js";

// Helper imports
import {
  PAGE_SIZE,
  normalizeRows,
  isoToDmy,
  dmyToIso,
  parseRowDateMs,
  isBankResendDayStartBackendErrorMessage,
  notifyTransactionDataChanged,
  isBankCategoryCompany,
  parseProfitSharingToRows,
  serializeProfitSharingRows,
  EMPTY_BANK_FORM,
  parseBankContractTermMonths,
  contractBillingEndYmdForBankForm,
  matchesCurrentBankFilters,
} from "./bankProcessHelpers.js";
import ProcessDeleteConfirmModal from "../processlist/components/ProcessDeleteConfirmModal.jsx";

// Component imports
import BankProcessTable from "./components/BankProcessTable.jsx";
import BankProcessFormModal from "./components/BankProcessFormModal.jsx";
import CountrySelectionModal from "./components/CountrySelectionModal.jsx";
import BankSelectionModal from "./components/BankSelectionModal.jsx";
import ProfitSharingModal from "./components/ProfitSharingModal.jsx";
import BankNoteModal from "./components/BankNoteModal.jsx";
import BankRemarkModal from "./components/BankRemarkModal.jsx";
import AccountingDueModal from "./components/AccountingDueModal.jsx";
import ResendModal from "./components/ResendModal.jsx";

export default function BankProcessListPage() {
  const resolveLang = useCallback(
    (next) => {
      if (next === "zh") return "zh";
      if (next === "en") return "en";
      // Prefer the same key used by AuthenticatedLayout; keep fallback for older persisted value.
      return localStorage.getItem("login_lang") === "zh" || localStorage.getItem("language") === "zh" ? "zh" : "en";
    },
    []
  );
  const [lang, setLang] = useState(() => resolveLang());
  const t = useCallback((key, params = {}) => getBankProcessText(lang, key, params), [lang]);
  const tAccount = useCallback((key, params = {}) => getAccountText(lang, key, params), [lang]);
  const [cssReady, setCssReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [rows, setRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);
  const [showEInvoice, setShowEInvoice] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState(null);
  const [accounts, setAccounts] = useState([]);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_BANK_FORM });
  
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [accountingRows, setAccountingRows] = useState([]);
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingSelected, setAccountingSelected] = useState(new Set());
  const [accountingDeleteSelected, setAccountingDeleteSelected] = useState(new Set());
  
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const [resendTarget, setResendTarget] = useState(null);
  const [resendDayStart, setResendDayStart] = useState("");
  const [resendDayEnd, setResendDayEnd] = useState("");
  const [resendFrequency, setResendFrequency] = useState("1st_of_every_month");
  const [resendInlineError, setResendInlineError] = useState("");
  
  const [supplierSortDir, setSupplierSortDir] = useState("asc");
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkRow, setRemarkRow] = useState(null);
  
  const [countriesList, setCountriesList] = useState([]);
  const [banksList, setBanksList] = useState([]);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [newCountryName, setNewCountryName] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [selectedCountryChips, setSelectedCountryChips] = useState([]);
  const [selectedBankChips, setSelectedBankChips] = useState([]);
  
  const [profitShareModalOpen, setProfitShareModalOpen] = useState(false);
  const [profitShareRows, setProfitShareRows] = useState([]);
  const [bankFormNote, setBankFormNote] = useState(null);
  
  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [accountPlusTarget, setAccountPlusTarget] = useState(null);
  const [rolesList, setRolesList] = useState([]);
  const [accountModalCurrencies, setAccountModalCurrencies] = useState([]);

  // Add Account modal state (shared component)
  const [accountModalForm, setAccountModalForm] = useState({ ...ACCOUNT_DEFAULT_FORM });
  const [accountModalSelectedCurrencyIds, setAccountModalSelectedCurrencyIds] = useState([]);
  const [accountModalSelectedCompanyIds, setAccountModalSelectedCompanyIds] = useState([]);
  const [accountModalCurrencyInput, setAccountModalCurrencyInput] = useState("");
  
  const toastTimerRef = useRef(null);
  const listAbortRef = useRef(null);
  const bankDatePickerInitRef = useRef(false);
  const bankContractEndHintRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => {
    if (!addAccountModalOpen) return;
    setAccountModalForm({ ...ACCOUNT_DEFAULT_FORM, payment_alert: "0" });
    setAccountModalSelectedCurrencyIds([]);
    setAccountModalSelectedCompanyIds(companyId ? [Number(companyId)] : []);
    setAccountModalCurrencyInput("");
  }, [addAccountModalOpen, companyId]);

  const accountModalOrderedRoles = useMemo(() => getOrderedRoles(rolesList), [rolesList]);

  const createAccountModalCurrency = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const code = toUpper(accountModalCurrencyInput).trim();
    if (!code) return;
    const targetCompany = accountModalSelectedCompanyIds[0] || companyId;
    if (!targetCompany) return notify(t("pleaseSelectCompanyFirst"), "danger");
    try {
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: targetCompany }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success || !json.data) return notify(json.message || json.error || t("failedCreateCurrency"), "danger");
      setAccountModalCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code, is_linked: false }]);
      setAccountModalCurrencyInput("");
      notify(t("currencyCreated", { code }), "success");
    } catch {
      notify(t("failedCreateCurrency"), "danger");
    }
  };

  const removeAccountModalCurrency = async (cid) => {
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cid }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return notify(json.error || t("failedDeleteCurrency"), "danger");
      setAccountModalCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
      setAccountModalSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  };

  const submitAccountModal = async (e) => {
    e.preventDefault();
    const alertAmount = normalizeAlertAmount(accountModalForm.alert_amount);
    if (accountModalForm.payment_alert === "1" && (!accountModalForm.alert_type || !accountModalForm.alert_start_date)) {
      return notify(t("paymentAlertRequired"), "danger");
    }
    if (accountModalForm.payment_alert === "1" && alertAmount && Number(alertAmount) >= 0) {
      return notify(t("alertAmountNegative"), "danger");
    }

    const fd = new FormData();
    Object.entries(accountModalForm).forEach(([k, v]) => {
      if (k === "alert_amount") fd.append(k, alertAmount);
      else fd.append(k, v ?? "");
    });
    if (accountModalForm.payment_alert === "0") {
      fd.set("alert_type", "");
      fd.set("alert_start_date", "");
      fd.set("alert_amount", "");
    }
    if (accountModalSelectedCompanyIds.length) fd.set("company_ids", JSON.stringify(accountModalSelectedCompanyIds));
    if (companyId) fd.set("company_id", String(companyId));
    if (accountModalSelectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(accountModalSelectedCurrencyIds));

    try {
      const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notify(json.message || json.error || t("saveFailed"), "danger");

      if (json?.data?.id && accountModalSelectedCompanyIds.length) {
        await Promise.all(
          accountModalSelectedCompanyIds.map((cid) =>
            fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, company_id: cid }),
              credentials: "include",
            })
          )
        );
      }
      if (json?.data?.id && accountModalSelectedCurrencyIds.length) {
        await Promise.all(
          accountModalSelectedCurrencyIds.map((cur) =>
            fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, currency_id: cur }),
              credentials: "include",
            })
          )
        );
      }

      notify(t("accountAddedSuccessfully"), "success");
      await handleAccountModalSuccess?.(json.data);
    } catch {
      notify(t("saveFailed"), "danger");
    }
  };

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page");
    document.body.classList.add("process-page", "process-page--bank");
    return () => {
      document.body.classList.remove("process-page", "process-page--bank", "process-page--bank-show-all");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  useEffect(() => {
    const syncLang = (event) => {
      const nextLang = event?.detail?.lang;
      setLang(resolveLang(nextLang));
    };
    window.addEventListener("storage", syncLang);
    window.addEventListener("eazycount:language-updated", syncLang);
    return () => {
      window.removeEventListener("storage", syncLang);
      window.removeEventListener("eazycount:language-updated", syncLang);
    };
  }, [resolveLang]);

  useEffect(() => {
    setCssReady(true);
    return () => {
      setCssReady(false);
    };
  }, []);

  useEffect(() => {
    if (loading || !cssReady || bankDatePickerInitRef.current) return;
    bankDatePickerInitRef.current = true;
    ensureMaintenanceDateRangePicker();
    {
      if (!window.MaintenanceDateRangePicker) return;
      const u = new URL(window.location.href);
      const dfIso = u.searchParams.get("date_from") || "";
      const dtIso = u.searchParams.get("date_to") || "";
      const fromH = document.getElementById("date_from");
      const toH = document.getElementById("date_to");
      if (fromH) fromH.value = dfIso && /^\d{4}-\d{2}-\d{2}$/.test(dfIso) ? isoToDmy(dfIso) : "";
      if (toH) toH.value = dtIso && /^\d{4}-\d{2}-\d{2}$/.test(dtIso) ? isoToDmy(dtIso) : "";
      window.MaintenanceDateRangePicker.init({
        allowEmpty: true,
        placeholder: t("selectDateRange"),
        selectEndDateHint: t("selectEndDate"),
        onChange: () => {
          const df = dmyToIso(window.MaintenanceDateRangePicker.getDateFrom());
          const dt = dmyToIso(window.MaintenanceDateRangePicker.getDateTo());
          setDateFrom(df);
          setDateTo(dt);
        },
      });
      const clearBtn = document.getElementById("processListDateClearBtn");
      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.MaintenanceDateRangePicker?.clear?.();
          setDateFrom(""); setDateTo("");
        });
      }
    }
    return () => {};
  }, [loading, cssReady]);

  /* Keep date-range chip wording in sync when login/UI language changes (picker caches placeholder internally). */
  useEffect(() => {
    if (loading || !cssReady || !bankDatePickerInitRef.current || !window.MaintenanceDateRangePicker?.init) return;
    window.MaintenanceDateRangePicker.init({
      allowEmpty: true,
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      onChange: () => {
        const df = dmyToIso(window.MaintenanceDateRangePicker.getDateFrom());
        const dt = dmyToIso(window.MaintenanceDateRangePicker.getDateTo());
        setDateFrom(df);
        setDateTo(dt);
      },
    });
  }, [lang, loading, cssReady, t]);

  useEffect(() => {
    (async () => {
      try {
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
        const effectiveCompany = url.searchParams.get("company_id") || meJson.data.company_id || cs[0]?.id || null;
        setCompanyId(effectiveCompany ? Number(effectiveCompany) : null);
        const current = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        setSelectedGroup(current?.group_id ? String(current.group_id).toUpperCase() : null);
        setSearch(url.searchParams.get("search") || "");
        setDateFrom(url.searchParams.get("date_from") || "");
        setDateTo(url.searchParams.get("date_to") || "");
        setShowAll(url.searchParams.get("showAll") === "1");
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowOfficial(url.searchParams.get("showOfficial") === "1");
        setShowEInvoice(url.searchParams.get("showEInvoice") === "1");
        setShowBlock(url.searchParams.get("showBlock") === "1");
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!companyId || loading) return;
    (async () => {
      try {
        const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
        url.searchParams.set("company_id", String(companyId));
        url.searchParams.set("showAll", "1");
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = await res.json();
        const list = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        setAccounts(list);
      } catch { setAccounts([]); }
    })();
  }, [companyId, loading]);

  useEffect(() => {
    if (showAll) document.body.classList.add("process-page--bank-show-all");
    else document.body.classList.remove("process-page--bank-show-all");
  }, [showAll]);

  useEffect(() => {
    if (!modalOpen || !companyId) return;
    (async () => {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_countries");
      url.searchParams.set("company_id", String(companyId));
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setCountriesList(json.data);
    })();
  }, [modalOpen, companyId]);

  useEffect(() => {
    if (!modalOpen || !companyId || !form.country) { setBanksList([]); return; }
    (async () => {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_banks_by_country");
      url.searchParams.set("company_id", String(companyId));
      url.searchParams.set("country", String(form.country));
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setBanksList(json.data);
    })();
  }, [modalOpen, companyId, form.country]);

  useEffect(() => {
    if (!modalOpen || !editMode) return;
    if (form.country) setCountriesList((prev) => (prev.includes(form.country) ? prev : [...prev, form.country].sort()));
    if (form.bank && form.country) setBanksList((prev) => (prev.includes(form.bank) ? prev : [...prev, form.bank].sort()));
  }, [modalOpen, editMode, form.country, form.bank]);

  useEffect(() => {
    if (!modalOpen) return;
    const cost = parseFloat(String(form.cost ?? "")) || 0;
    const price = parseFloat(String(form.price ?? "")) || 0;
    
    // profitSharingTotalFromString helper inside component since we can't easily import it just for an effect
    let share = 0;
    const str = String(form.profit_sharing || "").trim();
    if (str) {
      for (const part of str.split(",")) {
        const t = part.trim();
        const dash = t.lastIndexOf(" - ");
        if (dash !== -1) {
          const n = parseFloat(t.slice(dash + 3).trim());
          if (!Number.isNaN(n)) share += n;
        }
      }
    }
    
    const net = Math.max(0, price - cost - share);
    const next = !String(form.cost ?? "").trim() && !String(form.price ?? "").trim() && !String(form.profit_sharing ?? "").trim() ? "" : String(Number(net.toFixed(2)));
    setForm((f) => {
      if (String(f.profit) === next) return f;
      return { ...f, profit: next };
    });
  }, [modalOpen, form.cost, form.price, form.profit_sharing]);

  // Keep legacy bank_process_list.js rule:
  // when Day end exists, Frequency cannot be monthly.
  useEffect(() => {
    if (!modalOpen) return;
    const hasDayEnd = !!String(form.day_end || "").trim();
    if (!hasDayEnd) return;
    if (String(form.day_start_frequency || "") !== "monthly") return;
    setForm((prev) => ({ ...prev, day_start_frequency: "1st_of_every_month" }));
  }, [modalOpen, form.day_end, form.day_start_frequency]);

  // Auto calculate Day end
  useEffect(() => {
    if (!modalOpen) return;
    const start = String(form.day_start || "").trim();
    const currentEnd = String(form.day_end || "").trim();
    const contract = String(form.contract || "").trim();
    const frequency = String(form.day_start_frequency || "1st_of_every_month").trim();

    if (!start) {
      bankContractEndHintRef.current = null;
      return;
    }

    const term = parseBankContractTermMonths(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(start, term, frequency) : null;

    if (!calculated) {
      bankContractEndHintRef.current = null;
      if (currentEnd && currentEnd < start) {
        setForm((prev) => ({ ...prev, day_end: start }));
      }
      return;
    }

    const prevContractEnd = bankContractEndHintRef.current;
    if (currentEnd && currentEnd < calculated) {
      setForm((prev) => ({ ...prev, day_end: calculated }));
    } else if (prevContractEnd && currentEnd && calculated < prevContractEnd && currentEnd <= prevContractEnd && currentEnd > calculated) {
      setForm((prev) => ({ ...prev, day_end: calculated }));
    }
    
    bankContractEndHintRef.current = calculated;
  }, [modalOpen, form.day_start, form.contract, form.day_start_frequency, form.day_end]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      listAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const hasDayEnd = !!String(resendDayEnd || "").trim();
    if (!hasDayEnd) return;
    if (String(resendFrequency || "") !== "monthly") return;
    setResendFrequency("1st_of_every_month");
  }, [resendDayEnd, resendFrequency]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (search.trim()) url.searchParams.set("search", search.trim());
    else url.searchParams.delete("search");
    if (dateFrom) url.searchParams.set("date_from", dateFrom);
    else url.searchParams.delete("date_from");
    if (dateTo) url.searchParams.set("date_to", dateTo);
    else url.searchParams.delete("date_to");
    [["showAll", showAll], ["showInactive", showInactive], ["showOfficial", showOfficial], ["showEInvoice", showEInvoice], ["showBlock", showBlock]].forEach(([k, v]) => {
      if (v) url.searchParams.set(k, "1"); else url.searchParams.delete(k);
    });
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, search, dateFrom, dateTo, showAll, showInactive, showOfficial, showEInvoice, showBlock]);

  // Bank list always fetches the full dataset, then filters client-side
  // (matches legacy bank_process_list.js: prevents stale issue_flag/inactive splits).
  const fetchRows = useCallback(async () => {
    if (!companyId) return;
    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;
    setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("permission", "Bank");
      url.searchParams.set("company_id", String(companyId));
      if (search.trim()) url.searchParams.set("search", search.trim());
      url.searchParams.set("showAll", "1");
      const res = await fetch(url.toString(), { credentials: "include", signal: ac.signal });
      const json = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok || !json.success) return notify(json.message || json.error || t("failedLoadBankProcesses"), "danger");
      setRows(normalizeRows(json.data));
      setSelectedIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      if (ac.signal.aborted) return;
      notify(t("failedLoadBankProcesses"), "danger");
    } finally {
      if (!ac.signal.aborted) setTableLoading(false);
    }
  }, [companyId, search, notify, syncUrl]);

  useEffect(() => {
    if (!companyId || loading) return;
    const t = window.setTimeout(() => { void fetchRows(); }, 180);
    return () => window.clearTimeout(t);
  }, [companyId, loading, search, fetchRows]);

  // URL still reflects active filters even though they're applied client-side.
  useEffect(() => {
    if (!companyId || loading) return;
    syncUrl();
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [companyId, loading, showAll, showInactive, showOfficial, showEInvoice, showBlock, dateFrom, dateTo, syncUrl]);

  const loadAccountingInbox = useCallback(async () => {
    if (!companyId) return;
    setAccountingLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/process_accounting_inbox_api.php"));
      url.searchParams.set("company_id", String(companyId));
      const res = await fetch(url.toString(), { credentials: "include", cache: "no-cache" });
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setAccountingRows(list);
      setAccountingSelected(new Set(list.filter((x) => !x.already_posted_today).map((x) => Number(x.id))));
      setAccountingDeleteSelected(new Set());
    } catch { setAccountingRows([]); } 
    finally { setAccountingLoading(false); }
  }, [companyId]);

  const resetForm = () => setForm({ ...EMPTY_BANK_FORM });

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("switchCompanyFailed"), "danger");
      setCompanyId(Number(c.id));
      notifyCompanySessionUpdated();
      const bankCategory = await isBankCategoryCompany(c.company_id, buildApiUrl);
      if (!bankCategory) {
        window.location.assign(new URL(`/process-list?company_id=${c.id}`, window.location.origin).toString());
      }
      if (accountingOpen) void loadAccountingInbox();
    } catch { notify(t("switchCompanyFailed"), "danger"); }
  };

  const openAdd = () => {
    setEditMode(false);
    resetForm();
    setCountryModalOpen(false);
    setBankModalOpen(false);
    setProfitShareModalOpen(false);
    setBankFormNote(null);
    setAddAccountModalOpen(false);
    setSelectedCountryChips([]);
    setSelectedBankChips([]);
    setModalOpen(true);
  };

  const submitNewCountry = async (e) => {
    e.preventDefault();
    const name = String(newCountryName || "").trim().toUpperCase();
    if (!name || !companyId) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=add_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("addCountryFailed"), "danger");
      setCountriesList((prev) => [...new Set([...prev, name])].sort());
      setSelectedCountryChips((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setNewCountryName("");
      notify(t("countryAdded"));
    } catch { notify(t("addCountryFailed"), "danger"); }
  };

  const submitNewBank = async (e) => {
    e.preventDefault();
    const name = String(newBankName || "").trim().toUpperCase();
    if (!name || !companyId || !form.country) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", String(form.country)); fd.append("banks[]", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_country_banks"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("addBankFailed"), "danger");
      setBanksList((prev) => [...new Set([...prev, name])].sort());
      setSelectedBankChips((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setNewBankName("");
      notify(t("bankAdded"));
    } catch { notify(t("addBankFailed"), "danger"); }
  };

  const removeAvailableCountry = async (countryName) => {
    const country = String(countryName || "").trim();
    if (!country || !companyId) return;
    if (!window.confirm(t("removeCountryConfirm", { country }))) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", country);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("removeCountryFailed"), "danger");
      setCountriesList((prev) => prev.filter((c) => c !== country));
      setSelectedCountryChips((prev) => prev.filter((c) => c !== country));
      setForm((f) => (f.country === country ? { ...f, country: "", bank: "" } : f));
      notify(t("countryRemoved"));
    } catch { notify(t("removeCountryFailed"), "danger"); }
  };

  const removeAvailableBank = async (bankName) => {
    const bank = String(bankName || "").trim();
    const country = String(form.country || "").trim();
    if (!bank || !country || !companyId) return;
    if (!window.confirm(t("removeBankConfirm", { bank, country }))) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", country); fd.append("bank", bank);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_bank"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("removeBankFailed"), "danger");
      setBanksList((prev) => prev.filter((b) => b !== bank));
      setSelectedBankChips((prev) => prev.filter((b) => b !== bank));
      setForm((f) => (f.bank === bank ? { ...f, bank: "" } : f));
      notify(t("bankRemoved"));
    } catch { notify(t("removeBankFailed"), "danger"); }
  };

  const openProfitShareModal = () => {
    const rows = parseProfitSharingToRows(form.profit_sharing, accounts);
    setProfitShareRows(rows.length ? rows : [{ accountId: "", accountLabel: "", amount: "" }]);
    setProfitShareModalOpen(true);
  };

  const confirmProfitShareModal = () => {
    const s = serializeProfitSharingRows(profitShareRows, accounts);
    setForm((f) => ({ ...f, profit_sharing: s }));
    setProfitShareModalOpen(false);
  };

  const handleAccountModalSuccess = async (data) => {
    const newId = data?.id != null ? String(data.id) : "";
    const newAccountId = String(data?.account_id || "").trim();
    const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
    url.searchParams.set("company_id", String(companyId));
    url.searchParams.set("showAll", "1");
    const listRes = await fetch(url.toString(), { credentials: "include" });
    const listJson = await listRes.json();
    const list = Array.isArray(listJson?.data?.accounts) ? listJson.data.accounts : [];
    setAccounts(list);
    if (newId && accountPlusTarget === "card_merchant_id") setForm((f) => ({ ...f, card_merchant_id: newId }));
    if (newId && accountPlusTarget === "customer_id") setForm((f) => ({ ...f, customer_id: newId }));
    if (newId && accountPlusTarget === "profit_account_id") setForm((f) => ({ ...f, profit_account_id: newId }));
    if (newId && accountPlusTarget && typeof accountPlusTarget === "object" && accountPlusTarget.type === "profitRow") {
      const idx = accountPlusTarget.index;
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, accountId: newId, accountLabel: newAccountId } : r)));
    }
    notifyTransactionDataChanged("bank-process-list-react");
    setAddAccountModalOpen(false);
    setAccountPlusTarget(null);
  };

  const openAddAccountForField = async (target) => {
    setAccountPlusTarget(target);
    if (!companyId) return notify(t("missingCompanyContext"), "danger");
    try {
      const [editRes, curRes] = await Promise.all([
        fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" }),
        fetch(buildApiUrl("api/accounts/account_currency_api.php?action=get_available_currencies"), { credentials: "include" }),
      ]);
      const editJson = await editRes.json();
      const curJson = await curRes.json();
      setRolesList(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);
      setAccountModalCurrencies(Array.isArray(curJson?.data) ? curJson.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })) : []);
    } catch { setRolesList([]); setAccountModalCurrencies([]); }
    setAddAccountModalOpen(true);
  };

  const openEdit = async (rowId) => {
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(rowId));
      url.searchParams.set("permission", "Bank");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) return notify(json.message || json.error || t("failedLoadBankProcess"), "danger");
      const d = json.data;
      setEditMode(true);
      setForm({
        id: String(d.id || ""),
        country: d.country || "", bank: d.bank || "", type: d.type || "", name: d.name || "",
        card_merchant_id: d.card_merchant_id ? String(d.card_merchant_id) : "",
        customer_id: d.customer_id ? String(d.customer_id) : "",
        profit_account_id: d.profit_account_id ? String(d.profit_account_id) : "",
        contract: d.contract || "", insurance: d.insurance ?? "", cost: d.cost ?? "", price: d.price ?? "", profit: d.profit ?? "",
        profit_sharing: d.profit_sharing || "",
        day_start: d.day_start ? String(d.day_start).slice(0, 10) : "",
        day_end: d.day_end ? String(d.day_end).slice(0, 10) : "",
        day_start_frequency: d.day_start_frequency || "1st_of_every_month",
        status: d.status || "active", remark: d.remark || "", sop: d.sop || "",
      });
      setModalOpen(true);
    } catch { notify(t("failedLoadBankProcess"), "danger"); }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const dayStart = String(form.day_start || "").trim();
    const dayEnd = String(form.day_end || "").trim();
    if (dayStart && dayEnd && dayEnd < dayStart) {
      notify(t("dayEndEarlierThanStart"), "danger");
      return;
    }
    const hasDayEnd = !!dayEnd;
    const normalizedFreq = hasDayEnd ? "1st_of_every_month" : (String(form.day_start_frequency || "") === "monthly" ? "monthly" : "1st_of_every_month");
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === "id" && !editMode) return;
      if (k === "day_start_frequency") {
        fd.append(k, normalizedFreq);
        return;
      }
      fd.append(k, v ?? "");
    });
    if (companyId) fd.append("company_id", String(companyId));
    fd.append("permission", "Bank");
    try {
      const endpoint = editMode ? "api/processes/processlist_api.php?action=update_process" : "api/processes/addprocess_api.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("saveFailed"), "danger");
      notify(editMode ? t("bankProcessUpdated") : t("bankProcessAdded"));
      notifyTransactionDataChanged("bank-process-list-react");
      setModalOpen(false); fetchRows();
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const postAccountingToTransaction = async () => {
    const selected = accountingRows.filter((r) => accountingSelected.has(Number(r.id)) && !r.already_posted_today);
    if (selected.length === 0) return notify(t("needOneDueItem"), "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        const periodType = r.is_manual_inactive ? "manual_inactive" : (r.is_resend_consolidated_range ? "resend_consolidated_range" : (r.is_partial_first_month ? "partial_first_month" : (r.is_day_end_tail ? "day_end_tail" : "monthly")));
        fd.append("ids[]", r.id); fd.append("period_types[]", periodType); fd.append("billing_months[]", r.monthly_billing_month || "");
      });
      fd.append("allow_future_monthly", "1");
      const res = await fetch(buildApiUrl("api/processes/process_post_to_transaction_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("transactionPostFailed"), "danger");
      notify(json.message || t("postedToTransaction"));
      notifyTransactionDataChanged("bank-process-list-react");
      loadAccountingInbox(); fetchRows();
    } catch { notify(t("transactionPostFailed"), "danger"); }
  };

  const dismissAccountingRows = async () => {
    const selected = accountingRows.filter((r) => accountingDeleteSelected.has(Number(r.id)));
    if (selected.length === 0) return notify(t("tickDeleteRows"), "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        const periodType = r.is_manual_inactive ? "manual_inactive" : (r.is_resend_consolidated_range ? "resend_consolidated_range" : (r.is_partial_first_month ? "partial_first_month" : (r.is_day_end_tail ? "day_end_tail" : "monthly")));
        fd.append("ids[]", r.id); fd.append("period_types[]", periodType); fd.append("billing_months[]", r.monthly_billing_month || "");
      });
      const res = await fetch(buildApiUrl("api/processes/dismiss_accounting_due_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("deleteDueFailed"), "danger");
      notify(json.message || t("removedFromDue"));
      notifyTransactionDataChanged("bank-process-list-react");
      loadAccountingInbox(); fetchRows();
    } catch { notify(t("deleteDueFailed"), "danger"); }
  };

  const saveRemarkModal = async () => {
    if (!remarkRow) return;
    try {
      const fd = new FormData(); fd.append("id", String(remarkRow.id)); fd.append("remark", remarkDraft);
      const res = await fetch(buildApiUrl("api/processes/update_bank_remark_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("remarkUpdateFailed"), "danger");
      setRows((prev) => prev.map((r) => (Number(r.id) === Number(remarkRow.id) ? { ...r, remark: remarkDraft } : r)));
      notifyTransactionDataChanged("bank-process-list-react");
      notify(t("remarkUpdated"));
      setRemarkModalOpen(false); setRemarkRow(null);
    } catch { notify(t("remarkUpdateFailed"), "danger"); }
  };

  const resendAccountingDue = async () => {
    if (!resendTarget) return;
    setResendInlineError("");
    const dayStart = String(resendDayStart || "").trim();
    const dayEnd = String(resendDayEnd || "").trim();
    if (dayStart && dayEnd && dayEnd < dayStart) {
      const msg = t("dayEndEarlierThanStart");
      setResendInlineError(msg);
      notify(msg, "danger");
      return;
    }
    const normalizedResendFrequency = dayEnd ? "1st_of_every_month" : (String(resendFrequency || "") === "monthly" ? "monthly" : "1st_of_every_month");
    try {
      const res = await fetch(buildApiUrl("api/bankprocess_maintenance/resend_accounting_due_api.php"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ bank_process_id: Number(resendTarget.id), day_start: resendDayStart || null, day_end: resendDayEnd || null, day_start_frequency: normalizedResendFrequency }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json.message || json.error || t("resendFailed");
        if (isBankResendDayStartBackendErrorMessage(msg)) setResendInlineError(msg);
        return notify(msg, "danger");
      }
      notify(json.message || t("resendSuccessful"));
      notifyTransactionDataChanged("bank-process-list-react");
      if (accountingOpen) loadAccountingInbox();
      setResendModalOpen(false); setResendTarget(null);
    } catch { notify(t("resendFailed"), "danger"); }
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
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Bank" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || t("deleteFailed"), "danger");
      const n = json?.data?.deleted ?? selectedIds.size;
      notify(n === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: n }), "success");
      notifyTransactionDataChanged("bank-process-list-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      fetchRows();
    } catch { notify(t("deleteFailed"), "danger"); }
    finally { setDeleteSubmitting(false); }
  };

  const allCompanyButtons = useMemo(() => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""), [companies]);
  const groupIds = useMemo(() => [...new Set(allCompanyButtons.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(), [allCompanyButtons]);
  const companyButtons = useMemo(() => (!selectedGroup ? allCompanyButtons.filter((c) => !c.group_id || String(c.group_id).trim() === "") : allCompanyButtons.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup)), [allCompanyButtons, selectedGroup]);

  const supplierSortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const ak = String(a.card_lower || a.supplier || "").toLowerCase();
      const bk = String(b.card_lower || b.supplier || "").toLowerCase();
      const c = ak.localeCompare(bk);
      return supplierSortDir === "asc" ? c : -c;
    });
    return arr;
  }, [rows, supplierSortDir]);

  const visibleRows = useMemo(() => {
    const filterState = { showAll, showInactive, showOfficial, showEInvoice, showBlock };
    const filtered = supplierSortedRows.filter((r) => matchesCurrentBankFilters(r, filterState));
    if (!dateFrom && !dateTo) return filtered;
    const fromMs = dateFrom ? parseRowDateMs(dateFrom) : null;
    const toMs = dateTo ? parseRowDateMs(dateTo) : null;
    const toEnd = toMs != null ? toMs + 86400000 - 1 : null;
    return filtered.filter((r) => {
      const ts = parseRowDateMs(r.date || r.day_start);
      if (ts == null) return false;
      if (fromMs !== null && ts < fromMs) return false;
      if (toEnd !== null && ts > toEnd) return false;
      return true;
    });
  }, [supplierSortedRows, dateFrom, dateTo, showAll, showInactive, showOfficial, showEInvoice, showBlock]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE)), [visibleRows]);
  const pageRows = useMemo(() => {
    if (showAll) return visibleRows;
    const p = Math.min(currentPage, totalPages);
    return visibleRows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [visibleRows, showAll, currentPage, totalPages]);

  if (loading || !cssReady) return null;

  return (
    <div className="container">
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <h1 className="page-title" style={{ margin: 0 }}>{t("bankProcessList")}</h1>
            <div className="process-accounting-inbox-wrap">
              <button
                type="button"
                className="process-accounting-inbox-btn process-accounting-inbox-main"
                onClick={() => { setAccountingOpen(true); void loadAccountingInbox(); }}
              >
                <svg className="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                {t("accountingDue")}
                <span className="process-accounting-inbox-badge">{accountingRows.filter((x) => !x.already_posted_today).length}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="separator-line" />
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" onClick={openAdd}>{t("addProcess")}</button>
              <div className="process-list-date-filter" id="processListDateFilter" style={{ display: "inline-flex" }}>
                <div className="date-range-picker" id="date-range-picker">
                  <i className="fas fa-calendar-alt" aria-hidden="true" />
                  {/* Text is driven by MaintenanceDateRangePicker (must not set React children or they overwrite picker + stale i18n). */}
                  <span id="date-range-display" aria-live="polite" />
                  <button type="button" className="process-list-date-clear" id="processListDateClearBtn" title={t("clearDateRange")} aria-label={t("clearDateRange")} style={{ display: "none" }}>&times;</button>
                </div>
                <input type="hidden" id="date_from" defaultValue="" />
                <input type="hidden" id="date_to" defaultValue="" />
              </div>
              <div className="search-container">
                <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input type="text" className="search-input" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="checkbox-section">
                <input
                  type="checkbox"
                  id="showAll"
                  checked={showAll}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowAll(v);
                    if (v) {
                      setShowInactive(false);
                      setShowOfficial(false);
                      setShowEInvoice(false);
                      setShowBlock(false);
                    }
                  }}
                />
                <label htmlFor="showAll">{t("showAll")}</label>
              </div>
              <div className="checkbox-section">
                <input
                  type="checkbox"
                  id="showInactive"
                  checked={showInactive}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowInactive(v);
                    if (v) setShowAll(false);
                  }}
                />
                <label htmlFor="showInactive">{t("showInactive")}</label>
              </div>
              <div className="checkbox-section">
                <input
                  type="checkbox"
                  id="showOfficial"
                  checked={showOfficial}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowOfficial(v);
                    if (v) setShowAll(false);
                  }}
                />
                <label htmlFor="showOfficial">{t("showOfficial")}</label>
              </div>
              <div className="checkbox-section">
                <input
                  type="checkbox"
                  id="showEInvoice"
                  checked={showEInvoice}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowEInvoice(v);
                    if (v) setShowAll(false);
                  }}
                />
                <label htmlFor="showEInvoice">{t("showEInvoice")}</label>
              </div>
              <div className="checkbox-section">
                <input
                  type="checkbox"
                  id="showBlock"
                  checked={showBlock}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowBlock(v);
                    if (v) setShowAll(false);
                  }}
                />
                <label htmlFor="showBlock">{t("showBlock")}</label>
              </div>
            </div>
            <button type="button" className="btn btn-delete" id="processDeleteSelectedBtn" disabled={!selectedIds.size} title={t("delete")} onClick={deleteSelected}>{t("delete")}</button>
          </div>
          {groupIds.length > 0 && <div className="process-company-filter"><span className="process-company-label">{t("groupId")}</span><div className="process-company-buttons">{groupIds.map((g) => <button key={g} type="button" className={`process-company-btn ${selectedGroup === g ? "active" : ""}`} onClick={() => setSelectedGroup(g)}>{g}</button>)}</div></div>}
          <div className="process-company-filter"><span className="process-company-label">{t("company")}</span><div className="process-company-buttons">{companyButtons.map((c) => <button key={c.id} type="button" className={`process-company-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`} onClick={() => onSwitchCompany(c)}>{c.company_id}</button>)}</div></div>
        </div>

        <BankProcessTable
          tableLoading={tableLoading} showAll={showAll} pageRows={pageRows} currentPage={currentPage}
          PAGE_SIZE={PAGE_SIZE} selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          showHeaderSelectAll={showInactive || showOfficial || showEInvoice || showBlock}
          notify={notify} fetchRows={fetchRows} openEdit={openEdit} openRemarkModal={(row) => { setRemarkRow(row); setRemarkDraft(String(row.remark || "")); setRemarkModalOpen(true); }}
          openResendModal={(row) => {
            setResendInlineError("");
            setResendTarget(row);
            setResendDayStart(String(row.day_start || row.date || "").slice(0, 10));
            setResendDayEnd("");
            setResendFrequency("1st_of_every_month");
            setResendModalOpen(true);
          }}
          supplierSortDir={supplierSortDir} setSupplierSortDir={setSupplierSortDir}
          t={t}
        />
        {!showAll && <div className="pagination-container"><button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button><span className="pagination-info">{t("pageOf", { current: currentPage, total: totalPages })}</span><button type="button" className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button></div>}
      </div>

      {modalOpen && (
        <BankProcessFormModal
          editMode={editMode} form={form} setForm={setForm} accounts={accounts} countriesList={countriesList} banksList={banksList}
          onClose={() => setModalOpen(false)} onSubmit={submitForm}
          onOpenCountryModal={() => { setSelectedCountryChips(form.country ? [form.country] : []); setCountrySearch(""); setNewCountryName(""); setCountryModalOpen(true); }}
          onOpenBankModal={() => { setSelectedBankChips(form.bank ? [form.bank] : []); setBankSearch(""); setNewBankName(""); setBankModalOpen(true); }}
          onOpenProfitShareModal={openProfitShareModal}
          onOpenBankFormNoteModal={(kind) => setBankFormNote({ kind, draft: kind === "sop" ? String(form.sop || "") : String(form.remark || "") })}
          onOpenAddAccountForField={openAddAccountForField}
          t={t}
        />
      )}
      
      {countryModalOpen && (
        <CountrySelectionModal
          countriesList={countriesList} selectedCountryChips={selectedCountryChips} setSelectedCountryChips={setSelectedCountryChips}
          countrySearch={countrySearch} setCountrySearch={setCountrySearch} newCountryName={newCountryName} setNewCountryName={setNewCountryName}
          onSubmitNewCountry={submitNewCountry} onRemoveAvailableCountry={removeAvailableCountry}
          onConfirm={(country) => { setForm((f) => ({ ...f, country, bank: "" })); setCountryModalOpen(false); }}
          onClose={() => setCountryModalOpen(false)} notify={notify}
          t={t}
        />
      )}

      {bankModalOpen && (
        <BankSelectionModal
          banksList={banksList} selectedBankChips={selectedBankChips} setSelectedBankChips={setSelectedBankChips}
          bankSearch={bankSearch} setBankSearch={setBankSearch} newBankName={newBankName} setNewBankName={setNewBankName}
          onSubmitNewBank={submitNewBank} onRemoveAvailableBank={removeAvailableBank}
          onConfirm={(bank) => { setForm((f) => ({ ...f, bank })); setBankModalOpen(false); }}
          onClose={() => setBankModalOpen(false)} notify={notify}
          t={t}
        />
      )}

      {profitShareModalOpen && (
        <ProfitSharingModal
          profitShareRows={profitShareRows} setProfitShareRows={setProfitShareRows} accounts={accounts}
          onConfirm={confirmProfitShareModal} onClose={() => setProfitShareModalOpen(false)}
          onOpenAddAccountForField={openAddAccountForField}
          t={t}
        />
      )}

      <BankNoteModal
        bankFormNote={bankFormNote} setBankFormNote={setBankFormNote}
        onSave={() => {
          if (bankFormNote) {
            const { kind, draft } = bankFormNote;
            if (kind === "sop") setForm((f) => ({ ...f, sop: draft })); else setForm((f) => ({ ...f, remark: draft }));
            setBankFormNote(null);
          }
        }}
        t={t}
      />

      {accountingOpen && (
        <AccountingDueModal
          accountingRows={accountingRows} accountingLoading={accountingLoading}
          accountingSelected={accountingSelected} setAccountingSelected={setAccountingSelected}
          accountingDeleteSelected={accountingDeleteSelected} setAccountingDeleteSelected={setAccountingDeleteSelected}
          onPostToTransaction={postAccountingToTransaction} onDismissRows={dismissAccountingRows} onClose={() => setAccountingOpen(false)}
          t={t}
        />
      )}

      {resendModalOpen && (
        <ResendModal
          resendTarget={resendTarget} resendDayStart={resendDayStart} setResendDayStart={setResendDayStart}
          resendDayEnd={resendDayEnd} setResendDayEnd={setResendDayEnd} resendFrequency={resendFrequency} setResendFrequency={setResendFrequency}
          resendInlineError={resendInlineError} setResendInlineError={setResendInlineError}
          onResend={resendAccountingDue} onClose={() => setResendModalOpen(false)}
          t={t}
        />
      )}

      {remarkModalOpen && (
        <BankRemarkModal remarkDraft={remarkDraft} setRemarkDraft={setRemarkDraft} onSave={saveRemarkModal} onClose={() => setRemarkModalOpen(false)} t={t} />
      )}

      <ProcessDeleteConfirmModal
        open={deleteConfirmOpen}
        count={selectedIds.size}
        deleting={deleteSubmitting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteProcesses}
        t={t}
      />

      <AccountModal
        open={addAccountModalOpen}
        title={tAccount("addAccount")}
        isEditMode={false}
        form={accountModalForm}
        setForm={setAccountModalForm}
        orderedRoles={accountModalOrderedRoles}
        currencies={accountModalCurrencies}
        companies={companies}
        selectedCurrencyIds={accountModalSelectedCurrencyIds}
        setSelectedCurrencyIds={setAccountModalSelectedCurrencyIds}
        selectedCompanyIds={accountModalSelectedCompanyIds}
        setSelectedCompanyIds={setAccountModalSelectedCompanyIds}
        currencyInput={accountModalCurrencyInput}
        setCurrencyInput={setAccountModalCurrencyInput}
        onCreateCurrency={createAccountModalCurrency}
        onRemoveCurrency={removeAccountModalCurrency}
        onSubmit={submitAccountModal}
        onClose={() => {
          setAddAccountModalOpen(false);
          setAccountPlusTarget(null);
        }}
        t={tAccount}
      />
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}><i className="fas fa-chevron-left" /></button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
            <select id="calendar-month-select" aria-label="Month">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (<option key={i} value={i}>{m}</option>))}
            </select>
            <select id="calendar-year-select" aria-label="Year" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="calendar-weekdays">
          {(lang === "zh" ? ["日", "一", "二", "三", "四", "五", "六"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((d) => (<div key={d} className="calendar-weekday">{d}</div>))}
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
      {toast ? (
        <div className="process-notification-container">
          <div className={`process-notification process-notification-${toast.type === "danger" ? "danger" : (toast.type === "warning" ? "warning" : "success")} show`}>
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
