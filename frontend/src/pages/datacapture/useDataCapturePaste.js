import { useLayoutEffect, useRef } from "react";
import {
  parseCitibetFormatBasedPaste,
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "./paste/dataCaptureCitibetParsers.js";
import { handleCellPasteEvent } from "./paste/dataCapturePasteHandler.js";

/**
 * Phase 4: Paste orchestration in React — clipboard, type detect, 1.Text tab, CITIBET.
 * Remaining formats (2.Format, INVOICE, VPOWER, 4.RETURN, …) still fall through to legacy.
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

    return () => {
      delete window.__DC_HANDLE_CELL_PASTE__;
      delete window.__DC_PARSE_CITIBET_MAJOR__;
      delete window.__DC_PARSE_CITIBET_PAYMENT__;
      delete window.__DC_PARSE_CITIBET_FORMAT__;
    };
  }, []);
}
