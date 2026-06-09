import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchSummaryFormCatalog } from "../lib/summaryApi.js";
import {
  addSelectedDescriptionToForm,
  applyCalculatorToForm,
  buildDescriptionCatalog,
  buildFormulaDataGridItems,
  buildFormulaSavePatchFromForm,
  computeFormulaDisplayPreview,
  createBlankEditFormulaForm,
  insertCapturedCellIntoForm,
  rowToEditFormulaForm,
} from "../formula/editFormulaFormState.js";
import { applyFormulaSaveToRows } from "../formula/summaryFormulaSaveTarget.js";
import { saveSummaryTemplatePure } from "../formula/summarySaveTemplatePure.js";
import {
  resequenceSubOrdersInRows,
  syncSubOrderTemplates,
} from "../table/summarySubOrderResequence.js";
import { pushSummaryNotification } from "../lib/summaryNotify.js";
import { removeSuppressedRow } from "../lib/summarySuppressedRows.js";

async function fetchAccountCurrencies(accountId, companyId) {
  if (!accountId) return [];
  const params = new URLSearchParams({ action: "get_available_currencies" });
  params.set("account_id", String(accountId));
  if (companyId != null) params.set("company_id", String(companyId));
  const response = await fetch(
    buildApiUrl(`api/accounts/account_currency_api.php?${params.toString()}`),
    { credentials: "include" }
  );
  const json = await response.json();
  if (json.success && Array.isArray(json.data)) {
    return json.data.map((c) => ({
      id: c.id,
      code: c.code,
      currency_id: c.id,
      currency_code: c.code,
    }));
  }
  return [];
}

/**
 * Pure React Edit Formula — controlled form state, no DOM bridges.
 */
