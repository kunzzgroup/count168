import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";

function isNavItemActive(pathname, item) {
  if (item.to === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return Boolean(matchPath({ path: `${item.to}/*`, end: false }, pathname));
}

function measureIndicator(linkEl, pillEl) {
  if (!linkEl || !pillEl) return null;
  const pillRect = pillEl.getBoundingClientRect();
  const linkRect = linkEl.getBoundingClientRect();
  return {
    left: linkRect.left - pillRect.left,
    width: linkRect.width,
  };
}

/**
 * iOS / IG-style bottom nav: frosted pill + sliding liquid-glass active indicator.
 */
export default function MobileBottomNav({ items, labels, navHidden }) {
  const { pathname } = useLocation();
  const pillRef = useRef(null);
  const linkRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  const syncIndicator = useCallback(() => {
    const pill = pillRef.current;
    if (!pill || items.length === 0) return;
    const activeIdx = Math.max(
      0,
      items.findIndex((item) => isNavItemActive(pathname, item)),
    );
    const link = linkRefs.current[activeIdx];
    const next = measureIndicator(link, pill);
    if (!next) return;
    setIndicator((prev) => ({
      left: next.left,
      width: next.width,
      ready: prev.ready || next.width > 0,
    }));
  }, [items, pathname]);

  useLayoutEffect(() => {
    syncIndicator();
  }, [syncIndicator]);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) return undefined;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncIndicator) : null;
    ro?.observe(pill);
    window.addEventListener("resize", syncIndicator);
    if (document.fonts?.ready) {
      document.fonts.ready.then(syncIndicator).catch(() => {});
    }
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncIndicator);
    };
  }, [syncIndicator]);

  return (
    <div className="m-shell-nav-pill" ref={pillRef}>
      <span
        className={`m-shell-nav-indicator${indicator.ready ? " is-ready" : ""}`}
        style={{
          transform: `translate3d(${indicator.left}px, 0, 0)`,
          width: `${indicator.width}px`,
        }}
        aria-hidden="true"
      />
      {items.map((item, index) => (
        <NavLink
          key={item.to}
          ref={(el) => {
            linkRefs.current[index] = el;
          }}
          to={item.to}
          end={item.to === "/dashboard"}
          tabIndex={navHidden ? -1 : undefined}
          className={({ isActive }) =>
            `m-shell-nav-link${isActive ? " m-shell-nav-link--active" : ""}`
          }
        >
          <span className="m-shell-nav-glyph" aria-hidden="true">
            <i className={`fas ${item.icon}`} />
          </span>
          <span className="m-shell-nav-label">{labels[item.key]}</span>
        </NavLink>
      ))}
    </div>
  );
}
