import { pushSummaryNotification } from "./summaryNotify.js";
import { stripSummarySuccessParamFromUrl } from "./summaryStorage.js";

const PREPOPULATE_READY_TIMEOUT_MS = 8000;
const PREPOPULATE_POLL_MS = 40;

function resolveSummaryProcessId() {
  if (typeof window.getCurrentProcessId === "function") {
    const id = window.getCurrentProcessId();
    if (id != null) return id;
  }
  if (typeof window.currentProcessId === "number" && Number.isFinite(window.currentProcessId)) {
    return window.currentProcessId;
  }
  return null;
}

/** Wait until React rows, captured reference table, process id, and company id are ready. */
export async function waitForSummaryPrePopulateReady() {
  const deadline = Date.now() + PREPOPULATE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const summaryBody = document.getElementById("summaryTableBody");
    const capturedBody = document.getElementById("capturedTableBody");
    const hasRows = !!summaryBody?.querySelector("tr");
    const hasCaptured = !!capturedBody?.querySelector("tr");
    const processId = resolveSummaryProcessId();
    const companyId = window.DATACAPTURESUMMARY_COMPANY_ID;

    if (hasRows && hasCaptured && processId != null && companyId != null) {
      return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, PREPOPULATE_POLL_MS));
  }
  console.warn("Summary pre-populate readiness timeout", {
    rows: document.getElementById("summaryTableBody")?.querySelectorAll("tr").length ?? 0,
    captured: document.getElementById("capturedTableBody")?.querySelectorAll("tr").length ?? 0,
    processId: resolveSummaryProcessId(),
    companyId: window.DATACAPTURESUMMARY_COMPANY_ID ?? null,
  });
  return false;
}

