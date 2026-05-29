import { Suspense } from "react";
import { Outlet } from "react-router-dom";

/** Single outlet mount — no element cache (cache duplicated routes and cancelled data fetches). */
export default function AnimatedOutlet() {
  return (
    <main className="ec-page-shell" aria-live="polite">
      <Suspense fallback={null}>
        <div className="ec-page-shell__content">
          <Outlet />
        </div>
      </Suspense>
    </main>
  );
}
