import { formatAmount } from "../customerReportLogic.js";

export default function CustomerReportTable({ reportData, loading, error }) {
  const renderEmpty = (message) => (
    <div className="customer-report-list-container">
      <div className="customer-report-table-header">
        <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
      </div>
      <div className="customer-report-cards">
        <div className="customer-report-card">
          <div className="customer-report-card-item" style={{ textAlign: "center", padding: 20, gridColumn: "1 / -1", justifyContent: "center" }}>
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) return renderEmpty("Loading...");
  if (error) return renderEmpty(error);
  if (!reportData || !reportData.data || reportData.data.length === 0) return renderEmpty("No data found");

  const data = reportData.data;

  // Grouping Logic
  const grouped = {};
  data.forEach(item => {
    const c = item.currency || "null";
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(item);
  });

  const currenciesInReport = Object.keys(grouped).filter(c => c !== "null").sort();
  const hasNull = !!grouped["null"];

  // If multiple currencies or null+one, show grouped
  if (currenciesInReport.length > 1 || (currenciesInReport.length === 1 && hasNull)) {
    return (
      <div className="customer-report-list-container" id="currency-grouped-reports-container">
        {currenciesInReport.map(c => {
          const items = grouped[c];
          const win = items.reduce((acc, cur) => acc + parseFloat(cur.win || 0), 0);
          const lose = items.reduce((acc, cur) => acc + parseFloat(cur.lose || 0), 0);
          return (
            <div key={c} className="customer-report-currency-section" style={{ marginBottom: 30 }}>
              <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
                Currency: {c.toUpperCase()}
              </h3>
              <div className="customer-report-table-header">
                <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
              </div>
              <div className="customer-report-cards">
                {items.map((it, idx) => (
                  <div key={idx} className="customer-report-card">
                    <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
                    <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
                    <div className="customer-report-card-item">{(it.currency || "-").toUpperCase()}</div>
                    <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
                    <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
                  </div>
                ))}
              </div>
              <div className="customer-report-total">
                <div className="customer-report-total-label">Total:</div>
                <div className="customer-report-amount win customer-report-total-win">{formatAmount(win)}</div>
                <div className="customer-report-amount lose customer-report-total-lose">{formatAmount(lose)}</div>
              </div>
            </div>
          );
        })}
        {hasNull && (
          <div className="customer-report-currency-section" style={{ marginBottom: 30 }}>
            <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
              Currency: -
            </h3>
            <div className="customer-report-table-header">
              <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
            </div>
            <div className="customer-report-cards">
              {grouped["null"].map((it, idx) => (
                <div key={idx} className="customer-report-card">
                  <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
                  <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
                  <div className="customer-report-card-item">-</div>
                  <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
                  <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
                </div>
              ))}
            </div>
            <div className="customer-report-total">
              <div className="customer-report-total-label">Total:</div>
              <div className="customer-report-amount win customer-report-total-win">
                {formatAmount(grouped["null"].reduce((acc, cur) => acc + parseFloat(cur.win || 0), 0))}
              </div>
              <div className="customer-report-amount lose customer-report-total-lose">
                {formatAmount(grouped["null"].reduce((acc, cur) => acc + parseFloat(cur.lose || 0), 0))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default view (Single currency or no currency)
  return (
    <div className="customer-report-list-container" id="default-report-container">
      <div className="customer-report-table-header">
        <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
      </div>
      <div className="customer-report-cards">
        {data.map((it, idx) => (
          <div key={idx} className="customer-report-card">
            <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
            <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
            <div className="customer-report-card-item">{(it.currency || "-").toUpperCase()}</div>
            <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
            <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
          </div>
        ))}
      </div>
      <div className="customer-report-total">
        <div className="customer-report-total-label">Total:</div>
        <div className="customer-report-amount win customer-report-total-win">{formatAmount(reportData.total_win)}</div>
        <div className="customer-report-amount lose customer-report-total-lose">{formatAmount(reportData.total_lose)}</div>
      </div>
    </div>
  );
}
