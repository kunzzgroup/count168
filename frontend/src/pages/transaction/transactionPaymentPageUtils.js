export function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

/** dd/mm/yyyy -> Date (local). */
export function parseDmyToDate(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function loadTxScriptOnce(src, marker) {
  const key = marker || src;
  return new Promise((resolve, reject) => {
    const bySrc = document.querySelector(`script[src="${src}"]`);
    if (bySrc) {
      bySrc.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.txScript = key;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export function companyButtonStyle(comp, snapGroup) {
  const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
  if (snapGroup) {
    return cGid === snapGroup ? {} : { display: "none" };
  }
  return cGid ? { display: "none" } : {};
}
