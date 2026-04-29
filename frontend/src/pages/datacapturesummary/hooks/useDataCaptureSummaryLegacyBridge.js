import { useEffect, useState } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { assetUrl } from "../../../utils/apiUrl.js";
import { injectStylesheet } from "../../datacapture/utils/assetLoader.js";

export function useDataCaptureSummaryLegacyBridge() {
  const [legacyReady, setLegacyReady] = useState(false);

  useEffect(() => {
    const hrefs = [assetUrl("css/datacapturesummary.css"), assetUrl("css/global-13inch.css")];
    Promise.all(hrefs.map((href) => injectStylesheet(href)));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (cancelled) return;
        window.DATACAPTURESUMMARY_COMPANY_ID = meJson?.data?.company_id ?? null;
        window.__DCS_REACT_BOOTSTRAP__ = true;
        setLegacyReady(true);

        const dcSection = document.getElementById("sidebar-datacapture-section");
        const dcTitle = dcSection?.querySelector(".informationmenu-section-title");
        if (dcTitle) {
          dcTitle.onclick = (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            window.isNavigatingAwayByBackOrSubmit = true;
            try {
              localStorage.removeItem("capturedTableData");
              localStorage.removeItem("capturedProcessData");
              localStorage.removeItem("capturedDataCaptureType");
              localStorage.removeItem("capturedFormatPreviewHtml");
              localStorage.removeItem("captured655PreviewHtml");
              localStorage.removeItem("capturedTableRateValues");
              localStorage.removeItem("capturedTableFormulaSourceForRefresh");
              localStorage.removeItem("capturedCaptureId");
            } catch {
              // ignore storage cleanup errors
            }
            window.location.href = "/datacapture";
          };
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    };

    setup();
    return () => {
      cancelled = true;
      window.__DCS_REACT_BOOTSTRAP__ = false;
    };
  }, []);

  return { legacyReady };
}
