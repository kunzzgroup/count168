import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AccountAddModalSameAsList from "../components/AccountAddModalSameAsList.jsx";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

const PAGE_SIZE = 20;
/** 与旧版 bank_process_list.js BANK_GRID_TEMPLATE_COLUMNS 一致，保证列宽对齐 */
const BANK_GRID_TEMPLATE_COLUMNS = "0.2fr 0.8fr 0.6fr 0.7fr 0.5fr 0.6fr 0.6fr 0.6fr 0.7fr 0.4fr 0.4fr 0.4fr 0.45fr 0.5fr 0.36fr";

function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

function normalizeBankIssueFlag(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function isBankInactiveLike(status, issueFlag) {
  const s = String(status || "").trim().toLowerCase();
  const f = normalizeBankIssueFlag(issueFlag);
  return s === "inactive" || f === "official" || f === "e_invoice" || f === "block";
}

function canShowBankResend(row) {
  const s = String(row?.status || "").trim().toLowerCase();
  return s === "active" && !isBankInactiveLike(row?.status, row?.issue_flag);
}

function isoToDmy(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return "";
  const [y, m, d] = String(iso).trim().split("-");
  return `${d}/${m}/${y}`;
}

function dmyToIso(dmy) {
  const t = String(dmy || "").trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return "";
  const p = t.split("/");
  const dd = parseInt(p[0], 10);
  const mm = parseInt(p[1], 10);
  const yy = parseInt(p[2], 10);
  if (!yy || !mm || !dd) return "";
  return `${String(yy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseRowDateMs(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const head = s.slice(0, 10);
    const t = new Date(`${head}T00:00:00`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [dd, mm, yy] = s.split("/").map((x) => Number(x, 10));
    const t = new Date(yy, mm - 1, dd).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function isBankResendDayStartBackendErrorMessage(text) {
  const s = String(text || "");
  return (
    s.includes("不可与今天相同") ||
    s.includes("Day start cannot be today") ||
    s.includes("Resend 所填 Day start") ||
    s.includes("same calendar date as the current contract Day start")
  );
}

function notifyTransactionDataChanged(sourceTag) {
  const ts = String(Date.now());
  try {
    localStorage.setItem("count168_tx_invalidate_ts", ts);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("tx-data-changed", { detail: { ts, source: sourceTag || "bank-process-list-react" } }));
  } catch {
    /* ignore */
  }
}

async function isBankCategoryCompany(companyCode) {
  if (!companyCode) return false;
  try {
    const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const json = await res.json();
    const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
    const normalized = permissions.map((p) => String(p || "").toLowerCase());
    return normalized.includes("bank") && !normalized.includes("games") && !normalized.includes("gambling");
  } catch {
    return false;
  }
}

function profitSharingTotalFromString(s) {
  let total = 0;
  const str = String(s || "").trim();
  if (!str) return 0;
  for (const part of str.split(",")) {
    const t = part.trim();
    const dash = t.lastIndexOf(" - ");
    if (dash === -1) continue;
    const n = parseFloat(t.slice(dash + 3).trim());
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}

function parseProfitSharingToRows(s, accounts) {
  const out = [];
  const str = String(s || "").trim();
  if (!str) return out;
  for (const part of str.split(",")) {
    const t = part.trim();
    const dash = t.lastIndexOf(" - ");
    if (dash === -1) continue;
    const label = t.slice(0, dash).trim();
    const amount = parseFloat(t.slice(dash + 3).trim());
    if (!label || Number.isNaN(amount)) continue;
    const acc = (accounts || []).find(
      (a) => String(a.account_id || "").toLowerCase() === label.toLowerCase() || String(a.name || "").toLowerCase() === label.toLowerCase()
    );
    out.push({ accountId: acc ? String(acc.id) : "", accountLabel: label, amount: String(amount) });
  }
  return out;
}

function serializeProfitSharingRows(rows, accounts) {
  return rows
    .map((r) => {
      const acc = (accounts || []).find((a) => String(a.id) === String(r.accountId));
      const label = (acc?.account_id || String(r.accountLabel || "").trim()).trim();
      const amt = parseFloat(String(r.amount));
      if (!label || Number.isNaN(amt) || amt <= 0) return null;
      return `${label} - ${amt}`;
    })
    .filter(Boolean)
    .join(", ");
}

function deriveBankProcessUiStatus(row) {
  const f = normalizeBankIssueFlag(row?.issue_flag);
  if (f === "official") return "OFFICIAL";
  if (f === "e_invoice") return "E_INVOICE";
  if (f === "block") return "BLOCK";
  const s = String(row?.status || "").toLowerCase();
  if (s === "inactive") return "INACTIVE";
  if (s === "waiting") return "ACTIVE";
  return "ACTIVE";
}

function BankProcessStatusControl({ row, onUpdated, notify: doNotify, buildApiUrl: apiUrl }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const ui = deriveBankProcessUiStatus(row);
  const pillClass = `bank-process-status-pill bank-process-status-pill--${ui.toLowerCase().replace(/_/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const postIssueFlag = async (id, issueFlag) => {
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("issue_flag", issueFlag);
    const res = await fetch(apiUrl("api/processes/update_bank_issue_flag_api.php"), { method: "POST", body: fd, credentials: "include" });
    return res.json();
  };

  const postToggle = async (id) => {
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("permission", "Bank");
    const res = await fetch(apiUrl("api/processes/toggle_process_status_api.php"), { method: "POST", body: fd, credentials: "include" });
    return res.json();
  };

  const apply = async (target) => {
    const id = row.id;
    const st = String(row.status || "").toLowerCase();
    const hasFlag = !!normalizeBankIssueFlag(row.issue_flag);
    try {
      if (target === "ACTIVE") {
        if (hasFlag) {
          const j = await postIssueFlag(id, "");
          if (!j.success) return doNotify(j.message || j.error || "Clear flag failed", "danger");
        }
        if (st !== "active") {
          const j = await postToggle(id);
          if (!j.success) return doNotify(j.message || j.error || "Status update failed", "danger");
        }
      } else if (target === "INACTIVE") {
        if (hasFlag) {
          const j = await postIssueFlag(id, "");
          if (!j.success) return doNotify(j.message || j.error || "Clear flag failed", "danger");
        }
        if (st === "active") {
          const j = await postToggle(id);
          if (!j.success) return doNotify(j.message || j.error || "Status update failed", "danger");
        }
      } else if (target === "OFFICIAL") {
        const j = await postIssueFlag(id, "official");
        if (!j.success) return doNotify(j.message || j.error || "Update failed", "danger");
      } else if (target === "E_INVOICE") {
        const j = await postIssueFlag(id, "e_invoice");
        if (!j.success) return doNotify(j.message || j.error || "Update failed", "danger");
      } else if (target === "BLOCK") {
        const j = await postIssueFlag(id, "block");
        if (!j.success) return doNotify(j.message || j.error || "Update failed", "danger");
      }
      doNotify("Status updated", "success");
      onUpdated();
      setOpen(false);
    } catch {
      doNotify("Status update failed", "danger");
    }
  };

  const options = ["ACTIVE", "INACTIVE", "OFFICIAL", "E_INVOICE", "BLOCK"];
  const label = ui === "E_INVOICE" ? "E-INVOICE" : ui;

  return (
    <div className="bank-process-status-wrap" ref={wrapRef}>
      <button type="button" className={pillClass} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open ? (
        <div className="bank-process-status-menu" role="listbox">
          {options.map((opt) => {
            const optLabel = opt === "E_INVOICE" ? "E-INVOICE" : opt;
            const cur = ui === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`bank-process-status-option bank-process-status-option--${opt.toLowerCase().replace(/_/g, "-")}${cur ? " is-current" : ""}`}
                onClick={() => void apply(opt)}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function BankSearchableAccountPick({ value, onChange, accounts, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);
  const filtered = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((a) => `${a.account_id || ""} ${a.name || ""}`.toLowerCase().includes(qq));
  }, [accounts, q]);
  const selected = (accounts || []).find((a) => String(a.id) === String(value));
  return (
    <div className="custom-select-wrapper" ref={wrapRef}>
      <button type="button" className="custom-select-button" disabled={disabled} onClick={() => !disabled && setOpen((o) => !o)}>
        {selected ? selected.account_id : "Select Account"}
      </button>
      {open ? (
        <div className="custom-select-dropdown" style={{ display: "block" }}>
          <div className="custom-select-search">
            <input type="text" placeholder="Search account..." autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="custom-select-options">
            {filtered.map((a) => (
              <div
                key={a.id}
                className={`custom-select-option${String(value) === String(a.id) ? " selected" : ""}`}
                role="presentation"
                onClick={() => {
                  onChange(String(a.id));
                  setOpen(false);
                  setQ("");
                }}
              >
                {a.account_id} — {a.name || "-"}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function BankProcessListPage() {
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
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
  const toastTimerRef = useRef(null);
  const listAbortRef = useRef(null);
  const bankDatePickerInitRef = useRef(false);
  const [form, setForm] = useState({
    id: "",
    country: "",
    bank: "",
    type: "",
    name: "",
    card_merchant_id: "",
    customer_id: "",
    profit_account_id: "",
    contract: "",
    insurance: "",
    cost: "",
    price: "",
    profit: "",
    profit_sharing: "",
    day_start: "",
    day_end: "",
    day_start_frequency: "1st_of_every_month",
    status: "active",
    remark: "",
    sop: "",
  });

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  useLayoutEffect(() => {
    document.body.classList.remove("dashboard-page", "bg", "account-page", "announcement-page");
    document.body.classList.add("process-page", "process-page--bank");
    return () => document.body.classList.remove("process-page", "process-page--bank", "process-page--bank-show-all");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hrefs = [assetUrl("css/processCSS.css"), assetUrl("css/processlist.css"), assetUrl("css/accountCSS.css"), assetUrl("css/account-list.css"), assetUrl("css/date-range-picker.css")];
    Promise.all(
      hrefs.map(
        (href) =>
          new Promise((resolve) => {
            const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
            if (existing) return resolve(existing);
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.onload = () => resolve(link);
            link.onerror = () => resolve(link);
            document.head.appendChild(link);
          })
      )
    ).then(() => {
      if (!cancelled) setCssReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !cssReady || bankDatePickerInitRef.current) return;
    bankDatePickerInitRef.current = true;
    const script = document.createElement("script");
    script.src = assetUrl("js/date-range-picker.js");
    script.onload = () => {
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
        placeholder: "Select date range",
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
          setDateFrom("");
          setDateTo("");
        });
      }
    };
    document.body.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [loading, cssReady]);

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
      } finally {
        setLoading(false);
      }
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
      } catch {
        setAccounts([]);
      }
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
    if (!modalOpen || !companyId || !form.country) {
      setBanksList([]);
      return;
    }
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
    const share = profitSharingTotalFromString(form.profit_sharing);
    const net = Math.max(0, price - cost - share);
    const next = !String(form.cost ?? "").trim() && !String(form.price ?? "").trim() && !String(form.profit_sharing ?? "").trim() ? "" : String(Number(net.toFixed(2)));
    setForm((f) => {
      if (String(f.profit) === next) return f;
      return { ...f, profit: next };
    });
  }, [modalOpen, form.cost, form.price, form.profit_sharing]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      listAbortRef.current?.abort();
    };
  }, []);

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
      if (v) url.searchParams.set(k, "1");
      else url.searchParams.delete(k);
    });
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, search, dateFrom, dateTo, showAll, showInactive, showOfficial, showEInvoice, showBlock]);

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
      if (showAll) url.searchParams.set("showAll", "1");
      if (showInactive) url.searchParams.set("showInactive", "1");
      if (showOfficial) url.searchParams.set("showOfficial", "1");
      if (showEInvoice) url.searchParams.set("showEInvoice", "1");
      if (showBlock) url.searchParams.set("showBlock", "1");
      const res = await fetch(url.toString(), { credentials: "include", signal: ac.signal });
      const json = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok || !json.success) return notify(json.message || json.error || "Failed to load bank processes", "danger");
      setRows(normalizeRows(json.data));
      setSelectedIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      if (ac.signal.aborted) return;
      notify("Failed to load bank processes", "danger");
    } finally {
      if (!ac.signal.aborted) setTableLoading(false);
    }
  }, [companyId, search, showAll, showInactive, showOfficial, showEInvoice, showBlock, notify, syncUrl]);

  useEffect(() => {
    if (!companyId || loading) return;
    const t = window.setTimeout(() => {
      void fetchRows();
    }, 180);
    return () => window.clearTimeout(t);
  }, [companyId, loading, search, showAll, showInactive, showOfficial, showEInvoice, showBlock, fetchRows, dateFrom, dateTo]);

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
    } catch {
      setAccountingRows([]);
    } finally {
      setAccountingLoading(false);
    }
  }, [companyId]);

  const resetForm = () => {
    setForm({
      id: "",
      country: "",
      bank: "",
      type: "",
      name: "",
      card_merchant_id: "",
      customer_id: "",
      profit_account_id: "",
      contract: "",
      insurance: "",
      cost: "",
      price: "",
      profit: "",
      profit_sharing: "",
      day_start: "",
      day_end: "",
      day_start_frequency: "1st_of_every_month",
      status: "active",
      remark: "",
      sop: "",
    });
  };

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Switch company failed", "danger");
      setCompanyId(Number(c.id));
      const bankCategory = await isBankCategoryCompany(c.company_id);
      if (!bankCategory) {
        window.location.assign(new URL(`/process-list?company_id=${c.id}`, window.location.origin).toString());
      }
      if (accountingOpen) void loadAccountingInbox();
    } catch {
      notify("Switch company failed", "danger");
    }
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

  const toggleCountryChipSelection = (c) => {
    setSelectedCountryChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const toggleBankChipSelection = (b) => {
    setSelectedBankChips((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  };

  const submitNewCountry = async (e) => {
    e.preventDefault();
    const name = String(newCountryName || "").trim().toUpperCase();
    if (!name || !companyId) return;
    try {
      const fd = new FormData();
      fd.append("company_id", String(companyId));
      fd.append("country", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=add_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Add country failed", "danger");
      setCountriesList((prev) => [...new Set([...prev, name])].sort());
      setSelectedCountryChips((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setNewCountryName("");
      notify("Country added");
    } catch {
      notify("Add country failed", "danger");
    }
  };

  const submitNewBank = async (e) => {
    e.preventDefault();
    const name = String(newBankName || "").trim().toUpperCase();
    if (!name || !companyId || !form.country) return;
    try {
      const fd = new FormData();
      fd.append("company_id", String(companyId));
      fd.append("country", String(form.country));
      fd.append("banks[]", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_country_banks"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Add bank failed", "danger");
      setBanksList((prev) => [...new Set([...prev, name])].sort());
      setSelectedBankChips((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setNewBankName("");
      notify("Bank added");
    } catch {
      notify("Add bank failed", "danger");
    }
  };

  const openProfitShareModal = () => {
    const rows = parseProfitSharingToRows(form.profit_sharing, accounts);
    setProfitShareRows(rows.length ? rows : [{ accountId: "", accountLabel: "", amount: "" }]);
    setProfitShareModalOpen(true);
  };

  const addProfitShareRow = () => {
    setProfitShareRows((prev) => [...prev, { accountId: "", accountLabel: "", amount: "" }]);
  };

  const removeProfitShareRow = (idx) => {
    setProfitShareRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirmProfitShareModal = () => {
    const s = serializeProfitSharingRows(profitShareRows, accounts);
    setForm((f) => ({ ...f, profit_sharing: s }));
    setProfitShareModalOpen(false);
  };

  const openBankFormNoteModal = (kind) => {
    setBankFormNote({ kind, draft: kind === "sop" ? String(form.sop || "") : String(form.remark || "") });
  };

  const saveBankFormNoteModal = () => {
    if (!bankFormNote) return;
    const { kind, draft } = bankFormNote;
    if (kind === "sop") setForm((f) => ({ ...f, sop: draft }));
    else setForm((f) => ({ ...f, remark: draft }));
    setBankFormNote(null);
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
    if (!companyId) {
      notify("Missing company context.", "danger");
      return;
    }
    try {
      const [editRes, curRes] = await Promise.all([
        fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" }),
        fetch(buildApiUrl("api/accounts/account_currency_api.php?action=get_available_currencies"), { credentials: "include" }),
      ]);
      const editJson = await editRes.json();
      const curJson = await curRes.json();
      setRolesList(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);
      if (Array.isArray(curJson?.data)) {
        setAccountModalCurrencies(curJson.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
      } else {
        setAccountModalCurrencies([]);
      }
    } catch {
      setRolesList([]);
      setAccountModalCurrencies([]);
    }
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
      if (!res.ok || !json.success || !json.data) return notify(json.message || json.error || "Failed to load bank process", "danger");
      const d = json.data;
      setEditMode(true);
      setForm({
        id: String(d.id || ""),
        country: d.country || "",
        bank: d.bank || "",
        type: d.type || "",
        name: d.name || "",
        card_merchant_id: d.card_merchant_id ? String(d.card_merchant_id) : "",
        customer_id: d.customer_id ? String(d.customer_id) : "",
        profit_account_id: d.profit_account_id ? String(d.profit_account_id) : "",
        contract: d.contract || "",
        insurance: d.insurance ?? "",
        cost: d.cost ?? "",
        price: d.price ?? "",
        profit: d.profit ?? "",
        profit_sharing: d.profit_sharing || "",
        day_start: d.day_start ? String(d.day_start).slice(0, 10) : "",
        day_end: d.day_end ? String(d.day_end).slice(0, 10) : "",
        day_start_frequency: d.day_start_frequency || "1st_of_every_month",
        status: d.status || "active",
        remark: d.remark || "",
        sop: d.sop || "",
      });
      setModalOpen(true);
    } catch {
      notify("Failed to load bank process", "danger");
    }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === "id" && !editMode) return;
      fd.append(k, v ?? "");
    });
    if (companyId) fd.append("company_id", String(companyId));
    fd.append("permission", "Bank");
    try {
      const endpoint = editMode ? "api/processes/processlist_api.php?action=update_process" : "api/processes/addprocess_api.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Save failed", "danger");
      notify(editMode ? "Bank process updated" : "Bank process added");
      notifyTransactionDataChanged("bank-process-list-react");
      setModalOpen(false);
      fetchRows();
    } catch {
      notify("Save failed", "danger");
    }
  };

  const postAccountingToTransaction = async () => {
    const selected = accountingRows.filter((r) => accountingSelected.has(Number(r.id)) && !r.already_posted_today);
    if (selected.length === 0) return notify("Please select at least one due item", "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        const periodType = r.is_manual_inactive ? "manual_inactive" : (r.is_resend_consolidated_range ? "resend_consolidated_range" : (r.is_partial_first_month ? "partial_first_month" : (r.is_day_end_tail ? "day_end_tail" : "monthly")));
        fd.append("ids[]", r.id);
        fd.append("period_types[]", periodType);
        fd.append("billing_months[]", r.monthly_billing_month || "");
      });
      fd.append("allow_future_monthly", "1");
      const res = await fetch(buildApiUrl("api/processes/process_post_to_transaction_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Transaction post failed", "danger");
      notify(json.message || "Posted to transaction");
      notifyTransactionDataChanged("bank-process-list-react");
      loadAccountingInbox();
      fetchRows();
    } catch {
      notify("Transaction post failed", "danger");
    }
  };

  const dismissAccountingRows = async () => {
    const selected = accountingRows.filter((r) => accountingDeleteSelected.has(Number(r.id)));
    if (selected.length === 0) return notify("Please tick rows in Delete column", "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        const periodType = r.is_manual_inactive ? "manual_inactive" : (r.is_resend_consolidated_range ? "resend_consolidated_range" : (r.is_partial_first_month ? "partial_first_month" : (r.is_day_end_tail ? "day_end_tail" : "monthly")));
        fd.append("ids[]", r.id);
        fd.append("period_types[]", periodType);
        fd.append("billing_months[]", r.monthly_billing_month || "");
      });
      const res = await fetch(buildApiUrl("api/processes/dismiss_accounting_due_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Delete from due failed", "danger");
      notify(json.message || "Removed from Accounting Due");
      notifyTransactionDataChanged("bank-process-list-react");
      loadAccountingInbox();
      fetchRows();
    } catch {
      notify("Delete from due failed", "danger");
    }
  };

  const openRemarkModal = (row) => {
    setRemarkRow(row);
    setRemarkDraft(String(row.remark || ""));
    setRemarkModalOpen(true);
  };

  const saveRemarkModal = async () => {
    if (!remarkRow) return;
    try {
      const fd = new FormData();
      fd.append("id", String(remarkRow.id));
      fd.append("remark", remarkDraft);
      const res = await fetch(buildApiUrl("api/processes/update_bank_remark_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Remark update failed", "danger");
      setRows((prev) => prev.map((r) => (Number(r.id) === Number(remarkRow.id) ? { ...r, remark: remarkDraft } : r)));
      notifyTransactionDataChanged("bank-process-list-react");
      notify("Remark updated");
      setRemarkModalOpen(false);
      setRemarkRow(null);
    } catch {
      notify("Remark update failed", "danger");
    }
  };

  const openResendModal = (row) => {
    setResendInlineError("");
    setResendTarget(row);
    setResendDayStart(String(row.day_start || row.date || "").slice(0, 10));
    setResendDayEnd("");
    setResendFrequency("1st_of_every_month");
    setResendModalOpen(true);
  };

  const resendAccountingDue = async () => {
    if (!resendTarget) return;
    setResendInlineError("");
    try {
      const res = await fetch(buildApiUrl("api/bankprocess_maintenance/resend_accounting_due_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bank_process_id: Number(resendTarget.id),
          day_start: resendDayStart || null,
          day_end: resendDayEnd || null,
          day_start_frequency: resendFrequency || "1st_of_every_month",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json.message || json.error || "Resend failed";
        if (isBankResendDayStartBackendErrorMessage(msg)) setResendInlineError(msg);
        return notify(msg, "danger");
      }
      notify(json.message || "Resend successful");
      notifyTransactionDataChanged("bank-process-list-react");
      if (accountingOpen) loadAccountingInbox();
      setResendModalOpen(false);
      setResendTarget(null);
    } catch {
      notify("Resend failed", "danger");
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.size || !window.confirm("Delete selected inactive bank processes?")) return;
    try {
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Bank" }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Delete failed", "danger");
      notify("Deleted successfully");
      notifyTransactionDataChanged("bank-process-list-react");
      fetchRows();
    } catch {
      notify("Delete failed", "danger");
    }
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
    if (!dateFrom && !dateTo) return supplierSortedRows;
    const fromMs = dateFrom ? parseRowDateMs(dateFrom) : null;
    const toMs = dateTo ? parseRowDateMs(dateTo) : null;
    const toEnd = toMs != null ? toMs + 86400000 - 1 : null;
    return supplierSortedRows.filter((r) => {
      const ts = parseRowDateMs(r.date || r.day_start);
      if (ts == null) return false;
      if (fromMs !== null && ts < fromMs) return false;
      if (toEnd !== null && ts > toEnd) return false;
      return true;
    });
  }, [supplierSortedRows, dateFrom, dateTo]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE)), [visibleRows]);
  const pageRows = useMemo(() => {
    if (showAll) return visibleRows;
    const p = Math.min(currentPage, totalPages);
    return visibleRows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [visibleRows, showAll, currentPage, totalPages]);

  const bankHeaders = useMemo(
    () => [
    { key: "no", label: "No" },
    {
      key: "supplier",
      label: (
        <span className="bank-header-sortable" onClick={() => setSupplierSortDir((d) => (d === "asc" ? "desc" : "asc"))} role="presentation">
          Supplier <span className="bank-sort-indicator">{supplierSortDir === "asc" ? "▲" : "▼"}</span>
        </span>
      ),
    },
    { key: "ccy", label: "Country (Currency)" },
    { key: "bank", label: "Bank" },
    { key: "types", label: "Types" },
    { key: "owner", label: "Card Owner" },
    { key: "contract", label: "Contract" },
    { key: "insurance", label: "Insurance" },
    { key: "customer", label: "Customer" },
    { key: "cost", label: "Cost" },
    { key: "price", label: "Price" },
    { key: "profit", label: "Profit" },
    { key: "status", label: "Status" },
    { key: "date", label: "Date" },
    { key: "action", label: "Action" },
    ],
    [supplierSortDir]
  );

  if (loading || !cssReady) return null;

  return (
    <div className="container">
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
          <h1 className="page-title" style={{ margin: 0 }}>Bank Process List</h1>
          <div className="process-accounting-inbox-wrap">
            <button
              type="button"
              className="process-accounting-inbox-btn process-accounting-inbox-main"
              onClick={() => {
                setAccountingOpen(true);
                void loadAccountingInbox();
              }}
            >
              <svg className="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              Accounting Due
              <span className="process-accounting-inbox-badge">{accountingRows.filter((x) => !x.already_posted_today).length}</span>
            </button>
          </div>
        </div>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" onClick={openAdd}>Add Process</button>
              <div className="process-list-date-filter" id="processListDateFilter" style={{ display: "inline-flex" }}>
                <div className="date-range-picker" id="date-range-picker">
                  <i className="fas fa-calendar-alt" aria-hidden="true" />
                  <span id="date-range-display">Select date range</span>
                  <button type="button" className="process-list-date-clear" id="processListDateClearBtn" title="Clear date range" aria-label="Clear date range" style={{ display: "none" }}>
                    &times;
                  </button>
                </div>
                <input type="hidden" id="date_from" defaultValue="" />
                <input type="hidden" id="date_to" defaultValue="" />
              </div>
              <div className="search-container">
                <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input type="text" className="search-input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="checkbox-section"><input type="checkbox" id="showAll" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /><label htmlFor="showAll">Show All</label></div>
              <div className="checkbox-section"><input type="checkbox" id="showInactive" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /><label htmlFor="showInactive">Show Inactive</label></div>
              <div className="checkbox-section"><input type="checkbox" id="showOfficial" checked={showOfficial} onChange={(e) => setShowOfficial(e.target.checked)} /><label htmlFor="showOfficial">Show Official</label></div>
              <div className="checkbox-section"><input type="checkbox" id="showEInvoice" checked={showEInvoice} onChange={(e) => setShowEInvoice(e.target.checked)} /><label htmlFor="showEInvoice">Show E-Invoice</label></div>
              <div className="checkbox-section"><input type="checkbox" id="showBlock" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} /><label htmlFor="showBlock">Show Block</label></div>
            </div>
            <button type="button" className="btn btn-delete" id="processDeleteSelectedBtn" disabled={!selectedIds.size} title="Only inactive processes can be deleted" onClick={deleteSelected}>Delete</button>
          </div>

          {groupIds.length > 0 && <div className="process-company-filter"><span className="process-company-label">GroupID:</span><div className="process-company-buttons">{groupIds.map((g) => <button key={g} type="button" className={`process-company-btn ${selectedGroup === g ? "active" : ""}`} onClick={() => setSelectedGroup(g)}>{g}</button>)}</div></div>}
          <div className="process-company-filter"><span className="process-company-label">Company:</span><div className="process-company-buttons">{companyButtons.map((c) => <button key={c.id} type="button" className={`process-company-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`} onClick={() => onSwitchCompany(c)}>{c.company_id}</button>)}</div></div>
        </div>

        <div className="process-table-wrapper">
          <div className="table-header" style={{ gridTemplateColumns: BANK_GRID_TEMPLATE_COLUMNS }}>
            {bankHeaders.map((h) => (
              <div key={h.key} className={`header-item bank-header${h.key === "action" ? " bank-action-header" : ""}`}>
                {h.label}
              </div>
            ))}
          </div>
          <div className="process-cards">
            {tableLoading && <div className="process-card"><div className="card-item">Loading...</div></div>}
            {!tableLoading && pageRows.map((r, i) => (
              <div key={r.id} className="process-card" style={{ gridTemplateColumns: BANK_GRID_TEMPLATE_COLUMNS }}>
                <div className="card-item">{(showAll ? i : (currentPage - 1) * PAGE_SIZE + i) + 1}</div>
                <div className="card-item">{r.supplier || "-"}</div>
                <div className="card-item">{r.country || "-"}</div>
                <div className="card-item">{r.bank || "-"}</div>
                <div className="card-item">{r.type || "-"}</div>
                <div className="card-item">{r.card_lower || "-"}</div>
                <div className="card-item">{r.contract || "-"}</div>
                <div className="card-item">{r.insurance || "-"}</div>
                <div className="card-item">{r.customer || "-"}</div>
                <div className="card-item">{r.cost || "-"}</div>
                <div className="card-item">{r.price || "-"}</div>
                <div className="card-item">{r.profit || "-"}</div>
                <div className="card-item">
                  <BankProcessStatusControl
                    row={r}
                    notify={notify}
                    buildApiUrl={buildApiUrl}
                    onUpdated={() => {
                      notifyTransactionDataChanged("bank-process-list-react");
                      void fetchRows();
                    }}
                  />
                </div>
                <div className="card-item">{r.date || "-"}</div>
                <div className="card-item">
                  <span className="bank-action-tools">
                    <button type="button" className="edit-btn" aria-label="Edit" title="Edit" onClick={() => openEdit(r.id)}><img src={assetUrl("images/edit.svg")} alt="Edit" /></button>
                    <button type="button" className="edit-btn remark-action-btn" aria-label="Remark" title="Remark" onClick={() => openRemarkModal(r)} style={{ marginLeft: 6 }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 14, height: 14 }}>
                        <path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {canShowBankResend(r) ? (
                      <button type="button" className="bank-resend-btn" aria-label="Resend to Accounting Due" title="Resend" onClick={() => openResendModal(r)} style={{ marginLeft: 6 }}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 16, height: 16 }}>
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : null}
                  </span>
                  {String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions ? (
                    <input type="checkbox" className="row-checkbox bank-checkbox" style={{ marginLeft: 10 }} checked={selectedIds.has(r.id)} title="Select for deletion" onChange={() => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        {!showAll && <div className="pagination-container"><button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button><span className="pagination-info">{currentPage} of {totalPages}</span><button type="button" className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button></div>}
      </div>
      {modalOpen && (
        <div id="addBankModal" className="modal bank-modal" style={{ display: "block" }}>
          <div className="modal-content bank-modal-content">
            <div className="modal-header">
              <h2 id="bankModalTitle">{editMode ? "Edit Process" : "Add Process"}</h2>
              <span className="close" onClick={() => setModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <form id="addBankProcessForm" className="process-form bank-form" onSubmit={submitForm}>
                <input type="hidden" name="id" value={form.id} />
                <div className="bank-form-fields-scroll">
                  <div className="bank-form-row">
                    <div className="bank-form-cell bank-form-cell-left">
                      <h3 className="bank-section-title">Bank Information</h3>
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_country">Country (Currency)</label>
                          <div className="select-with-add">
                            {editMode ? (
                              <input id="bank_country" readOnly className="bank-input" value={form.country} />
                            ) : (
                              <select
                                id="bank_country"
                                name="country"
                                className="bank-select"
                                value={form.country}
                                required
                                onChange={(ev) => setForm((prev) => ({ ...prev, country: ev.target.value, bank: "" }))}
                              >
                                <option value="">Select Country</option>
                                {countriesList.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            )}
                            {!editMode ? (
                              <button
                                type="button"
                                className="bank-add-btn"
                                title="Add New Country"
                                onClick={() => {
                                  setSelectedCountryChips(form.country ? [form.country] : []);
                                  setCountrySearch("");
                                  setNewCountryName("");
                                  setCountryModalOpen(true);
                                }}
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_bank">Bank</label>
                          <div className="select-with-add">
                            {editMode ? (
                              <input id="bank_bank" readOnly className="bank-input" value={form.bank} />
                            ) : (
                              <select
                                id="bank_bank"
                                name="bank"
                                className="bank-select"
                                value={form.bank}
                                required
                                disabled={!form.country}
                                onChange={(ev) => setForm((prev) => ({ ...prev, bank: ev.target.value }))}
                              >
                                <option value="">Select Bank</option>
                                {banksList.map((b) => (
                                  <option key={b} value={b}>{b}</option>
                                ))}
                              </select>
                            )}
                            {!editMode ? (
                              <button
                                type="button"
                                className="bank-add-btn"
                                title="Add New Bank"
                                disabled={!form.country}
                                onClick={() => {
                                  setSelectedBankChips(form.bank ? [form.bank] : []);
                                  setBankSearch("");
                                  setNewBankName("");
                                  setBankModalOpen(true);
                                }}
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <h3 className="bank-section-title">Detail</h3>
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_card_merchant">Supplier</label>
                          <div className="account-select-with-buttons">
                            <BankSearchableAccountPick
                              value={form.card_merchant_id}
                              onChange={(id) => setForm((prev) => ({ ...prev, card_merchant_id: id }))}
                              accounts={accounts}
                              disabled={false}
                            />
                            <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => openAddAccountForField("card_merchant_id")}>+</button>
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_cost">Buy Price</label>
                          <input
                            id="bank_cost"
                            name="cost"
                            type="text"
                            className="bank-input"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Enter amount"
                            value={form.cost}
                            onChange={(ev) => setForm((prev) => ({ ...prev, cost: ev.target.value }))}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bank-form-row">
                    <div className="bank-form-cell bank-form-cell-left">
                      <div className="form-row bank-row-two-cols bank-row-type-name">
                        <div className="form-group">
                          <label htmlFor="bank_type">Type</label>
                          {editMode ? (
                            <input id="bank_type" readOnly className="bank-input" value={form.type} />
                          ) : (
                            <select id="bank_type" name="type" className="bank-select" value={form.type} required onChange={(ev) => setForm((prev) => ({ ...prev, type: ev.target.value }))}>
                              <option value="">Select Type</option>
                              <option value="PERSONAL">PERSONAL</option>
                              <option value="ENTERPRISE">ENTERPRISE</option>
                              <option value="BUSINESS">BUSINESS</option>
                            </select>
                          )}
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_name">Card Owner</label>
                          <input
                            id="bank_name"
                            name="name"
                            type="text"
                            className="bank-input"
                            placeholder="Enter Card Owner"
                            value={form.name}
                            readOnly={editMode}
                            required={!editMode}
                            onChange={(ev) => setForm((prev) => ({ ...prev, name: String(ev.target.value).toUpperCase() }))}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_customer">Customer</label>
                          <div className="account-select-with-buttons">
                            <BankSearchableAccountPick
                              value={form.customer_id}
                              onChange={(id) => setForm((prev) => ({ ...prev, customer_id: id }))}
                              accounts={accounts}
                              disabled={false}
                            />
                            <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => openAddAccountForField("customer_id")}>+</button>
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_price">Sell Price</label>
                          <input
                            id="bank_price"
                            name="price"
                            type="text"
                            className="bank-input"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Enter amount"
                            value={form.price}
                            onChange={(ev) => setForm((prev) => ({ ...prev, price: ev.target.value }))}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bank-form-row">
                    <div className="bank-form-cell bank-form-cell-left">
                      <div className="form-row bank-day-start-row">
                        <div className="form-group bank-day-start-input-wrap">
                          <label htmlFor="bank_day_start">Day start</label>
                          <input id="bank_day_start" name="day_start" type="date" className="bank-input" value={form.day_start} onChange={(ev) => setForm((prev) => ({ ...prev, day_start: ev.target.value }))} />
                        </div>
                        <div className="form-group bank-day-end-input-wrap">
                          <label htmlFor="bank_day_end">Day end</label>
                          <input id="bank_day_end" name="day_end" type="date" className="bank-input" value={form.day_end} onChange={(ev) => setForm((prev) => ({ ...prev, day_end: ev.target.value }))} />
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_profit_account">Company</label>
                          <div className="account-select-with-buttons">
                            <BankSearchableAccountPick
                              value={form.profit_account_id}
                              onChange={(id) => setForm((prev) => ({ ...prev, profit_account_id: id }))}
                              accounts={accounts}
                              disabled={false}
                            />
                            <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => openAddAccountForField("profit_account_id")}>+</button>
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_profit">Profit</label>
                          <input id="bank_profit" name="profit" type="number" className="bank-input" placeholder="Auto calculated" readOnly style={{ backgroundColor: "#f5f5f5" }} value={form.profit} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bank-form-row bank-form-row-last">
                    <div className="bank-form-cell bank-form-cell-left">
                      <div className="form-group bank-day-start-frequency-wrap" style={{ marginBottom: 20 }}>
                        <label htmlFor="bank_day_start_frequency">Frequency</label>
                        <select id="bank_day_start_frequency" name="day_start_frequency" className="bank-input bank-select" value={form.day_start_frequency} onChange={(ev) => setForm((prev) => ({ ...prev, day_start_frequency: ev.target.value }))}>
                          <option value="1st_of_every_month">1st of Every Month</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <input type="hidden" name="profit_sharing" value={form.profit_sharing} />
                      <div className="bank-profit-sharing-container form-group">
                        <div className="bank-profit-sharing-header">
                          <h3>Selected Profit Sharing</h3>
                          <button type="button" className="bank-add-btn" title="Add Profit Sharing" onClick={openProfitShareModal}>+</button>
                        </div>
                        <div className="bank-profit-sharing-list" id="selectedProfitSharingList">
                          {parseProfitSharingToRows(form.profit_sharing, accounts).length === 0 ? (
                            <div className="no-profit-sharing"><p>No profit sharing selected</p></div>
                          ) : (
                            parseProfitSharingToRows(form.profit_sharing, accounts).map((row, idx) => (
                              <div key={`${row.accountLabel}-${idx}`} className="bank-profit-sharing-item" style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                                <span>{row.accountLabel}</span>
                                {" — "}
                                <span>{row.amount}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="bank-form-cell bank-form-cell-right">
                      <div className="form-row bank-row-two-cols">
                        <div className="form-group">
                          <label htmlFor="bank_contract">Contract</label>
                          <select id="bank_contract" name="contract" className="bank-select" value={form.contract} onChange={(ev) => setForm((prev) => ({ ...prev, contract: ev.target.value }))} required>
                            <option value="">Select Contract</option>
                            <option value="1 MONTH">1 MONTH</option>
                            <option value="2 MONTHS">2 MONTHS</option>
                            <option value="3 MONTHS">3 MONTHS</option>
                            <option value="6 MONTHS">6 MONTHS</option>
                            <option value="1+1">1+1 MONTH</option>
                            <option value="1+2">1+2 MONTHS</option>
                            <option value="1+3">1+3 MONTHS</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="bank_insurance">Insurance</label>
                          <input id="bank_insurance" name="insurance" type="text" className="bank-input" inputMode="decimal" autoComplete="off" placeholder="Enter amount" value={form.insurance} onChange={(ev) => setForm((prev) => ({ ...prev, insurance: ev.target.value }))} />
                        </div>
                      </div>
                      <div className="form-group bank-remark-wrap" style={{ marginTop: 12 }}>
                        <div className="bank-remark-actions">
                          <button type="button" id="bank_sop_btn" className="btn btn-save" onClick={() => openBankFormNoteModal("sop")}>SOP</button>
                          <button type="button" id="bank_remark_btn" className="btn btn-save" onClick={() => openBankFormNoteModal("remark")}>Remark</button>
                        </div>
                        {(form.sop || form.remark) ? (
                          <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>{[form.sop && "SOP filled", form.remark && "Remark filled"].filter(Boolean).join(" · ")}</p>
                        ) : null}
                      </div>
                      {editMode ? (
                        <div className="form-group" style={{ marginTop: 12 }}>
                          <label htmlFor="bank_status_edit">Status</label>
                          <select id="bank_status_edit" value={form.status} onChange={(ev) => setForm((prev) => ({ ...prev, status: ev.target.value }))}>
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="form-actions bank-actions">
                  <button type="submit" className="btn btn-save" id="bankSubmitBtn">{editMode ? "Update Process" : "Add Process"}</button>
                  <button type="button" className="btn btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {countryModalOpen && (
        <div id="countrySelectionModal" className="modal" style={{ display: "block" }}>
          <div className="modal-content country-selection-modal">
            <div className="modal-header">
              <h2>Select or Add Country</h2>
              <span className="close" onClick={() => setCountryModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <div className="country-selection-container">
                <div className="available-countries-section">
                  <div className="add-country-bar">
                    <h3>Add New Country</h3>
                    <form className="add-country-form" onSubmit={submitNewCountry}>
                      <div className="add-country-input-group">
                        <input type="text" id="new_country_name" placeholder="Enter new country name..." value={newCountryName} onChange={(e) => setNewCountryName(e.target.value.toUpperCase())} />
                        <button type="submit" className="btn btn-save">Add</button>
                      </div>
                    </form>
                  </div>
                  <h3>Available Countries</h3>
                  <div className="country-search">
                    <input type="text" id="countrySearch" placeholder="Search countries..." value={countrySearch} onChange={(e) => setCountrySearch(e.target.value.toUpperCase())} />
                  </div>
                  <div className="country-list" id="existingCountries">
                    {[...new Set([...(countriesList || []), ...selectedCountryChips])]
                      .filter((c) => !countrySearch.trim() || c.toUpperCase().includes(countrySearch.trim()))
                      .map((c) => (
                      <div
                        key={c}
                        className="country-item"
                        role="presentation"
                        onClick={() => setSelectedCountryChips((prev) => (prev.includes(c) ? prev : [...prev, c]))}
                      >
                        <div className="country-item-left">
                          <span>{c}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="selected-countries-section">
                  <h3>Selected Countries</h3>
                  <div className="selected-countries-list" id="selectedCountriesInModal">
                    {selectedCountryChips.length === 0 ? (
                      <div className="no-countries">None</div>
                    ) : (
                      selectedCountryChips.map((c) => (
                        <div key={`sel-${c}`} className="selected-country-modal-item">
                          <span>{c}</span>
                          <button type="button" className="remove-country-modal" aria-label={`Remove ${c}`} onClick={() => setSelectedCountryChips((prev) => prev.filter((x) => x !== c))}>
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-save"
                  id="confirmCountriesBtn"
                  onClick={() => {
                    if (selectedCountryChips.length !== 1) {
                      notify("Select exactly one country on the right (add from the list or remove extras with ×).", "warning");
                      return;
                    }
                    setForm((f) => ({ ...f, country: selectedCountryChips[0], bank: "" }));
                    setCountryModalOpen(false);
                  }}
                >
                  Confirm
                </button>
                <button type="button" className="btn btn-cancel" onClick={() => setCountryModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {bankModalOpen && (
        <div id="bankSelectionModal" className="modal" style={{ display: "block" }}>
          <div className="modal-content bank-selection-modal">
            <div className="modal-header">
              <h2>Select or Add Bank</h2>
              <span className="close" onClick={() => setBankModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <div className="bank-selection-container">
                <div className="available-banks-section">
                  <div className="add-bank-bar">
                    <h3>Add New Bank</h3>
                    <form className="add-bank-form" onSubmit={submitNewBank}>
                      <div className="add-bank-input-group">
                        <input type="text" id="new_bank_name" placeholder="Enter new bank name..." value={newBankName} onChange={(e) => setNewBankName(e.target.value.toUpperCase())} />
                        <button type="submit" className="btn btn-save">Add</button>
                      </div>
                    </form>
                  </div>
                  <h3>Available Banks</h3>
                  <div className="bank-search">
                    <input type="text" id="bankSearch" placeholder="Search banks..." value={bankSearch} onChange={(e) => setBankSearch(e.target.value.toUpperCase())} />
                  </div>
                  <div className="bank-list" id="existingBanks">
                    {banksList.filter((b) => !bankSearch.trim() || b.toUpperCase().includes(bankSearch.trim())).map((b) => (
                      <div
                        key={b}
                        className={`country-item${selectedBankChips.includes(b) ? " selected" : ""}`}
                        role="presentation"
                        onClick={() => toggleBankChipSelection(b)}
                      >
                        <div className="country-item-left">
                          <span>{b}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="selected-banks-section">
                  <h3>Selected Banks</h3>
                  <div className="selected-banks-list" id="selectedBanksInModal">
                    {selectedBankChips.length === 0 ? (
                      <div className="no-countries">None</div>
                    ) : (
                      selectedBankChips.map((b) => (
                        <div key={`sel-b-${b}`} className="selected-country-modal-item">
                          <span>{b}</span>
                          <button type="button" className="remove-country-modal" aria-label={`Remove ${b}`} onClick={() => setSelectedBankChips((prev) => prev.filter((x) => x !== b))}>
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-save"
                  id="confirmBanksBtn"
                  onClick={() => {
                    if (selectedBankChips.length !== 1) {
                      notify("Select exactly one bank on the right (add from the list or remove extras with ×).", "warning");
                      return;
                    }
                    setForm((f) => ({ ...f, bank: selectedBankChips[0] }));
                    setBankModalOpen(false);
                  }}
                >
                  Confirm
                </button>
                <button type="button" className="btn btn-cancel" onClick={() => setBankModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {profitShareModalOpen && (
        <div id="profitSharingModal" className="modal" style={{ display: "block" }}>
          <div className="modal-content" style={{ maxWidth: "628px" }}>
            <div className="modal-header">
              <h2>Add Profit Sharing</h2>
              <span className="close" onClick={() => setProfitShareModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <div className="bank-form" style={{ display: "block" }}>
                <div id="profitSharingRowsContainer">
                  {profitShareRows.map((row, idx) => (
                    <div key={`ps-${idx}`} className="form-row bank-row-two-cols profit-sharing-row" style={{ alignItems: "flex-end", gap: 8 }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Account</label>
                        <div className="account-select-with-buttons">
                          <BankSearchableAccountPick
                            value={row.accountId}
                            onChange={(id) => {
                              const acc = accounts.find((a) => String(a.id) === String(id));
                              setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, accountId: id, accountLabel: acc?.account_id || "" } : r)));
                            }}
                            accounts={accounts}
                            disabled={false}
                          />
                          <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => openAddAccountForField({ type: "profitRow", index: idx })}>+</button>
                        </div>
                      </div>
                      <div className="form-group" style={{ width: 120 }}>
                        <label>Amount</label>
                        <input type="number" className="bank-input profit-sharing-amount" placeholder="Amount" step="0.01" min="0" value={row.amount} onChange={(e) => setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)))} />
                      </div>
                      <button type="button" className="btn btn-delete" style={{ marginBottom: 4 }} onClick={() => removeProfitShareRow(idx)} aria-label="Remove row">×</button>
                    </div>
                  ))}
                </div>
                <div className="profit-sharing-add-row-wrap" style={{ marginTop: 10 }}>
                  <button type="button" className="bank-add-btn" title="Add another Account & Amount" onClick={addProfitShareRow}>+</button>
                </div>
                <div className="form-actions bank-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-save" onClick={confirmProfitShareModal}>Add</button>
                  <button type="button" className="btn btn-cancel" onClick={() => setProfitShareModalOpen(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {bankFormNote && (
        <div id="sopModal" className="modal bank-modal sop-modal" style={{ display: "block" }}>
          <div className="modal-content sop-modal-content">
            <div className="modal-header">
              <h2 id="processNoteModalTitle">{bankFormNote.kind === "sop" ? "SOP" : "Remark"}</h2>
              <span className="close" onClick={() => setBankFormNote(null)} role="presentation">&times;</span>
            </div>
            <div className="modal-body sop-modal-body">
              <textarea
                id="sop_content"
                placeholder="Enter notes for this process..."
                className="bank-input sop-modal-textarea"
                value={bankFormNote.draft}
                onChange={(e) => setBankFormNote((n) => (n ? { ...n, draft: e.target.value } : n))}
              />
              <div className="form-actions bank-actions sop-modal-actions">
                <button type="button" className="btn btn-save" onClick={saveBankFormNoteModal}>Save</button>
                <button type="button" className="btn btn-cancel" onClick={() => setBankFormNote(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <AccountAddModalSameAsList
        open={addAccountModalOpen}
        onClose={() => {
          setAddAccountModalOpen(false);
          setAccountPlusTarget(null);
        }}
        companyId={companyId}
        companies={companies}
        roles={rolesList}
        currencies={accountModalCurrencies}
        setCurrencies={setAccountModalCurrencies}
        notify={notify}
        onSuccess={(data) => void handleAccountModalSuccess(data)}
      />
      {accountingOpen && (
        <div id="processAccountingDueModal" className="modal" style={{ display: "block" }}>
          <div className="modal-content" style={{ maxWidth: "980px" }}>
            <div className="modal-header">
              <h2>Accounting Due</h2>
              <span className="close" onClick={() => setAccountingOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <button type="button" className="btn btn-save" onClick={postAccountingToTransaction} disabled={accountingLoading || accountingSelected.size === 0}>Transaction ({accountingSelected.size})</button>
                <button type="button" className="btn btn-delete" onClick={dismissAccountingRows} disabled={accountingLoading || accountingDeleteSelected.size === 0}>Delete ({accountingDeleteSelected.size})</button>
              </div>
              <div style={{ maxHeight: "420px", overflow: "auto" }}>
                <table style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th />
                      <th>No</th>
                      <th>Day Start</th>
                      <th>Process</th>
                      <th>Bank</th>
                      <th>Contract</th>
                      <th>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountingLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                    {!accountingLoading && accountingRows.length === 0 && <tr><td colSpan={7}>No processes due for accounting today.</td></tr>}
                    {!accountingLoading && accountingRows.map((r, idx) => {
                      const id = Number(r.id);
                      const checked = accountingSelected.has(id);
                      const delChecked = accountingDeleteSelected.has(id);
                      return (
                        <tr key={`${id}-${idx}`}>
                          <td><input type="checkbox" disabled={!!r.already_posted_today} checked={checked && !r.already_posted_today} onChange={(e) => setAccountingSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(id); else n.delete(id); return n; })} /></td>
                          <td>{idx + 1}</td>
                          <td>{r.day_start || r.start_date || "-"}</td>
                          <td>{r.name || r.bank || "-"}</td>
                          <td>{r.bank || "-"}</td>
                          <td>{r.contract || "-"}</td>
                          <td><input type="checkbox" checked={delChecked} onChange={(e) => setAccountingDeleteSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(id); else n.delete(id); return n; })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {resendModalOpen && (
        <div id="confirmBankResendModal" className="process-modal process-modal--bank-resend" style={{ display: "block" }}>
          <div className="process-confirm-modal-content bank-resend-modal-content">
            <div className="bank-resend-modal-hero">
              <div className="process-confirm-icon-container bank-resend-modal-icon-wrap">
                <svg className="process-confirm-icon process-confirm-icon--resend" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3v5h5" />
                </svg>
              </div>
              <h2 className="process-confirm-title bank-resend-modal-title">Resend to Accounting Due</h2>
              <p className="process-confirm-message bank-resend-modal-message">
                Process: <b>{resendTarget?.supplier || resendTarget?.bank || "-"}</b>
              </p>
            </div>
            <div id="confirmBankResendScheduleFields" className="bank-resend-schedule-card">
              <div className="bank-resend-schedule-card__head">
                <span className="bank-resend-schedule-card__label">Billing schedule</span>
                <p className="bank-resend-schedule-card__hint">
                  These values apply only to this Resend (which month to reopen). They are not saved to the process record; Edit Process keeps its own billing until you click Update Process.
                </p>
              </div>
              <div className="bank-resend-schedule-grid">
                <div className="bank-resend-field">
                  <label className="bank-resend-field__label" htmlFor="bank_resend_day_start">Day start</label>
                  <input
                    id="bank_resend_day_start"
                    className={`bank-resend-control${resendInlineError ? " bank-resend-control--error" : ""}`}
                    type="date"
                    autoComplete="off"
                    value={resendDayStart}
                    onChange={(e) => {
                      setResendInlineError("");
                      setResendDayStart(e.target.value);
                    }}
                  />
                </div>
                <div className="bank-resend-field">
                  <label className="bank-resend-field__label" htmlFor="bank_resend_day_end">Day end</label>
                  <input id="bank_resend_day_end" className="bank-resend-control" type="date" autoComplete="off" value={resendDayEnd} onChange={(e) => setResendDayEnd(e.target.value)} />
                </div>
                <div className="bank-resend-field bank-resend-field--full">
                  <label className="bank-resend-field__label" htmlFor="bank_resend_frequency">Frequency</label>
                  <select id="bank_resend_frequency" className="bank-resend-control bank-resend-control--select" value={resendFrequency} onChange={(e) => setResendFrequency(e.target.value)}>
                    <option value="1st_of_every_month">1st of Every Month</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              {resendInlineError ? (
                <div id="bankResendDayStartInlineError" className="bank-resend-inline-alert" role="alert">
                  {resendInlineError}
                </div>
              ) : null}
            </div>
            <div className="process-confirm-actions bank-resend-modal-actions">
              <button
                type="button"
                className="process-btn process-btn-cancel confirm-cancel confirm-bank-resend-cancel"
                onClick={() => {
                  setResendInlineError("");
                  setResendModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button type="button" className="process-btn process-btn-resend confirm-bank-resend-confirm" id="confirmBankResendBtn" onClick={resendAccountingDue}>
                Resend
              </button>
            </div>
          </div>
        </div>
      )}
      {remarkModalOpen && (
        <div id="bankRemarkModal" className="modal bank-modal sop-modal" style={{ display: "block" }}>
          <div className="modal-content sop-modal-content">
            <div className="modal-header">
              <h2 id="processNoteModalTitle">Remark</h2>
              <span className="close" onClick={() => setRemarkModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body sop-modal-body">
              <textarea
                id="bank_remark_inline"
                className="bank-input sop-modal-textarea"
                placeholder="Enter notes for this process..."
                value={remarkDraft}
                onChange={(e) => setRemarkDraft(e.target.value)}
              />
              <div className="form-actions bank-actions sop-modal-actions">
                <button type="button" className="btn btn-save" onClick={() => void saveRemarkModal()}>
                  Save
                </button>
                <button type="button" className="btn btn-cancel" onClick={() => setRemarkModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
            <select id="calendar-month-select" aria-label="Month">
              <option value="0">Jan</option>
              <option value="1">Feb</option>
              <option value="2">Mar</option>
              <option value="3">Apr</option>
              <option value="4">May</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aug</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Dec</option>
            </select>
            <select id="calendar-year-select" aria-label="Year" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div>
          <div className="calendar-weekday">Mon</div>
          <div className="calendar-weekday">Tue</div>
          <div className="calendar-weekday">Wed</div>
          <div className="calendar-weekday">Thu</div>
          <div className="calendar-weekday">Fri</div>
          <div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
      {toast && <div className={`process-notification ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
