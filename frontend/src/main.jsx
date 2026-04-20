import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import App from "./jsx/App.jsx";

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
if (rawApiBaseUrl && rawApiBaseUrl.trim() !== "") {
  axios.defaults.baseURL = rawApiBaseUrl.trim().replace(/\/+$/, "");
}

axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
