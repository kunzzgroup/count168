import { formatCurrency } from "../lib/dashboardFormat.js";

export function DashboardAnimatedValue({ value, className = "" }) {
  const target = parseFloat(value) || 0;

  return (
    <span className={`dashboard-animated-value${className ? ` ${className}` : ""}`}>
      {formatCurrency(target)}
    </span>
  );
}
