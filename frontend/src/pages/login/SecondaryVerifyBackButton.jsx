export default function SecondaryVerifyBackButton({ onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full border-0 bg-transparent text-sky-400 hover:bg-sky-50 hover:text-blue-600 transition-all duration-200 cursor-pointer"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <i className="fas fa-arrow-left text-lg" />
    </button>
  );
}
