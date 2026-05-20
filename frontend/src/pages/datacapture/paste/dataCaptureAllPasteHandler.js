import { handle4ReturnPaste, handleApiReturnPaste } from "./dataCaptureReturnPaste.js";
import { handleVPowerPaste } from "./dataCaptureVPowerPaste.js";
import { handleAgentLinkPaste } from "./dataCaptureAgentLinkPaste.js";
import { handleWbetPaste } from "./dataCaptureWbetPaste.js";
import { handleWbetApiPaste } from "./dataCaptureWbetApiPaste.js";
import { handleInvoicePaste } from "./dataCaptureInvoicePaste.js";
import { handle2SpecialPaste } from "./dataCapture2SpecialPaste.js";
import { handle3ApiPaste } from "./dataCapture3ApiPaste.js";
import { handleAwcPaste } from "./dataCaptureAwcHandlerPaste.js";
import { handlePegasusPaste } from "./dataCapturePegasusPaste.js";
import { handleAlipayPaste } from "./dataCaptureAlipayPaste.js";
import { handleC8PlayPaste } from "./dataCaptureC8PlayPaste.js";
import { handleMaxbetPaste } from "./dataCaptureMaxbetPaste.js";

/** Capture types with dedicated paste handlers in React. */
export const TYPED_CAPTURE_TYPES = new Set([
  "4.RETURN",
  "API_RETURN",
  "VPOWER",
  "AGENT_LINK",
  "WBET",
  "WBET_API",
  "INVOICE",
  "2.SPECIAL",
  "3.API",
  "AWC",
  "PEGASUS",
  "ALIPAY",
  "C8PLAY",
  "MAXBET",
]);

/** @deprecated use TYPED_CAPTURE_TYPES */
export const SPECIAL_CAPTURE_TYPES = TYPED_CAPTURE_TYPES;

/**
 * Route typed capture paste to the matching handler.
 * @returns {boolean}
 */
export function handleTypedCapturePaste(e, pastedData, captureType) {
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
    case "INVOICE":
      return handleInvoicePaste(e, pastedData);
    case "2.SPECIAL":
      return handle2SpecialPaste(e, pastedData);
    case "3.API":
      return handle3ApiPaste(e, pastedData);
    case "AWC":
      return handleAwcPaste(e, pastedData);
    case "PEGASUS":
      return handlePegasusPaste(e, pastedData);
    case "ALIPAY":
      return handleAlipayPaste(e, pastedData);
    case "C8PLAY":
      return handleC8PlayPaste(e, pastedData);
    case "MAXBET":
      return handleMaxbetPaste(e, pastedData);
    default:
      return false;
  }
}

/** @deprecated */
export function handleSpecialFormatPaste(e, pastedData, captureType) {
  return handleTypedCapturePaste(e, pastedData, captureType);
}
