/** Shown while auth/session bootstraps — avoids empty #root (login bg “white screen”). */
export default function AppBootLoading({ label = "Loading…" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        color: "#334155",
        background: "#f8fafc",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid #e2e8f0",
          borderTopColor: "#3b82f6",
          animation: "ec-boot-spin 0.75s linear infinite",
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <style>{`@keyframes ec-boot-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
