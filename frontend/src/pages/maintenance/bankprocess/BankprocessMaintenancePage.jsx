import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import BankprocessMaintenanceFilters from "./components/BankprocessMaintenanceFilters.jsx";
import BankprocessMaintenanceTable from "./components/BankprocessMaintenanceTable.jsx";
import BankprocessDeleteModal from "./components/BankprocessDeleteModal.jsx";
import {
  deleteBankprocessData,
  fetchCompanyCurrencies,
  fetchCompanyPermissions,
  formatDmy,
  searchBankprocessData,
  updateSessionCompany,
} from "./bankprocessMaintenanceLogic.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-bpm-script="${safe}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.bpmScript = safe;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

export default function BankprocessMaintenancePage() {
  const navigate = useNavigate();
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState("");
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [datePickerScriptReady, setDatePickerScriptReady] = useState(false);
  const today = useMemo(() => formatDmy(new Date()), []);
  const currentCompanyIdRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      return next.length > 2 ? next.slice(1) : next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");
    setDateFrom(today);
    setDateTo(today);

    const setup = async () => {
      const links = [
        "https://fonts.googleapis.com/css?family=Amaranth",
        "https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap",
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
        assetUrl("css/accountCSS.css"),
        assetUrl("css/global-13inch.css"),
        assetUrl("css/bankprocess_maintenance.css"),
        assetUrl("css/date-range-picker.css"),
      ];
      await Promise.all(links.map((href) => injectStylesheet(href).catch(() => null)));
      await loadScriptOnce(assetUrl("js/date-range-picker.js"));
      setDatePickerScriptReady(true);
    };

    setup().catch(() => null);
    return () => {
      document.body.classList.remove("maintenance-page");
    };
  }, [today]);

  useEffect(() => {
    if (!datePickerScriptReady || bootLoading || !me) return;
    if (!document.getElementById("date-range-picker")) return;
    if (!window?.MaintenanceDateRangePicker?.init) return;

    // Wait until current paint completes so picker nodes exist for binding.
    const timer = setTimeout(() => {
      window.MaintenanceDateRangePicker.init({
        onChange: () => {
          const nextFrom = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
          const nextTo = window.MaintenanceDateRangePicker.getDateTo?.() || "";
          setDateFrom(nextFrom);
          setDateTo(nextTo);
        },
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [datePickerScriptReady, bootLoading, me]);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, compRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = meJson.data;
        if (String(user.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
        const hasFull = userPerms.length === 0;
        const canMaintenance = hasFull || userPerms.includes("maintenance");
        if (!canMaintenance || !user.company_has_bank) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const compJson = await compRes.json();
        const compRows = Array.isArray(compJson?.data) ? compJson.data.filter((c) => c.company_id) : [];
        setMe(user);
        setCompanies(compRows);

        let initialCompanyId = user.company_id ? Number(user.company_id) : (compRows[0]?.id ? Number(compRows[0].id) : null);
        if (initialCompanyId && !compRows.some((c) => Number(c.id) === Number(initialCompanyId))) {
          initialCompanyId = compRows[0]?.id ? Number(compRows[0].id) : null;
        }
        setCompanyId(initialCompanyId);
        currentCompanyIdRef.current = initialCompanyId;
        const currentComp = compRows.find((c) => Number(c.id) === Number(initialCompanyId));
        setCompanyCode(currentComp?.company_id || "");

        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(compRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && currentComp?.group_id && String(currentComp.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (currentComp?.group_id) {
          selGroup = String(currentComp.group_id).toUpperCase().trim();
        }
        setSelectedGroup(selGroup);
        if (selGroup) {
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        } else {
          sessionStorage.removeItem("dashboard_group_filter");
        }
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (bootLoading || !companyId || !companyCode) return;
    (async () => {
      const perms = await fetchCompanyPermissions(companyCode);
      setPermissions(perms);
      const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
      if (saved && perms.includes(saved)) setSelectedPermission(saved);
      else setSelectedPermission(perms[0] || "");

      const currencyList = await fetchCompanyCurrencies(companyId).catch(() => []);
      setCurrencies(currencyList);
      setSelectedCurrency((prev) => {
        if (prev && currencyList.some((x) => x.code === prev)) return prev;
        const myr = currencyList.find((x) => x.code === "MYR");
        return myr?.code || currencyList[0]?.code || null;
      });
    })();
  }, [bootLoading, companyId, companyCode]);

  const searchData = useCallback(async (silent = false) => {
    if (!dateFrom || !dateTo) {
      if (!silent) notify("Please select date range", "error");
      return;
    }
    setLoading(true);
    try {
      const data = await searchBankprocessData({ dateFrom, dateTo, companyId, selectedCurrency, query });
      setRows(data);
      setHasSearched(true);
      setSelectedIds([]);
      if (!silent) {
        if (data?.length) {
          notify(`Found ${data.length} record(s)`, "success");
        } else {
          notify("No bank process transactions found", "info");
        }
      }
    } catch (err) {
      setRows([]);
      setHasSearched(true);
      if (!silent) notify(err.message || "Search failed", "error");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, companyId, selectedCurrency, query, notify]);

  useEffect(() => {
    if (!bootLoading && companyId && selectedCurrency && dateFrom && dateTo) {
      searchData(true);
    }
  }, [bootLoading, companyId, selectedCurrency, dateFrom, dateTo, selectedPermission, searchData]);

  useEffect(() => {
    if (!selectedPermission || !companyCode) return;
    localStorage.setItem(`selectedPermission_${companyCode}`, selectedPermission);
  }, [selectedPermission, companyCode]);

  const handleSwitchCompany = useCallback(async (targetCompany) => {
    if (!targetCompany?.id) return;
    const nextId = Number(targetCompany.id);
    if (nextId === Number(currentCompanyIdRef.current)) return;
    try {
      await updateSessionCompany(nextId);
      setCompanyId(nextId);
      setCompanyCode(targetCompany.company_id || "");
      currentCompanyIdRef.current = nextId;
      notifyCompanySessionUpdated();
      notify(`Switched to ${targetCompany.company_id}`, "success");
    } catch (err) {
      notify(err.message || "Switch failed", "error");
    }
  }, [notify]);

  const onGroupClick = (gid) => {
    if (selectedGroup === gid) {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
      return;
    }
    setSelectedGroup(gid);
    sessionStorage.setItem("dashboard_group_filter", gid);
  };

  const visibleCompanies = useMemo(() => {
    if (selectedGroup) {
      return companies.filter((c) => String(c.group_id || "").toUpperCase().trim() === selectedGroup);
    }
    return companies.filter((c) => !String(c.group_id || "").trim());
  }, [companies, selectedGroup]);

  const groupedIds = useMemo(
    () => [...new Set(companies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
    [companies]
  );

  const selectableRows = useMemo(
    () => rows.filter((r) => !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)),
    [rows]
  );

  const selectAll = selectableRows.length > 0 && selectedIds.length === selectableRows.length;

  const onToggleSelectAll = (checked) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(selectableRows.map((r) => r.transaction_id));
  };

  const onToggleRow = (transactionId) => {
    setSelectedIds((prev) => (prev.includes(transactionId) ? prev.filter((id) => id !== transactionId) : [...prev, transactionId]));
  };

  const onDelete = async () => {
    if (!confirmDelete) {
      notify("Please confirm deletion by checking the checkbox", "error");
      return;
    }
    if (selectedIds.length === 0) {
      notify("Please select at least one record", "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      const result = await deleteBankprocessData(selectedIds);
      try {
        const ts = String(Date.now());
        localStorage.setItem("count168_tx_invalidate_ts", ts);
        window.dispatchEvent(new CustomEvent("tx-data-changed", { detail: { ts, source: "bankprocess_maintenance_delete" } }));
      } catch {
        // ignore
      }
      notify(result.message || `Deleted ${selectedIds.length} record(s)`, "success");
      setSelectedIds([]);
      setConfirmDelete(false);
      await searchData(true);
    } catch (err) {
      notify(err.message || "Delete failed", "error");
    }
  };

  if (bootLoading || !me) return null;

  return (
    <div className="container">
      <BankprocessMaintenanceFilters
        permissions={permissions}
        selectedPermission={selectedPermission}
        setSelectedPermission={setSelectedPermission}
        dateFrom={dateFrom}
        dateTo={dateTo}
        today={today}
        query={query}
        setQuery={setQuery}
        onSearch={searchData}
        groupedIds={groupedIds}
        selectedGroup={selectedGroup}
        onGroupClick={onGroupClick}
        companies={companies}
        visibleCompanies={visibleCompanies}
        companyId={companyId}
        handleSwitchCompany={handleSwitchCompany}
        currencies={currencies}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        selectedIds={selectedIds}
        onDelete={onDelete}
      />

      <BankprocessMaintenanceTable
        loading={loading}
        rows={rows}
        hasSearched={hasSearched}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        selectAll={selectAll}
        onToggleSelectAll={onToggleSelectAll}
      />

      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((t) => (
          <div key={t.id} className={`maintenance-notification maintenance-notification-${t.type} show`}>
            {t.message}
          </div>
        ))}
      </div>

      <BankprocessDeleteModal
        isOpen={isDeleteModalOpen}
        selectedCount={selectedIds.length}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={onConfirmDelete}
      />
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}><i className="fas fa-chevron-left" /></button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" defaultValue="0"><option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option><option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option><option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option></select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
