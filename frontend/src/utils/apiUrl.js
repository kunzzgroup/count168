export function buildApiUrl(pathAndQuery) {
  const pathname = window.location.pathname || "/";
  const basePath = pathname.replace(/[^/]*$/, "") || "/";
  const base = window.location.origin + basePath;
  return new URL(pathAndQuery, base).href;
}

/** Static assets (css/js) under the same path base as APIs, e.g. /subdir/admin → /subdir/js/... */
export function assetUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  // Prefer the bundled asset base (where index-*.js is loaded from),
  // because SPA routes like /announcement can otherwise resolve to /css/* and 404.
  const entryScript = document.querySelector('script[type="module"][src*="/assets/"]');
  const src = entryScript?.getAttribute("src");
  if (src) {
    try {
      const pathname = new URL(src, window.location.origin).pathname;
      const marker = "/assets/";
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const assetBasePath = pathname.slice(0, markerIndex + 1); // keep trailing slash
        return new URL(`${assetBasePath}${clean}`, window.location.origin).href;
      }
    } catch {
      // Fallback to legacy path resolution.
    }
  }
  return buildApiUrl(clean);
}
