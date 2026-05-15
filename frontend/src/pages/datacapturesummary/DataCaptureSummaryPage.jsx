/**
 * Router shim — `App.jsx` imports this route; some snapshots omit the full Summary SPA.
 * Replace with the migrated Summary shell when available (mirror `datacapturesummary.php` + `js/datacapturesummary.js`).
 */
export default function DataCaptureSummaryPage() {
  return (
    <div className="container" style={{ padding: "24px", maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Data Capture Summary</h1>
      <p>
        This checkout defines the route but does not include the full Data Capture Summary React page bundle.
      </p>
      <p>
        Submitting from Data Capture expects this route — restore <code>DataCaptureSummaryPage.jsx</code> from your complete frontend branch or migrate{" "}
        <code>datacapturesummary.php</code> using the same pattern as Data Capture.
      </p>
    </div>
  );
}
