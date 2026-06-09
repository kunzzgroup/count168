/** SVG defs + overlays for modern flowing chart animations. */

const TREND_FLOW_SERIES = [
  { id: "Profit", color: "#3b82f6", glow: "rgba(59,130,246,0.55)" },
  { id: "Exp", color: "#ef4444", glow: "rgba(239,68,68,0.5)" },
  { id: "Net", color: "#10b981", glow: "rgba(16,185,129,0.5)" },
  { id: "Earn", color: "#f59e0b", glow: "rgba(245,158,11,0.5)" },
];

export function DashboardTrendFlowDefs() {
  return (
    <defs>
      {TREND_FLOW_SERIES.map(({ id, color, glow }) => (
        <filter key={`f-${id}`} id={`dashboardGlow${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
          <feFlood floodColor={glow} floodOpacity="0.85" result="glowColor" />
          <feComposite in="glowColor" in2="blur" operator="in" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      ))}

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
            <animate attributeName="x1" values="-240;520;-240" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="x2" values="0;760;0" dur="2.6s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient id={`g${id}StrokeFlow`} gradientUnits="userSpaceOnUse" x1="-180" y1="0" x2="180" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.45" />
            <animate attributeName="x1" values="-180;360;-180" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="x2" values="180;720;180" dur="2.2s" repeatCount="indefinite" />
          </linearGradient>
        </g>
      ))}

    </defs>
  );
}

const FLOW_FILL_BY_DATA_KEY = {
  profit: { base: "url(#gProfit)", flow: "url(#gProfitFlow)", glow: "url(#dashboardGlowProfit)" },
  expenses: { base: "url(#gExp)", flow: "url(#gExpFlow)", glow: "url(#dashboardGlowExp)" },
  netProfit: { base: "url(#gNet)", flow: "url(#gNetFlow)", glow: "url(#dashboardGlowNet)" },
  earnings: { base: "url(#gEarn)", flow: "url(#gEarnFlow)", glow: "url(#dashboardGlowEarn)" },
};

export function resolveTrendFlowFill(dataKey) {
  return FLOW_FILL_BY_DATA_KEY[dataKey] || null;
}

export function DashboardChartSeriesPulse({ formattedGraphicalItems, flowActive }) {
  if (!flowActive || !formattedGraphicalItems?.length) return null;

  return (
    <g className="dashboard-chart-flow-pulses" aria-hidden="true">
      {formattedGraphicalItems.map((item) => {
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
              <animate attributeName="r" values="4;13;4" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="fill-opacity" values="0.22;0.04;0.22" dur="2.4s" repeatCount="indefinite" />
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
              <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto" calcMode="linear">
                <mpath href={`#${travelKey}-path`} />
              </animateMotion>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
