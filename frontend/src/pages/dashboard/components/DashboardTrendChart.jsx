import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardChartBaseline } from "../lib/dashboardChart.jsx";
import {
  DashboardTrendAreaDefs,
  DASHBOARD_TREND_DRAW_BEGIN_MS,
  DASHBOARD_TREND_DRAW_DURATION_MS,
  resolveTrendAreaFill,
  zeroTrendChartRows,
} from "../lib/dashboardChartFx.jsx";
import { formatChartTooltipLabel } from "../lib/dashboardDateUtils.js";
import { formatCurrency } from "../lib/dashboardFormat.js";

export function DashboardTrendChart({
  i18n,
  chartRows,
  chartSeries,
  chartVisible,
  onToggleSeries,
  chartDateRangeText,
  chartXAxisLayout,
  chartDataStable = false,
}) {
  const [chartVisitKey] = useState(() => Date.now());
  const [chartAnimArmed, setChartAnimArmed] = useState(false);
  const [displayRows, setDisplayRows] = useState(null);
  const chartRowsRef = useRef(chartRows);
  chartRowsRef.current = chartRows;

  const hasChartData = chartRows.length > 0;
  const chartSessionKey = `${chartVisitKey}-${chartDateRangeText}`;
  const chartAnimKey = `${chartSessionKey}-${chartAnimArmed ? "play" : "hold"}`;

  useEffect(() => {
    setChartAnimArmed(false);
    setDisplayRows(null);
  }, [chartSessionKey]);

  useEffect(() => {
    if (!hasChartData || !chartDataStable) {
      setChartAnimArmed(false);
      setDisplayRows(null);
      return undefined;
    }

    let cancelled = false;
    let rafId = 0;
    const targetRows = chartRowsRef.current;

    setChartAnimArmed(true);
    setDisplayRows(zeroTrendChartRows(targetRows));

    rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setDisplayRows(targetRows);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      setChartAnimArmed(false);
      setDisplayRows(null);
    };
  }, [chartSessionKey, hasChartData, chartDataStable]);

  const chartBodyClassName = [
    "dashboard-panel-chart-body",
    chartAnimArmed ? "is-enter" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="dashboard-panel-card dashboard-panel-card--chart">
      <div className="dashboard-panel-head">
        <h3 className="dashboard-panel-title">{i18n.trendChart}</h3>
        <div className="dashboard-panel-legend" role="group" aria-label={i18n.trendChart}>
          {chartSeries.map((s) => (
            <button
              key={s.dataKey}
              type="button"
              className={`dashboard-legend-item${chartVisible[s.idx] ? " is-on" : ""}`}
              aria-pressed={chartVisible[s.idx]}
              onClick={() => onToggleSeries(s.idx)}
            >
              <span className="dashboard-legend-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="dashboard-panel-period-pill" id="chart-date-range">
          {chartDateRangeText}
        </div>
      </div>
      <div className={chartBodyClassName}>
        {chartAnimArmed && displayRows ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              key={chartAnimKey}
              data={displayRows}
              baseValue={0}
              margin={{ top: 8, right: 16, left: 0, bottom: chartXAxisLayout.marginBottom }}
            >
              <DashboardTrendAreaDefs />
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <Customized component={DashboardChartBaseline} />
              <XAxis
                dataKey="label"
                interval={chartXAxisLayout.interval}
                minTickGap={chartXAxisLayout.minTickGap}
                tick={chartXAxisLayout.tick}
                height={chartXAxisLayout.height}
                tickMargin={0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} width={72} />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(_, items) => {
                  const d = items?.[0]?.payload?.date;
                  return formatChartTooltipLabel(d, i18n.locale);
                }}
              />
              {chartSeries.map((s) => {
                if (!chartVisible[s.idx]) return null;
                const areaFill = resolveTrendAreaFill(s.dataKey) || s.fill;
                return (
                  <Area
                    key={`${s.dataKey}-${chartAnimKey}`}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.label}
                    stroke={s.color}
                    fill={areaFill}
                    strokeWidth={2}
                    baseValue={0}
                    dot={false}
                    activeDot={{ r: 8, strokeWidth: 2, stroke: s.color, fill: "#fff" }}
                    isAnimationActive
                    animationBegin={DASHBOARD_TREND_DRAW_BEGIN_MS}
                    animationDuration={DASHBOARD_TREND_DRAW_DURATION_MS}
                    animationEasing="ease-out"
                    className="dashboard-trend-area"
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-panel-chart-placeholder" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
