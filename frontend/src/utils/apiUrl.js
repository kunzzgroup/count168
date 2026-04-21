export function buildApiUrl(pathAndQuery) {
  const pathname = window.location.pathname || "/";
  const basePath = pathname.replace(/[^/]*$/, "") || "/";
  const base = window.location.origin + basePath;
  return new URL(pathAndQuery, base).href;
}
