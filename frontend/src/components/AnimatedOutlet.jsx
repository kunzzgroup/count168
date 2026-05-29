import { Suspense } from "react";
import { useLocation, useOutlet } from "react-router-dom";

/** Keeps sidebar mounted; swaps route content without loading spinners or enter animations. */
export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <main className="ec-page-shell" aria-live="polite">
      <Suspense fallback={null}>
        <div key={location.pathname} className="ec-page-shell__content">
          {outlet}
        </div>
      </Suspense>
    </main>
  );
}
