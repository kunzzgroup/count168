import { createFormulaDisplayFromExpression } from "../../../shared/formula/index.js";
import { evaluateFormulaExpression, parseReferenceFormula } from "./summaryFormulaReference.js";
import { formatNegativeNumbersInFormula } from "./summaryFormulaParseUtils.js";
import { preserveFormulaStructure } from "./summaryPreserveFormula.js";
import { resolveCurrentSourceDataFromTemplate } from "./summaryTemplateSourceData.js";
import { isMg95ElsonSpecialRow } from "../lib/summaryIdProductDisplay.js";
import { formatProcessedAmountDisplay } from "../table/summaryRowAmount.js";

function hasMeaningfulFormulaOperators(value) {
  const v = String(value || "").trim();
  return v !== "" && v !== "Formula";
}

/**
 * Resolve formula display when applying a saved template (legacy applyTemplateToSummaryRow logic).
 */
export function resolveTemplateFormulaDisplay({
  row,
  template,
  sourceColumns = "",
  formulaOperators = "",
  sourcePercent = "1",
  enableSourcePercent = true,
  tableData = null,
}) {
  const savedFormulaDisplay = String(template?.formula_display || template?.formulaDisplay || "").trim();
  const isBatchSelected = template?.batch_selection == 1;
  const idProduct = row?.productType === "sub" ? row.subIdProduct || row.idProduct : row.idProduct;

  if (isMg95ElsonSpecialRow(row)) {
    const amount = template?.last_processed_amount ?? row?.processedAmount ?? row?.baseProcessedAmount;
    if (amount != null && String(amount).trim() !== "") {
      return formatProcessedAmountDisplay(String(amount));
    }
  }

  let resolvedFromOperators = "";
  if (hasMeaningfulFormulaOperators(formulaOperators)) {
    try {
      resolvedFromOperators = evaluateFormulaExpression(
        formulaOperators,
        idProduct,
        row?.clickedColumns || "",
        row?.rowIndex
      );
      if (!Number.isNaN(Number(resolvedFromOperators)) && Number.isFinite(Number(resolvedFromOperators))) {
        resolvedFromOperators = formatNegativeNumbersInFormula(String(Number(resolvedFromOperators)));
      }
    } catch {
      resolvedFromOperators = "";
    }
  }

  if (
    (!savedFormulaDisplay || savedFormulaDisplay === "Formula") &&
    resolvedFromOperators
  ) {
    return createFormulaDisplayFromExpression(resolvedFromOperators, sourcePercent, enableSourcePercent);
  }

  const resolvedSourceExpression = resolveCurrentSourceDataFromTemplate({
    row,
    template: {
      ...(template || {}),
      source_columns: sourceColumns || template?.source_columns,
      formula_operators: formulaOperators || template?.formula_operators,
    },
    idProduct,
    tableData,
  });

  if (isBatchSelected) {
    if (!savedFormulaDisplay || savedFormulaDisplay === "Formula") {
      return "";
    }
    if (resolvedSourceExpression) {
      const preserved = preserveFormulaStructure(
        savedFormulaDisplay,
        resolvedSourceExpression,
        sourcePercent,
        enableSourcePercent
      );
      if (preserved === null) {
        return createFormulaDisplayFromExpression(
          resolvedSourceExpression,
          sourcePercent,
          enableSourcePercent
        );
      }
      return preserved;
    }
    if (/\[[^\]]+\s*[: ,]\s*\d+\]/.test(savedFormulaDisplay)) {
      const parsed = parseReferenceFormula(savedFormulaDisplay, idProduct, row?.clickedColumns || "", row?.rowIndex);
      return enableSourcePercent
        ? createFormulaDisplayFromExpression(parsed, sourcePercent, enableSourcePercent)
        : parsed;
    }
    return savedFormulaDisplay;
  }

  if (savedFormulaDisplay && savedFormulaDisplay !== "Formula") {
    if (resolvedSourceExpression) {
      const preserved = preserveFormulaStructure(
        savedFormulaDisplay,
        resolvedSourceExpression,
        sourcePercent,
        enableSourcePercent
      );
      if (preserved !== null) return preserved;
    }
    return savedFormulaDisplay;
  }

  if (resolvedFromOperators) {
    return createFormulaDisplayFromExpression(resolvedFromOperators, sourcePercent, enableSourcePercent);
  }

  if (resolvedSourceExpression) {
    return createFormulaDisplayFromExpression(
      resolvedSourceExpression,
      sourcePercent,
      enableSourcePercent
    );
  }

  return savedFormulaDisplay || "";
}