function readSummaryRefreshStateFromLocalStorage() {
  try {
    const raw = localStorage.getItem("capturedTableFormulaSourceForRefresh");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** accountDbId -> data-row-index from saved refresh snapshot */
function buildPreferredAccountRowIndexMap(saved) {
  const map = new Map();
  if (!saved || typeof saved !== "object") return map;

  const byStable = saved.rowsByStableKey;
  if (byStable && typeof byStable === "object") {
    Object.entries(byStable).forEach(([stableKey, data]) => {
      const parts = stableKey.split("\t");
      const rowIndex = parts[1]?.trim() ?? "";
      const accountPart = parts[2]?.trim() ?? "";
      let accountId = "";
      if (accountPart.startsWith("id:")) {
        accountId = accountPart.slice(3).trim();
      }
      const fromData = data?.accountDbId != null ? String(data.accountDbId).trim() : "";
      accountId = accountId || fromData;
      if (accountId && rowIndex !== "") {
        map.set(accountId, rowIndex);
      }
    });
  }

  const byUid = saved.rowsByRowUid;
  if (byUid && typeof byUid === "object" && byStable) {
    Object.entries(byUid).forEach(([uid, data]) => {
      const accountId = data?.accountDbId != null ? String(data.accountDbId).trim() : "";
      if (!accountId || map.has(accountId)) return;
      for (const [stableKey, rowData] of Object.entries(byStable)) {
        if (rowData?.rowUid !== uid) continue;
        const rowIndex = stableKey.split("\t")[1]?.trim() ?? "";
        if (rowIndex !== "") {
          map.set(accountId, rowIndex);
        }
        break;
      }
    });
  }

  return map;
}

function clearSummaryRowAccountAssignment(row) {
  const accountCell = row.querySelector("td:nth-child(2)");
  if (accountCell) {
    accountCell.textContent = "";
    accountCell.removeAttribute("data-account-id");
  }
  row.removeAttribute("data-template-applied");
  row.removeAttribute("data-account-order");
}

function clearSummaryRowAccountAndFormula(row) {
  clearSummaryRowAccountAssignment(row);
  const cells = row.querySelectorAll("td");
  if (cells[4]) {
    cells[4].innerHTML = '<div class="formula-cell-content"><span class="formula-text"></span></div>';
  }
  if (cells[5]) cells[5].textContent = "";
  if (cells[8]) cells[8].textContent = "0.00";
  row.removeAttribute("data-formula-operators");
  row.removeAttribute("data-template-formula-operators");
  row.removeAttribute("data-formula-display");
  row.removeAttribute("data-formula-raw");
  row.removeAttribute("data-source-columns");
  row.removeAttribute("data-source-percent");
  row.setAttribute("data-base-processed-amount", "0");
}

/**
 * Soft refresh: template populate may assign an account to the wrong M99M06 row (by template row_index),
 * then restore applies the same account to the saved row_index — clear template misplacements first.
 */
export function clearMisplacedTemplateAccountsBeforeRestore(saved) {
  const preferred = buildPreferredAccountRowIndexMap(saved);
  if (preferred.size === 0) return;

  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach((row) => {
    if ((row.getAttribute("data-product-type") || "main") !== "main") return;
    const accountCell = row.querySelector("td:nth-child(2)");
    const accountId = accountCell?.getAttribute("data-account-id")?.trim();
    if (!accountId) return;

    const preferredRowIndex = preferred.get(accountId);
    if (preferredRowIndex == null) return;

    const rowIndex = row.getAttribute("data-row-index")?.trim() ?? "";
    if (String(rowIndex) === String(preferredRowIndex)) return;

    clearSummaryRowAccountAndFormula(row);
  });
}

/** Safety net after restore — keep one row per (id_product, account_id). */
export function dedupeSummaryAccountsAfterRestore(saved) {
  const preferred = buildPreferredAccountRowIndexMap(saved);
  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return;

  const groups = new Map();

  tbody.querySelectorAll("tr").forEach((row) => {
    if ((row.getAttribute("data-product-type") || "main") !== "main") return;
    const accountCell = row.querySelector("td:nth-child(2)");
    const accountId = accountCell?.getAttribute("data-account-id")?.trim();
    const accountText = accountCell?.textContent?.trim();
    if (!accountId || !accountText || accountText === "+") return;

    const idCell = row.querySelector("td:first-child");
    const idProduct =
      idCell?.getAttribute("data-main-product")?.trim() || idCell?.textContent?.trim() || "";
    const groupKey = `${idProduct.replace(/\s+/g, " ").trim()}::${accountId}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  });

  groups.forEach((rows) => {
    if (rows.length <= 1) return;
    const accountId = rows[0].querySelector("td:nth-child(2)")?.getAttribute("data-account-id")?.trim();
    const preferredRowIndex = accountId ? preferred.get(accountId) : null;
    let keepRow = rows.find(
      (row) => String(row.getAttribute("data-row-index") || "") === String(preferredRowIndex || "")
    );
    if (!keepRow) keepRow = rows[rows.length - 1];
    rows.forEach((row) => {
      if (row === keepRow) return;
      clearSummaryRowAccountAndFormula(row);
    });
  });

  window.rebuildUsedAccountIds?.();
}

async function preloadSummaryAccountCatalog() {
  if (typeof window.fetchSummaryAccountList !== "function") return;
  try {
    const accounts = await window.fetchSummaryAccountList();
    if (Array.isArray(accounts) && accounts.length) {
      window.__summaryAccountListCache = accounts;
      window.__accountListWithRoles = accounts;
      window.applyAccountDisplayByRoleToAllRows?.();
    }
  } catch (error) {
    console.warn("preloadSummaryAccountCatalog failed:", error);
  }
}

/**
 * Runs template auto-populate + formula/rate restore after React renders summary rows.
 * Mirrors the .finally() block in populateOriginalTableWithColumnAData.
 */
export async function runSummaryTablePostPopulate(idProducts) {
  await waitForSummaryPrePopulateReady();
  await preloadSummaryAccountCatalog();

  if (typeof window.autoPopulateSummaryRowsFromTemplates !== "function") {
    runSummaryTablePostPopulateFinally();
    return;
  }

  try {
    await window.autoPopulateSummaryRowsFromTemplates(idProducts);
    if (window.currentProcessHadTemplates !== true) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await window.autoPopulateSummaryRowsFromTemplates(idProducts);
    }
  } catch (error) {
    console.error("Auto-populate templates error:", error);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await window.autoPopulateSummaryRowsFromTemplates(idProducts);
    } catch (retryError) {
      console.error("Auto-populate templates retry error:", retryError);
    }
  } finally {
    runSummaryTablePostPopulateFinally();
  }
}

function runSummaryTablePostPopulateFinally() {
  try {
    const isFreshFromCapture = window.__summaryFreshFromCapture === true;
    if (isFreshFromCapture) {
      try {
        localStorage.removeItem("capturedTableRateValues");
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem("capturedTableRateValuesByProductId");
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem("capturedTableFormulaSourceForRefresh");
      } catch {
        /* ignore */
      }
      window._summaryStateFromServer = null;
    } else {
      let savedSnapshot = null;
      if (window.__SUMMARY_SOFT_REFRESH__ === true) {
        savedSnapshot = readSummaryRefreshStateFromLocalStorage();
        if (savedSnapshot) {
          clearMisplacedTemplateAccountsBeforeRestore(savedSnapshot);
        }
      }
      window.restoreFormulaSourceFromRefresh?.();
      if (savedSnapshot) {
        dedupeSummaryAccountsAfterRestore(savedSnapshot);
      }
      window.restoreRateValuesFromRefresh?.();
      if (typeof window.restoreRateValuesFromRefresh === "function") {
        setTimeout(window.restoreRateValuesFromRefresh, 80);
      }
    }

    if (
      !isFreshFromCapture &&
      window.currentProcessHadTemplates !== true &&
      window._summaryHasRefreshStateToPreserve !== true
    ) {
      const summaryTableBody = document.getElementById("summaryTableBody");
      if (summaryTableBody) {
        summaryTableBody.querySelectorAll("tr").forEach((row) => {
          const cells = row.querySelectorAll("td");
          if (cells[4]) {
            cells[4].innerHTML =
              '<div class="formula-cell-content"><span class="formula-text"></span></div>';
            const span = cells[4].querySelector(".formula-text");
            if (span) span.textContent = "";
          }
          if (cells[5]) cells[5].textContent = "";
          row.removeAttribute("data-formula-operators");
          row.removeAttribute("data-template-formula-operators");
          row.removeAttribute("data-formula-display");
          row.removeAttribute("data-formula-raw");
          row.removeAttribute("data-source-columns");
          row.removeAttribute("data-source-percent");
          row.setAttribute("data-base-processed-amount", "0");
          if (cells[8]) cells[8].textContent = "0.00";
        });
      }
    }

    if (isFreshFromCapture && typeof window.recalculateSummaryProcessedAmountsFromDisplayedFormula === "function") {
      window.recalculateSummaryProcessedAmountsFromDisplayedFormula();
    }
  } catch (e) {
    console.warn("Summary init (restore / clear formulas) failed:", e);
  }

  window.updateProcessedAmountTotal?.();
  setTimeout(() => {
    window.updateProcessedAmountTotal?.();
  }, 120);

  rebindAllSummaryTableRows();
  if (!window.__SUMMARY_REACT_TABLE__) {
    showSummarySuccessNotificationIfNeeded();
  }
}

/** True when summary rows exist but template populate has not filled account/formula yet. */
export function summaryTableNeedsTemplatePopulate() {
  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return true;

  const rows = tbody.querySelectorAll("tr");
  if (!rows.length) return true;

  let dataRows = 0;
  let populatedRows = 0;

  rows.forEach((row) => {
    const idText = row.querySelector("td.id-product")?.textContent?.trim() || "";
    if (!idText || /TOTAL/i.test(idText)) return;

    dataRows += 1;
    const cells = row.querySelectorAll("td");
    const accountText = (cells[1]?.textContent || "").trim();
    const formulaText = (cells[4]?.textContent || "").trim();
    const hasAccount = accountText !== "" && accountText !== "+";
    const hasFormula = formulaText !== "";
    if (hasAccount || hasFormula) {
      populatedRows += 1;
    }
  });

  return dataRows > 0 && populatedRows === 0;
}

export async function waitForSummaryPopulateIdle(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!window.__SUMMARY_POPULATE_IN_FLIGHT__) return;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
}

export function showSummarySuccessNotificationIfNeeded() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("success") === "1") {
    pushSummaryNotification("Success", "Data captured and summary generated successfully!", "success");
    stripSummarySuccessParamFromUrl();
  } else if (urlParams.get("error") === "1") {
    pushSummaryNotification("Error", "Failed to generate summary. Please try again.", "error");
    stripSummarySuccessParamFromUrl();
  }
}

export function rebindAllSummaryTableRows() {
  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach((row) => {
    const idCell = row.querySelector("td.id-product");
    const idProduct =
      idCell?.getAttribute("data-main-product")?.trim() ||
      idCell?.textContent?.trim() ||
      "";
    bindSummaryRowLegacyHandlers(row, idProduct);
  });

  window.updateDeleteButton?.();
}

export function bindSummaryRowLegacyHandlers(rowEl, idProduct) {
  if (!rowEl) return;

  const addButton = rowEl.querySelector(".add-account-btn");
  if (addButton) {
    addButton.onclick = function handleAdd() {
      window.handleAddAccount?.(this, idProduct);
    };
  }

  const rateCheckbox = rowEl.querySelector(".rate-checkbox");
  if (rateCheckbox) {
    rateCheckbox.onchange = function handleRateChange() {
      window.handleRateCheckboxChange?.(this);
    };
  }

  const rateValueCell = rowEl.querySelector("td.editable-cell");
  if (rateValueCell && typeof window.attachRateValueEditListener === "function") {
    window.attachRateValueEditListener(rateValueCell, rowEl);
  }

  const selectCheckbox = rowEl.querySelector(".summary-select-checkbox");
  if (selectCheckbox) {
    selectCheckbox.onchange = function handleSelectChange() {
      const row = this.closest("tr");
      if (row) {
        row.classList.toggle("summary-row-selected", this.checked);
      }
      window.updateProcessedAmountTotal?.();
    };
  }

  const deleteCheckbox = rowEl.querySelector(".summary-row-checkbox");
  if (deleteCheckbox) {
    deleteCheckbox.onchange = () => {
      window.updateDeleteButton?.();
    };
  }
}

export function bindCapturedCellClick(cellEl) {
  if (!cellEl) return;
  cellEl.onclick = function onCapturedCellClick() {
    window.insertCellValueToFormula?.(this);
  };
}
