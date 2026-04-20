import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  withCredentials: true,
});

export const getDashboard = (params) =>
  api.get("/api/transactions/dashboard_api.php", { params });

export const getCompanies = () =>
  api.get("/api/transactions/get_owner_companies_api.php", {
    params: { all: 1 },
  });

export const getCurrencies = (companyId) =>
  api.get("/api/transactions/get_company_currencies_api.php", {
    params: { company_id: companyId },
  });

export const switchCompanySession = (companyId) =>
  api.get("/api/session/update_company_session_api.php", {
    params: { company_id: companyId },
  });

export const getSessionMe = () => api.get("/api/session/me.php");

export default api;
