/** SVG defs + overlays for modern flowing chart animations. */

export const DASHBOARD_TREND_FLOW_CYCLE = "2.8s";
export const DASHBOARD_TREND_DRAW_BEGIN_MS = 80;
export const DASHBOARD_TREND_DRAW_DURATION_MS = 1100;
export const DASHBOARD_TREND_FLOW_LAYER_OFFSET_MS = 120;
export const DASHBOARD_TREND_IDLE_DELAY_MS =
  DASHBOARD_TREND_DRAW_BEGIN_MS + DASHBOARD_TREND_DRAW_DURATION_MS + 100;
/** Share of the timeline used to stagger points left → right (wave). */
export const DASHBOARD_TREND_WAVE_SPREAD = 0.62;

export const TREND_CHART_METRIC_KEYS = ["profit", "expenses", "netProfit", "earnings"];

export function easeOutCubic(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}

/** Interpolate each point from 0.00 with a left-to-right wave. */
export function interpolateTrendChartRows(targetRows, progress) {
  if (!targetRows?.length) return [];
  const n = targetRows.length;
  const waveWindow = Math.max(1 - DASHBOARD_TREND_WAVE_SPREAD, 0.12);

  return targetRows.map((row, index) => {
    const stagger = n <= 1 ? 0 : (index / (n - 1)) * DASHBOARD_TREND_WAVE_SPREAD;
    const localT = easeOutCubic(Math.max(0, Math.min(1, (progress - stagger) / waveWindow)));
    const next = { ...row };
    TREND_CHART_METRIC_KEYS.forEach((key) => {
      if (key in row) {
        next[key] = (Number(row[key]) || 0) * localT;
      }
    });
    return next;
  });
}

const TREND_FLOW_SERIES = [
  { id: "Profit", color: "#3b82f6" },
  { id: "Exp", color: "#ef4444" },
  { id: "Net", color: "#10b981" },
  { id: "Earn", color: "#f59e0b" },
];

export function DashboardTrendFlowDefs() {
  return (
    <defs>
      {TREND_FLOW_SERIES.map(({ id, color }) => (
        <g key={id}>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="72%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`g${id}Flow`} gradientUnits="userSpaceOnUse" x1="-240" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="38%" stopColor={color} stopOpacity="0.08" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.42" />
            <stop offset="62%" stopColor={color} stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            <animate
              attributeName="x1"
              values="-240;520;-240"
              dur={DASHBOARD_TREND_FLOW_CYCLE}
              repeatCount="indefinite"
            />
            <animate
              attributeName="x2"
              values="0;760;0"
              dur={DASHBOARD_TREND_FLOW_CYCLE}
              repeatCount="indefinite"
            />
          </linearGradient>
        </g>
      ))}

    </defs>
  );
}

const FLOW_FILL_BY_DATA_KEY = {
  profit: { base: "url(#gProfit)", flow: "url(#gProfitFlow)" },
  expenses: { base: "url(#gExp)", flow: "url(#gExpFlow)" },
  netProfit: { base: "url(#gNet)", flow: "url(#gNetFlow)" },
  earnings: { base: "url(#gEarn)", flow: "url(#gEarnFlow)" },
};

export function resolveTrendFlowFill(dataKey) {
  return FLOW_FILL_BY_DATA_KEY[dataKey] || null;
}

function isTrendBaseAreaItem(item) {
  return String(item?.props?.className || "").includes("dashboard-trend-area-base");
}

export function DashboardChartSeriesPulse({ formattedGraphicalItems, flowActive }) {
  if (!flowActive || !formattedGraphicalItems?.length) return null;

  return (
    <g className="dashboard-chart-flow-pulses" aria-hidden="true">
      {formattedGraphicalItems.map((item) => {
        if (!isTrendBaseAreaItem(item)) return null;
        const points = item?.props?.points;
        const stroke = item?.props?.stroke;
        const dataKey = item?.props?.dataKey;
        const strokeWidth = item?.props?.strokeWidth;
        if (!points?.length || !stroke || stroke === "none" || !strokeWidth) return null;

        const last = points[points.length - 1];
        const pulseKey = dataKey || stroke;

        return (
          <g key={pulseKey} className="dashboard-chart-flow-pulse-group">
            <circle cx={last.x} cy={last.y} r={5} fill={stroke} fillOpacity="0.18">
              <animate
                attributeName="r"
                values="4;13;4"
                dur={DASHBOARD_TREND_FLOW_CYCLE}
                repeatCount="indefinite"
              />
              <animate
                attributeName="fill-opacity"
                values="0.22;0.04;0.22"
                dur={DASHBOARD_TREND_FLOW_CYCLE}
                repeatCount="indefinite"
              />
            </circle>
            <circle cx={last.x} cy={last.y} r={4.5} fill={stroke} stroke="#fff" strokeWidth={2} />
            <circle cx={last.x} cy={last.y} r={2} fill="#ffffff" fillOpacity="0.92" />
          </g>
        );
      })}
    </g>
  );
}

export function DashboardChartFlowTravelers({ formattedGraphicalItems, flowActive, chartAnimKey }) {
  if (!flowActive || !formattedGraphicalItems?.length) return null;

  return (
    <g className="dashboard-chart-flow-travelers" aria-hidden="true" key={chartAnimKey}>
      {formattedGraphicalItems.map((item) => {
        if (!isTrendBaseAreaItem(item)) return null;
        const points = item?.props?.points;
        const stroke = item?.props?.stroke;
        const dataKey = item?.props?.dataKey;
        const strokeWidth = item?.props?.strokeWidth;
        if (!points?.length || points.length < 2 || !stroke || stroke === "none" || !strokeWidth) {
          return null;
        }

        const pathD = points
          .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
          .join(" ");
        const travelKey = `${dataKey || stroke}-travel`;

        return (
          <g key={travelKey}>
            <path d={pathD} fill="none" stroke="transparent" strokeWidth={1} pathLength={100} id={`${travelKey}-path`} />
            <circle r={3.2} fill="#ffffff" stroke={stroke} strokeWidth={2}>
              <animateMotion
                dur={DASHBOARD_TREND_FLOW_CYCLE}
                repeatCount="indefinite"
                rotate="auto"
                calcMode="linear"
              >
                <mpath href={`#${travelKey}-path`} />
              </animateMotion>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
