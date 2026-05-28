import { parseMaintenanceDateTime } from "./maintenanceCreatedAtDisplay.js";

/**
 * Created At column: date only; gray time text on hover/focus.
 * @param {{ value?: string | null, fallback?: string }} props
 */
export default function MaintenanceCreatedAtDisplay({ value, fallback = "-" }) {
  const parsed = parseMaintenanceDateTime(value);
  if (!parsed) return fallback;

  const { date, time } = parsed;
  const hasTime = Boolean(time);

  return (
    <span
      className={`maintenance-created-at-display${hasTime ? " maintenance-created-at-display--has-time" : ""}`}
      title={hasTime ? time : undefined}
      aria-label={hasTime ? `${date} ${time}` : date}
    >
      <span className="maintenance-created-at-date">{date}</span>
      {hasTime ? <span className="maintenance-created-at-time-reveal">{time}</span> : null}
    </span>
  );
}
