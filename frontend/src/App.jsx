import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import TransactionDashboardPage from "./pages/TransactionDashboardPage.jsx";
import DomainPage from "./pages/DomainPage.jsx";
import AnnouncementPage from "./pages/AnnouncementPage.jsx";
import AuthenticatedLayout from "./components/AuthenticatedLayout.jsx";
import AccountListPage from "./pages/AccountListPage.jsx";
import ProcessListPage from "./pages/ProcessListPage.jsx";
import BankProcessListPage from "./pages/BankProcessListPage.jsx";

export default function App() {
  return (
    <Routes>
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
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
