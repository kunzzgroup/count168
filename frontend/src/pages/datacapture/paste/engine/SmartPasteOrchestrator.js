/**
 * SmartPasteOrchestrator — Universal Smart Paste entry (Phase 1).
 * Matrix path is default. Accounting mapping is optional (rules only, no AI).
 */
import {
  isSmartPasteUniversalEnabled,
  SMART_PASTE_SKIP_CAPTURE_TYPES,
  shouldSkipUniversalForFormat,
} from "./featureFlag.js";
import { clipboardCaptureService } from "./ClipboardCaptureService.js";
import { parserEngine } from "./ParserEngine.js";
import { cleaningEngine } from "./CleaningEngine.js";
import { headerDetectionEngine } from "./HeaderDetectionEngine.js";
import { ruleMappingEngine } from "./RuleMappingEngine.js";
import { confidenceEngine } from "./ConfidenceEngine.js";
import { validationEngine } from "./ValidationEngine.js";
import {
  dataCaptureImporter,
  detectedTableToMatrix,
  accountingRecordsToMatrix,
} from "./DataCaptureImporter.js";
import { cellText } from "./utils/tableStats.js";
import { notifyPasteUser } from "../../lib/dataCaptureBridge.js";

/**
 * @typedef {object} SmartPasteResult
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {'matrix'|'accounting'} [mode]
 * @property {object} [parsed]
 * @property {string[][]} [matrix]
 * @property {object} [mapping]
 * @property {object} [confidence]
 * @property {object} [importResult]
 */

export class SmartPasteOrchestrator {
  /**
   * @param {ClipboardEvent} e
   * @param {HTMLElement|null} cell
   * @param {string} captureType
   * @param {{ accountingMode?: boolean, includeHeaderRow?: boolean }} [options]
   * @returns {SmartPasteResult}
   */
  tryHandle(e, cell, captureType, options = {}) {
    if (!isSmartPasteUniversalEnabled()) {
      return { ok: false, reason: "FLAG_OFF" };
    }
    if (SMART_PASTE_SKIP_CAPTURE_TYPES.has(captureType)) {
      return { ok: false, reason: "SKIP_TYPE" };
    }

    const captured = clipboardCaptureService.capture(e);
    if (shouldSkipUniversalForFormat(captureType, captured)) {
      return { ok: false, reason: "SKIP_FORMAT_STYLED" };
    }
    if (!captured.html && !captured.plain) {
      return { ok: false, reason: "EMPTY_CLIPBOARD" };
    }

    let parsed;
    try {
      parsed = parserEngine.parse(captured);
    } catch (err) {
      return { ok: false, reason: err?.code || "NO_TABLE", error: String(err?.message || err) };
    }

    const cleaned = cleaningEngine.clean(parsed);
    if (!cleaned.rows?.length) {
      return { ok: false, reason: "EMPTY", parsed: cleaned };
    }

    const detected = headerDetectionEngine.detect(cleaned);

    if (options.accountingMode) {
      return this.#handleAccounting(detected, cell, options);
    }

    return this.#handleMatrix(detected, cell, options);
  }

  #handleMatrix(detected, cell, options) {
    let matrix = detectedTableToMatrix(detected, {
      includeHeaderRow: options.includeHeaderRow !== false,
      includeFooterRows: options.includeFooterRows === true,
    });

    const validated = validationEngine.validateMatrix(matrix);
    matrix = validated.matrix;

    if (!matrix.length) {
      return { ok: false, reason: "EMPTY", parsed: detected };
    }

    const importResult = dataCaptureImporter.importMatrix(matrix, cell, {
      successMessage: options.successMessage || "Smart paste: table imported.",
      emptyMessage: "Smart paste: nothing to import.",
      alignTotalRows: options.alignTotalRows === true,
      chunkSize: matrix.length >= 2000 ? 200 : 0,
      ...options.importOptions,
    });

    if (!importResult.applied || !(importResult.successCount > 0)) {
      return {
        ok: false,
        reason: "IMPORT_ZERO",
        mode: "matrix",
        parsed: detected,
        matrix,
        importResult,
      };
    }

    return {
      ok: true,
      mode: "matrix",
      parsed: detected,
      matrix,
      importResult,
      issues: validated.issues,
    };
  }

  #handleAccounting(detected, cell, options) {
    const sampleRows = detected.rows.slice(0, 8);
    const mapping = ruleMappingEngine.map(detected.headers, sampleRows);
    const confidence = confidenceEngine.evaluate(mapping, { samplePassRate: 1 });

    if (confidence.warning) {
      notifyPasteUser(
        `Smart paste mapping confidence ${confidence.score} (${confidence.band}). Review columns if needed.`,
        "warning",
      );
    }

    const records = this.#buildAccountingRecords(detected, mapping);
    const validated = validationEngine.validateAccountingRecords(records);
    const matrix = accountingRecordsToMatrix(validated.records);

    const importResult = dataCaptureImporter.importMatrix(matrix, cell, {
      successMessage: "Smart paste: accounting rows imported.",
      ...options.importOptions,
    });

    if (!importResult.applied || !(importResult.successCount > 0)) {
      return {
        ok: false,
        reason: "IMPORT_ZERO",
        mode: "accounting",
        parsed: detected,
        mapping,
        confidence,
        matrix,
        importResult,
      };
    }

    return {
      ok: true,
      mode: "accounting",
      parsed: detected,
      mapping,
      confidence,
      matrix,
      importResult,
      issues: validated.issues,
    };
  }

  #buildAccountingRecords(detected, mappingResult) {
    const byField = new Map(
      (mappingResult.mappings || []).map((m) => [m.field, m]),
    );
    return (detected.rows || []).map((row) => {
      const get = (field) => {
        const m = byField.get(field);
        if (!m) return "";
        return cellText(row?.[m.sourceIndex]);
      };
      return {
        document_no: get("document_no"),
        date: get("date"),
        supplier: get("supplier"),
        description: get("description"),
        amount: get("amount"),
        tax: get("tax"),
        total: get("total"),
      };
    });
  }
}

export const smartPasteOrchestrator = new SmartPasteOrchestrator();

/**
 * Sync try for paste handler. Returns true when Universal fully handled the paste.
 */
export function trySmartPasteUniversal(e, cell, captureType, options = {}) {
  try {
    const result = smartPasteOrchestrator.tryHandle(e, cell, captureType, options);
    return Boolean(result?.ok);
  } catch (err) {
    console.warn("[SmartPaste] unexpected failure, falling back:", err);
    return false;
  }
}
