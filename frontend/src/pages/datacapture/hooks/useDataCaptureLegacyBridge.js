import { useEffect } from "react";
import { assetUrl } from "../../../utils/apiUrl.js";
import { injectStylesheet } from "../utils/assetLoader.js";

export function useDataCaptureLegacyBridge() {
  useEffect(() => {
    const hrefs = [assetUrl("css/datacapture.css"), assetUrl("css/global-13inch.css")];
    Promise.all(hrefs.map((href) => injectStylesheet(href)));
  }, []);
}
