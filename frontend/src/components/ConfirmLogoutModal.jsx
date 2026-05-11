import { useEffect } from "react";

export default function ConfirmLogoutModal({ open, onCancel, onConfirm, loading = false, i18n = {} }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, loading]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.confirmLogoutTitle || "Confirm logout"}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          padding: 20,
        }}
      >
        <h3 style={{ margin: 0, fontSize: "var(--text-page-title-mb)", color: "#1a1a1a" }}>
          {i18n.confirmLogoutTitle || "Confirm Logout"}
        </h3>
        <p style={{ marginTop: 6, marginBottom: 20, color: "#4b5563" }}>
          {i18n.confirmLogoutMessage || "Are you sure you want to logout?"}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111827",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {i18n.cancel || "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              border: "none",
              background: "linear-gradient(135deg, #56ccf2, #004ff9)",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? i18n.loggingOut || "Logging out..." : i18n.logout || "Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}
