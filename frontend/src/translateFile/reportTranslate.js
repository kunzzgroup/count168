export const REPORT_I18N = {
  en: {
    customerReportTitle: "Customer Report",
    domainReportTitle: "Domain Report",
    switchFailed: "Switch failed",

    account: "Account",
    allAccounts: "All Accounts",
    searchAccount: "Search account...",
    noResultsFound: "No results found",

    dateRange: "Date Range",
    selectDateRange: "Select date range",
    selectEndDate: "Select end date",

    quickSelect: "Quick Select",
    period: "Period",
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This Week",
    lastWeek: "Last Week",
    thisMonth: "This Month",
    lastMonth: "Last Month",
    thisYear: "This Year",
    lastYear: "Last Year",

    showAll: "Show All",
    groupId: "GroupID:",
    groupFilterAll: "ALL",
    company: "Company:",
    currency: "Currency:",
    all: "All",

    process: "Process",
    allProcess: "All Process",
    searchProcess: "Search process...",

    colAccount: "Account",
    colName: "Name",
    colGroupId: "Group ID",
    colCompanyId: "Company",
    colCurrency: "Currency",
    colWin: "Win",
    colLose: "Lose",
    colProcess: "Process",
    colTurnover: "Turnover",
    colWinLose: "Win/Lose",

    loading: "Loading...",
    updatingReport: "Updating…",
    noDataFound: "No data found",

    currencyLine: "Currency: {code}",
    currencyDash: "Currency: -",
    totalColon: "Total:",
    total: "Total",
  },
  zh: {
    customerReportTitle: "客户报表",
    domainReportTitle: "域名报表",
    switchFailed: "切换失败",

    account: "账号",
    allAccounts: "全部账号",
    searchAccount: "搜索账号...",
    noResultsFound: "无匹配结果",

    dateRange: "日期范围",
    selectDateRange: "选择日期范围",
    selectEndDate: "选择结束日期",

    quickSelect: "快捷选择",
    period: "周期",
    today: "今天",
    yesterday: "昨天",
    thisWeek: "本周",
    lastWeek: "上周",
    thisMonth: "本月",
    lastMonth: "上月",
    thisYear: "今年",
    lastYear: "去年",

    showAll: "显示全部",
    groupId: "集团:",
    groupFilterAll: "全部",
    company: "公司:",
    currency: "币种:",
    all: "全部",

    process: "流程",
    allProcess: "全部流程",
    searchProcess: "搜索流程...",

    colAccount: "账号",
    colName: "名称",
    colGroupId: "集团",
    colCompanyId: "公司",
    colCurrency: "币种",
    colWin: "赢",
    colLose: "输",
    colProcess: "流程",
    colTurnover: "流水",
    colWinLose: "输赢",

    loading: "加载中...",
    updatingReport: "更新中…",
    noDataFound: "暂无数据",

    currencyLine: "币种：{code}",
    currencyDash: "币种：-",
    totalColon: "合计：",
    total: "合计",
  },
};

export function getReportText(lang, key, params = {}) {
  const locale = lang === "zh" ? "zh" : "en";
  const template = REPORT_I18N[locale][key] ?? REPORT_I18N.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? ""));
}
