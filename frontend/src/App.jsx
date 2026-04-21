import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import TransactionDashboardPage from "./pages/TransactionDashboardPage.jsx";
import DomainPage from "./pages/DomainPage.jsx";
import AnnouncementPage from "./pages/AnnouncementPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<TransactionDashboardPage />} />
      <Route path="/domain" element={<DomainPage />} />
      <Route path="/announcement" element={<AnnouncementPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
