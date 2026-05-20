import {
  getClipboardPlainText,  isTypingModeCell,
  resolvePasteCell,
} from "./dataCaptureClipboard.js";
import {
  autoDetectCaptureTypeFromPaste,
  parseCitibetPasteData,
  shouldExitCitibetMode,
} from "./dataCapturePasteDetect.js";
import { handleCitibetPaste } from "./dataCaptureCitibetPaste.js";
import { handleTextModePaste } from "./dataCaptureTextPaste.js";
import {
  handleTypedCapturePaste,
  TYPED_CAPTURE_TYPES,
} from "./dataCaptureAllPasteHandler.js";
import { handleFormatCellPaste } from "./dataCaptureFormatPasteHandler.js";
import { handleGenericPaste } from "./dataCaptureGenericPaste.js";
import {
  clearLegacyPasteContext,
  setLegacyPasteContext,
} from "./dataCaptureLegacyPasteBridge.js";

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

function invokeGenericPasteFallback(e, pastedData) {
  setLegacyPasteContext(getCaptureType(), "fallback");
  try {
    return handleGenericPaste(e, pastedData);
  } finally {
    clearLegacyPasteContext();
  }
}

/**
 * Full paste orchestrator — all formats in React.
 */
export function handleCellPasteEvent(e) {
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

  if (captureType === "2.Format") {
    if (handleFormatCellPaste(e, pastedData)) return;
    invokeGenericPasteFallback(e, pastedData);
    return;
  }

  if (TYPED_CAPTURE_TYPES.has(captureType)) {
    if (handleTypedCapturePaste(e, pastedData, captureType)) return;
    invokeGenericPasteFallback(e, pastedData);
    return;
  }

  if (captureType === "1.Text") {
    if (handleTextModePaste(e, pastedData, cell)) return;
  }

  const citibetParsed = parseCitibetPasteData(pastedData, captureType);
  if (citibetParsed) {
    if (handleCitibetPaste(e, pastedData, cell, captureType, citibetParsed)) return;
  }

  invokeGenericPasteFallback(e, pastedData);
}
