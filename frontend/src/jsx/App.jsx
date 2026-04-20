import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SecondaryPasswordView from "./templates/SecondaryPasswordView.jsx";
import LegacyAppShell from "./LegacyAppShell.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/secondary-password" element={<SecondaryPasswordView />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/app/*" element={<LegacyAppShell />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
