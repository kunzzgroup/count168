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
  DashboardChartFlowTravelers,
  DashboardChartSeriesPulse,
  DashboardTrendFlowDefs,
  DASHBOARD_TREND_DRAW_BEGIN_MS,
  DASHBOARD_TREND_DRAW_DURATION_MS,
  DASHBOARD_TREND_FLOW_LAYER_OFFSET_MS,
  DASHBOARD_TREND_IDLE_DELAY_MS,
  resolveTrendFlowFill,
} from "../lib/dashboardChartFx.jsx";
import { formatChartTooltipLabel } from "../lib/dashboardDateUtils.js";
import { formatCurrency } from "../lib/dashboardFormat.js";

function DashboardTrendFlowLayers(props) {
  return (
    <>
      <DashboardChartSeriesPulse {...props} />
      <DashboardChartFlowTravelers {...props} />
    </>
  );
}

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
  const [animChartRows, setAnimChartRows] = useState(null);
  const [flowIdle, setFlowIdle] = useState(false);
  const chartRowsRef = useRef(chartRows);
  chartRowsRef.current = chartRows;

  const hasChartData = chartRows.length > 0;
  const chartSessionKey = `${chartVisitKey}-${chartDateRangeText}`;
  const chartAnimKey = `${chartSessionKey}-${chartAnimArmed ? "play" : "hold"}`;

  useEffect(() => {
    setChartAnimArmed(false);
    setAnimChartRows(null);
    setFlowIdle(false);
  }, [chartSessionKey]);

  useEffect(() => {
    if (!hasChartData || !chartDataStable) {
      setChartAnimArmed(false);
      setAnimChartRows(null);
      setFlowIdle(false);
      return undefined;
    }

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (cancelled) return;
        setAnimChartRows(chartRowsRef.current);
        setChartAnimArmed(true);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      setChartAnimArmed(false);
      setAnimChartRows(null);
      setFlowIdle(false);
    };
  }, [chartSessionKey, hasChartData, chartDataStable]);

  useEffect(() => {
    if (!chartAnimArmed) {
      setFlowIdle(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setFlowIdle(true), DASHBOARD_TREND_IDLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [chartAnimKey, chartAnimArmed]);

  const chartBodyClassName = [
    "dashboard-panel-chart-body",
    chartAnimArmed ? "is-enter is-flow-active" : "",
    flowIdle ? "is-flow-idle" : "",
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
        {chartAnimArmed && animChartRows ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              key={chartAnimKey}
              data={animChartRows}
              margin={{ top: 8, right: 16, left: 0, bottom: chartXAxisLayout.marginBottom }}
            >
              <DashboardTrendFlowDefs />
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
              {chartSeries.flatMap((s) => {
                if (!chartVisible[s.idx]) return [];
                const flowFill = resolveTrendFlowFill(s.dataKey);
                const baseFill = flowFill?.base || s.fill;
                const seriesKey = `${s.dataKey}-${chartAnimKey}`;

                const layers = [
                  <Area
                    key={`${seriesKey}-base`}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.label}
                    stroke={s.color}
                    fill={baseFill}
                    strokeWidth={2.5}
                    isAnimationActive
                    animationBegin={DASHBOARD_TREND_DRAW_BEGIN_MS}
                    animationDuration={DASHBOARD_TREND_DRAW_DURATION_MS}
                    animationEasing="ease-out"
                    className="dashboard-trend-area-base"
                  />,
                ];

                if (flowFill?.flow) {
                  layers.push(
                    <Area
                      key={`${seriesKey}-flow`}
                      type="monotone"
                      dataKey={s.dataKey}
                      legendType="none"
                      tooltipType="none"
                      stroke="none"
                      fill={flowFill.flow}
                      fillOpacity={0.38}
                      isAnimationActive
                      animationBegin={DASHBOARD_TREND_DRAW_BEGIN_MS + DASHBOARD_TREND_FLOW_LAYER_OFFSET_MS}
                      animationDuration={DASHBOARD_TREND_DRAW_DURATION_MS}
                      animationEasing="ease-out"
                      className="dashboard-trend-area-flow"
                    />
                  );
                }

                return layers;
              })}
              <Customized
                component={(props) => (
                  <DashboardTrendFlowLayers
                    {...props}
                    flowActive={chartAnimArmed}
                    chartAnimKey={chartAnimKey}
                  />
                )}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dashboard-panel-chart-placeholder" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
