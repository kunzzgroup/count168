import { useLayoutEffect, useRef } from "react";
import {
  parseCitibetFormatBasedPaste,
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "./paste/dataCaptureCitibetParsers.js";
import { handleCellPasteEvent } from "./paste/dataCapturePasteHandler.js";
import { parseAndFillHtmlTableForText } from "./paste/dataCaptureTextHtmlPaste.js";
import { detectHtmlTableInClipboard } from "./paste/dataCaptureHtmlClipboard.js";
import {
  parseAndFillHtmlTableForWbet,
  parseAndFillHtmlTableForWbetApi,
} from "./paste/dataCaptureWbetHtmlPaste.js";

/**
 * Phase 4: Paste orchestration in React — clipboard, type detect, 1.Text tab, CITIBET,
 * and Phase 4d special formats (4.RETURN, VPOWER, WBET, …).
 */
export function useDataCapturePaste() {
  const handlerRef = useRef(handleCellPasteEvent);
  handlerRef.current = handleCellPasteEvent;

  useLayoutEffect(() => {
    window.__DC_HANDLE_CELL_PASTE__ = (e) => {
      const legacy = window.__DC_LEGACY_HANDLE_CELL_PASTE_INTERNAL__;
      return handlerRef.current(e, legacy);
    };

    window.__DC_PARSE_CITIBET_MAJOR__ = parseCitibetMajorPaymentReport;
    window.__DC_PARSE_CITIBET_PAYMENT__ = parseCitibetPaymentReport;
    window.__DC_PARSE_CITIBET_FORMAT__ = parseCitibetFormatBasedPaste;
    window.__DC_PARSE_HTML_TEXT__ = parseAndFillHtmlTableForText;
    window.__DC_DETECT_HTML_TABLE__ = detectHtmlTableInClipboard;
    window.__DC_PARSE_HTML_WBET__ = parseAndFillHtmlTableForWbet;
    window.__DC_PARSE_HTML_WBET_API__ = parseAndFillHtmlTableForWbetApi;

    return () => {
      delete window.__DC_HANDLE_CELL_PASTE__;
      delete window.__DC_PARSE_CITIBET_MAJOR__;
      delete window.__DC_PARSE_CITIBET_PAYMENT__;
      delete window.__DC_PARSE_CITIBET_FORMAT__;
      delete window.__DC_PARSE_HTML_TEXT__;
      delete window.__DC_DETECT_HTML_TABLE__;
      delete window.__DC_PARSE_HTML_WBET__;
      delete window.__DC_PARSE_HTML_WBET_API__;
    };
  }, []);
}
