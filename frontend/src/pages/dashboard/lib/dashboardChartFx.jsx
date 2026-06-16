/** Static area gradients + zero-baseline enter draw (kunzzgroup KPI / Chart.js style). */

export const DASHBOARD_TREND_DRAW_BEGIN_MS = 0;
export const DASHBOARD_TREND_DRAW_DURATION_MS = 1000;

const TREND_CHART_METRIC_KEYS = ["profit", "expenses", "netProfit", "earnings"];

const TREND_AREA_SERIES = [
  { id: "Profit", color: "#3b82f6" },
  { id: "Exp", color: "#ef4444" },
  { id: "Net", color: "#10b981" },
  { id: "Earn", color: "#f59e0b" },
];

/** Vertical fade matching kunzzgroup KPI canvas gradient stops. */
export function DashboardTrendAreaDefs() {
  return (
    <defs>
      {TREND_AREA_SERIES.map(({ id, color }) => (
        <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="30%" stopColor={color} stopOpacity="0.2" />
          <stop offset="70%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      ))}
    </defs>
  );
}

const AREA_FILL_BY_DATA_KEY = {
  profit: "url(#gProfit)",
  expenses: "url(#gExp)",
  netProfit: "url(#gNet)",
  earnings: "url(#gEarn)",
};

export function resolveTrendAreaFill(dataKey) {
  return AREA_FILL_BY_DATA_KEY[dataKey] || null;
}

/** Flatten all series to 0.00 for the first paint; Recharts then interpolates to targets. */
export function zeroTrendChartRows(rows) {
  if (!rows?.length) return [];
  return rows.map((row) => {
    const next = { ...row };
    TREND_CHART_METRIC_KEYS.forEach((key) => {
      if (key in row) next[key] = 0;
    });
    return next;
  });
}
