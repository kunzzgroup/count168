export function buildApiUrl(pathAndQuery) {
  const pathname = window.location.pathname || "/";
  const basePath = pathname.replace(/[^/]*$/, "") || "/";
  const base = window.location.origin + basePath;
  return new URL(pathAndQuery, base).href;
}

/** Static assets (css/js) under the same path base as APIs, e.g. /subdir/admin → /subdir/js/... */
export function assetUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  return buildApiUrl(clean);
}
