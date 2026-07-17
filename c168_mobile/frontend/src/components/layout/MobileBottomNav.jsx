import { memo, useEffect, useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";

function isNavItemActive(pathname, item) {
  if (item.to === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return Boolean(matchPath({ path: `${item.to}/*`, end: false }, pathname));
}

/**
 * Bottom nav with CSS-only sliding indicator (transform-only, no layout reads).
 */
function MobileBottomNav({ items, labels }) {
  const { pathname } = useLocation();
  const activeIdx = Math.max(
    0,
    items.findIndex((item) => isNavItemActive(pathname, item)),
  );
  const count = Math.max(items.length, 1);
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMotionReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`m-shell-nav-pill${motionReady ? " is-motion" : ""}`}
      style={{
        "--nav-count": String(count),
        "--nav-index": String(activeIdx),
      }}
    >
      <span className="m-shell-nav-indicator" aria-hidden="true" />
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/dashboard"}
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

export default memo(MobileBottomNav);
