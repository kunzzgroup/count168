import { Suspense, useEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";

/** Keeps sidebar mounted; animates main content on route change (no loading spinner). */
export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const shellRef = useRef(null);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    el.classList.remove("ec-page-shell--enter");
    void el.offsetWidth;
    el.classList.add("ec-page-shell--enter");
  }, [location.pathname]);

  return (
    <main ref={shellRef} className="ec-page-shell" aria-live="polite">
      <Suspense fallback={null}>
        <div key={location.pathname} className="ec-page-shell__content">
          {outlet}
        </div>
      </Suspense>
    </main>
  );
}
