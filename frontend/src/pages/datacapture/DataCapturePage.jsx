import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import { useDataCaptureLegacyBridge } from "./hooks/useDataCaptureLegacyBridge.js";
import { useDataCaptureSubmit } from "./hooks/useDataCaptureSubmit.js";
import { useDataCaptureSubmitGate } from "./hooks/useDataCaptureSubmitGate.js";
import { useDataCaptureRestore } from "./hooks/useDataCaptureRestore.js";
import { useDataCaptureTableEngine } from "./hooks/useDataCaptureTableEngine.js";
import { loadScriptOnce } from "./utils/assetLoader.js";

export default function DataCapturePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [permissionOptions, setPermissionOptions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState("");
  const [dateOptions, setDateOptions] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [submittedProcesses, setSubmittedProcesses] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [processOptions, setProcessOptions] = useState([]);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [processSearch, setProcessSearch] = useState("");
  const [processDropdownOpen, setProcessDropdownOpen] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [selectedDescriptionsState, setSelectedDescriptionsState] = useState([]);
  const [availableDescriptions, setAvailableDescriptions] = useState([]);
  const [descriptionSearch, setDescriptionSearch] = useState("");
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [newDescriptionName, setNewDescriptionName] = useState("");
  const [removeWord, setRemoveWord] = useState("");
  const [replaceWordFrom, setReplaceWordFrom] = useState("");
  const [replaceWordTo, setReplaceWordTo] = useState("");
  const [remark, setRemark] = useState("");
  const [currencyId, setCurrencyId] = useState("");
  const [dataCaptureType, setDataCaptureType] = useState("1.Text");
  const [formatGridReady, setFormatGridReady] = useState(false);
  const [tableRevision, setTableRevision] = useState(0);
  /** Frozen after first load so React re-renders do not clobber vanilla `display` on company pills */
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const isPageReady = !loading && !forbidden && companyId != null;
  const { submit } = useDataCaptureSubmit({ selectedDescriptions: selectedDescriptionsState, navigate });
  const submitGate = useDataCaptureSubmitGate({
    selectedProcessId,
    selectedDescriptions: selectedDescriptionsState,
    currencyId,
    dataCaptureType,
    tableRevision,
  });
  const tableEngine = useDataCaptureTableEngine({ ready: isPageReady });
  const toUpperInput = useCallback((next) => String(next || "").toUpperCase(), []);
  const processDropdownRef = useRef(null);

  const selectedProcess = useMemo(
    () => processOptions.find((option) => String(option.id) === String(selectedProcessId)) || null,
    [processOptions, selectedProcessId]
  );
  const filteredProcessOptions = useMemo(() => {
    const keyword = processSearch.trim().toLowerCase();
    if (!keyword) return processOptions;
    return processOptions.filter((option) => String(option.displayText || "").toLowerCase().includes(keyword));
  }, [processOptions, processSearch]);

  const companyCode = useMemo(() => {
    const cur = filterSnapshot?.snapCompanies?.find((c) => Number(c.id) === Number(companyId));
    return cur ? String(cur.company_id || "") : "";
  }, [filterSnapshot, companyId]);

  const companyButtonStyle = useCallback((comp, snapGroup) => {
    const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
    if (snapGroup) {
      return cGid === snapGroup ? {} : { display: "none" };
    }
    return cGid ? { display: "none" } : {};
  }, []);

  const formatSubmittedDateTime = useCallback((process) => {
    if (process?.created_at) {
      const createdObj = new Date(process.created_at);
      const day = String(createdObj.getDate()).padStart(2, "0");
      const month = String(createdObj.getMonth() + 1).padStart(2, "0");
      const year = createdObj.getFullYear();
      const hh = String(createdObj.getHours()).padStart(2, "0");
      const mm = String(createdObj.getMinutes()).padStart(2, "0");
      const ss = String(createdObj.getSeconds()).padStart(2, "0");
      return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
    }
    const logicalDate = process?.capture_date || process?.date_submitted || "";
    const parts = logicalDate.split("-");
    let dateText = "";
    if (parts.length === 3) {
      dateText = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const now = new Date();
    if (!dateText) {
      dateText = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${dateText} ${hh}:${mm}:${ss}`;
  }, []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page");
    document.body.classList.add("dashboard-page", "datacapture-page");
    return () => {
      document.body.classList.remove("datacapture-page", "page-ready");
    };
  }, []);

  /** Legacy datacapture.js 仍会调用 updateSubmitButtonState；SPA 下 Submit 由 React 独占控制 */
  useLayoutEffect(() => {
    window.__DC_REACT_SUBMIT_BUTTON__ = true;
    window.__DC_REACT_UPPERCASE__ = true;
    window.__DC_REACT_CAPTURE_TYPE__ = true;
    window.__DC_REACT_FORMAT_PASTE__ = true;
    window.__DC_REACT_FORMAT_VISIBILITY__ = true;
    window.__DC_REACT_SET_FORMAT_GRID_READY__ = (ready) => {
      setFormatGridReady(!!ready);
    };
    return () => {
      delete window.__DC_REACT_SUBMIT_BUTTON__;
      delete window.__DC_REACT_UPPERCASE__;
      delete window.__DC_REACT_CAPTURE_TYPE__;
      delete window.__DC_REACT_FORMAT_PASTE__;
      delete window.__DC_REACT_FORMAT_VISIBILITY__;
      delete window.__DC_REACT_SET_FORMAT_GRID_READY__;
      delete window.__dcSetCaptureType;
    };
  }, []);

  /** Let legacy parser/format engine follow React-controlled capture type. */
  useEffect(() => {
    window.__dcSetCaptureType?.(dataCaptureType);
  }, [dataCaptureType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          navigate("/member", { replace: true });
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canDc = hasFull || perms.includes("datacapture");
        if (!canDc || !u.company_has_gambling) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && current?.group_id?.trim()) {
          selGroup = String(current.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            snapCompanies: snapRows,
            snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
          });
          setCompanyId(effective);
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleGroupChange = useCallback((gid) => {
    setFilterSnapshot((prev) => {
      if (!prev) return prev;
      sessionStorage.setItem("dashboard_group_filter", gid);
      return { ...prev, selectedGroup: gid };
    });
  }, []);

  const handleCompanyChange = useCallback(
    async (nextCompanyId) => {
      const normalized = Number(nextCompanyId);
      if (!Number.isFinite(normalized)) return;

      try {
        const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${normalized}`), {
          credentials: "include",
        });
        const sj = await sync.json();
        if (!sync.ok || !sj.success) return;
        notifyCompanySessionUpdated();

        setCompanyId(normalized);
        setFilterSnapshot((prev) => {
          if (!prev) return prev;
          const current = prev.snapCompanies.find((c) => Number(c.id) === normalized);
          const nextGroup = current?.group_id ? String(current.group_id).toUpperCase().trim() : null;
          if (nextGroup) sessionStorage.setItem("dashboard_group_filter", nextGroup);
          return {
            ...prev,
            companyId: normalized,
            selectedGroup: nextGroup,
          };
        });

        navigate(`/datacapture?company_id=${normalized}`, { replace: true });
      } catch {
        // ignore transient company switch failure
      }
    },
    [navigate]
  );

  useDataCaptureLegacyBridge({ companyId, companyCode });
  useDataCaptureRestore({
    ready: !loading && !forbidden && companyId != null,
    processOptions,
    setSelectedDescriptions: setSelectedDescriptionsState,
    setSelectedDate,
    setCurrencyId,
    setDataCaptureType,
    setRemoveWord,
    setReplaceWordFrom,
    setReplaceWordTo,
    setRemark,
    onRestoreProcess: (process) => {
      setSelectedProcessId(String(process.id || ""));
    },
  });

  useEffect(() => {
    const today = new Date();
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const opts = [];
    for (let i = 6; i >= -6; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const value = `${y}-${m}-${day}`;
      opts.push({ value, label: `${value} (${weekdayNames[d.getDay()]})` });
    }
    setDateOptions(opts);
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setSelectedDate(todayValue);
  }, []);

  useEffect(() => {
    if (loading || forbidden || !selectedDate) return;
    let cancelled = false;
    (async () => {
      try {
        const url = buildApiUrl(
          `api/processes/submitted_processes_api.php?action=get_submissions_by_capture_date&capture_date=${encodeURIComponent(selectedDate)}`
        );
        const finalUrl = companyId ? `${url}${url.includes("?") ? "&" : "?"}company_id=${companyId}` : url;
        const response = await fetch(finalUrl, { credentials: "include" });
        const result = await response.json();
        if (cancelled) return;
        setSubmittedProcesses(result.success ? result.data || [] : []);
      } catch {
        if (!cancelled) setSubmittedProcesses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, selectedDate, companyId]);

  useEffect(() => {
    if (loading || forbidden || companyId == null) return;
    const tableBody = document.getElementById("tableBody");
    const headerRow = document.querySelector("#tableHeader tr");
    if (!tableBody || !headerRow) return;
    if (tableBody.children.length > 0) return;
    const rows = 26;
    const cols = 20;
    while (headerRow.children.length < cols + 1) {
      const th = document.createElement("th");
      th.textContent = String(headerRow.children.length);
      headerRow.appendChild(th);
    }
    for (let r = 0; r < rows; r += 1) {
      const tr = document.createElement("tr");
      const rowHeader = document.createElement("td");
      rowHeader.className = "row-header";
      rowHeader.textContent = String(r + 1);
      tr.appendChild(rowHeader);
      for (let c = 0; c < cols; c += 1) {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.col = String(c);
        tr.appendChild(td);
      }
      tableBody.appendChild(tr);
    }
  }, [loading, forbidden, companyId]);

  /** 载入旧版 datacapture.js：TEXT / 2.Format / CITIBET / RETURN 等模式的粘贴解析与表格行为均在该脚本中 */
  useEffect(() => {
    if (loading || forbidden || companyId == null) return;
    const tableBody = document.getElementById("tableBody");
    if (!tableBody || tableBody.children.length === 0) return;

    let cancelled = false;

    window.__DC_REACT_PERMISSION_FILTER__ = true;
    window.__DC_REACT_DATE_SUBMITTED__ = true;
    window.__DC_REACT_FORM_DATA__ = true;
    window.__DC_REACT_PROCESS_DROPDOWN__ = true;
    window.__DC_REACT_BOOT__ = true;

    (async () => {
      try {
        await loadScriptOnce(assetUrl("js/datacapture.js"));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return;
      }
      if (cancelled) return;
      try {
        await window.__initDataCapturePage?.();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      window.__resetDataCapturePageInitPromise?.();
    };
  }, [loading, forbidden, companyId]);

  /** CITIBET 等模式下表格变动需触发 React 侧 Submit 校验（legacy updateSubmitButtonState 已在 SPA 下短路） */
  useEffect(() => {
    if (!isPageReady) return undefined;
    const body = document.getElementById("tableBody");
    if (!body) return undefined;
    let timeoutId = null;
    const bump = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setTableRevision((r) => r + 1), 80);
    };
    body.addEventListener("input", bump);
    body.addEventListener("paste", bump, true);
    const mo = new MutationObserver(bump);
    mo.observe(body, { childList: true, subtree: true, characterData: true });
    bump();
    return () => {
      window.clearTimeout(timeoutId);
      body.removeEventListener("input", bump);
      body.removeEventListener("paste", bump, true);
      mo.disconnect();
    };
  }, [isPageReady]);

  useEffect(() => {
    if (!processDropdownOpen) return;
    const searchInput = processDropdownRef.current?.querySelector(".custom-select-search input");
    searchInput?.focus();
  }, [processDropdownOpen]);

  /** Close Process dropdown on outside click. Do not use wrapper onBlur — clicking a non-focusable option yields relatedTarget null and closes before click fires. */
  useEffect(() => {
    if (!processDropdownOpen) return;
    const onDocPointerDown = (e) => {
      const el = processDropdownRef.current;
      if (el && !el.contains(e.target)) {
        setProcessDropdownOpen(false);
        setProcessSearch("");
      }
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, [processDropdownOpen]);

  useEffect(() => {
    setDescriptionText(selectedDescriptionsState.join(", "));
  }, [selectedDescriptionsState]);

  /** legacy datacapture.js 内仍会读取 window.selectedDescriptions（校验/重置等） */
  useEffect(() => {
    window.selectedDescriptions = Array.isArray(selectedDescriptionsState) ? [...selectedDescriptionsState] : [];
  }, [selectedDescriptionsState]);

  const notify = useCallback((message, type = "success") => {
    const container = document.getElementById("processNotificationContainer");
    if (!container) return;
    const node = document.createElement("div");
    node.className = `process-notification process-notification-${type}`;
    node.textContent = message;
    container.appendChild(node);
    setTimeout(() => node.classList.add("show"), 10);
    setTimeout(() => {
      node.classList.remove("show");
      setTimeout(() => node.remove(), 300);
    }, 1500);
  }, []);

  useEffect(() => {
    if (loading || forbidden) return undefined;
    const clearLinkedFields = () => {
      setCurrencyId("");
      setRemoveWord("");
      setReplaceWordFrom("");
      setReplaceWordTo("");
      setRemark("");
      setSelectedDescriptionsState([]);
    };

    const loadLinkedFields = async () => {
      if (!selectedProcessId) {
        clearLinkedFields();
        return;
      }
      try {
        const url = buildApiUrl(`api/processes/processlist_api.php?action=get_process&id=${encodeURIComponent(selectedProcessId)}`);
        const finalUrl = companyId ? `${url}${url.includes("?") ? "&" : "?"}company_id=${companyId}` : url;
        const response = await fetch(finalUrl, { credentials: "include" });
        const result = await response.json();
        if (!result.success || !result.data) return;
        const pd = result.data;

        let nextCurrency = "";
        const desired = pd.currency_id != null ? String(pd.currency_id) : "";
        if (desired && currencyOptions.some((c) => String(c.id) === desired)) {
          nextCurrency = desired;
        } else if (pd.currency_code) {
          const code = String(pd.currency_code).toUpperCase();
          const matched = currencyOptions.find((c) => String(c.code || "").toUpperCase() === code);
          if (matched) nextCurrency = String(matched.id);
        }
        setCurrencyId(nextCurrency);

        setRemoveWord(pd.remove_word || "");
        setReplaceWordFrom(pd.replace_word_from || "");
        setReplaceWordTo(pd.replace_word_to || "");
        setRemark(pd.remarks || "");
        const nextDescriptions = pd.description_names ? [pd.description_names] : [];
        setSelectedDescriptionsState(nextDescriptions);
      } catch {
        // keep previous values on transient request failure
      }
    };

    loadLinkedFields();
    return undefined;
  }, [loading, forbidden, companyId, selectedProcessId, currencyOptions]);

  useEffect(() => {
    if (loading || forbidden || !companyCode) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "get_company_permissions",
            company_id: companyCode,
          }),
        });
        const result = await response.json();
        const raw = result.success && result.data && result.data.permissions ? result.data.permissions : ["Games", "Bank", "Loan", "Rate", "Money"];
        const filtered = raw.filter((p) => p !== "Bank");
        if (cancelled) return;
        setPermissionOptions(filtered);

        let nextSelected = "";
        try {
          const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
          if (saved && filtered.includes(saved)) nextSelected = saved;
        } catch {
          // ignore localStorage access errors
        }
        if (!nextSelected && filtered.length > 0) nextSelected = filtered[0];
        setSelectedPermission(nextSelected);
      } catch {
        if (!cancelled) {
          setPermissionOptions([]);
          setSelectedPermission("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, companyCode]);

  useEffect(() => {
    if (!selectedPermission) return;
    // category kept in React; no legacy permission switch call.
  }, [selectedPermission]);

  useEffect(() => {
    if (loading || forbidden) return;
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = buildApiUrl("api/processes/addprocess_api.php");
        const finalUrl = companyId ? `${baseUrl}?company_id=${companyId}` : baseUrl;
        const response = await fetch(finalUrl, { credentials: "include" });
        const result = await response.json();
        if (cancelled) return;
        if (result.success) {
          setCurrencyOptions(Array.isArray(result.currencies) ? result.currencies : []);
        } else {
          setCurrencyOptions([]);
        }
      } catch {
        if (!cancelled) setCurrencyOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, companyId]);

  useEffect(() => {
    if (loading || forbidden || !selectedDate) return;
    let cancelled = false;
    (async () => {
      try {
        const url = buildApiUrl(`api/processes/submitted_processes_api.php?action=get_processes_by_day&date=${encodeURIComponent(selectedDate)}`);
        const finalUrl = companyId ? `${url}${url.includes("?") ? "&" : "?"}company_id=${companyId}` : url;
        const response = await fetch(finalUrl, { credentials: "include" });
        const result = await response.json();
        if (cancelled) return;

        if (!result.success || !Array.isArray(result.data)) {
          setProcessOptions([]);
          return;
        }

        const nextOptions = result.data.map((process) => {
          const displayText =
            process.process_display != null && String(process.process_display).trim() !== ""
              ? String(process.process_display).trim()
              : process.description_name
                ? `${process.process_id} (${process.description_name})`
                : process.process_id;
          return {
            displayText,
            id: process.id,
            processCode: process.process_id,
            descriptionName: process.description_name || null,
          };
        });

        setProcessOptions(nextOptions);
        setSelectedProcessId("");
        setProcessSearch("");
        setProcessDropdownOpen(false);
      } catch {
        if (!cancelled) {
          setProcessOptions([]);
          setSelectedProcessId("");
          setProcessSearch("");
          setProcessDropdownOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, selectedDate, companyId]);

  const loadDescriptions = useCallback(async () => {
    const url = buildApiUrl("api/processes/addprocess_api.php");
    const finalUrl = companyId ? `${url}?company_id=${companyId}` : url;
    const response = await fetch(finalUrl, { credentials: "include" });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Failed to load descriptions");
    setAvailableDescriptions(Array.isArray(result.descriptions) ? result.descriptions : []);
  }, [companyId]);

  const openDescriptionModal = useCallback(async () => {
    try {
      await loadDescriptions();
      setDescriptionSearch("");
      setDescriptionModalOpen(true);
    } catch (error) {
      notify(error.message || "Failed to load descriptions", "danger");
    }
  }, [loadDescriptions, notify]);

  const closeDescriptionModal = useCallback(() => {
    setDescriptionModalOpen(false);
    setDescriptionSearch("");
    setNewDescriptionName("");
  }, []);

  const confirmDescriptions = useCallback(() => {
    if (!selectedDescriptionsState.length) {
      notify("Please select at least one description", "danger");
      return;
    }
    closeDescriptionModal();
  }, [closeDescriptionModal, notify, selectedDescriptionsState]);

  const resetFormValues = useCallback(() => {
    setRemoveWord("");
    setReplaceWordFrom("");
    setReplaceWordTo("");
    setRemark("");
    setSelectedDescriptionsState([]);
    setCurrencyId("");
    setFormatGridReady(false);
    setSelectedProcessId("");
    setProcessSearch("");
    setProcessDropdownOpen(false);
    const tableBody = document.getElementById("tableBody");
    if (tableBody) {
      tableBody.querySelectorAll("td[data-col]").forEach((cell) => {
        cell.textContent = "";
      });
    }
  }, []);

  if (forbidden) {
    return <Navigate to="/process-list" replace />;
  }
  if (loading || companyId == null || !filterSnapshot) {
    return null;
  }

  const fs = filterSnapshot;
  const shouldShowTable = dataCaptureType !== "2.Format" || formatGridReady;
  const shouldShowFormatPasteArea = dataCaptureType === "2.Format" && !formatGridReady;
  const handleFormatPasteAreaPaste = useCallback((e) => {
    if (dataCaptureType !== "2.Format") return;
    const handled = window.__dcHandleFormatPasteFromClipboard?.(e.clipboardData || window.clipboardData, "");
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    window.setTimeout(() => {
      window.__dcTryParseFormatPasteAreaFromDom?.();
    }, 0);
  }, [dataCaptureType]);

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, marginTop: 20 }}>
        <h1 style={{ margin: 0 }}>Data Capture</h1>

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div
            id="data-capture-permission-filter"
            className="data-capture-company-filter data-capture-permission-filter-header"
            style={{ display: permissionOptions.length > 1 ? "flex" : "none" }}
          >
            <span className="data-capture-company-label">Category:</span>
            <div id="data-capture-permission-buttons" className="data-capture-company-buttons">
              {permissionOptions.map((permission) => (
                <button
                  key={permission}
                  type="button"
                  className={`data-capture-company-btn ${selectedPermission === permission ? "active" : ""}`}
                  onClick={() => setSelectedPermission(permission)}
                >
                  {permission}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="top-section">
        <div className="form-column">
          <div className="form-container">
            <form id="dataCaptureForm" className="process-form" method="POST" action="#">
              {fs.snapGroupIds.length > 0 && (
                <div id="group-buttons-wrapper" className="data-capture-company-filter shared-group-wrapper">
                  <span className="data-capture-company-label">GroupID:</span>
                  <div id="group-buttons-container" className="data-capture-company-buttons">
                    {fs.snapGroupIds.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`data-capture-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`}
                        data-group-id={gid}
                        onClick={() => handleGroupChange(gid)}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fs.snapCompanies.length > 0 && (
                <div id="company-buttons-wrapper" className="data-capture-company-filter shared-company-wrapper">
                  <span className="data-capture-company-label">Company:</span>
                  <div id="company-buttons-container" className="data-capture-company-buttons">
                    {fs.snapCompanies.map((comp) => (
                      <button
                        key={comp.id}
                        type="button"
                        style={companyButtonStyle(comp, fs.selectedGroup)}
                        className={`data-capture-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`}
                        data-company-id={comp.id}
                        data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                        data-company-code={comp.company_id}
                        onClick={() => handleCompanyChange(comp.id)}
                      >
                        {comp.company_id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="capture_date">Date</label>
                <select id="capture_date" name="capture_date" required value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
                  <option value="">Select Date</option>
                  {dateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="capture_process">Process</label>
                <div className="custom-select-wrapper" ref={processDropdownRef}>
                  <button
                    type="button"
                    className="custom-select-button"
                    id="capture_process"
                    data-placeholder="Select Process"
                    name="process"
                    data-value={selectedProcess ? selectedProcess.id : ""}
                    data-process-code={selectedProcess?.processCode || ""}
                    data-description-name={selectedProcess?.descriptionName || ""}
                    onClick={() => setProcessDropdownOpen((prev) => !prev)}
                  >
                    {selectedProcess?.displayText || "Select Process"}
                  </button>
                  <div className="custom-select-dropdown" id="capture_process_dropdown" style={{ display: processDropdownOpen ? "block" : "none" }}>
                    <div className="custom-select-search">
                      <input
                        type="text"
                        placeholder="Search process..."
                        autoComplete="off"
                        value={processSearch}
                        onChange={(e) => setProcessSearch(e.target.value)}
                      />
                    </div>
                    <div className="custom-select-options">
                      {filteredProcessOptions.map((option) => (
                        <div
                          key={`${option.id}-${option.displayText}`}
                          className="custom-select-option"
                          data-value={option.id}
                          data-process-code={option.processCode}
                          data-description-name={option.descriptionName || ""}
                          onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0) return;
                            e.preventDefault();
                            setSelectedProcessId(String(option.id || ""));
                            setProcessDropdownOpen(false);
                            setProcessSearch("");
                          }}
                          role="option"
                          tabIndex={-1}
                        >
                          {option.displayText}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_description">Description</label>
                <div className="input-with-icon">
                  <input
                    type="text"
                    id="capture_description"
                    name="description"
                    required
                    readOnly
                    value={descriptionText}
                    placeholder="Click + to select descriptions"
                  />
                  <button type="button" className="add-icon" onClick={openDescriptionModal}>
                    +
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_currency">Currency</label>
                <select
                  id="capture_currency"
                  name="currency"
                  required
                  value={currencyId}
                  onChange={(e) => setCurrencyId(e.target.value)}
                >
                  <option value="">Select Currency</option>
                  {currencyOptions.map((currency) => (
                    <option key={currency.id} value={currency.id}>
                      {currency.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="capture_remove_word">Remove Word</label>
                <input
                  type="text"
                  id="capture_remove_word"
                  name="remove_word"
                  placeholder="Enter words to remove"
                  value={removeWord}
                  onChange={(e) => setRemoveWord(toUpperInput(e.target.value))}
                />
                <small className="field-help" style={{ display: "block", marginTop: 0, fontStyle: "italic", color: "#666" }}>
                  (Use semicolon to separate multiple words, e.g. abc;cde;efg)
                </small>
              </div>

              <div className="form-group replace-word-group">
                <label htmlFor="capture_replace_word_from">Replace Word</label>
                <div className="replace-word-fields">
                  <input
                    type="text"
                    id="capture_replace_word_from"
                    name="replace_word_from"
                    placeholder="Old word"
                    value={replaceWordFrom}
                    onChange={(e) => setReplaceWordFrom(toUpperInput(e.target.value))}
                  />
                  <span className="replace-arrow">→</span>
                  <input
                    type="text"
                    id="capture_replace_word_to"
                    name="replace_word_to"
                    placeholder="New word"
                    value={replaceWordTo}
                    onChange={(e) => setReplaceWordTo(toUpperInput(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_remark">Remark</label>
                <input
                  type="text"
                  id="capture_remark"
                  name="remark"
                  placeholder="Enter remark"
                  value={remark}
                  onChange={(e) => setRemark(toUpperInput(e.target.value))}
                />
              </div>
            </form>
          </div>
        </div>

        <div className="submitted-column">
          <div className="submitted-container">
            <h2 className="submitted-title">Submitted Processes</h2>
            <div className="submitted-list" id="submittedProcessesList">
              {submittedProcesses.length === 0 ? (
                <div className="no-data">No processes submitted for this date</div>
              ) : (
                submittedProcesses.map((process, idx) => (
                  <div className="submitted-item" key={`${process.id || process.process_id || "p"}-${idx}`}>
                    <div className="submitted-details">
                      <div className="detail-row">
                        <strong>
                          {process.process_code}
                          {process.description_name ? ` (${process.description_name})` : ""}
                        </strong>
                        <div className="submitted-meta">
                          <span className="submitted-by">{process.submitted_by}</span>
                          <span className="submitted-date">{formatSubmittedDateTime(process)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-section">
        <div className={`excel-table-container${dataCaptureType === "CITIBET_MAJOR" ? " citibet-mode" : ""}`}>
          <div className="excel-table-header">
            <span>Data Capture Table</span>
            <select
              id="dataCaptureTypeSelector"
              className="data-capture-type-selector"
              value={dataCaptureType}
              onChange={(e) => setDataCaptureType(e.target.value)}
            >
              <option value="1.Text">1.TEXT</option>
              <option value="2.Format">2.FORMAT</option>
              <option value="CITIBET_MAJOR">3.CITIBET</option>
              <option value="4.RETURN">4.RETURN</option>
            </select>
            <button type="button" className="btn btn-cancel" onClick={resetFormValues}>
              Reset
            </button>
          </div>
          <table className="excel-table" id="dataTable" style={{ display: shouldShowTable ? "table" : "none" }}>
            <thead id="tableHeader">
              <tr>
                <th />
              </tr>
            </thead>
            <tbody id="tableBody" />
          </table>
          <div id="tablePreviewFormat" className="table-preview-format" style={{ display: "none" }}>
            <iframe id="tablePreviewFrameFormat" className="table-preview-frame-format" title="Format Table Preview" />
          </div>
          <div
            id="pasteAreaFormat"
            className="paste-area-format"
            style={{ display: shouldShowFormatPasteArea ? "block" : "none" }}
            contentEditable
            onPaste={handleFormatPasteAreaPaste}
            onInput={() => {
              if (dataCaptureType !== "2.Format") return;
              window.setTimeout(() => {
                window.__dcTryParseFormatPasteAreaFromDom?.();
              }, 0);
            }}
            data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
            suppressContentEditableWarning
          />
        </div>

        <div className="form-actions">
          <button
            id="dataCaptureSubmitBtn"
            type="button"
            className="btn btn-save"
            disabled={!submitGate.canSubmit}
            title={submitGate.canSubmit ? undefined : submitGate.disabledTitle}
            style={submitGate.canSubmit ? undefined : { opacity: 0.6, cursor: "not-allowed" }}
            onClick={submit}
          >
            Submit
          </button>
        </div>
      </div>

      <div id="descriptionSelectionModal" className={`modal ${descriptionModalOpen ? "show" : ""}`} style={{ display: descriptionModalOpen ? "block" : "none" }}>
        <div className="modal-content description-selection-modal">
          <div className="modal-header">
            <h2>Select or Add Description</h2>
            <span className="close" onClick={closeDescriptionModal} role="presentation">
              &times;
            </span>
          </div>
          <div className="modal-body">
            <div className="description-selection-container">
              <div className="selected-descriptions-section">
                <h3>Selected Descriptions</h3>
                <div className="selected-descriptions-list" id="selectedDescriptionsInModal">
                  {selectedDescriptionsState.length === 0 ? (
                    <div className="no-descriptions">No descriptions selected</div>
                  ) : (
                    selectedDescriptionsState.map((desc) => (
                      <div key={desc} className="selected-description-modal-item">
                        <span>{desc}</span>
                        <button
                          type="button"
                          className="remove-description-modal"
                          onClick={() => setSelectedDescriptionsState((prev) => prev.filter((d) => d !== desc))}
                        >
                          &times;
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="available-descriptions-section">
                <div className="add-description-bar">
                  <h3>Add New Description</h3>
                  <form
                    id="addDescriptionForm"
                    className="add-description-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = newDescriptionName.trim();
                      if (!name) return;
                      const formData = new FormData();
                      formData.append("action", "add_description");
                      formData.append("description_name", name);
                      try {
                        const response = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
                          method: "POST",
                          credentials: "include",
                          body: formData,
                        });
                        const result = await response.json();
                        if (!result.success) {
                          notify(result.error || "Failed to add description", "danger");
                          return;
                        }
                        setNewDescriptionName("");
                        await loadDescriptions();
                        notify("Description added successfully", "success");
                      } catch {
                        notify("Failed to add description", "danger");
                      }
                    }}
                  >
                    <div className="add-description-input-group">
                      <input
                        type="text"
                        id="new_description_name"
                        name="description_name"
                        placeholder="Enter new description name..."
                        required
                        value={newDescriptionName}
                        onChange={(e) => setNewDescriptionName(toUpperInput(e.target.value))}
                      />
                      <button type="submit" className="btn btn-save">
                        Add
                      </button>
                    </div>
                  </form>
                </div>

                <h3>Available Descriptions</h3>
                <div className="description-search">
                  <input
                    type="text"
                    id="descriptionSearch"
                    placeholder="Search descriptions..."
                    value={descriptionSearch}
                    onChange={(e) => setDescriptionSearch(toUpperInput(e.target.value))}
                  />
                </div>
                <div className="description-list" id="existingDescriptions">
                  {availableDescriptions
                    .filter((d) => String(d.name || "").toLowerCase().includes(descriptionSearch.toLowerCase()))
                    .filter((d) => !selectedDescriptionsState.includes(d.name))
                    .map((d) => (
                      <div key={d.id} className="description-item">
                        <div className="description-item-left">
                          <input
                            type="checkbox"
                            name="available_descriptions"
                            checked={selectedDescriptionsState.includes(d.name)}
                            onChange={(e) => {
                              if (!e.target.checked) return;
                              setSelectedDescriptionsState((prev) => (prev.includes(d.name) ? prev : [...prev, d.name]));
                            }}
                          />
                          <label>{d.name}</label>
                        </div>
                        <button
                          type="button"
                          className="description-delete-btn"
                          title="Delete description"
                          aria-label="Delete description"
                          onClick={async () => {
                            const ok = window.confirm(`Are you sure you want to delete description ${d.name}? This action cannot be undone.`);
                            if (!ok) return;
                            const fd = new FormData();
                            fd.append("action", "delete_description");
                            fd.append("description_id", d.id);
                            try {
                              const response = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
                                method: "POST",
                                credentials: "include",
                                body: fd,
                              });
                              const result = await response.json();
                              if (!result.success) {
                                notify(result.error || "Failed to delete description", "danger");
                                return;
                              }
                              setSelectedDescriptionsState((prev) => prev.filter((name) => name !== d.name));
                              await loadDescriptions();
                              notify("Description deleted successfully", "success");
                            } catch {
                              notify("Failed to delete description", "danger");
                            }
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-save" id="confirmDescriptionsBtn" onClick={confirmDescriptions}>
                Confirm
              </button>
              <button type="button" className="btn btn-cancel" onClick={closeDescriptionModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="processNotificationContainer" className="process-notification-container" />

      <div id="contextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => tableEngine.copySelectedCells()} role="presentation">
          <span>📋 Copy</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.pasteToSelectedCells()} role="presentation">
          <span>📄 Paste</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.clearSelectedCells()} role="presentation">
          <span>🗑️ Clear</span>
        </div>
        <div className="context-menu-item" onClick={(e) => tableEngine.showDeleteDialog(e)} role="presentation">
          <span>🗑️ Delete</span>
        </div>
        <div className="context-menu-item" onClick={(e) => tableEngine.selectAllCells(e)} role="presentation">
          <span>☑️ Select All</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => tableEngine.insertColumnLeft()} role="presentation">
          <span>➕ Insert 1 column left</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.insertColumnRight()} role="presentation">
          <span>➕ Insert 1 column right</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.deleteColumn()} role="presentation">
          <span>🗑️ Delete column</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.clearColumn()} role="presentation">
          <span>❌ Clear column</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => tableEngine.insertRowAbove()} role="presentation">
          <span>➕ Insert 1 row above</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.insertRowBelow()} role="presentation">
          <span>➕ Insert 1 row below</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.deleteRow()} role="presentation">
          <span>🗑️ Delete row</span>
        </div>
        <div className="context-menu-item" onClick={() => tableEngine.clearRow()} role="presentation">
          <span>❌ Clear row</span>
        </div>
      </div>

      <div id="deleteDialog" className="delete-dialog" style={{ display: "none" }}>
        <div className="delete-dialog-content">
          <div className="delete-dialog-header">
            <span>Delete</span>
            <span className="delete-dialog-close" onClick={(e) => tableEngine.closeDeleteDialog(e)} role="presentation">
              &times;
            </span>
          </div>
          <div className="delete-dialog-body">
            <div className="delete-dialog-title">Delete</div>
            <div className="delete-options">
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="shiftLeft" defaultChecked />
                <span>Shift cells left</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="shiftUp" />
                <span>Shift cells up</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="entireRow" />
                <span>Entire row</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="entireColumn" />
                <span>Entire column</span>
              </label>
            </div>
          </div>
          <div className="delete-dialog-footer">
            <button type="button" className="btn btn-save" onClick={(e) => tableEngine.confirmDelete(e)} role="presentation">
              OK
            </button>
            <button type="button" className="btn btn-cancel" onClick={(e) => tableEngine.closeDeleteDialog(e)} role="presentation">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
