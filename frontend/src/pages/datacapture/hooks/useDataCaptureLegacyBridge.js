import { useEffect } from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { injectStylesheet, loadScriptOnce } from "../utils/assetLoader.js";

export function useDataCaptureLegacyBridge({ loading, forbidden, companyId, companyCode, onCompanyChange }) {
  useEffect(() => {
    const hrefs = [assetUrl("css/datacapture.css"), assetUrl("css/global-13inch.css")];
    Promise.all(hrefs.map((href) => injectStylesheet(href)));
  }, []);

  useEffect(() => {
    if (loading || forbidden || companyId == null) return;

    let cancelled = false;
    const runBridge = async () => {
      window.DATACAPTURE_COMPANY_ID = companyId;
      window.DATACAPTURE_COMPANY_CODE = companyCode;
      window._sharedCompanyFilterInitialized = false;
      try {
        await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
        if (cancelled) return;
        window.onSharedCompanyFilterChanged = (id) => {
          if (typeof onCompanyChange === "function") {
            onCompanyChange(id);
            return;
          }
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("company_id", String(id));
          window.location.assign(nextUrl.toString());
        };
        window.__initSharedCompanyFilter?.();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    };

    runBridge();

    return () => {
      cancelled = true;
      window._sharedCompanyFilterInitialized = false;
      delete window.onSharedCompanyFilterChanged;
    };
  }, [loading, forbidden, companyId, companyCode, onCompanyChange]);
}
