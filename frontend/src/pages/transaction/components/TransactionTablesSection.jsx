import { formatPaymentHistoryMoney, toUpperDisplay } from "../transactionFormat.js";

export default function TransactionTablesSection({
  tablesVisible,
  searchLoading,
  tp,
  searchState,
  getRoleClass,
  fallbackRoleClass,
  openHistory,
  handleBalanceCellClick,
}) {
  return (
    <>
      <div className="transaction-tables-section" style={{ display: tablesVisible ? "block" : "none" }}>
        <div id="transaction-tables-loading" className="transaction-tables-loading" style={{ display: searchLoading ? "flex" : "none" }} aria-live="polite">
          Loading data
        </div>
        <div
          id="default-tables-container"
          style={{
            display: tp.mode === "default" ? "flex" : "none",
            flexDirection: "column",
            width: "100%",
          }}
        >
          {tp.singleCurrencyTitle ? (
            <h3
              id="default-currency-title"
              style={{ margin: "10px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937", display: "block" }}
            >
              {tp.singleCurrencyTitle}
            </h3>
          ) : null}
          <div style={{ display: "flex", gap: 20, width: "100%" }}>
            <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
              <table className="transaction-table" id="table_left">
                <thead>
                  <tr className="transaction-table-header">
                    <th>Account</th>
                    <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>Name</th>
                    <th>B/F</th><th>Win/Loss</th><th>Cr/Dr</th><th>Balance</th>
                  </tr>
                </thead>
                <tbody id="tbody_left">
                  {(tp.defaultLeft || []).map((row) => {
                    const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                    const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                    return (
                      <tr key={`${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                        <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>{row.account_id}</td>
                        <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{toUpperDisplay(row.account_name)}</td>
                        <td>{formatPaymentHistoryMoney(row.bf)}</td>
                        <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                        <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                        <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, true)}>{formatPaymentHistoryMoney(row.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="transaction-table-footer">
                    <td>Total</td>
                    <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                    <td id="left_total_bf">{formatPaymentHistoryMoney(tp.totalsLeft?.bf ?? "0")}</td>
                    <td id="left_total_winloss">{formatPaymentHistoryMoney(tp.totalsLeft?.win_loss ?? "0")}</td>
                    <td id="left_total_crdr">{formatPaymentHistoryMoney(tp.totalsLeft?.cr_dr ?? "0")}</td>
                    <td id="left_total_balance">{formatPaymentHistoryMoney(tp.totalsLeft?.balance ?? "0")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
              <table className="transaction-table" id="table_right">
                <thead>
                  <tr className="transaction-table-header">
                    <th>Account</th>
                    <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>Name</th>
                    <th>B/F</th><th>Win/Loss</th><th>Cr/Dr</th><th>Balance</th>
                  </tr>
                </thead>
                <tbody id="tbody_right">
                  {(tp.defaultRight || []).map((row) => {
                    const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                    const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                    return (
                      <tr key={`${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                        <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>{row.account_id}</td>
                        <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{toUpperDisplay(row.account_name)}</td>
                        <td>{formatPaymentHistoryMoney(row.bf)}</td>
                        <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                        <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                        <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, false)}>{formatPaymentHistoryMoney(row.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="transaction-table-footer">
                    <td>Total</td>
                    <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                    <td id="right_total_bf">{formatPaymentHistoryMoney(tp.totalsRight?.bf ?? "0")}</td>
                    <td id="right_total_winloss">{formatPaymentHistoryMoney(tp.totalsRight?.win_loss ?? "0")}</td>
                    <td id="right_total_crdr">{formatPaymentHistoryMoney(tp.totalsRight?.cr_dr ?? "0")}</td>
                    <td id="right_total_balance">{formatPaymentHistoryMoney(tp.totalsRight?.balance ?? "0")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        <div id="currency-grouped-tables-container" style={{ display: tp.mode === "grouped" ? "block" : "none", width: "100%" }}>
          {(tp.grouped || []).map((g) => (
            <div key={g.currency} style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
                Currency: {g.currency}
              </h3>
              <div style={{ display: "flex", gap: 20, width: "100%" }}>
                {[
                  { key: "L", rows: g.left || [], totals: g.totalsLeft, isLeft: true },
                  { key: "R", rows: g.right || [], totals: g.totalsRight, isLeft: false },
                ].map((side) => (
                  <div key={side.key} className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                    <table className="transaction-table">
                      <thead>
                        <tr className="transaction-table-header">
                          <th>Account</th>
                          <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>Name</th>
                          <th>B/F</th><th>Win/Loss</th><th>Cr/Dr</th><th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {side.rows.map((row) => {
                          const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                          const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                          return (
                            <tr key={`${side.key}-${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                              <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>{row.account_id}</td>
                              <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>{toUpperDisplay(row.account_name)}</td>
                              <td>{formatPaymentHistoryMoney(row.bf)}</td>
                              <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                              <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                              <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, side.isLeft)}>{formatPaymentHistoryMoney(row.balance)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-footer">
                          <td>Total</td>
                          <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                          <td>{formatPaymentHistoryMoney(side.totals?.bf ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(side.totals?.win_loss ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(side.totals?.cr_dr ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(side.totals?.balance ?? "0")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>
              <div style={{ margin: "12px auto", maxWidth: 400 }}>
                <table className="transaction-summary-table" style={{ margin: "0 auto", maxWidth: 400 }}>
                  <thead><tr className="transaction-table-header"><th colSpan={2}>Total</th></tr></thead>
                  <tbody>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">B/F</td><td>{formatPaymentHistoryMoney(g.totalsSummary?.bf ?? "0")}</td></tr>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">Win/Loss</td><td>{formatPaymentHistoryMoney(g.totalsSummary?.win_loss ?? "0")}</td></tr>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">Cr/Dr</td><td>{formatPaymentHistoryMoney(g.totalsSummary?.cr_dr ?? "0")}</td></tr>
                    <tr className="transaction-table-row"><td className="transaction-summary-label">Balance</td><td>{formatPaymentHistoryMoney(g.totalsSummary?.balance ?? "0")}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="transaction-summary-section" style={{ display: tablesVisible && tp.mode !== "grouped" ? "flex" : "none" }}>
        <table className="transaction-summary-table">
          <thead><tr className="transaction-table-header"><th colSpan={2}>Total</th></tr></thead>
          <tbody>
            <tr className="transaction-table-row"><td className="transaction-summary-label">B/F</td><td id="sum_total_bf">{formatPaymentHistoryMoney(tp.totalsSummary?.bf ?? "0")}</td></tr>
            <tr className="transaction-table-row"><td className="transaction-summary-label">Win/Loss</td><td id="sum_total_winloss">{formatPaymentHistoryMoney(tp.totalsSummary?.win_loss ?? "0")}</td></tr>
            <tr className="transaction-table-row"><td className="transaction-summary-label">Cr/Dr</td><td id="sum_total_crdr">{formatPaymentHistoryMoney(tp.totalsSummary?.cr_dr ?? "0")}</td></tr>
            <tr className="transaction-table-row"><td className="transaction-summary-label">Balance</td><td id="sum_total_balance">{formatPaymentHistoryMoney(tp.totalsSummary?.balance ?? "0")}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
