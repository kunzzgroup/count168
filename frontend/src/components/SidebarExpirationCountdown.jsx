/**
 * Sidebar footer expiration card — shared by AuthenticatedLayout & MemberPage.
 */
export default function SidebarExpirationCountdown({
  status = "normal",
  label,
  hint,
  clickable = false,
  title,
  onClick,
  onKeyDown,
}) {
  return (
    <div
      className={`company-expiration-countdown company-expiration-countdown--sidebar ${status}${clickable ? " is-clickable" : ""}`}
      title={title}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="expiration-icon-wrap" aria-hidden="true">
        <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div className="expiration-content">
        <span className="expiration-label">{label}</span>
        <span className="expiration-countdown-text">{hint}</span>
      </div>
    </div>
  );
}
