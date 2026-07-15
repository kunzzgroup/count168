import { useMemo, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileDashboard } from "../../hooks/useMobileDashboard.js";
import CurrencyDistributionCard from "./CurrencyDistributionCard.jsx";
import CurrencyListCard from "./CurrencyListCard.jsx";
import DashboardKpiCard from "./DashboardKpiCard.jsx";
import DashboardTrendChart from "./DashboardTrendChart.jsx";
import FilterSheet from "./FilterSheet.jsx";
import HeroSummaryCard from "./HeroSummaryCard.jsx";

export default function DashboardPage() {
  const dash = useMobileDashboard();
  const { i18n, kpi, loading, error, me, blocked, compareLabel } = dash;
  const [filterOpen, setFilterOpen] = useState(false);

  const sparklineValues = useMemo(() => {
    const rows = dash.chartRows || [];
    if (rows.length < 2) return [];
    // Cap points for hero sparkline readability on narrow phones.
    const step = Math.max(1, Math.floor(rows.length / 24));
    return rows.filter((_, i) => i % step === 0 || i === rows.length - 1).map((r) => Number(r.netProfit) || 0);
  }, [dash.chartRows]);

  if (blocked) return null;

  const kpiCards = [
    { variant: "profit", label: i18n.profit, value: kpi?.profit, compare: kpi?.comparisons?.profit },
    { variant: "expense", label: i18n.expenses, value: kpi?.expenses, compare: kpi?.comparisons?.expenses },
    { variant: "net", label: i18n.netProfit, value: kpi?.netProfit, compare: kpi?.comparisons?.netProfit },
  ];
  if (kpi?.showEarnings) {
    kpiCards.push({
      variant: "earnings",
      label: i18n.earnings,
      value: kpi?.kpiCardEarnings,
      compare: kpi?.comparisons?.earnings,
    });
  }

  const greetingName = me?.nickname || me?.username || me?.name || "";

  return (
    <MobileShell
      i18n={i18n}
      me={me}
      overlay={<FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} dash={dash} />}
    >
      <div
        className="relative w-full max-w-full overflow-x-hidden px-3.5 pb-3"
        style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 10% -10%, rgba(47,107,255,0.14), transparent 55%), radial-gradient(ellipse 60% 50% at 90% 10%, rgba(56,189,248,0.12), transparent 50%)",
          }}
          aria-hidden="true"
        />

        <header className="relative flex items-end justify-between gap-3 py-2">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold tracking-tight text-slate-900">{i18n.dashboard}</h1>
            {greetingName ? (
              <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-500">
                {i18n.greeting.replace("{name}", greetingName)}
              </p>
            ) : null}
          </div>
          {dash.selectedCompany?.company_id ? (
            <span className="shrink-0 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold tracking-wide text-slate-600 shadow-sm ring-1 ring-slate-100">
              {dash.selectedCompany.company_id}
            </span>
          ) : null}
        </header>

        <div className="relative mb-4 mt-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="tap-scale flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white/95 px-3.5 py-3 shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)] ring-1 ring-slate-100"
          >
            <i className="far fa-calendar text-[#2f6bf6]" aria-hidden="true" />
            <span className="truncate text-[13px] font-bold text-slate-700">{dash.dateRangeText}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="tap-scale flex shrink-0 items-center gap-2 rounded-2xl bg-[#2f6bf6] px-3.5 py-3 text-white shadow-[0_10px_22px_-10px_rgba(47,107,246,0.65)]"
          >
            <i className="fas fa-filter text-[12px]" aria-hidden="true" />
            <span className="text-[13px] font-bold">{i18n.filter}</span>
          </button>
        </div>

        {error && (
          <div className="relative mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="min-w-0 flex-1 text-[13px] font-semibold text-rose-700">{error}</div>
            <button
              type="button"
              onClick={dash.retry}
              className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-[12px] font-bold text-rose-600 ring-1 ring-rose-200"
            >
              Retry
            </button>
          </div>
        )}

        <div className="relative space-y-4">
          <HeroSummaryCard
            i18n={i18n}
            currency={dash.currency}
            value={dash.summaryValue}
            compare={kpi?.comparisons?.netProfit}
            compareLabel={compareLabel}
            multiCurrency={dash.showMultiCurrencyNote}
            loading={loading}
            sparklineValues={sparklineValues}
          />

          {!loading && !dash.hasData && (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-center">
              <p className="text-[13px] font-semibold text-slate-500">{i18n.noData}</p>
              {dash.activePreset !== "thisYear" && (
                <button
                  type="button"
                  className="mt-3 tap-scale rounded-xl bg-[#2f6bf6] px-4 py-2 text-[13px] font-bold text-white"
                  onClick={() => dash.applyPreset("thisYear")}
                >
                  {i18n.thisYear}
                </button>
              )}
            </div>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-slate-900">{i18n.overview}</h2>
              <span className="text-[12px] font-semibold text-slate-400">
                {i18n.swipe} <i className="fas fa-arrow-right-long text-[10px]" aria-hidden="true" />
              </span>
            </div>
            <div className="no-scrollbar -mx-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3.5 pb-1">
              {kpiCards.map((card) => (
                <DashboardKpiCard
                  key={card.variant}
                  variant={card.variant}
                  label={card.label}
                  value={card.value}
                  compare={card.compare}
                  compareLabel={compareLabel}
                  loading={loading}
                />
              ))}
            </div>
          </section>

          <CurrencyDistributionCard
            i18n={i18n}
            currencyCode={dash.currency}
            rows={dash.earningsCurrencyRows}
            useConverted={dash.useConvertedEarnings}
            loading={loading}
          />

          <DashboardTrendChart
            rows={dash.chartRows}
            series={dash.chartSeries}
            visible={dash.chartVisible}
            onToggleSeries={dash.toggleChartSeries}
            label={i18n.trendChart}
            dateRangeText={dash.dateRangeShort}
            xAxisLayout={dash.chartXAxisLayout}
            emptyText={loading ? i18n.loading : i18n.noData}
          />

          <CurrencyListCard
            i18n={i18n}
            lang={dash.lang}
            currencyCode={dash.currency}
            rows={dash.earningsCurrencyRows}
            exchangeRates={dash.exchangeRates}
            exchangeRatesLoading={dash.exchangeRatesLoading}
            useConverted={dash.useConvertedEarnings}
            loading={loading}
          />
        </div>

        {loading && (
          <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center" aria-live="polite">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-[12px] font-bold text-white shadow-lg">
              <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {i18n.loading}
            </span>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
