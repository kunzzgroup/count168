import { handle4ReturnPaste, handleApiReturnPaste } from "./dataCaptureReturnPaste.js";
import { handleVPowerPaste } from "./dataCaptureVPowerPaste.js";
import { handleAgentLinkPaste } from "./dataCaptureAgentLinkPaste.js";
import { handleWbetPaste } from "./dataCaptureWbetPaste.js";
import { handleWbetApiPaste } from "./dataCaptureWbetApiPaste.js";

export const SPECIAL_CAPTURE_TYPES = new Set([
  "4.RETURN",
  "API_RETURN",
  "VPOWER",
  "AGENT_LINK",
  "WBET",
  "WBET_API",
]);

/**
 * Phase 4d — RETURN / VPOWER / WBET family paste handlers.
 * @returns {boolean} true when the event was handled (caller should not fall through).
 */
export function handleSpecialFormatPaste(e, pastedData, captureType) {
  switch (captureType) {
    case "API_RETURN":
      return handleApiReturnPaste(e, pastedData);
    case "4.RETURN":
      return handle4ReturnPaste(e, pastedData);
    case "VPOWER":
      return handleVPowerPaste(e, pastedData);
    case "AGENT_LINK":
      return handleAgentLinkPaste(e, pastedData);
    case "WBET":
      return handleWbetPaste(e, pastedData);
    case "WBET_API":
      return handleWbetApiPaste(e, pastedData);
    default:
      return false;
  }
}
