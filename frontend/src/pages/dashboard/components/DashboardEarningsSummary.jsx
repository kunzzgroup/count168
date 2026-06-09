import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
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

export function DashboardEarningsSummary({
  i18n,
  currencyCode,
  currencies,
  earningsCurrencyRows,
  useConvertedEarnings,
  earningsBreakdownShowsRate = false,
  summaryEarningsValue,
  summaryConversionNote,
  summaryEarningsLoading,
  earningsPanelStable = true,
  earningsByCurrencyLoading,
  exchangeRates,
  exchangeRatesError,
  exchangeRatesLoading,
  exchangeRateScopeKey = "",
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

  const summaryPieReady =
    earningsPanelStable && earningsPieSlices.length > 0 && !summaryEarningsLoading;

  /** Play pie enter animation once per scope; skip when returning from another page with same filters. */
  const shouldPlayPieEnterAnim = useMemo(() => {
    if (!summaryPieReady || !exchangeRateScopeKey) return false;
    if (typeof sessionStorage === "undefined") return true;
    return sessionStorage.getItem(`dashboard_pie_anim:${exchangeRateScopeKey}`) !== "1";
  }, [summaryPieReady, exchangeRateScopeKey]);

  useEffect(() => {
    if (!shouldPlayPieEnterAnim || !exchangeRateScopeKey) return undefined;
    const timer = window.setTimeout(() => {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(`dashboard_pie_anim:${exchangeRateScopeKey}`, "1");
      }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [shouldPlayPieEnterAnim, exchangeRateScopeKey]);

  const isRowAmountLoading = useCallback(
    (code) => {
      if (currencies.length <= 1) return summaryEarningsLoading;
      const row = earningsCurrencyRows.find((r) => r.code === code);
      return row?.earnings == null;
    },
    [currencies.length, earningsCurrencyRows, summaryEarningsLoading]
  );

  const isRowRateLoading = useCallback(() => {
    if (currencies.length <= 1) return false;
    return (
      exchangeRatesLoading ||
      (exchangeRateScopeKey && exchangeRates.scopeKey !== exchangeRateScopeKey)
    );
  }, [currencies.length, exchangeRatesLoading, exchangeRates.scopeKey, exchangeRateScopeKey]);

  useEffect(() => {
    setHoveredPieSector(null);
  }, [currencyCode]);

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
  }, [summaryPieReady, currencyCode]);

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
            aria-hidden={!earningsPanelStable && !earningsPieSlices.length}
            onMouseLeave={() => setHoveredPieSector(null)}
          >
            <div ref={pieShellRef} className="dashboard-summary-pie-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie
                    data={
                      earningsPieSlices.length
                        ? earningsPieSlices
                        : [{ code: "—", earnings: 0, value: 1, fill: "#e0e7ff" }]
                    }
                    dataKey="value"
                    nameKey="code"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="84%"
                    paddingAngle={earningsPieSlices.length > 1 ? 3 : 0}
                    stroke="#fff"
                    strokeWidth={3}
                    label={false}
                    activeShape={false}
                    isAnimationActive={shouldPlayPieEnterAnim}
                    animationBegin={0}
                    animationDuration={320}
                    animationEasing="ease-out"
                    onMouseEnter={handlePieSectorEnter}
                    onMouseLeave={() => setHoveredPieSector(null)}
                  >
                    {(earningsPieSlices.length ? earningsPieSlices : [{ fill: "#e0e7ff" }]).map(
                      (entry, index) => (
                        <Cell key={entry.code || index} fill={entry.fill} stroke="#fff" strokeWidth={3} />
                      )
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {!summaryEarningsLoading && earningsPanelStable && earningsPieSlices.length > 0 && !hoveredPieTooltip && (
                <div
                  className={`dashboard-summary-pie-center${shouldPlayPieEnterAnim ? " is-enter" : ""}`}
                  aria-hidden="true"
                >
                  <span className="dashboard-summary-pie-center-pct">{pieCenterMetrics.pct}%</span>
                  <span className="dashboard-summary-pie-center-code">{pieCenterMetrics.code}</span>
                  <span className="dashboard-summary-pie-center-caption">{i18n.shareOfTotal}</span>
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
        <div
          className={`dashboard-summary-currency-list${
            currencies.length > 1 ? " is-multi-currency" : ""
          }`}
          aria-label={i18n.currencyBreakdown}
        >
          <div className="dashboard-summary-currency-list-head" aria-hidden="true">
            <span>{i18n.breakdownCurrency}</span>
            <span>{i18n.breakdownAmount}</span>
            <span>{earningsBreakdownShowsRate ? i18n.breakdownRate : i18n.breakdownShare}</span>
          </div>
          <div className="dashboard-summary-currency-list-body" role="list">
            {earningsCurrencyRows.map((row, index) => {
              const rowAmountLoading = isRowAmountLoading(row.code);
              const rowRateLoading = isRowRateLoading();
              const sharePct = computeCurrencySharePct(row, earningsShareTotal, useConvertedEarnings);
              const unitRateLabel = earningsBreakdownShowsRate
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
                      {rowAmountLoading ? "…" : formatCurrency(row.earnings ?? 0)}
                    </span>
                    {useConvertedEarnings &&
                      !rowAmountLoading &&
                      row.earningsConverted != null &&
                      String(row.code).toUpperCase() !== String(currencyCode).toUpperCase() && (
                        <span className="dashboard-summary-currency-converted">
                          {formatI18nTemplate(i18n.convertedApprox, {
                            amount: formatCurrency(row.earningsConverted),
                            code: currencyCode,
                          })}
                        </span>
                      )}
                    {earningsBreakdownShowsRate &&
                      !useConvertedEarnings &&
                      String(row.code).toUpperCase() !== String(currencyCode).toUpperCase() && (
                        <span className="dashboard-summary-currency-converted is-placeholder" aria-hidden="true">
                          &nbsp;
                        </span>
                      )}
                  </div>
                  <span className="dashboard-summary-currency-rate" title={unitRateTitle}>
                    {rowRateLoading
                      ? "…"
                      : earningsBreakdownShowsRate
                        ? unitRateLabel && unitRateLabel !== "—"
                          ? unitRateLabel
                          : "—"
                        : rowAmountLoading
                          ? "…"
                          : `${sharePct.toFixed(1)}%`}
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
