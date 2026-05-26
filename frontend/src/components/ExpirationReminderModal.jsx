import { useEffect } from "react";

export default function ExpirationReminderModal({ open, title, message, confirmLabel, onConfirm }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onConfirm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="expiration-reminder-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onConfirm();
      }}
    >
      <div className="expiration-reminder-modal-box" role="dialog" aria-labelledby="expirationReminderTitle">
        <div className="expiration-reminder-modal-icon-wrap">
          <svg className="expiration-reminder-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h3 id="expirationReminderTitle" className="expiration-reminder-modal-title">
          {title}
        </h3>
        <p className="expiration-reminder-modal-message">{message}</p>
        <div className="expiration-reminder-modal-actions">
          <button type="button" className="expiration-reminder-modal-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
