import { isCitibetCaptureType } from "../dataCaptureTypeConstants.js";
import {
  getClipboardPlainText,
  isTypingModeCell,
  resolvePasteCell,
} from "./dataCaptureClipboard.js";
import {
  autoDetectCaptureTypeFromPaste,
  parseCitibetPasteData,
  shouldExitCitibetMode,
} from "./dataCapturePasteDetect.js";
import { handleCitibetPaste } from "./dataCaptureCitibetPaste.js";
import { handleTextModePaste } from "./dataCaptureTextPaste.js";

function getCaptureType() {
  if (typeof window.__DC_GET_CAPTURE_TYPE__ === "function") {
    return window.__DC_GET_CAPTURE_TYPE__() || "1.Text";
  }
  return "1.Text";
}

function applyCaptureType(nextType) {
  if (typeof window.__DC_APPLY_CAPTURE_TYPE__ === "function") {
    window.__DC_APPLY_CAPTURE_TYPE__(nextType);
  } else if (typeof window.applyDataCaptureType === "function") {
    window.applyDataCaptureType(nextType);
  }
}

/**
 * Phase 4 paste orchestrator — React owns detection + 1.Text/CITIBET paths;
 * all other formats fall through to legacy `handleCellPaste` body.
 */
export function handleCellPasteEvent(e, legacyFallback) {
  const cell = resolvePasteCell(e.target);

  if (isTypingModeCell(cell)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  e.preventDefault();

  const pastedData = getClipboardPlainText(e);
  const detected = autoDetectCaptureTypeFromPaste(pastedData);
  if (detected) {
    applyCaptureType(detected);
  } else if (shouldExitCitibetMode(pastedData, getCaptureType())) {
    applyCaptureType("1.Text");
  }

  const captureType = getCaptureType();

  if (captureType === "1.Text") {
    if (handleTextModePaste(e, pastedData, cell)) return;
  }

  const citibetParsed = parseCitibetPasteData(pastedData, captureType);
  if (citibetParsed) {
    if (handleCitibetPaste(e, pastedData, cell, captureType, citibetParsed)) return;
  }

  if (typeof legacyFallback === "function") {
    legacyFallback(e);
  }
}