export function useSummaryEditFormulaPure({
  captureScope,
  companyId,
  processId,
  tableData,
  rows,
  replaceRows,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("edit");
  const [sessionKey, setSessionKey] = useState(0);
  const [form, setForm] = useState(null);
  const [anchorRow, setAnchorRow] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const anchorRef = useRef(null);

  const usedAccountIds = useMemo(
    () =>
      rows
        .filter((r) => r.accountId && r.account?.trim())
        .map((r) => String(r.accountId)),
    [rows]
  );

  const descriptionCatalog = useMemo(
    () => buildDescriptionCatalog(tableData),
    [tableData]
  );

  const formulaDataGridItems = useMemo(
    () => (open && anchorRow ? buildFormulaDataGridItems(tableData, anchorRow) : []),
    [tableData, anchorRow, open]
  );

  const refreshPreview = useCallback((nextForm) => {
    setForm(computeFormulaDisplayPreview(nextForm, anchorRef.current || {}));
  }, []);

  const handleFormChange = useCallback(
    (nextForm) => {
      refreshPreview(nextForm);
    },
    [refreshPreview]
  );

  const loadCurrenciesForAccount = useCallback(
    async (accountId, preferredCurrencyId = null) => {
      if (!accountId) return;
      try {
        const list = await fetchAccountCurrencies(accountId, companyId);
        if (list.length) {
          setCurrencies(list);
          if (preferredCurrencyId) {
            const match = list.find((c) => String(c.id) === String(preferredCurrencyId));
            if (match) {
              setForm((prev) =>
                prev
                  ? {
                      ...prev,
                      currencyId: String(match.id),
                      currencyLabel: String(match.code || ""),
                    }
                  : prev
              );
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load account currencies:", e);
      }
    },
    [companyId]
  );

  const handleAccountSelect = useCallback(
    (accountId) => {
      void loadCurrenciesForAccount(accountId);
    },
    [loadCurrenciesForAccount]
  );

  const closeEditFormula = useCallback(() => {
    setOpen(false);
    setForm(null);
    setAnchorRow(null);
    anchorRef.current = null;
    document.body.style.overflow = "";
  }, []);

  const openFormulaSession = useCallback(
    (row, nextMode) => {
      if (!row) return;
      anchorRef.current = row;
      setAnchorRow(row);
      setMode(nextMode);
      setSessionKey((k) => k + 1);
      const initial =
        nextMode === "new" ? createBlankEditFormulaForm(row) : rowToEditFormulaForm(row);
      setForm(computeFormulaDisplayPreview(initial, row));
      setOpen(true);
      document.body.style.overflow = "hidden";
      if (initial.accountId) {
        void loadCurrenciesForAccount(initial.accountId, initial.currencyId);
      }
    },
    [loadCurrenciesForAccount]
  );

  const showEditFormula = useCallback(
    (row) => {
      openFormulaSession(row, "edit");
    },
    [openFormulaSession]
  );

  const showNewFormula = useCallback(
    (row) => {
      openFormulaSession(row, "new");
    },
    [openFormulaSession]
  );

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    void (async () => {
      try {
        const catalog = await fetchSummaryFormCatalog(captureScope);
        if (!alive) return;
        setAccounts(catalog.accounts || []);
        if (!anchorRef.current?.accountId) {
          setCurrencies(catalog.currencies || []);
        }
      } catch (e) {
        console.error("Edit formula catalog load failed:", e);
        pushSummaryNotification("Error", String(e?.message || e), "error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, sessionKey, captureScope]);

  const handleCalculatorPress = useCallback(
    (payload) => {
      if (!form) return;
      refreshPreview(applyCalculatorToForm(form, payload, anchorRef.current || {}));
    },
    [form, refreshPreview]
  );

  const handleAddSelectedData = useCallback(() => {
    if (!form) return;
    const result = addSelectedDescriptionToForm(form, tableData, anchorRef.current || {});
    if (!result.ok) {
      pushSummaryNotification("Info", "Please select row data first.", "info");
      return;
    }
    setForm(result.form);
  }, [form, tableData]);

  const insertCapturedCellValue = useCallback(
    (cellMeta) => {
      if (!form) return;
      const result = insertCapturedCellIntoForm(form, cellMeta, anchorRef.current || {});
      if (!result.ok) {
        if (result.reason === "no_numbers") {
          pushSummaryNotification("Info", "No numbers or symbols were found in the cell.", "info");
        }
        return;
      }
      setForm(result.form);
    },
    [form]
  );

  const handleCapturedCellClick = useCallback(
    (cellMeta) => {
      if (!open || !form) {
        pushSummaryNotification("Info", "Please Open Edit Formula", "info");
        return;
      }
      insertCapturedCellValue(cellMeta);
    },
    [open, form, insertCapturedCellValue]
  );

  const handleFormulaGridItemClick = useCallback(
    (item) => {
      if (!open || !form || !item) return;
      insertCapturedCellValue({
        idProduct: item.idProduct,
        rowLabel: item.rowLabel,
        rowIndex: item.rowIndex,
        displayColumnIndex: item.columnIndex,
        dataColumnIndex: Math.max(0, item.columnIndex - 1),
        value: item.value,
      });
    },
    [open, form, insertCapturedCellValue]
  );

  const handleSave = useCallback(async () => {
    const anchor = anchorRef.current;
    if (!anchor || !form) return;

    const result = buildFormulaSavePatchFromForm(form, anchor);
    if (!result.ok) {
      pushSummaryNotification("Error", result.message, "error");
      return;
    }

    const applied = applyFormulaSaveToRows(rows, anchor, mode, result.patch);
    let nextRows = applied.rows;
    const targetRow = applied.targetRow;

    if (targetRow?.productType === "sub" || applied.action === "insertSub") {
      const parentId = targetRow?.parentIdProduct || anchor.idProduct;
      nextRows = resequenceSubOrdersInRows(nextRows, parentId);
    }
    replaceRows(nextRows);

    if (targetRow) {
      removeSuppressedRow(targetRow);
      const hasFormula =
        String(targetRow.formulaOperators || targetRow.formulaDisplay || result.patch?.formulaOperators || "")
          .trim() !== "";
      const isEmptyNewSub = applied.action === "insertSub" && !hasFormula;
      if (!isEmptyNewSub) {
        try {
          const rowToSave = nextRows.find((r) => r.key === targetRow.key) || targetRow;
          const tpl = await saveSummaryTemplatePure(rowToSave, {
            captureScope,
            companyId,
            processId,
          });
          if (tpl.success && (tpl.templateId || tpl.templateKey || tpl.formulaVariant != null)) {
            nextRows = nextRows.map((r) =>
              r.key === targetRow.key
                ? {
                    ...r,
                    templateId: tpl.templateId ?? r.templateId,
                    templateKey: tpl.templateKey ?? r.templateKey,
                    formulaVariant: tpl.formulaVariant ?? r.formulaVariant,
                  }
                : r
            );
            replaceRows(nextRows);
          }
          if (targetRow.productType === "sub" || applied.action === "insertSub") {
            const parentId = targetRow.parentIdProduct || anchor.idProduct;
            await syncSubOrderTemplates(nextRows, parentId, (row) =>
              saveSummaryTemplatePure(row, { captureScope, companyId, processId })
            );
          }
        } catch (e) {
          console.warn("Template save failed:", e);
        }
      }
    }

    pushSummaryNotification(t("success") || "Success", t("formulaSaved") || "Formula saved.", "success");
    closeEditFormula();
  }, [
    form,
    rows,
    mode,
    replaceRows,
    captureScope,
    companyId,
    processId,
    closeEditFormula,
    t,
  ]);

  const saveDisabled =
    !form?.currencyId?.trim() || !form?.accountId?.trim() || !String(form?.formula || "").trim();

  return {
    open,
    sessionKey,
    form,
    accounts,
    currencies,
    usedAccountIds,
    idProductOptions: descriptionCatalog.idProducts,
    rowDataOptions: descriptionCatalog.rowDataOptions,
    formulaDataGridItems,
    saveDisabled,
    rowKey: anchorRef.current?.key ?? null,
    productValue: anchorRef.current?.idProduct || "",
    showEditFormula,
    showNewFormula,
    closeEditFormula,
    handleFormChange,
    handleAccountSelect,
    handleSave,
    handleCalculatorPress,
    onAddSelectedData: handleAddSelectedData,
    onCapturedCellClick: handleCapturedCellClick,
    onFormulaGridItemClick: handleFormulaGridItemClick,
  };
}
