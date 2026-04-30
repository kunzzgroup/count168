export function buildApiUrl(pathAndQuery) {
  const pathname = window.location.pathname || "/";
  const basePath = pathname.replace(/[^/]*$/, "") || "/";
  const base = window.location.origin + basePath;
  return new URL(pathAndQuery, base).href;
}

/** Static assets (css/js) under the same path base as APIs, e.g. /subdir/admin → /subdir/js/... */
function getAssetBasePath() {
  const script = document.querySelector('script[src*="assets/index-"]');
  const src = script?.getAttribute("src") || "";

  if (src.includes("/frontend/dist/assets/")) return "/frontend/dist/";
  if (src.includes("/assets/")) return "/";
  if ((window.location.pathname || "").includes("/frontend/dist/")) return "/frontend/dist/";
  return "/";
}

export function assetUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  return new URL(`${getAssetBasePath()}${clean}`, window.location.origin).href;
}
