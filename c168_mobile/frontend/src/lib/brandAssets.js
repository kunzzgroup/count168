/** Site-root brand assets (shared with desktop under /images). */
export function brandLogoUrl() {
  if (typeof window === "undefined") return "/images/count_brandlogo.png";
  return new URL("/images/count_brandlogo.png", window.location.origin).href;
}

export function brandWhiteLogoUrl() {
  if (typeof window === "undefined") return "/images/count_whitelogo.png";
  return new URL("/images/count_whitelogo.png", window.location.origin).href;
}
