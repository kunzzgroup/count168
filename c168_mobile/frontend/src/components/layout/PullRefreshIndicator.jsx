/** Circular pull / refresh indicator — moves with content, no layout jump. */
export default function PullRefreshIndicator({ pullPx, progress, phase, labels }) {
  const spinning = phase === "refreshing";
  const armed = phase === "armed";
  const settling = phase === "settling";
  const pulling = phase === "pulling" || armed;

  if (pullPx < 0.5 && !spinning && !settling) return null;

  const label = spinning
    ? labels.loading || "Loading…"
    : armed
      ? labels.releaseToRefresh || "Release to refresh"
      : labels.pullToRefresh || "Pull to refresh";

  const size = 28;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arcLen = circumference * Math.min(1, progress);
  const opacity = Math.min(1, 0.35 + progress * 0.75);

  return (
    <div
      className="flex flex-col items-center justify-end overflow-hidden"
      style={{
        height: Math.max(pullPx, spinning || settling ? 46 : 0),
        opacity,
        transition: settling ? "height 280ms ease, opacity 200ms ease" : undefined,
      }}
      aria-live={spinning ? "polite" : undefined}
      aria-hidden={!pulling && !spinning && !settling}
    >
      <div className="flex flex-col items-center gap-1 pb-1">
        <div className="relative grid size-8 place-items-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={spinning ? "animate-[mPullSpin_0.75s_linear_infinite]" : ""}
            aria-hidden="true"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={stroke}
            />
            {!spinning ? (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={armed ? "#2f6bf6" : "#94a3b8"}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${arcLen} ${circumference}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: pulling ? undefined : "stroke-dasharray 200ms ease" }}
              />
            ) : (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="#2f6bf6"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference * 0.28} ${circumference}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            )}
          </svg>
          {!spinning && (
            <i
              className={`fas fa-arrow-down absolute text-[9px] ${
                armed ? "text-[#2f6bf6]" : "text-slate-400"
              }`}
              style={{
                transform: armed ? "rotate(180deg)" : undefined,
                transition: "transform 180ms ease, color 180ms ease",
              }}
              aria-hidden="true"
            />
          )}
        </div>
        {(pulling || spinning) && (
          <span
            className={`text-[10px] font-bold tracking-wide ${
              armed || spinning ? "text-[#2f6bf6]" : "text-slate-400"
            }`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
