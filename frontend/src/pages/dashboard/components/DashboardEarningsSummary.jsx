import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import { formatFrankfurterUnitRate } from "../../../utils/dashboard/frankfurterRates.js";
import {
  buildEarningsPieSlices,
  computeCurrencySharePct,
  computePieCenterMetrics,
  computeSectorTooltipPosition,
  getCurrencyColor,
  resolveEarningsShareDenominator,
} from "../lib/dashboardEarnings.js";
import { formatCurrency, formatI18nTemplate } from "../lib/dashboardFormat.js";
import { EarningsPieSectorTooltip } from "./EarningsPieSectorTooltip.jsx";

const PIE_INNER = "56%";
const PIE_OUTER = "82%";
const PIE_CORNER = 5;
const PIE_PAD = 3;

function renderActivePieSector(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, stroke, strokeWidth } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      cornerRadius={PIE_CORNER}
      style={{ filter: "drop-shadow(0 4px 10px rgba(15, 23, 42, 0.14))" }}
    />
  );
}

export function DashboardEarningsSummary({
  i18n,
  currencyCode,
  currencies,
  earningsCurrencyRows,
  useConvertedEarnings,
  summaryEarningsValue,
  summaryConversionNote,
  summaryEarningsLoading,
  earningsByCurrencyLoading,
  exchangeRates,
  exchangeRatesError,
  exchangeRatesLoading,
  rateFootnoteText,
  convertedEarningsTotal,
}) {
  const pieAreaRef = useRef(null);
  const pieShellRef = useRef(null);
  const [pieShellLayout, setPieShellLayout] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [hoveredPieSector, setHoveredPieSector] = useState(null);

  const earningsPieSlices = useMemo(
    () => buildEarningsPieSlices(earningsCurrencyRows, { useConverted: useConvertedEarnings }),
    [earningsCurrencyRows, useConvertedEarnings]
  );

  const earningsShareTotal = useMemo(
    () =>
      resolveEarningsShareDenominator(earningsCurrencyRows, {
        useConverted: useConvertedEarnings,
        convertedTotal: convertedEarningsTotal,
      }),
    [useConvertedEarnings, convertedEarningsTotal, earningsCurrencyRows]
  );

  const pieCenterMetrics = useMemo(
    () =>
      computePieCenterMetrics(earningsCurrencyRows, currencyCode, {
        useConverted: useConvertedEarnings,
        shareTotal: earningsShareTotal,
      }),
    [earningsCurrencyRows, currencyCode, useConvertedEarnings, earningsShareTotal]
  );

  const currencyPieFillByCode = useMemo(() => {
    const map = {};
    earningsCurrencyRows.forEach((row, index) => {
      map[row.code] = getCurrencyColor(row.code, index);
    });
    return map;
  }, [earningsCurrencyRows]);

  const summaryPieReady = earningsPieSlices.length > 0 && !summaryEarningsLoading;
  const pieDataKey = `${currencyCode || "pie"}-${useConvertedEarnings ? "c" : "n"}-${earningsPieSlices.map((s) => s.code).join(",")}`;

  const isRowEarningsLoading = useCallback(
    (code) => {
      if (currencies.length <= 1) return summaryEarningsLoading;
      const row = earningsCurrencyRows.find((r) => r.code === code);
      return row?.earnings == null;
    },
    [currencies.length, earningsCurrencyRows, summaryEarningsLoading]
  );

  useEffect(() => {
    setHoveredPieSector(null);
  }, [currencyCode, earningsPieSlices]);

  useLayoutEffect(() => {
    const wrap = pieAreaRef.current;
    const shell = pieShellRef.current;
    if (!wrap || !shell) return undefined;

    const syncLayout = () => {
      setPieShellLayout({
        left: shell.offsetLeft,
        top: shell.offsetTop,
        width: shell.clientWidth,
        height: shell.clientHeight,
      });
    };

    syncLayout();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncLayout) : null;
    observer?.observe(wrap);
    observer?.observe(shell);
    window.addEventListener("resize", syncLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncLayout);
    };
  }, [summaryPieReady, earningsPieSlices.length, currencyCode]);

  const handlePieSectorEnter = useCallback(
    (sectorData, index) => {
      const slice = earningsPieSlices[index];
      if (!slice || sectorData?.midAngle == null) return;
      setHoveredPieSector({
        slice,
        cx: sectorData.cx,
        cy: sectorData.cy,
        innerRadius: sectorData.innerRadius,
        outerRadius: sectorData.outerRadius,
        midAngle: sectorData.midAngle,
      });
    },
    [earningsPieSlices]
  );

  const hoveredPieTooltip = useMemo(() => {
    if (!hoveredPieSector || pieShellLayout.width <= 0) return null;
    const pos = computeSectorTooltipPosition(
      hoveredPieSector,
      pieShellLayout.width,
      pieShellLayout.height
    );
    if (!pos) return null;
    const slice = hoveredPieSector.slice;
    const row = earningsCurrencyRows.find(
      (r) => String(r.code).toUpperCase() === String(slice?.code || "").toUpperCase()
    );
    const sharePct =
      row && earningsShareTotal
        ? computeCurrencySharePct(row, earningsShareTotal, useConvertedEarnings)
        : null;
    return {
      slice,
      sharePct,
      left: pos.left + pieShellLayout.left,
      top: pos.top + pieShellLayout.top,
      placeAbove: pos.placeAbove,
      radial: pos.radial,
    };
  }, [
    hoveredPieSector,
    earningsPieSlices,
    earningsCurrencyRows,
    earningsShareTotal,
    useConvertedEarnings,
    pieShellLayout,
  ]);

  const placeholderSlice = [{ code: "—", earnings: 0, value: 1, fill: "#e2e8f0" }];
  const chartSlices = earningsPieSlices.length ? earningsPieSlices : placeholderSlice;
  const multiSlice = earningsPieSlices.length > 1;

  return (
    <div className="dashboard-panel-card dashboard-panel-card--summary">
      <div className="dashboard-summary-layout">
        <div className="dashboard-summary-left-col">
          <div className="dashboard-summary-hero dashboard-summary-hero--compact">
            <span className="dashboard-summary-hero-caption">
              {i18n.earnings}
              {currencyCode ? ` · ${currencyCode}` : ""}
            </span>
            <div className="dashboard-summary-hero-value">
              {summaryEarningsLoading ? "…" : formatCurrency(summaryEarningsValue)}
            </div>
            {summaryConversionNote && (
              <span className="dashboard-summary-hero-conversion-note">{summaryConversionNote}</span>
            )}
          </div>
          <div
            ref={pieAreaRef}
            className="dashboard-summary-pie-wrap"
            aria-hidden={summaryEarningsLoading && !earningsPieSlices.length}
            onMouseLeave={() => setHoveredPieSector(null)}
          >
            <div ref={pieShellRef} className="dashboard-summary-pie-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  <defs>
                    <filter id="dashboardPieSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.08" />
                    </filter>
                    {earningsPieSlices.map((slice) => (
                      <linearGradient
                        key={slice.gradientId}
                        id={slice.gradientId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={slice.gradientFrom} />
                        <stop offset="100%" stopColor={slice.gradientTo} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={[{ value: 1 }]}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={PIE_INNER}
                    outerRadius={PIE_OUTER}
                    fill="#f1f5f9"
                    stroke="none"
                    isAnimationActive={false}
                  />
                  <Pie
                    key={pieDataKey}
                    data={chartSlices}
                    dataKey="value"
                    nameKey="code"
                    cx="50%"
                    cy="50%"
                    innerRadius={PIE_INNER}
                    outerRadius={PIE_OUTER}
                    paddingAngle={multiSlice ? PIE_PAD : 0}
                    cornerRadius={multiSlice ? PIE_CORNER : 0}
                    stroke="#ffffff"
                    strokeWidth={2.5}
                    label={false}
                    activeShape={summaryPieReady ? renderActivePieSector : false}
                    isAnimationActive={summaryPieReady && !earningsByCurrencyLoading}
                    animationBegin={80}
                    animationDuration={680}
                    animationEasing="ease-out"
                    style={{ filter: "url(#dashboardPieSoftShadow)" }}
                    onMouseEnter={handlePieSectorEnter}
                    onMouseLeave={() => setHoveredPieSector(null)}
                  >
                    {chartSlices.map((entry, index) => (
                      <Cell
                        key={entry.code || index}
                        fill={
                          entry.gradientId && earningsPieSlices.length
                            ? `url(#${entry.gradientId})`
                            : entry.fill
                        }
                        stroke="#ffffff"
                        strokeWidth={2.5}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {!summaryEarningsLoading && earningsPieSlices.length > 0 && !hoveredPieTooltip && (
                <div key={currencyCode || "center"} className="dashboard-summary-pie-center" aria-hidden="true">
                  <div className="dashboard-summary-pie-center-ring" aria-hidden="true" />
                  <div className="dashboard-summary-pie-center-badge">
                    <span className="dashboard-summary-pie-center-pct">{pieCenterMetrics.pct}%</span>
                    <span className="dashboard-summary-pie-center-code">{pieCenterMetrics.code}</span>
                  </div>
                </div>
              )}
            </div>
            {hoveredPieTooltip && (
              <div
                className={`dashboard-summary-pie-tooltip-anchor${
                  hoveredPieTooltip.radial ? " is-radial" : hoveredPieTooltip.placeAbove ? "" : " is-below"
                }`}
                style={{
                  left: hoveredPieTooltip.left,
                  top: hoveredPieTooltip.top,
                }}
              >
                <EarningsPieSectorTooltip
                  slice={hoveredPieTooltip.slice}
                  sharePct={hoveredPieTooltip.sharePct}
                  baseCode={currencyCode}
                  useConverted={useConvertedEarnings}
                  convertedApproxTemplate={i18n.convertedApprox}
                  placeAbove={hoveredPieTooltip.placeAbove}
                />
              </div>
            )}
          </div>
        </div>
        <div className="dashboard-summary-currency-list" aria-label={i18n.currencyBreakdown}>
          <div className="dashboard-summary-currency-list-head" aria-hidden="true">
            <span>{i18n.breakdownCurrency}</span>
            <span>{i18n.breakdownAmount}</span>
            <span>{useConvertedEarnings ? i18n.breakdownRate : i18n.breakdownShare}</span>
          </div>
          <div className="dashboard-summary-currency-list-body" role="list">
            {earningsCurrencyRows.map((row, index) => {
              const rowLoading = isRowEarningsLoading(row.code);
              const sharePct = computeCurrencySharePct(row, earningsShareTotal, useConvertedEarnings);
              const unitRateLabel =
                !rowLoading && useConvertedEarnings
                  ? formatFrankfurterUnitRate(row.code, currencyCode, exchangeRates.rates)
                  : null;
              const unitRateTitle =
                unitRateLabel && unitRateLabel !== "—"
                  ? formatI18nTemplate(i18n.rateOneUnit, {
                      from: row.code,
                      rate: unitRateLabel,
                      base: currencyCode,
                    })
                  : undefined;
              return (
                <div
                  key={row.code}
                  role="listitem"
                  className={`dashboard-summary-currency-row${row.code === currencyCode ? " is-active" : ""}`}
                  style={
                    row.code === currencyCode
                      ? {
                          "--currency-accent":
                            currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                        }
                      : undefined
                  }
                >
                  <div className="dashboard-summary-currency-label">
                    <span
                      className="dashboard-summary-currency-dot"
                      style={{
                        backgroundColor: currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                      }}
                      aria-hidden="true"
                    />
                    <span className="dashboard-summary-currency-code">{row.code}</span>
                  </div>
                  <div className="dashboard-summary-currency-amount-col">
                    <span className="dashboard-summary-currency-amount">
                      {rowLoading ? "…" : formatCurrency(row.earnings ?? 0)}
                    </span>
                    {useConvertedEarnings &&
                      !rowLoading &&
                      row.earningsConverted != null &&
                      String(row.code).toUpperCase() !== String(currencyCode).toUpperCase() && (
                        <span className="dashboard-summary-currency-converted">
                          {formatI18nTemplate(i18n.convertedApprox, {
                            amount: formatCurrency(row.earningsConverted),
                            code: currencyCode,
                          })}
                        </span>
                      )}
                  </div>
                  <span className="dashboard-summary-currency-rate" title={unitRateTitle}>
                    {rowLoading ? "" : useConvertedEarnings ? unitRateLabel : `${sharePct.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {currencies.length > 1 && rateFootnoteText && (
        <p
          className={`dashboard-summary-rate-footnote${
            exchangeRatesError || exchangeRates.unsupported?.length ? " is-warn" : ""
          }${exchangeRatesLoading ? " is-muted" : ""}`}
        >
          {rateFootnoteText}
        </p>
      )}
    </div>
  );
}
