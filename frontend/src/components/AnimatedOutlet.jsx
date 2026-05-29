import { Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";

const MAX_CACHED_ROUTES = 12;

/**
 * Keeps visited routes mounted (hidden) so sidebar hops reuse DOM, chart animations,
 * and in-memory data. While a lazy chunk loads, the previous page stays visible.
 */
export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const pathname = location.pathname;

  const visiblePathRef = useRef(pathname);
  const [cache, setCache] = useState(() => new Map());

  useEffect(() => {
    if (!outlet) return;
    visiblePathRef.current = pathname;
    setCache((prev) => {
      if (prev.get(pathname) === outlet) return prev;
      const next = new Map(prev);
      next.set(pathname, outlet);
      while (next.size > MAX_CACHED_ROUTES) {
        const oldest = next.keys().next().value;
        if (oldest === pathname) break;
        next.delete(oldest);
      }
      return next;
    });
  }, [pathname, outlet]);

  const isCached = cache.has(pathname);
  const keepPreviousVisible = !isCached && cache.size > 0;
  const visiblePath = isCached ? pathname : keepPreviousVisible ? visiblePathRef.current : pathname;

  return (
    <main className="ec-page-shell" aria-live="polite">
      {Array.from(cache.entries()).map(([path, element]) => (
        <div
          key={path}
          className={`ec-page-shell__content${path === visiblePath ? " is-active" : ""}`}
          aria-hidden={path !== visiblePath}
        >
          {element}
        </div>
      ))}
      {!isCached ? (
        <Suspense fallback={null}>
          <div
            className={`ec-page-shell__content${!keepPreviousVisible ? " is-active" : ""}`}
            aria-hidden={keepPreviousVisible}
          >
            {outlet}
          </div>
        </Suspense>
      ) : null}
    </main>
  );
}
