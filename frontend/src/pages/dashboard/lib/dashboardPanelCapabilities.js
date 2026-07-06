/**
 * Dashboard right panel tab capabilities by filter scope.
 *
 * @typedef {'subsidiary' | 'groupLevel' | 'standard'} DashboardPanelScopeKind
 * @typedef {'currency' | 'netProfit' | 'earning'} DashboardPanelTabId
 *
 * @typedef {{
 *   scope: DashboardPanelScopeKind,
 *   showTabs: boolean,
 *   showNetProfitTab: boolean,
 *   showEarningTab: boolean,
 *   tabs: DashboardPanelTabId[],
 * }} DashboardPanelCapabilities
 */

/**
 * @param {{
 *   subsidiaryDashboardScope?: boolean,
 *   groupIds?: string[],
 *   groupsAllMode?: boolean,
 *   companyId?: number | string | null,
 *   groupAllMode?: boolean,
 *   usesGroupLedgerDashboard?: boolean,
 *   groupsAllGroupLevel?: boolean,
 * }} scope
 * @returns {DashboardPanelScopeKind}
 */
export function resolveDashboardPanelScope(scope = {}) {
  if (scope.subsidiaryDashboardScope) return "subsidiary";
  if (!scope.groupIds?.length) return "standard";
  const groupLevel = Boolean(
    scope.groupAllMode ||
      (scope.groupsAllMode && scope.companyId == null) ||
      scope.usesGroupLedgerDashboard ||
      scope.groupsAllGroupLevel
  );
  return groupLevel ? "groupLevel" : "standard";
}

/**
 * @param {DashboardPanelScopeKind} kind
 * @returns {DashboardPanelCapabilities}
 */
export function resolveDashboardPanelCapabilities(kind) {
  if (kind === "subsidiary") {
    return {
      scope: "subsidiary",
      showTabs: true,
      showNetProfitTab: false,
      showEarningTab: true,
      tabs: ["currency", "earning"],
    };
  }
  if (kind === "groupLevel") {
    return {
      scope: "groupLevel",
      showTabs: true,
      showNetProfitTab: true,
      showEarningTab: true,
      tabs: ["currency", "netProfit", "earning"],
    };
  }
  return {
    scope: "standard",
    showTabs: false,
    showNetProfitTab: false,
    showEarningTab: false,
    tabs: ["currency"],
  };
}

/**
 * @param {DashboardPanelCapabilities} capabilities
 * @param {string} view
 * @returns {string}
 */
export function normalizeDashboardPanelView(capabilities, view) {
  const v = String(view || "currency");
  if (!capabilities.showTabs) return "currency";
  if (v === "netProfit" && !capabilities.showNetProfitTab) return "currency";
  if (v === "earning" && !capabilities.showEarningTab) return "currency";
  if (capabilities.tabs.includes(v)) return v;
  return capabilities.tabs[0] || "currency";
}
