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

function clearSummaryFormulaCellDom(cell) {
  if (!cell) return;
  if (window.__SUMMARY_REACT_TABLE__) {
    while (cell.firstChild) {
      cell.removeChild(cell.firstChild);
    }
    return;
  }
  cell.innerHTML =
    '<div class="formula-cell-content"><span class="formula-text"></span></div>';
}

function clearSummaryRowAccountAndFormula(row) {
  clearSummaryRowAccountAssignment(row);
  const cells = row.querySelectorAll("td");
  if (cells[4]) {
    clearSummaryFormulaCellDom(cells[4]);
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

/** True when a summary row has a real account assignment (not empty / "+" placeholder). */
export function summaryRowHasAssignedAccount(row) {
  if (!row) return false;
  const accountCell = row.querySelector("td:nth-child(2)");
  if (!accountCell) return false;
  const accountId = accountCell.getAttribute("data-account-id")?.trim();
  if (accountId) return true;
  const text = (accountCell.textContent || "").trim();
  return text !== "" && text !== "+";
}

function normalizeIdProductKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Remove React sub-rows that duplicate a main row's account under the same id_product. */
function removeDuplicateSubRowsForMainAccount(keepRow, accountId) {
  if (!keepRow || !accountId) return;
  if ((keepRow.getAttribute("data-product-type") || "main") !== "main") return;

  const keepIdProduct =
    keepRow.querySelector("td:first-child")?.getAttribute("data-main-product")?.trim() ||
    keepRow.querySelector("td:first-child")?.textContent?.trim() ||
    "";
  const keepNorm = normalizeIdProductKey(keepIdProduct);
  if (!keepNorm) return;

  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return;

  const keysToRemove = [];
  tbody.querySelectorAll("tr").forEach((row) => {
    if (row === keepRow) return;
    if ((row.getAttribute("data-product-type") || "main") !== "sub") return;

    const subAccountId = row.querySelector("td:nth-child(2)")?.getAttribute("data-account-id")?.trim();
    if (subAccountId !== accountId) return;

    const parentId =
      row.getAttribute("data-parent-id-product")?.trim() ||
      row.querySelector("td:first-child")?.getAttribute("data-main-product")?.trim() ||
      "";
    if (normalizeIdProductKey(parentId) !== keepNorm) return;

    const reactKey = row.getAttribute("data-react-row-key");
    if (reactKey) {
      keysToRemove.push(reactKey);
    } else {
      clearSummaryRowAccountAndFormula(row);
    }
  });

  if (keysToRemove.length > 0 && typeof window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__ === "function") {
    try {
      window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__(keysToRemove);
    } catch (err) {
      console.warn("removeDuplicateSubRowsForMainAccount failed:", err);
    }
  }
}

/**
 * After Save Formula / template populate — keep one row per (id_product, account_id).
 * Clears duplicate main rows and removes duplicate sub rows that mirror a main account.
 * @param {HTMLElement|null} keepRow - row that was just saved/updated
 */
export function dedupeSummaryAccountsAfterSave(keepRow) {
  if (!keepRow) return;

  keepRow.setAttribute("data-preferred-account-save", "1");

  const keepAccountCell = keepRow.querySelector("td:nth-child(2)");
  const keepAccountId = keepAccountCell?.getAttribute("data-account-id")?.trim();
  if (!keepAccountId) return;

  const keepIdCell = keepRow.querySelector("td:first-child");
  const keepIdProduct =
    keepIdCell?.getAttribute("data-main-product")?.trim() ||
    keepIdCell?.textContent?.trim() ||
    "";
  if (!keepIdProduct) return;

  const keepRowIndex = keepRow.getAttribute("data-row-index")?.trim() ?? "";
  const groupKey = `${normalizeIdProductKey(keepIdProduct)}::${keepAccountId}`;
  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach((row) => {
    if (row === keepRow) return;

    const productType = row.getAttribute("data-product-type") || "main";
    const accountCell = row.querySelector("td:nth-child(2)");
    const accountId = accountCell?.getAttribute("data-account-id")?.trim();
    const accountText = accountCell?.textContent?.trim();
    if (!accountId || !accountText || accountText === "+") return;

    const idCell = row.querySelector("td:first-child");
    const idProduct =
      idCell?.getAttribute("data-main-product")?.trim() || idCell?.textContent?.trim() || "";
    const rowGroupKey = `${normalizeIdProductKey(idProduct)}::${accountId}`;
    if (rowGroupKey !== groupKey) return;

    if (productType === "main") {
      const rowIndex = row.getAttribute("data-row-index")?.trim() ?? "";
      if (keepRowIndex && rowIndex === keepRowIndex) return;
      clearSummaryRowAccountAndFormula(row);
    }
  });

  removeDuplicateSubRowsForMainAccount(keepRow, keepAccountId);

  window.rebuildUsedAccountIds?.();
  window.updateProcessedAmountTotal?.();
}

/** Global dedupe after template populate — prefer saved row_index per account when available. */
export function dedupeAllSummaryDuplicateAccounts(savedSnapshot = null) {
  const preferred = savedSnapshot ? buildPreferredAccountRowIndexMap(savedSnapshot) : new Map();
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
    const groupKey = `${normalizeIdProductKey(idProduct)}::${accountId}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  });

  groups.forEach((rows) => {
    if (rows.length <= 1) return;
    const accountId = rows[0].querySelector("td:nth-child(2)")?.getAttribute("data-account-id")?.trim();
    const preferredRowIndex = accountId ? preferred.get(accountId) : null;
    let keepRow =
      rows.find((row) => row.getAttribute("data-preferred-account-save") === "1") ||
      rows.find(
        (row) => String(row.getAttribute("data-row-index") || "") === String(preferredRowIndex || "")
      );
    if (!keepRow) keepRow = rows[0];
    rows.forEach((row) => {
      if (row === keepRow) return;
      clearSummaryRowAccountAndFormula(row);
    });
    if (accountId) removeDuplicateSubRowsForMainAccount(keepRow, accountId);
  });

  window.rebuildUsedAccountIds?.();
  window.updateProcessedAmountTotal?.();
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
    let keepRow =
      rows.find((row) => row.getAttribute("data-preferred-account-save") === "1") ||
      rows.find(
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
          if (row.getAttribute("data-row-user-cleared") === "1") return;
          const cells = row.querySelectorAll("td");
          if (cells[4]) {
            clearSummaryFormulaCellDom(cells[4]);
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

    dedupeAllSummaryDuplicateAccounts(
      isFreshFromCapture ? null : readSummaryRefreshStateFromLocalStorage()
    );
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
