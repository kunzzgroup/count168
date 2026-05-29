import { Suspense, useEffect, useState } from "react";
import { useLocation, useNavigation, useOutlet } from "react-router-dom";

const MAX_CACHED_ROUTES = 12;

/**
 * Keeps visited routes mounted (hidden) so sidebar hops reuse DOM + in-memory data.
 * Only caches after navigation settles — avoids storing the previous route under the new path.
 */
export default function AnimatedOutlet() {
  const location = useLocation();
  const navigation = useNavigation();
  const outlet = useOutlet();
  const pathname = location.pathname;
  const isNavigating = navigation.state !== "idle";

  const [cache, setCache] = useState(() => new Map());
  /** Path whose cached/live layer is currently visible */
  const [displayPath, setDisplayPath] = useState(pathname);

  const isCached = cache.has(pathname);
  const showLiveLayer = !isCached;

  // Revisit a cached route: switch immediately (no wait for lazy chunk).
  useEffect(() => {
    if (cache.has(pathname)) {
      setDisplayPath(pathname);
    }
  }, [pathname, cache]);

  // First visit: wait until router is idle, then cache the committed outlet.
  useEffect(() => {
    if (!outlet || isNavigating) return;

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
    setDisplayPath(pathname);
  }, [pathname, outlet, isNavigating]);

  return (
    <main className="ec-page-shell" aria-live="polite">
      {Array.from(cache.entries()).map(([path, element]) => (
        <div
          key={path}
          className={`ec-page-shell__content${path === displayPath ? " is-active" : ""}`}
          aria-hidden={path !== displayPath}
        >
          {element}
        </div>
      ))}
      {showLiveLayer ? (
        <Suspense fallback={null}>
          <div
            className={`ec-page-shell__content${displayPath === pathname && !isNavigating ? " is-active" : ""}`}
            aria-hidden={displayPath !== pathname || isNavigating}
          >
            {outlet}
          </div>
        </Suspense>
      ) : null}
    </main>
  );
}
