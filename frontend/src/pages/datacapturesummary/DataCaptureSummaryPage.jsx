import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useSummaryTableColumns } from "./hooks/useSummaryTableColumns.jsx";
import { useDataCaptureSummarySubmit } from "./hooks/useDataCaptureSummarySubmit.js";
import { useDataCaptureSummaryBootstrap } from "./hooks/useDataCaptureSummaryBootstrap.js";
import { useSummaryServerState } from "./hooks/useSummaryServerState.js";
import { extractSummaryRowsFromCapturedTable } from "./utils/summaryTableTransform.js";
import {
  computeProcessedAmounts,
  formatAmountDisplay,
  formatFixed2,
  legacyRowCurrencyFormulaOk,
  legacySubmitTotalTolerance,
  parseDisplayAmountToNumber,
  parseLooseNumericInput,
} from "./utils/summaryNumberUtils.js";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import { postSummaryStateSync } from "./utils/summaryServerPayload.js";

import "./styles/datacapturesummary.css";

export default function DataCaptureSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const deleteCallbackRef = useRef(null);

  const [companyId, setCompanyId] = useState(null);
  const [notification, setNotification] = useState({
    visible: false,
    title: "Notification",
    message: "Message",
    type: "info",
  });
  const [confirmDeleteState, setConfirmDeleteState] = useState({
    visible: false,
    message: "This action cannot be undone.",
  });
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [contentVisible, setContentVisible] = useState(false);
  const [emptyVisible, setEmptyVisible] = useState(false);
  const [processInfoVisible, setProcessInfoVisible] = useState(false);
  const [processInfo, setProcessInfo] = useState({
    date: "-",
    process: "-",
    description: "-",
    currency: "-",
    remark: "-",
  });
  const [summaryRows, setSummaryRows] = useState([]);
  const [rateInput, setRateInput] = useState("");
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [processMeta, setProcessMeta] = useState({
    captureDate: "",
    processId: null,
    currencyId: null,
    remark: "",
    processName: "",
    processCode: "",
    currencyName: "",
  });
  const [processCurrencyCode, setProcessCurrencyCode] = useState("");
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm, setAddForm] = useState({
    account_id: "",
    name: "",
    role: "",
    password: "",
    payment_alert: "0",
    alert_type: "",
    alert_start_date: "",
    alert_amount: "",
    remark: "",
  });
  const [addCurrencyInput, setAddCurrencyInput] = useState("");
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [companyPickOptions, setCompanyPickOptions] = useState([]);
  const [selectedCompanyIdsForAdd, setSelectedCompanyIdsForAdd] = useState([]);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page");
    document.body.classList.add("dashboard-page", "datacapturesummary-page");
    return () => {
      document.body.classList.remove("datacapturesummary-page", "page-ready");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchUser = async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!cancelled) {
          setCompanyId(json?.data?.company_id ?? null);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch current user:", error);
      }
    };
    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  const hideNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, visible: false }));
  }, []);

  const showNotification = useCallback((title, message, type = "success") => {
    setNotification({
      visible: true,
      title: title || "Notification",
      message: message || "",
      type,
    });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }));
    }, 5000);
  }, []);

  const goBackToDataCapture = useCallback(() => {
    navigate("/datacapture?restore=1");
  }, [navigate]);

  const rateSelectAllLabel = useMemo(() => {
    const eligible = summaryRows.filter((r) => String(r.idProduct || "").trim() !== "");
    if (eligible.length === 0) return "Select All";
    return eligible.every((r) => r.rateChecked) ? "Clear All" : "Select All";
  }, [summaryRows]);

  const toggleAllRate = useCallback(() => {
    setSummaryRows((prev) => {
      const eligible = prev.filter((r) => String(r.idProduct || "").trim() !== "");
      const allChecked = eligible.length > 0 && eligible.every((r) => r.rateChecked);
      return prev.map((row) => {
        if (!String(row.idProduct || "").trim()) return row;
        return { ...row, rateChecked: !allChecked };
      });
    });
  }, []);

  const refreshPage = useCallback(async () => {
    if (contentVisible && !emptyVisible && summaryRows.length > 0 && processMeta.processId) {
      await postSummaryStateSync(summaryRows, processMeta, companyId);
    }
    navigate(0);
  }, [companyId, contentVisible, emptyVisible, navigate, processMeta, summaryRows]);

  const closeConfirmDeleteModal = useCallback(() => {
    setConfirmDeleteState((prev) => ({ ...prev, visible: false }));
    deleteCallbackRef.current = null;
  }, []);

  const confirmDelete = useCallback(() => {
    const callback = deleteCallbackRef.current;
    if (typeof callback === "function") callback();
    closeConfirmDeleteModal();
  }, [closeConfirmDeleteModal]);

  const showConfirmDelete = useCallback((message, callback) => {
    deleteCallbackRef.current = callback;
    setConfirmDeleteState({
      visible: true,
      message: message || "This action cannot be undone.",
    });
  }, []);

  const submitRateValues = useCallback(() => {
    const expr = rateInput.trim();
    if (!expr) return;
    const operator = expr[0];
    const num = parseLooseNumericInput(expr.slice(1));
    if (!Number.isFinite(num) || (operator !== "*" && operator !== "/")) {
      showNotification("Error", "Rate format must be like *3 or /3", "error");
      return;
    }
    setSummaryRows((prev) =>
      prev.map((row) => {
        if (!row.rateChecked) return row;
        const base = Number.parseFloat(String(row.baseProcessedAmount).replace(/,/g, "")) || 0;
        const next = operator === "*" ? base * num : num === 0 ? base : base / num;
        return { ...row, rateValue: expr, processedAmount: formatFixed2(next) };
      }),
    );
  }, [rateInput, showNotification]);

  const deleteSelectedRows = useCallback(() => {
    const count = summaryRows.filter((row) => row.deleteChecked).length;
    if (!count) {
      showNotification("Info", "Please select rows to delete.", "info");
      return;
    }
    showConfirmDelete(`Delete ${count} selected row(s)?`, () => {
      setSummaryRows((prev) => prev.filter((row) => !row.deleteChecked));
    });
  }, [showConfirmDelete, showNotification, summaryRows]);

  const { submitSummaryData, isSubmitting } = useDataCaptureSummarySubmit({
    companyId,
    processMeta,
    summaryRows,
    parseDisplayAmountToNumber,
    showNotification,
    navigate,
  });

  const loadCompanyPickOptions = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/accounts/account_company_api.php?action=get_available_companies"), { credentials: "include" });
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) setCompanyPickOptions(json.data);
    } catch {
      setCompanyPickOptions([]);
    }
  }, []);

  const closeAddModal = useCallback(() => {
    setAddModalVisible(false);
    setAddCurrencyInput("");
    setSelectedCurrencyIds([]);
    setSelectedCompanyIdsForAdd([]);
  }, []);

  const openAddModal = useCallback(() => {
    setAddModalVisible(true);
    loadCompanyPickOptions();
  }, [loadCompanyPickOptions]);

  useSummaryServerState({
    enabled: contentVisible && !emptyVisible && summaryRows.length > 0,
    companyId,
    processMeta,
    summaryRows,
  });

  useEffect(() => {
    const onPageShow = (ev) => {
      if (!ev.persisted) return;
      setSummaryRows((prev) =>
        prev.map((row) => ({
          ...row,
          ...computeProcessedAmounts(row.formula || "", row.source || "1", row.rateValue || ""),
        })),
      );
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const submitAddAccount = useCallback(
    async (e) => {
      e.preventDefault();
      try {
        const formData = new FormData();
        formData.set("account_id", addForm.account_id.trim().toUpperCase());
        formData.set("name", addForm.name.trim().toUpperCase());
        formData.set("role", addForm.role);
        formData.set("password", addForm.password);
        formData.set("payment_alert", addForm.payment_alert);
        formData.set("remark", addForm.remark.trim().toUpperCase());
        formData.set("alert_type", addForm.payment_alert === "1" ? addForm.alert_type : "");
        formData.set("alert_start_date", addForm.payment_alert === "1" ? addForm.alert_start_date : "");
        formData.set("alert_amount", addForm.payment_alert === "1" ? addForm.alert_amount : "");
        if (companyId) formData.set("company_id", String(companyId));

        const response = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const json = await response.json();
        if (!json?.success) throw new Error(json?.message || json?.error || "Failed to add account");
        const newAccountId = json?.data?.id ?? null;
        if (newAccountId && selectedCurrencyIds.length > 0) {
          await Promise.all(
            selectedCurrencyIds.map((currencyId) =>
              fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: newAccountId, currency_id: currencyId }),
                credentials: "include",
              }),
            ),
          );
        }
        if (newAccountId && selectedCompanyIdsForAdd.length > 0) {
          await Promise.all(
            selectedCompanyIdsForAdd.map((cid) =>
              fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: newAccountId, company_id: cid }),
                credentials: "include",
              }),
            ),
          );
        }

        const optUrl = companyId
          ? buildApiUrl(`api/datacapture_summary/summary_api.php?company_id=${encodeURIComponent(companyId)}`)
          : buildApiUrl("api/datacapture_summary/summary_api.php");
        const optRes = await fetch(optUrl, { credentials: "include" });
        const optJson = await optRes.json();
        if (optJson?.success && Array.isArray(optJson.accounts)) {
          setAccountOptions(optJson.accounts);
        }

        showNotification("Success", "Account added successfully!", "success");
        setAddModalVisible(false);
        setAddCurrencyInput("");
        setSelectedCurrencyIds([]);
        setSelectedCompanyIdsForAdd([]);
        setAddForm({
          account_id: "",
          name: "",
          role: "",
          password: "",
          payment_alert: "0",
          alert_type: "",
          alert_start_date: "",
          alert_amount: "",
          remark: "",
        });
      } catch (error) {
        showNotification("Error", error?.message || "Failed to add account", "error");
      }
    },
    [addForm, companyId, selectedCompanyIdsForAdd, selectedCurrencyIds, showNotification],
  );

  const addCurrencyFromInput = useCallback(async () => {
    const code = addCurrencyInput.trim().toUpperCase();
    if (!code) {
      showNotification("Info", "Please enter a currency code first.", "info");
      return;
    }
    if (!companyId) {
      showNotification("Error", "Missing company context.", "error");
      return;
    }
    try {
      const response = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: companyId }),
        credentials: "include",
      });
      const json = await response.json();
      if (!json?.success || !json?.data) {
        throw new Error(json?.message || json?.error || "Failed to create currency");
      }
      const created = { id: json.data.id, code: json.data.code };
      setCurrencyOptions((prev) => {
        if (prev.some((item) => Number(item.id) === Number(created.id))) return prev;
        return [...prev, created];
      });
      setSelectedCurrencyIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setAddCurrencyInput("");
      showNotification("Success", `Currency ${created.code} created.`, "success");
    } catch (error) {
      showNotification("Error", error?.message || "Failed to create currency", "error");
    }
  }, [addCurrencyInput, companyId, showNotification]);

  const hideLoadingState = useCallback(() => {
    setLoadingVisible(false);
    setContentVisible(true);
    setEmptyVisible(false);
  }, []);

  const showEmptyState = useCallback(() => {
    setLoadingVisible(false);
    setContentVisible(false);
    setEmptyVisible(true);
  }, []);

  const displayProcessInfo = useCallback((legacyProcessData) => {
    if (!legacyProcessData || typeof legacyProcessData !== "object") return;
    const descriptions = Array.isArray(legacyProcessData.descriptions) ? legacyProcessData.descriptions : [];
    setProcessInfo({
      date: legacyProcessData.date || "-",
      process: legacyProcessData.processName || legacyProcessData.process || "-",
      description: descriptions.length > 0 ? descriptions.join(", ") : "-",
      currency: legacyProcessData.currencyName || legacyProcessData.currency || "-",
      remark: legacyProcessData.remark || "-",
    });
    setProcessInfoVisible(true);
  }, []);

  useDataCaptureSummaryBootstrap({
    companyId,
    locationSearch: location.search,
    showNotification,
    showEmptyState,
    hideLoadingState,
    displayProcessInfo,
    extractSummaryRowsFromCapturedTable,
    setSummaryRows,
    setProcessCurrencyCode,
    setProcessMeta,
    setAccountOptions,
    setCurrencyOptions,
    setRoleOptions,
  });

  const submitState = useMemo(() => {
    const { ok: isWithinRange, formattedTotal, finalTotal } = legacySubmitTotalTolerance(summaryRows);
    const allRowsHaveCurrencyAndFormula = summaryRows.every(legacyRowCurrencyFormulaOk);
    const canSubmit = isWithinRange && allRowsHaveCurrencyAndFormula;
    let title = "";
    if (!isWithinRange) {
      title = `Cannot submit: The sum of Processed Amount must be between -0.05 and 0.05. Current sum: ${formattedTotal}`;
    } else if (!allRowsHaveCurrencyAndFormula) {
      title = "请先为已选 Account 的每一行填写 Currency 与 Formula 后再提交。（Cannot save: Currency and Formula are required.）";
    }
    const footerTotalValue = Number.parseFloat(String(finalTotal).replace(/,/g, ""));
    return {
      canSubmit,
      title,
      footerTotalValue: Number.isFinite(footerTotalValue) ? footerTotalValue : 0,
    };
  }, [summaryRows]);

  useEffect(() => {
    if (!processCurrencyCode || !currencyOptions.length) return;
    const selectedCurrency = currencyOptions.find((c) => String(c.code || "").trim().toUpperCase() === processCurrencyCode.toUpperCase());
    if (!selectedCurrency) return;
    setProcessMeta((prev) =>
      prev.currencyId ? prev : { ...prev, currencyId: selectedCurrency.id, currencyName: selectedCurrency.code || prev.currencyName },
    );
    setSummaryRows((prev) =>
      prev.map((row) => (row.currencyId ? row : { ...row, currencyId: selectedCurrency.id, currency: selectedCurrency.code })),
    );
  }, [currencyOptions, processCurrencyCode]);

  const summaryColumns = useSummaryTableColumns({
    accountOptions,
    currencyOptions,
    openAddModal,
    setSummaryRows,
    computeProcessedAmounts,
    formatAmountDisplay,
  });

  const summaryTable = useReactTable({
    data: summaryRows,
    columns: summaryColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="container">
      <h1>Data Capture Summary</h1>

      {loadingVisible && (
        <div id="loadingState" className="loading-container">
          <div className="loading-spinner" />
          <p>Loading data...</p>
        </div>
      )}

      {contentVisible && (
        <>
          <div className="summary-action-buttons" id="actionButtons">
            <div style={{ flex: 1 }} />
            <div className="batch-controls-group">
              <label htmlFor="rateInput" className="batch-label">
                Rate
              </label>
              <input type="text" id="rateInput" className="batch-input" placeholder="e.g. *3 or /3" value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
              <button className="btn-update-all" id="rateSelectAllBtn" onClick={toggleAllRate} type="button">
                {rateSelectAllLabel}
              </button>
              <button className="btn-update-all" id="topSubmitBtn" onClick={submitRateValues} type="button">
                Submit
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <button
              className="summary-btn summary-btn-delete"
              id="summaryDeleteSelectedBtn"
              onClick={deleteSelectedRows}
              title="Delete selected rows"
              disabled={!summaryRows.some((row) => row.deleteChecked)}
              type="button"
            >
              Delete
            </button>
          </div>

          <div className="summary-table-container" id="summaryTableContainer">
            {processInfoVisible && (
              <div className="process-info-container" id="processInfoContainer">
                <div className="process-info-row">
                  <div className="process-info-item">
                    <span className="process-info-label">Date:</span>
                    <span className="process-info-value" id="processInfoDate">{processInfo.date}</span>
                  </div>
                  <div className="process-info-item">
                    <span className="process-info-label">Process:</span>
                    <span className="process-info-value" id="processInfoProcess">{processInfo.process}</span>
                  </div>
                  <div className="process-info-item">
                    <span className="process-info-label">Description:</span>
                    <span className="process-info-value" id="processInfoDescription">{processInfo.description}</span>
                  </div>
                  <div className="process-info-item">
                    <span className="process-info-label">Currency:</span>
                    <span className="process-info-value" id="processInfoCurrency">{processInfo.currency}</span>
                  </div>
                  <div className="process-info-item">
                    <span className="process-info-label">Remark:</span>
                    <span className="process-info-value" id="processInfoRemark">{processInfo.remark}</span>
                  </div>
                </div>
              </div>
            )}
            <div className="table-wrapper">
              <table className="summary-table" id="summaryTable">
                <thead>
                  {summaryTable.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className={header.column.columnDef.meta?.className || undefined}>
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody id="summaryTableBody">
                  {summaryTable.getRowModel().rows.map((tableRow) => {
                    const rowData = tableRow.original;
                    const rowIndex = rowData.originalRowIndex ?? tableRow.index;
                    return (
                      <tr key={tableRow.id} data-row-index={String(rowIndex)} data-product-type="main">
                        {tableRow.getVisibleCells().map((cell) => (
                          <td key={cell.id} className={cell.column.columnDef.meta?.className || undefined}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr id="summaryTotalRow">
                    <td colSpan="8" className="summary-total-label" />
                    <td id="summaryTotalAmount" style={{ color: submitState.canSubmit ? "#0D60FF" : "#A91215" }}>{formatAmountDisplay(submitState.footerTotalValue)}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="summary-submit-container" id="summarySubmitContainer">
            <button
              type="button"
              className="btn btn-submit"
              id="summarySubmitBtn"
              onClick={submitSummaryData}
              disabled={!submitState.canSubmit || isSubmitting}
              title={submitState.title}
            >
              Submit
            </button>
            <button type="button" className="btn btn-cancel" onClick={goBackToDataCapture} style={{ marginLeft: 10 }}>
              Back
            </button>
            <button type="button" className="btn btn-refresh" onClick={refreshPage} title="Refresh page">
              <img src={assetUrl("images/refresh.svg")} alt="Refresh" style={{ width: "clamp(23px, 1.8vw, 35px)", height: "clamp(23px, 1.8vw, 35px)" }} />
            </button>
          </div>
        </>
      )}

      <div
        id="notificationPopup"
        className={`notification-popup ${notification.type} ${notification.visible ? "show" : ""}`}
        style={{ display: notification.visible ? "block" : "none" }}
      >
        <div className="notification-header">
          <span className="notification-title" id="notificationTitle">
            {notification.title}
          </span>
          <button className="notification-close" onClick={hideNotification} type="button">
            &times;
          </button>
        </div>
        <div className="notification-message" id="notificationMessage">
          {notification.message}
        </div>
      </div>

      <div id="confirmDeleteModal" className="summary-modal" style={{ display: confirmDeleteState.visible ? "flex" : "none" }}>
        <div className="summary-confirm-modal-content">
          <div className="summary-confirm-icon-container">
            <svg className="summary-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="summary-confirm-title">Confirm Delete</h2>
          <p id="confirmDeleteMessage" className="summary-confirm-message">
            {confirmDeleteState.message}
          </p>
          <div className="summary-confirm-actions">
            <button type="button" className="summary-btn summary-btn-cancel confirm-cancel" onClick={closeConfirmDeleteModal}>
              Cancel
            </button>
            <button type="button" className="summary-btn summary-btn-delete confirm-delete" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>

      {emptyVisible && (
        <div className="summary-table-container empty-state-container">
          <div className="table-header">
            <span>No Captured Data Available</span>
          </div>
          <div className="empty-state">
            <p>No captured data found. Please go back to the Data Capture page and submit some data first.</p>
            <button onClick={() => navigate("/datacapture")} className="btn btn-save" type="button">
              Go to Data Capture
            </button>
          </div>
        </div>
      )}

      {addModalVisible && (
        <div id="addModal" className="account-modal" style={{ display: "block" }}>
          <div className="account-modal-content">
            <div className="account-modal-header">
              <h2>Add Account</h2>
              <span className="account-close" onClick={closeAddModal} role="presentation">
                &times;
              </span>
            </div>
            <div className="account-modal-body">
              <form id="addAccountForm" className="account-form" onSubmit={submitAddAccount}>
                <div className="account-form-columns">
                  <div className="account-form-column">
                    <h3 className="account-section-header">Personal Information</h3>
                    <div className="account-form-group">
                      <label htmlFor="add_account_id">Account ID *</label>
                      <input type="text" id="add_account_id" name="account_id" required value={addForm.account_id} onChange={(e) => setAddForm((p) => ({ ...p, account_id: e.target.value.toUpperCase() }))} />
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_name">Name *</label>
                      <input type="text" id="add_name" name="name" required value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value.toUpperCase() }))} />
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_role">Role *</label>
                      <select id="add_role" name="role" required value={addForm.role} onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value }))}>
                        <option value="">Select Role</option>
                        {roleOptions.map((role) => (
                          <option key={role.id ?? role.role ?? role.name} value={role.role ?? role.name}>
                            {role.role ?? role.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_password">Password *</label>
                      <input type="password" id="add_password" name="password" required autoComplete="new-password" value={addForm.password} onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))} />
                    </div>
                  </div>
                  <div className="account-form-column">
                    <h3 className="account-section-header">Payment</h3>
                    <div className="account-form-group" />
                    <div className="account-form-group">
                      <label>Payment Alert</label>
                      <div className="account-radio-group">
                        <label className="account-radio-label">
                          <input type="radio" name="add_payment_alert" value="1" checked={addForm.payment_alert === "1"} onChange={() => setAddForm((p) => ({ ...p, payment_alert: "1" }))} />
                          Yes
                        </label>
                        <label className="account-radio-label">
                          <input type="radio" name="add_payment_alert" value="0" checked={addForm.payment_alert === "0"} onChange={() => setAddForm((p) => ({ ...p, payment_alert: "0" }))} />
                          No
                        </label>
                      </div>
                    </div>
                    <div className="account-form-row" id="add_alert_fields" style={{ display: addForm.payment_alert === "1" ? "flex" : "none" }}>
                      <div className="account-form-group">
                        <label htmlFor="add_alert_type">Alert Type</label>
                        <select id="add_alert_type" name="alert_type" value={addForm.alert_type} onChange={(e) => setAddForm((p) => ({ ...p, alert_type: e.target.value }))}>
                          <option value="">Select Type</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          {dayOptions.map((d) => (
                            <option key={d} value={d}>
                              {d} Days
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="account-form-group">
                        <label htmlFor="add_alert_start_date">Start Date</label>
                        <input type="date" id="add_alert_start_date" name="alert_start_date" value={addForm.alert_start_date} onChange={(e) => setAddForm((p) => ({ ...p, alert_start_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="account-form-group" id="add_alert_amount_row" style={{ display: addForm.payment_alert === "1" ? "block" : "none" }}>
                      <label htmlFor="add_alert_amount">Alert (Amount)</label>
                      <input type="number" id="add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)" value={addForm.alert_amount} onChange={(e) => setAddForm((p) => ({ ...p, alert_amount: e.target.value }))} />
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_remark">Remark</label>
                      <textarea id="add_remark" name="remark" rows="1" style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} value={addForm.remark} onChange={(e) => setAddForm((p) => ({ ...p, remark: e.target.value.toUpperCase() }))} />
                    </div>
                  </div>
                </div>

                <div className="account-form-section">
                  <div className="account-advance-section">
                    <h3>Advanced Account</h3>
                    <div className="account-other-currency">
                      <label>Other Currency:</label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <input
                          type="text"
                          id="addCurrencyInput"
                          placeholder="Enter new currency code (e.g., EUR, JPY, GBP)"
                          style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
                          value={addCurrencyInput}
                          onChange={(e) => setAddCurrencyInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCurrencyFromInput();
                            }
                          }}
                        />
                        <button type="button" className="account-btn-add-currency" onClick={addCurrencyFromInput}>
                          Create Currency
                        </button>
                      </div>
                      <div className="account-currency-list" id="addCurrencyList">
                        {currencyOptions.map((currency) => (
                          <label key={currency.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 10 }}>
                            <input
                              type="checkbox"
                              checked={selectedCurrencyIds.includes(currency.id)}
                              onChange={(e) => {
                                setSelectedCurrencyIds((prev) =>
                                  e.target.checked ? [...new Set([...prev, currency.id])] : prev.filter((id) => id !== currency.id),
                                );
                              }}
                            />
                            {currency.code}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="account-other-currency" style={{ marginTop: 20 }}>
                      <label>Company:</label>
                      <div className="account-currency-list" id="addCompanyList">
                        {companyPickOptions.map((c) => (
                          <label key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 10 }}>
                            <input
                              type="checkbox"
                              checked={selectedCompanyIdsForAdd.includes(c.id)}
                              onChange={(e) => {
                                const id = c.id;
                                setSelectedCompanyIdsForAdd((prev) =>
                                  e.target.checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
                                );
                              }}
                            />
                            {c.company_id || c.code || c.name || c.id}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="account-form-actions">
                  <button type="submit" className="account-btn account-btn-save">
                    Add Account
                  </button>
                  <button type="button" className="account-btn account-btn-cancel" onClick={closeAddModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
