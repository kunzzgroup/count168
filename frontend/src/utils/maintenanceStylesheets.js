/**
 * 各 Maintenance 子路由会各自注入 `*_maintenance.css`。SPA 切换时若不移除上一页的 sheet，
 * 多个文件同时定义 `.maintenance-search-section` 等相同选择器，后加载顺序不稳定，会出现
 * 「要点刷新才对」的样式错乱。整页刷新时 head 里只有当前页需要的 CSS，故表现正常。
 */
export const MAINTENANCE_PAGE_STYLESHEETS = [
  "capture_maintenance.css",
  "transaction_maintenance.css",
  "payment_maintenance.css",
  "formula_maintenance.css",
  "bankprocess_maintenance.css",
];

/**
 * @param {string} keepFileName - 须保留的文件名，例如 "transaction_maintenance.css"
 */
export function removeOtherMaintenanceStylesheets(keepFileName) {
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.href || link.getAttribute("href") || "";
    /** 匹配 `capture_maintenance.css` 与 Vite 构建后的 `capture_maintenance-xxxxx.css` */
    const hit = MAINTENANCE_PAGE_STYLESHEETS.find((name) => {
      const base = name.replace(/\.css$/i, "");
      return href.includes(base);
    });
    if (hit && hit !== keepFileName) {
      link.remove();
    }
  });
}

/**
 * 等待样式表可用；支持 href 与 DOM 中已存在 link 的绝对/相对 URL 不一致的情况。
 * @param {string} href - 传给 <link href> 的地址（一般为 assetUrl(...)）
 */
export function waitForStylesheet(href) {
  return new Promise((resolve) => {
    const file = href.split("/").pop() || href;

    const findExisting = () =>
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((link) => {
        const h = link.href || link.getAttribute("href") || "";
        return h === href || h.endsWith(file) || h.includes(file);
      });

    const markLoaded = (el) => {
      try {
        el.dataset.loaded = "1";
      } catch {
        /* ignore */
      }
      resolve(el);
    };

    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`) || findExisting();

    if (existing) {
      document.head.appendChild(existing);
      if (existing.dataset.loaded === "1") return resolve(existing);
      try {
        if (existing.sheet != null) return markLoaded(existing);
      } catch {
        /* ignore */
      }
      const onLoad = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        markLoaded(existing);
      };
      const onError = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        resolve(existing);
      };
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => markLoaded(l);
    l.onerror = () => resolve(l);
    document.head.appendChild(l);
  });
}
