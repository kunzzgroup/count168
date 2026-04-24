import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import TransactionDashboardPage from "./pages/TransactionDashboardPage.jsx";
import DomainPage from "./pages/DomainPage.jsx";
import AnnouncementPage from "./pages/AnnouncementPage.jsx";
import AuthenticatedLayout from "./components/AuthenticatedLayout.jsx";
import AccountListPage from "./pages/AccountListPage.jsx";
import ProcessListPage from "./pages/ProcessListPage.jsx";
import BankProcessListPage from "./pages/BankProcessListPage.jsx";
import UserListPage from "./pages/UserListPage.jsx";
import OwnershipPage from "./pages/OwnershipPage.jsx";
import DataCapturePage from "./pages/DataCapturePage.jsx";
import TransactionPaymentPage from "./pages/TransactionPaymentPage.jsx";

export default function App() {
  return (
    <Routes>
      {/* SPA routes */}
      <Route path="/login" element={<LoginPage />} />
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
      </Route>

      {/* Clean URLs for non-migrated pages (still rendered by PHP) */}
      <Route path="/member" element={<Navigate to="/member.php" replace />} />
      <Route path="/owner-secondary-password" element={<Navigate to="/owner_secondary_password.php" replace />} />
      <Route path="/reset-password" element={<Navigate to="/reset-password.php" replace />} />
      <Route path="/datacapture.php" element={<Navigate to="/datacapture" replace />} />
      <Route path="/transaction.php" element={<Navigate to="/transaction" replace />} />
      <Route path="/customer-report" element={<Navigate to="/customer_report.php" replace />} />
      <Route path="/payment-maintenance" element={<Navigate to="/payment_maintenance.php" replace />} />

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

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
