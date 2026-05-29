import { Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";

const MAX_CACHED_ROUTES = 12;

/**
 * Keeps visited routes mounted (hidden) so sidebar hops reuse DOM + in-memory data.
 * Defers caching until the router has committed the new outlet (BrowserRouter-safe;
 * useNavigation requires createBrowserRouter and crashes the app).
 */
export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const pathname = location.pathname;

  const [cache, setCache] = useState(() => new Map());
  const [displayPath, setDisplayPath] = useState(pathname);
  const commitGenRef = useRef(0);

  const isCached = cache.has(pathname);
  const showLiveLayer = !isCached;

  // Revisit a cached route: switch immediately.
  useEffect(() => {
    if (cache.has(pathname)) {
      setDisplayPath(pathname);
    }
  }, [pathname, cache]);

  // First visit: wait one frame so pathname and outlet stay in sync before caching.
  useEffect(() => {
    if (!outlet) return;

    if (cache.has(pathname)) {
      setDisplayPath(pathname);
      return undefined;
    }

    const gen = ++commitGenRef.current;
    let cancelled = false;

    const commit = () => {
      if (cancelled || gen !== commitGenRef.current) return;
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
    };

    queueMicrotask(() => {
      requestAnimationFrame(commit);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, outlet, cache]);

  const liveActive = showLiveLayer && displayPath === pathname;

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
            className={`ec-page-shell__content${liveActive ? " is-active" : ""}`}
            aria-hidden={!liveActive}
          >
            {outlet}
          </div>
        </Suspense>
      ) : null}
    </main>
  );
}
