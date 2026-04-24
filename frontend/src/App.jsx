import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import TransactionDashboardPage from "./pages/TransactionDashboardPage.jsx";
import DomainPage from "./pages/domain/DomainPage.jsx";
import AnnouncementPage from "./pages/announcement/AnnouncementPage.jsx";
import AuthenticatedLayout from "./components/AuthenticatedLayout.jsx";
import AccountListPage from "./pages/account/AccountListPage.jsx";
import ProcessListPage from "./pages/ProcessListPage.jsx";
import BankProcessListPage from "./pages/BankProcessListPage.jsx";
import UserListPage from "./pages/userlist/UserListPage.jsx";
import OwnershipPage from "./pages/OwnershipPage.jsx";
import DataCapturePage from "./pages/DataCapturePage.jsx";
import TransactionPaymentPage from "./pages/TransactionPaymentPage.jsx";
import CustomerReportPage from "./pages/CustomerReportPage.jsx";
import DomainReportPage from "./pages/DomainReportPage.jsx";
import CaptureMaintenancePage from "./pages/CaptureMaintenancePage.jsx";
import TransactionMaintenancePage from "./pages/TransactionMaintenancePage.jsx";
import FormulaMaintenancePage from "./pages/FormulaMaintenancePage.jsx";
import BankprocessMaintenancePage from "./pages/BankprocessMaintenancePage.jsx";
import PaymentMaintenancePage from "./pages/PaymentMaintenancePage.jsx";
import OwnerSecondaryPasswordPage from "./pages/OwnerSecondaryPasswordPage.jsx";
import UserSecondaryPasswordPage from "./pages/UserSecondaryPasswordPage.jsx";

export default function App() {
  return (
    <Routes>
      {/* SPA routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/owner-secondary-password" element={<OwnerSecondaryPasswordPage />} />
      <Route path="/user-secondary-password" element={<UserSecondaryPasswordPage />} />
      <Route element={<AuthenticatedLayout />}>
        <Route path="/dashboard" element={<TransactionDashboardPage />} />
        <Route path="/domain" element={<DomainPage />} />
        <Route path="/announcement" element={<AnnouncementPage />} />
        <Route path="/account-list" element={<AccountListPage />} />
        <Route path="/add-account" element={<AccountListPage />} />
        <Route path="/process-list" element={<ProcessListPage />} />
        <Route path="/games-process-list" element={<ProcessListPage />} />
        <Route path="/bank-process-list" element={<BankProcessListPage />} />
        <Route path="/userlist" element={<UserListPage />} />
        <Route path="/ownership" element={<OwnershipPage />} />
        <Route path="/datacapture" element={<DataCapturePage />} />
        <Route path="/transaction" element={<TransactionPaymentPage />} />
        <Route path="/customer-report" element={<CustomerReportPage />} />
        <Route path="/domain-report" element={<DomainReportPage />} />
        <Route path="/capture-maintenance" element={<CaptureMaintenancePage />} />
        <Route path="/transaction-maintenance" element={<TransactionMaintenancePage />} />
        <Route path="/formula-maintenance" element={<FormulaMaintenancePage />} />
        <Route path="/bankprocess-maintenance" element={<BankprocessMaintenancePage />} />
        <Route path="/payment-maintenance" element={<PaymentMaintenancePage />} />
      </Route>

      {/* Clean URLs for non-migrated pages (still rendered by PHP) */}
      <Route path="/datacapture.php" element={<Navigate to="/datacapture" replace />} />
      <Route path="/transaction.php" element={<Navigate to="/transaction" replace />} />
      <Route path="/transcation" element={<Navigate to="/transaction" replace />} />
      <Route path="/customer_report.php" element={<Navigate to="/customer-report" replace />} />
      <Route path="/customer_report" element={<Navigate to="/customer-report" replace />} />
      <Route path="/domain_report.php" element={<Navigate to="/domain-report" replace />} />
      <Route path="/domain_report" element={<Navigate to="/domain-report" replace />} />
      <Route path="/capture_maintenance.php" element={<Navigate to="/capture-maintenance" replace />} />
      <Route path="/capture_maintenance" element={<Navigate to="/capture-maintenance" replace />} />
      <Route path="/transaction_maintenance.php" element={<Navigate to="/transaction-maintenance" replace />} />
      <Route path="/transaction_maintenance" element={<Navigate to="/transaction-maintenance" replace />} />
      <Route path="/formula_maintenance.php" element={<Navigate to="/formula-maintenance" replace />} />
      <Route path="/formula_maintenance" element={<Navigate to="/formula-maintenance" replace />} />
      <Route path="/bankprocess_maintenance.php" element={<Navigate to="/bankprocess-maintenance" replace />} />
      <Route path="/bankprocess_maintenance" element={<Navigate to="/bankprocess-maintenance" replace />} />
      <Route path="/payment_maintenance.php" element={<Navigate to="/payment-maintenance" replace />} />
      <Route path="/payment_maintenance" element={<Navigate to="/payment-maintenance" replace />} />

      {/* Legacy .php aliases */}
      <Route path="/index.php" element={<Navigate to="/login" replace />} />
      <Route path="/dashboard.php" element={<Navigate to="/dashboard" replace />} />
      <Route path="/domain.php" element={<Navigate to="/domain" replace />} />
      <Route path="/announcement.php" element={<Navigate to="/announcement" replace />} />
      <Route path="/account-list.php" element={<Navigate to="/account-list" replace />} />
      <Route path="/add-account.php" element={<Navigate to="/add-account" replace />} />
      <Route path="/processlist.php" element={<Navigate to="/process-list" replace />} />
      <Route path="/games_process_list.php" element={<Navigate to="/games-process-list" replace />} />
      <Route path="/bank_process_list.php" element={<Navigate to="/bank-process-list" replace />} />
      <Route path="/userlist.php" element={<Navigate to="/userlist" replace />} />
      <Route path="/ownership.php" element={<Navigate to="/ownership" replace />} />
      <Route path="/owner_secondary_password.php" element={<Navigate to="/owner-secondary-password" replace />} />
      <Route path="/api/users/user_secondary_password.php" element={<Navigate to="/user-secondary-password" replace />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
