export default function SecondaryVerifyBackButton({ onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className="secondary-verify-back-btn"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {"<--"}
    </button>
  );
}
