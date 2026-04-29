import { formatPaymentHistoryMoney, toUpperDisplay } from "../transactionFormat.js";

export default function TransactionHeader({
  canApproveContra,
  contraInbox,
  toggleContraInbox,
  refreshContraInbox,
  approveContra,
  rejectContra,
  fsCompanyId,
  pushToast,
  refreshContraInboxAfterAction,
  runSearch,
}) {
  return (
    <div className="transaction-header-bar">
      <div className="transaction-header-left">
        <h1 className="transaction-title">Transaction List</h1>
        {canApproveContra && (
          <div className="contra-inbox-wrap" id="contraInboxWrap">
            <button type="button" className="contra-inbox-btn contra-inbox-main" id="contraInboxBtn" onClick={toggleContraInbox}>
              <svg className="contra-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              Contra Inbox
              <span className="contra-inbox-badge" id="contraInboxCount">
                {contraInbox.items.length}
              </span>
            </button>
            <div className="contra-inbox-popover" id="contraInboxPopover" style={{ display: contraInbox.open ? "block" : "none" }}>
              <div className="contra-inbox-popover-header">
                <div className="contra-inbox-popover-title">
                  Contra Inbox
                  <span className="contra-inbox-badge" id="contraInboxCount2">
                    {contraInbox.items.length}
                  </span>
                </div>
                <button type="button" className="contra-inbox-btn" id="contraInboxRefreshBtn" onClick={refreshContraInbox}>
                  Refresh
                </button>
              </div>
              <div className="contra-inbox-popover-body">
                {contraInbox.loading && <div style={{ padding: 12 }}>Loading...</div>}
                <table className="contra-inbox-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Currency</th>
                      <th>Amount</th>
                      <th>Submitted By</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="contraInboxTbody">
                    {contraInbox.items.map((it) => (
                      <tr key={it.id || `${it.transaction_id}-${it.transaction_date}`}>
                        <td>{it.transaction_date || it.date || "-"}</td>
                        <td>
                          {it.from_account_code || "-"}
                          {it.from_account_name ? ` - ${it.from_account_name}` : ""}
                        </td>
                        <td>
                          {it.to_account_code || "-"}
                          {it.to_account_name ? ` - ${it.to_account_name}` : ""}
                        </td>
                        <td>{toUpperDisplay(it.currency || "-")}</td>
                        <td>{formatPaymentHistoryMoney(it.amount)}</td>
                        <td>{toUpperDisplay(it.submitted_by || it.created_by || "-")}</td>
                        <td>{toUpperDisplay(it.description || "-")}</td>
                        <td>
                          <button
                            type="button"
                            className="contra-inbox-btn contra-inbox-approve"
                            onClick={async () => {
                              const tid = it.transaction_id || it.id;
                              if (!tid) return;
                              const res = await approveContra({ transactionId: tid, companyId: fsCompanyId });
                              if (res?.success) {
                                pushToast("Approved", "success");
                                await refreshContraInboxAfterAction();
                                await runSearch({ silent: false });
                              } else {
                                pushToast(res?.message || "Approve failed", "error");
                              }
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="contra-inbox-btn contra-inbox-reject"
                            onClick={async () => {
                              if (!confirm("确定要拒绝这条 Contra 交易吗？拒绝后数据将被永久删除。")) return;
                              const tid = it.transaction_id || it.id;
                              if (!tid) return;
                              const res = await rejectContra({ transactionId: tid, companyId: fsCompanyId });
                              if (res?.success) {
                                pushToast("Rejected", "success");
                                await refreshContraInboxAfterAction();
                              } else {
                                pushToast(res?.message || "Reject failed", "error");
                              }
                            }}
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
