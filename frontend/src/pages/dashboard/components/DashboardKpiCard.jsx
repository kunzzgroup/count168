import { DashboardAnimatedValue } from "./DashboardAnimatedValue.jsx";
import { KPI_CARD_ICONS } from "../lib/dashboardConstants.js";
import { formatSignedChange } from "../lib/dashboardFormat.js";

export function DashboardKpiCard({
  variant,
  label,
  value,
  loading,
  id,
  tone,
  compare,
  compareLabel,
  fallbackFoot,
  footNote,
}) {
  const showCompare = compare && !loading;
  const showBadge = showCompare && compare.badgeMode !== "none" && compare.badgeText !== "—";

  return (
    <div
      id={id}
      className={`dashboard-kpi-card dashboard-kpi-card--${variant}${tone ? ` dashboard-kpi-card--${tone}` : ""}`}
    >
      <div className="kpi-card-head">
        <i className={`kpi-card-head-icon ${KPI_CARD_ICONS[variant] || "far fa-chart-bar"}`} aria-hidden="true" />
        <span className="kpi-card-head-label">{label}</span>
      </div>
      <div className="kpi-card-main">
        <div className="kpi-card-value">
          <DashboardAnimatedValue value={value} />
        </div>
        {showBadge && (
          <span className={`kpi-card-badge${compare.badgePositive ? " is-up" : " is-down"}`}>
            <i className={`fas fa-arrow-${compare.badgeArrow}`} aria-hidden="true" />
            {compare.badgeText}
          </span>
        )}
      </div>
      <div className="kpi-card-foot">
        {showCompare ? (
          <>
            <span className={`kpi-card-delta${compare.deltaPositive ? " is-up" : " is-down"}`}>
              {formatSignedChange(compare.delta)}
            </span>
            <span className="kpi-card-foot-muted">{compareLabel}</span>
          </>
        ) : (
          <span className="kpi-card-foot-muted">{fallbackFoot}</span>
        )}
        {footNote ? <span className="kpi-card-foot-note">{footNote}</span> : null}
      </div>
    </div>
  );
}
