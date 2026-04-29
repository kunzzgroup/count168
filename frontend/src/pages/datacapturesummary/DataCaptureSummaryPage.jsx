import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDataCaptureSummaryLegacyBridge } from "./hooks/useDataCaptureSummaryLegacyBridge.js";
import { buildApiUrl } from "../../utils/apiUrl.js";

function extractSummaryRowsFromCapturedTable(tableData) {
  const columnAData = [];
  const rowIndexMap = [];
  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  rows.forEach((rowData, rowIndex) => {
    if (!Array.isArray(rowData) || rowData.length <= 1 || rowData[1]?.type !== "data") return;
    const cellValue = String(rowData[1]?.value ?? "");
    if (rowIndex === 3 && cellValue.trim() !== "") {
      const trimmed = cellValue.trim();
      if (trimmed.includes("\n")) {
        const entries = trimmed
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (entries.length > 1) {
          entries.forEach((entry) => {
            columnAData.push(entry);
            rowIndexMap.push(rowIndex);
          });
          return;
        }
      }
    }
    columnAData.push(cellValue);
    rowIndexMap.push(rowIndex);
  });

  return columnAData
    .map((value, index) => ({ value: String(value ?? "").trim(), originalRowIndex: rowIndexMap[index] ?? index }))
    .filter((item) => item.value !== "")
    .map((item, index) => ({
      id: `${item.value}-${index}`,
      idProduct: item.value,
      originalRowIndex: item.originalRowIndex,
      account: "",
      accountId: null,
      currency: "",
      currencyId: null,
      formula: "",
      source: "",
      rateChecked: false,
      rateValue: "",
      processedAmount: "0.00",
      skipChecked: false,
      deleteChecked: false,
    }));
}

function computeProcessedAmount(formula, sourcePercent) {
  const sanitized = String(formula || "").replace(/,/g, "").trim();
  if (!sanitized) return "0.00";
  const safe = sanitized.replace(/[^0-9+\-*/().\s]/g, "");
  let base = 0;
  try {
    // eslint-disable-next-line no-new-func
    base = Number(Function(`"use strict"; return (${safe});`)());
    if (!Number.isFinite(base)) base = 0;
  } catch {
    base = 0;
  }
  const src = Number.parseFloat(String(sourcePercent || "1")) || 1;
  return (base * src).toFixed(2);
}

