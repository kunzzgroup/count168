const prefetchedModules = new Set();
const prefetchedData = new Set();

function prefetchModule(key, loader) {
  if (prefetchedModules.has(key)) return;
  prefetchedModules.add(key);
  void loader().catch(() => {
    prefetchedModules.delete(key);
  });
}

/** Prefetch frequently paired admin routes after login. */
export function prefetchAdminCluster() {
  prefetchRouteModule("/userlist");
  prefetchRouteModule("/account-list");
}

/** Prefetch route JS chunk on sidebar hover / focus. */
export function prefetchRouteModule(pathname) {
  const path = String(pathname || "").split("?")[0];
  switch (path) {
    case "/dashboard":
      prefetchModule(path, () => import("../../pages/dashboard/TransactionDashboardPage.jsx"));
      break;
    case "/domain":
      prefetchModule(path, () => import("../../pages/domain/DomainPage.jsx"));
      break;
    case "/announcement":
      prefetchModule(path, () => import("../../pages/announcement/AnnouncementPage.jsx"));
      break;
    case "/auto-renew":
      prefetchModule(path, () => import("../../pages/autorenew/AutoRenewPage.jsx"));
      prefetchAutoRenewList();
      break;
    case "/userlist":
      prefetchModule(path, () => import("../../pages/userlist/UserListPage.jsx"));
      break;
    case "/account-list":
    case "/add-account":
      prefetchModule(path, () => import("../../pages/account/AccountListPage.jsx"));
      break;
    case "/ownership":
      prefetchModule(path, () => import("../../pages/ownership/OwnershipPage.jsx"));
      break;
    case "/process-list":
    case "/games-process-list":
      prefetchModule(path, () => import("../../pages/processlist/ProcessListPage.jsx"));
      break;
    case "/bank-process-list":
      prefetchModule(path, () => import("../../pages/bankprocesslist/BankProcessListPage.jsx"));
      break;
    case "/datacapture":
      prefetchModule(path, () => import("../../pages/datacapture/DataCapturePage.jsx"));
      break;
    case "/datacapturesummary":
      prefetchModule(path, () => import("../../pages/datacapturesummary/DataCaptureSummaryPage.jsx"));
      break;
    case "/transaction":
      prefetchModule(path, () => import("../../pages/transaction/TransactionPaymentPage.jsx"));
      break;
    case "/customer-report":
      prefetchModule(path, () => import("../../pages/report/customer/CustomerReportPage.jsx"));
      break;
    case "/domain-report":
      prefetchModule(path, () => import("../../pages/report/domain/DomainReportPage.jsx"));
      break;
    case "/capture-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/capture/CaptureMaintenancePage.jsx"));
      break;
    case "/transaction-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/transaction/TransactionMaintenancePage.jsx"));
      break;
    case "/formula-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/formula/FormulaMaintenancePage.jsx"));
      break;
    case "/bankprocess-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx"));
      break;
    case "/payment-maintenance":
      prefetchModule(path, () => import("../../pages/maintenance/payment/PaymentMaintenancePage.jsx"));
      break;
    case "/useraccess":
      prefetchModule(path, () => import("../../pages/useraccess/UserAccessPage.jsx"));
      break;
    case "/deleted-log":
      prefetchModule(path, () => import("../../pages/deletedlog/DeletedLogPage.jsx"));
      break;
    default:
      break;
  }
}

/** Warm auto-renew list API so first paint is faster after navigation. */
export function prefetchAutoRenewList() {
  const key = "auto-renew:pending";
  if (prefetchedData.has(key)) return;
  prefetchedData.add(key);
  import("../../pages/autorenew/autoRenewRoutePrefetch.js")
    .then(({ prefetchAutoRenewApprovals }) => prefetchAutoRenewApprovals("pending"))
    .catch(() => {
      prefetchedData.delete(key);
    });
}
