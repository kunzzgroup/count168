import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import { useDataCaptureLegacyBridge } from "./datacapture/hooks/useDataCaptureLegacyBridge.js";

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
  const [descriptionText, setDescriptionText] = useState("");
  const [selectedDescriptionsState, setSelectedDescriptionsState] = useState([]);
  const [removeWord, setRemoveWord] = useState("");
  const [replaceWordFrom, setReplaceWordFrom] = useState("");
  const [replaceWordTo, setReplaceWordTo] = useState("");
  const [remark, setRemark] = useState("");
  /** Frozen after first load so React re-renders do not clobber vanilla `display` on company pills */
  const [filterSnapshot, setFilterSnapshot] = useState(null);

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
          window.location.assign(new URL("/member", window.location.origin).href);
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

  useDataCaptureLegacyBridge({ loading, forbidden, companyId, companyCode });

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
    if (loading || forbidden) return undefined;
    const processButton = document.getElementById("capture_process");
    if (!processButton) return undefined;

    const clearLinkedFields = () => {
      const currencySelect = document.getElementById("capture_currency");
      const descriptionInput = document.getElementById("capture_description");
      if (currencySelect) currencySelect.value = "";
      setRemoveWord("");
      setReplaceWordFrom("");
      setReplaceWordTo("");
      setRemark("");
      setDescriptionText("");
      setSelectedDescriptionsState([]);
      if (descriptionInput) descriptionInput.value = "";
      window.selectedDescriptions = [];
    };

    const onProcessChange = async () => {
      const processId = processButton.getAttribute("data-value") || "";
      if (!processId) {
        clearLinkedFields();
        return;
      }
      try {
        const url = buildApiUrl(`api/processes/processlist_api.php?action=get_process&id=${encodeURIComponent(processId)}`);
        const finalUrl = companyId ? `${url}${url.includes("?") ? "&" : "?"}company_id=${companyId}` : url;
        const response = await fetch(finalUrl, { credentials: "include" });
        const result = await response.json();
        if (!result.success || !result.data) return;
        const pd = result.data;

        const currencySelect = document.getElementById("capture_currency");
        if (currencySelect) {
          const desired = pd.currency_id != null ? String(pd.currency_id) : "";
          if (desired && Array.from(currencySelect.options).some((opt) => opt.value === desired)) {
            currencySelect.value = desired;
          } else if (pd.currency_code) {
            const code = String(pd.currency_code).toUpperCase();
            const matched = Array.from(currencySelect.options).find((opt) => String(opt.textContent || "").toUpperCase() === code);
            if (matched) currencySelect.value = matched.value;
          }
        }

        const descriptionInput = document.getElementById("capture_description");
        setRemoveWord(pd.remove_word || "");
        setReplaceWordFrom(pd.replace_word_from || "");
        setReplaceWordTo(pd.replace_word_to || "");
        setRemark(pd.remarks || "");
        const nextDescriptions = pd.description_names ? [pd.description_names] : [];
        setSelectedDescriptionsState(nextDescriptions);
        setDescriptionText(nextDescriptions.join(", "));
        if (descriptionInput) descriptionInput.value = pd.description_names || "";
        window.selectedDescriptions = nextDescriptions;
      } catch {
        // keep previous values on transient request failure
      }
    };

    processButton.addEventListener("change", onProcessChange);
    return () => processButton.removeEventListener("change", onProcessChange);
  }, [loading, forbidden, companyId]);

  useEffect(() => {
    window.__setDataCaptureLinkedFields = (payload = {}) => {
      if (Object.prototype.hasOwnProperty.call(payload, "removeWord")) setRemoveWord(payload.removeWord || "");
      if (Object.prototype.hasOwnProperty.call(payload, "replaceWordFrom")) setReplaceWordFrom(payload.replaceWordFrom || "");
      if (Object.prototype.hasOwnProperty.call(payload, "replaceWordTo")) setReplaceWordTo(payload.replaceWordTo || "");
      if (Object.prototype.hasOwnProperty.call(payload, "remark")) setRemark(payload.remark || "");
    };
    return () => {
      delete window.__setDataCaptureLinkedFields;
    };
  }, []);

  useEffect(() => {
    window.__setDataCaptureDescriptions = (descriptions = []) => {
      const next = Array.isArray(descriptions) ? descriptions : [];
      setSelectedDescriptionsState(next);
      setDescriptionText(next.join(", "));
    };
    return () => {
      delete window.__setDataCaptureDescriptions;
    };
  }, []);

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
    window.switchDataCapturePermission?.(selectedPermission);
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
          window.__syncDataCaptureProcessMap?.([]);
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
        window.__syncDataCaptureProcessMap?.(nextOptions);

        const processBtn = document.getElementById("capture_process");
        if (processBtn) {
          processBtn.textContent = processBtn.getAttribute("data-placeholder") || "Select Process";
          processBtn.removeAttribute("data-value");
          processBtn.removeAttribute("data-process-code");
          processBtn.removeAttribute("data-description-name");
        }
      } catch {
        if (!cancelled) {
          setProcessOptions([]);
          window.__syncDataCaptureProcessMap?.([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, selectedDate, companyId]);

  if (forbidden) {
    return <Navigate to="/process-list" replace />;
  }
  if (loading || companyId == null || !filterSnapshot) {
    return null;
  }

  const fs = filterSnapshot;

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
                <div className="custom-select-wrapper">
                  <button type="button" className="custom-select-button" id="capture_process" data-placeholder="Select Process" name="process">
                    Select Process
                  </button>
                  <div className="custom-select-dropdown" id="capture_process_dropdown">
                    <div className="custom-select-search">
                      <input type="text" placeholder="Search process..." autoComplete="off" />
                    </div>
                    <div className="custom-select-options">
                      {processOptions.map((option) => (
                        <div
                          key={`${option.id}-${option.displayText}`}
                          className="custom-select-option"
                          data-value={option.id}
                          data-process-code={option.processCode}
                          data-description-name={option.descriptionName || ""}
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
                  <button type="button" className="add-icon" onClick={() => window.expandDescription?.()}>
                    +
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_currency">Currency</label>
                <select id="capture_currency" name="currency" defaultValue="">
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
                  onChange={(e) => setRemoveWord(e.target.value)}
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
                    onChange={(e) => setReplaceWordFrom(e.target.value)}
                  />
                  <span className="replace-arrow">→</span>
                  <input
                    type="text"
                    id="capture_replace_word_to"
                    name="replace_word_to"
                    placeholder="New word"
                    value={replaceWordTo}
                    onChange={(e) => setReplaceWordTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_remark">Remark</label>
                <input type="text" id="capture_remark" name="remark" placeholder="Enter remark" value={remark} onChange={(e) => setRemark(e.target.value)} />
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
        <div className="excel-table-container">
          <div className="excel-table-header">
            <span>Data Capture Table</span>
            <select id="dataCaptureTypeSelector" className="data-capture-type-selector" defaultValue="1.Text">
              <option value="1.Text">1.TEXT</option>
              <option value="2.Format">2.FORMAT</option>
              <option value="CITIBET_MAJOR">3.CITIBET</option>
              <option value="4.RETURN">4.RETURN</option>
            </select>
            <button type="button" className="btn btn-cancel" onClick={() => window.resetForm?.()}>
              Reset
            </button>
          </div>
          <table className="excel-table" id="dataTable">
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
            style={{ display: "none" }}
            contentEditable
            data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
            suppressContentEditableWarning
          />
        </div>

        <div className="form-actions">
          <button id="dataCaptureSubmitBtn" type="button" className="btn btn-save" onClick={() => window.submitDataCaptureForm?.()}>
            Submit
          </button>
        </div>
      </div>

      <div id="descriptionSelectionModal" className="modal" style={{ display: "none" }}>
        <div className="modal-content description-selection-modal">
          <div className="modal-header">
            <h2>Select or Add Description</h2>
            <span className="close" onClick={() => window.closeDescriptionSelectionModal?.()} role="presentation">
              &times;
            </span>
          </div>
          <div className="modal-body">
            <div className="description-selection-container">
              <div className="selected-descriptions-section">
                <h3>Selected Descriptions</h3>
                <div className="selected-descriptions-list" id="selectedDescriptionsInModal" />
              </div>

              <div className="available-descriptions-section">
                <div className="add-description-bar">
                  <h3>Add New Description</h3>
                  <form id="addDescriptionForm" className="add-description-form">
                    <div className="add-description-input-group">
                      <input type="text" id="new_description_name" name="description_name" placeholder="Enter new description name..." required />
                      <button type="submit" className="btn btn-save">
                        Add
                      </button>
                    </div>
                  </form>
                </div>

                <h3>Available Descriptions</h3>
                <div className="description-search">
                  <input type="text" id="descriptionSearch" placeholder="Search descriptions..." onKeyUp={() => window.filterDescriptions?.()} />
                </div>
                <div className="description-list" id="existingDescriptions" />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-save" id="confirmDescriptionsBtn" onClick={() => window.confirmDescriptions?.()}>
                Confirm
              </button>
              <button type="button" className="btn btn-cancel" onClick={() => window.closeDescriptionSelectionModal?.()}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="processNotificationContainer" className="process-notification-container" />

      <div id="contextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => window.copySelectedCells?.()} role="presentation">
          <span>📋 Copy</span>
        </div>
        <div className="context-menu-item" onClick={() => window.pasteToSelectedCells?.()} role="presentation">
          <span>📄 Paste</span>
        </div>
        <div className="context-menu-item" onClick={() => window.clearSelectedCells?.()} role="presentation">
          <span>🗑️ Clear</span>
        </div>
        <div className="context-menu-item" onClick={(e) => window.showDeleteDialog?.(e)} role="presentation">
          <span>🗑️ Delete</span>
        </div>
        <div className="context-menu-item" onClick={(e) => window.selectAllCells?.(e)} role="presentation">
          <span>☑️ Select All</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => window.insertColumnLeft?.()} role="presentation">
          <span>➕ Insert 1 column left</span>
        </div>
        <div className="context-menu-item" onClick={() => window.insertColumnRight?.()} role="presentation">
          <span>➕ Insert 1 column right</span>
        </div>
        <div className="context-menu-item" onClick={() => window.deleteColumn?.()} role="presentation">
          <span>🗑️ Delete column</span>
        </div>
        <div className="context-menu-item" onClick={() => window.clearColumn?.()} role="presentation">
          <span>❌ Clear column</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => window.insertRowAbove?.()} role="presentation">
          <span>➕ Insert 1 row above</span>
        </div>
        <div className="context-menu-item" onClick={() => window.insertRowBelow?.()} role="presentation">
          <span>➕ Insert 1 row below</span>
        </div>
        <div className="context-menu-item" onClick={() => window.deleteRow?.()} role="presentation">
          <span>🗑️ Delete row</span>
        </div>
        <div className="context-menu-item" onClick={() => window.clearRow?.()} role="presentation">
          <span>❌ Clear row</span>
        </div>
      </div>

      <div id="deleteDialog" className="delete-dialog" style={{ display: "none" }}>
        <div className="delete-dialog-content">
          <div className="delete-dialog-header">
            <span>Delete</span>
            <span className="delete-dialog-close" onClick={() => window.closeDeleteDialog?.()} role="presentation">
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
            <button type="button" className="btn btn-save" onClick={(e) => window.confirmDelete?.(e)} role="presentation">
              OK
            </button>
            <button type="button" className="btn btn-cancel" onClick={(e) => window.closeDeleteDialog?.(e)} role="presentation">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
