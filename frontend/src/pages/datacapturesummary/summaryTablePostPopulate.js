import { stripSummarySuccessParamFromUrl } from "./summaryStorage.js";

/**
 * Runs template auto-populate + formula/rate restore after React renders summary rows.
 * Mirrors the .finally() block in populateOriginalTableWithColumnAData.
 */
export async function runSummaryTablePostPopulate(idProducts) {
  if (typeof window.autoPopulateSummaryRowsFromTemplates !== "function") {
    runSummaryTablePostPopulateFinally();
    return;
  }

  try {
    await window.autoPopulateSummaryRowsFromTemplates(idProducts);
  } catch (error) {
    console.error("Auto-populate templates error:", error);
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
      window.restoreFormulaSourceFromRefresh?.();
      window.restoreRateValuesFromRefresh?.();
      if (typeof window.restoreRateValuesFromRefresh === "function") {
        setTimeout(window.restoreRateValuesFromRefresh, 80);
      }
    }

    if (window.currentProcessHadTemplates !== true && window._summaryHasRefreshStateToPreserve !== true) {
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
}

export function showSummarySuccessNotificationIfNeeded() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("success") === "1") {
    window.showNotification?.("Success", "Data captured and summary generated successfully!", "success");
    stripSummarySuccessParamFromUrl();
  } else if (urlParams.get("error") === "1") {
    window.showNotification?.("Error", "Failed to generate summary. Please try again.", "error");
    stripSummarySuccessParamFromUrl();
  }
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
