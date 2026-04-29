import { useEffect } from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { injectStylesheet, loadScriptOnce } from "../utils/assetLoader.js";

export function useDataCaptureLegacyBridge({ loading, forbidden, companyId, companyCode }) {
  useEffect(() => {
    const hrefs = [assetUrl("css/datacapture.css"), assetUrl("css/global-13inch.css")];
    Promise.all(hrefs.map((href) => injectStylesheet(href)));
  }, []);

  useEffect(() => {
    if (loading || forbidden || companyId == null) return;

    let cancelled = false;
    const runVanilla = async () => {
      window.DATACAPTURE_COMPANY_ID = companyId;
      window.DATACAPTURE_COMPANY_CODE = companyCode;
      window.__DC_REACT_PERMISSION_FILTER__ = true;
      window.__DC_REACT_DATE_SUBMITTED__ = true;
      window.__DC_REACT_FORM_DATA__ = true;
      window.__DC_REACT_PROCESS_DETAIL__ = true;

      window._sharedCompanyFilterInitialized = false;
      try {
        await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
        if (cancelled) return;
        window.__initSharedCompanyFilter?.();

        await loadScriptOnce(assetUrl("js/datacapture.js"));
        if (cancelled) return;

        window.onSharedCompanyFilterChanged = (id) => {
          if (typeof window.switchDataCaptureCompany === "function") {
            window.switchDataCaptureCompany(id);
          }
        };

        const form = document.getElementById("dataCaptureForm");
        if (form) form.removeAttribute("data-dc-spa-init");
        await window.__initDataCapturePage?.();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    };

    runVanilla();

    return () => {
      cancelled = true;
      window._sharedCompanyFilterInitialized = false;
      window.__DC_REACT_PERMISSION_FILTER__ = false;
      window.__DC_REACT_DATE_SUBMITTED__ = false;
      window.__DC_REACT_FORM_DATA__ = false;
      window.__DC_REACT_PROCESS_DETAIL__ = false;
      const form = document.getElementById("dataCaptureForm");
      if (form) form.removeAttribute("data-dc-spa-init");
    };
  }, [loading, forbidden, companyId, companyCode]);
}
