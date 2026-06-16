import { DashboardKpiCard } from "./DashboardKpiCard.jsx";

export function DashboardKpiGrid({
  i18n,
  kpi,
  kpiComparePeriodLabel,
  kpiFooter,
  loading,
}) {
  const compareVsTemplate = i18n.kpiCompareVs;

  return (
    <div
      className={`dashboard-kpi-grid${kpi.showEarnings ? " dashboard-kpi-grid--with-earnings" : ""}`}
    >
      <DashboardKpiCard
        variant="profit"
        label={i18n.profit}
        value={kpi.profit}
        compare={kpi.comparisons?.profit}
        comparePeriodLabel={kpiComparePeriodLabel}
        compareVsTemplate={compareVsTemplate}
        fallbackFoot={kpiFooter}
        loading={loading}
      />
      <DashboardKpiCard
        variant="expense"
        label={i18n.expenses}
        value={kpi.expenses}
        compare={kpi.comparisons?.expenses}
        comparePeriodLabel={kpiComparePeriodLabel}
        compareVsTemplate={compareVsTemplate}
        fallbackFoot={kpiFooter}
        loading={loading}
      />
      <DashboardKpiCard
        variant="net"
        label={i18n.netProfit}
        value={kpi.netProfit}
        compare={kpi.comparisons?.netProfit}
        comparePeriodLabel={kpiComparePeriodLabel}
        compareVsTemplate={compareVsTemplate}
        fallbackFoot={kpiFooter}
        loading={loading}
      />
      {kpi.showEarnings && (
        <DashboardKpiCard
          variant="earnings"
          label={i18n.earnings}
          value={kpi.kpiCardEarnings ?? kpi.earnings}
          compare={kpi.comparisons?.earnings}
          comparePeriodLabel={kpiComparePeriodLabel}
          compareVsTemplate={compareVsTemplate}
          fallbackFoot={kpiFooter}
          loading={loading}
          id="earnings-card-wrapper"
        />
      )}
    </div>
  );
}