export default function DataCaptureSummaryPage() {
  const { legacyReady, companyId } = useDataCaptureSummaryLegacyBridge();
  const deleteCallbackRef = useRef(null);
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
  const [processMeta, setProcessMeta] = useState({ captureDate: "", processId: null, currencyId: null, remark: "" });
  const [processCurrencyCode, setProcessCurrencyCode] = useState("");
  const [addModalVisible, setAddModalVisible] = useState(false);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page");
    document.body.classList.add("dashboard-page", "datacapturesummary-page");
    return () => {
      document.body.classList.remove("datacapturesummary-page", "page-ready");
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
    window.location.href = "/datacapture?restore=1";
  }, []);

  const refreshPage = useCallback(() => {
    window.location.reload();
  }, []);

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

  const toggleAllRate = useCallback(() => {
    setSummaryRows((prev) => prev.map((row) => ({ ...row, rateChecked: true })));
  }, []);

  const submitRateValues = useCallback(() => {
    const expr = rateInput.trim();
    if (!expr) return;
    const operator = expr[0];
    const num = Number.parseFloat(expr.slice(1));
    if (!Number.isFinite(num) || (operator !== "*" && operator !== "/")) {
      showNotification("Error", "Rate format must be like *3 or /3", "error");
      return;
    }
    setSummaryRows((prev) =>
      prev.map((row) => {
        if (!row.rateChecked) return row;
        const amount = Number.parseFloat(String(row.processedAmount).replace(/,/g, "")) || 0;
        const next = operator === "*" ? amount * num : num === 0 ? amount : amount / num;
        return { ...row, rateValue: expr, processedAmount: next.toFixed(2) };
      }),
    );
  }, []);

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

  const submitSummaryData = useCallback(() => {
    (async () => {
      try {
        if (!processMeta.captureDate || !processMeta.processId || !processMeta.currencyId) {
          showNotification("Error", "Missing process info for submit.", "error");
          return;
        }
        const summaryPayloadRows = summaryRows
          .filter((row) => !row.skipChecked)
          .filter((row) => row.accountId && row.idProduct)
          .map((row, idx) => ({
            idProductMain: row.idProduct,
            idProductSub: "",
            productType: "main",
            accountId: Number(row.accountId),
            currencyId: Number(row.currencyId || processMeta.currencyId),
            currencyCode: row.currency || "",
            formula: row.formula || "",
            sourcePercent: row.source || "1",
            processedAmount: Number.parseFloat(String(row.processedAmount).replace(/,/g, "")) || 0,
            rateValue: row.rateValue || null,
            displayOrder: idx,
          }));
        if (!summaryPayloadRows.length) {
          showNotification("Error", "No valid rows to submit.", "error");
          return;
        }
        const response = await fetch(buildApiUrl("api/datacapture_summary/summary_api.php?action=submit"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captureDate: processMeta.captureDate,
            processId: Number(processMeta.processId),
            currencyId: Number(processMeta.currencyId),
            remark: processMeta.remark || "",
            summaryRows: summaryPayloadRows,
          }),
        });
        const json = await response.json();
        if (!json?.success) {
          throw new Error(json?.message || "Submit failed");
        }
        showNotification("Success", "Data submitted successfully.", "success");
        const url = new URL(window.location.href);
        url.searchParams.set("success", "1");
        window.location.href = url.pathname + url.search;
      } catch (error) {
        showNotification("Error", error?.message || "Submit failed", "error");
      }
    })();
  }, [processMeta.captureDate, processMeta.currencyId, processMeta.processId, processMeta.remark, showNotification, summaryRows]);

  const closeAddModal = useCallback(() => {
    setAddModalVisible(false);
  }, []);

  const openAddModal = useCallback(() => {
    setAddModalVisible(true);
  }, []);

  const addCurrencyFromInput = useCallback(() => {
    showNotification("Info", "Currency create flow is being migrated.", "info");
  }, []);

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

  const summaryTotal = useMemo(() => {
    return summaryRows
      .filter((row) => !row.skipChecked)
      .reduce((acc, row) => acc + (Number.parseFloat(String(row.processedAmount).replace(/,/g, "")) || 0), 0);
  }, [summaryRows]);

  const submitState = useMemo(() => {
    const isWithinRange = summaryTotal >= -0.05 && summaryTotal <= 0.05;
    const allRowsHaveCurrencyAndFormula = summaryRows.every((row) => !row.account || (row.currency && row.formula));
    const canSubmit = isWithinRange && allRowsHaveCurrencyAndFormula;
    let title = "";
    if (!isWithinRange) title = `Total must be between -0.05 and 0.05. Current total: ${summaryTotal.toFixed(2)}`;
    else if (!allRowsHaveCurrencyAndFormula) title = "请为每一行选择 Currency 并填写 Formula 后再提交。";
    return { canSubmit, title };
  }, [summaryRows, summaryTotal]);

  useEffect(() => {
    if (!legacyReady) return;
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success") === "1";
    const error = url.searchParams.get("error") === "1";
    if (success) {
      showNotification("Success", "Data captured and summary generated successfully!", "success");
    } else if (error) {
      showNotification("Error", "Failed to generate summary. Please try again.", "error");
    }
    if (success || error) {
      url.searchParams.delete("success");
      url.searchParams.delete("error");
      window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""));
    }

    try {
      const optionsUrl = companyId
        ? buildApiUrl(`api/datacapture_summary/summary_api.php?company_id=${encodeURIComponent(companyId)}`)
        : buildApiUrl("api/datacapture_summary/summary_api.php");
      const tableDataRaw = localStorage.getItem("capturedTableData");
      const processDataRaw = localStorage.getItem("capturedProcessData");
      if (!tableDataRaw || !processDataRaw) {
        showEmptyState();
        return;
      }
      fetch(optionsUrl, { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success) {
            setAccountOptions(Array.isArray(data.accounts) ? data.accounts : []);
            setCurrencyOptions(Array.isArray(data.currencies) ? data.currencies : []);
          }
        })
        .catch(() => {});
      const tableData = JSON.parse(tableDataRaw);
      const processData = JSON.parse(processDataRaw);
      displayProcessInfo(processData);
      const initialRows = extractSummaryRowsFromCapturedTable(tableData);
      setSummaryRows(initialRows);
      const processId = Number(processData.process ?? processData.processId ?? processData.process_id ?? 0) || null;
      const processCurrencyText = String(processData.currencyName || processData.currency || "").trim();
      setProcessCurrencyCode(processCurrencyText);
      setProcessMeta({
        captureDate: processData.date || "",
        processId,
        currencyId: null,
        remark: processData.remark || "",
      });
      hideLoadingState();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("load summary react error:", e);
      showEmptyState();
    }
  }, [companyId, displayProcessInfo, hideLoadingState, legacyReady, showEmptyState, showNotification]);

  useEffect(() => {
    if (!processCurrencyCode || !currencyOptions.length) return;
    const selectedCurrency = currencyOptions.find((c) => String(c.code || "").trim().toUpperCase() === processCurrencyCode.toUpperCase());
    if (!selectedCurrency) return;
    setProcessMeta((prev) => (prev.currencyId ? prev : { ...prev, currencyId: selectedCurrency.id }));
    setSummaryRows((prev) =>
      prev.map((row) => (row.currencyId ? row : { ...row, currencyId: selectedCurrency.id, currency: selectedCurrency.code })),
    );
  }, [currencyOptions, processCurrencyCode]);

  return (
    <div className="container">
      <h1>Data Capture Summary</h1>

      <div id="loadingState" className="loading-container" style={{ display: loadingVisible ? "block" : "none" }}>
        <div className="loading-spinner" />
        <p>Loading data...</p>
      </div>

      <div className="summary-action-buttons" id="actionButtons" style={{ display: contentVisible ? "flex" : "none" }}>
        <div style={{ flex: 1 }} />
        <div className="batch-controls-group">
          <label htmlFor="rateInput" className="batch-label">
            Rate
          </label>
          <input type="text" id="rateInput" className="batch-input" placeholder="e.g. *3 or /3" value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
          <button className="btn-update-all" id="rateSelectAllBtn" onClick={toggleAllRate} type="button">
            Select All
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
          disabled
          type="button"
        >
          Delete
        </button>
      </div>

      <div className="summary-table-container" id="summaryTableContainer" style={{ display: contentVisible ? "block" : "none" }}>
        <div className="process-info-container" id="processInfoContainer" style={{ display: processInfoVisible ? "block" : "none" }}>
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
        <div className="table-wrapper">
          <table className="summary-table" id="summaryTable">
            <thead>
              <tr>
                <th className="id-product-header">Id Product</th>
                <th>Account</th>
                <th />
                <th>Currency</th>
                <th>Formula</th>
                <th>Source</th>
                <th>Rate</th>
                <th>Rate Value</th>
                <th>Processed Amount</th>
                <th>Skip</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody id="summaryTableBody">
              {summaryRows.map((row, idx) => {
                const value = row.idProduct;
                const rowIndex = row.originalRowIndex ?? idx;
                return (
                  <tr key={row.id} data-row-index={String(rowIndex)} data-product-type="main">
                    <td className="id-product" data-main-product={value} data-sub-product="" title={value || undefined}>
                      {value}
                    </td>
                    <td>
                      <select
                        value={row.accountId ?? ""}
                        onChange={(e) => {
                          const selected = accountOptions.find((a) => String(a.id) === e.target.value);
                          setSummaryRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    accountId: selected?.id ?? null,
                                    account: selected ? `${selected.account_id}${selected.name ? ` (${selected.name})` : ""}` : "",
                                  }
                                : item,
                            ),
                          );
                        }}
                      >
                        <option value="">Select Account</option>
                        {accountOptions.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.account_id}
                            {acc.name ? ` (${acc.name})` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="add-account-btn"
                        type="button"
                        onClick={openAddModal}
                      >
                        +
                      </button>
                    </td>
                    <td>
                      <select
                        value={row.currencyId ?? ""}
                        onChange={(e) => {
                          const selected = currencyOptions.find((c) => String(c.id) === e.target.value);
                          setSummaryRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    currencyId: selected?.id ?? null,
                                    currency: selected?.code ?? "",
                                  }
                                : item,
                            ),
                          );
                        }}
                      >
                        <option value="">Currency</option>
                        {currencyOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.formula}
                        onChange={(e) => {
                          const formula = e.target.value;
                          setSummaryRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, formula, processedAmount: computeProcessedAmount(formula, item.source || "1") }
                                : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={row.source}
                        placeholder="1"
                        onChange={(e) => {
                          const source = e.target.value;
                          setSummaryRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, source, processedAmount: computeProcessedAmount(item.formula, source || "1") }
                                : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        className="rate-checkbox"
                        onChange={(e) => {
                          setSummaryRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, rateChecked: e.currentTarget.checked } : item)));
                        }}
                        checked={row.rateChecked}
                      />
                    </td>
                    <td className="editable-cell" style={{ textAlign: "center", cursor: "text" }}>{row.rateValue}</td>
                    <td>{row.processedAmount}</td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        className="summary-select-checkbox"
                        onChange={(e) => {
                          setSummaryRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, skipChecked: e.currentTarget.checked } : item)));
                        }}
                        checked={row.skipChecked}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        className="summary-row-checkbox"
                        data-value={value}
                        onChange={() => {
                          setSummaryRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, deleteChecked: !item.deleteChecked } : item)));
                        }}
                        checked={row.deleteChecked}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr id="summaryTotalRow">
                <td colSpan="8" className="summary-total-label" />
                <td id="summaryTotalAmount" style={{ color: submitState.canSubmit ? "#0D60FF" : "#A91215" }}>{summaryTotal.toFixed(2)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="summary-submit-container" id="summarySubmitContainer" style={{ display: contentVisible ? "flex" : "none" }}>
        <button type="button" className="btn btn-submit" id="summarySubmitBtn" onClick={submitSummaryData} disabled={!submitState.canSubmit} title={submitState.title}>
          Submit
        </button>
        <button type="button" className="btn btn-cancel" onClick={goBackToDataCapture} style={{ marginLeft: 10 }}>
          Back
        </button>
        <button type="button" className="btn btn-refresh" onClick={refreshPage} title="Refresh page">
          <img src="images/refresh.svg" alt="Refresh" style={{ width: "clamp(23px, 1.8vw, 35px)", height: "clamp(23px, 1.8vw, 35px)" }} />
        </button>
      </div>

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

      <div className="summary-table-container empty-state-container" style={{ display: emptyVisible ? "block" : "none" }}>
        <div className="table-header">
          <span>No Captured Data Available</span>
        </div>
        <div className="empty-state">
          <p>No captured data found. Please go back to the Data Capture page and submit some data first.</p>
          <button onClick={() => (window.location.href = "/datacapture")} className="btn btn-save" type="button">
            Go to Data Capture
          </button>
        </div>
      </div>

      <div id="addModal" className="account-modal" style={{ display: addModalVisible ? "block" : "none" }}>
        <div className="account-modal-content">
          <div className="account-modal-header">
            <h2>Add Account</h2>
            <span className="account-close" onClick={closeAddModal} role="presentation">
              &times;
            </span>
          </div>
          <div className="account-modal-body">
            <form id="addAccountForm" className="account-form">
              <div className="account-form-columns">
                <div className="account-form-column">
                  <h3 className="account-section-header">Personal Information</h3>
                  <div className="account-form-group">
                    <label htmlFor="add_account_id">Account ID *</label>
                    <input type="text" id="add_account_id" name="account_id" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_name">Name *</label>
                    <input type="text" id="add_name" name="name" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_role">Role *</label>
                    <select id="add_role" name="role" required>
                      <option value="">Select Role</option>
                    </select>
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_password">Password *</label>
                    <input type="password" id="add_password" name="password" required autoComplete="new-password" />
                  </div>
                </div>
                <div className="account-form-column">
                  <h3 className="account-section-header">Payment</h3>
                  <div className="account-form-group" />
                  <div className="account-form-group">
                    <label>Payment Alert</label>
                    <div className="account-radio-group">
                      <label className="account-radio-label">
                        <input type="radio" name="add_payment_alert" value="1" />
                        Yes
                      </label>
                      <label className="account-radio-label">
                        <input type="radio" name="add_payment_alert" value="0" defaultChecked />
                        No
                      </label>
                    </div>
                  </div>
                  <div className="account-form-row" id="add_alert_fields" style={{ display: "none" }}>
                    <div className="account-form-group">
                      <label htmlFor="add_alert_type">Alert Type</label>
                      <select id="add_alert_type" name="alert_type">
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
                      <input type="date" id="add_alert_start_date" name="alert_start_date" />
                    </div>
                  </div>
                  <div className="account-form-group" id="add_alert_amount_row" style={{ display: "none" }}>
                    <label htmlFor="add_alert_amount">Alert (Amount)</label>
                    <input type="number" id="add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)" />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_remark">Remark</label>
                    <textarea id="add_remark" name="remark" rows="1" style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} />
                  </div>
                </div>
              </div>

              <div className="account-form-section">
                <div className="account-advance-section">
                  <h3>Advanced Account</h3>
                  <div className="account-other-currency">
                    <label>Other Currency:</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <input type="text" id="addCurrencyInput" placeholder="Enter new currency code (e.g., EUR, JPY, GBP)" style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4 }} />
                      <button type="button" className="account-btn-add-currency" onClick={addCurrencyFromInput}>
                        Create Currency
                      </button>
                    </div>
                    <div className="account-currency-list" id="addCurrencyList" />
                  </div>
                  <div className="account-other-currency" style={{ marginTop: 20 }}>
                    <label>Company:</label>
                    <div className="account-currency-list" id="addCompanyList" />
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
    </div>
  );
}
