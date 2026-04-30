import { useEffect } from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { injectStylesheet } from "../utils/assetLoader.js";

export function useDataCaptureLegacyBridge({ companyId, companyCode }) {
  useEffect(() => {
    const hrefs = [assetUrl("css/datacapture.css"), assetUrl("css/global-13inch.css")];
    Promise.all(hrefs.map((href) => injectStylesheet(href)));
  }, []);

  /**
   * Keep legacy globals for datacapture.js compatibility.
   * Company switching itself is fully React-controlled now.
   */
  useEffect(() => {
    if (companyId == null) return;
    window.DATACAPTURE_COMPANY_ID = companyId;
    window.DATACAPTURE_COMPANY_CODE = companyCode || "";
  }, [companyId, companyCode]);
}
