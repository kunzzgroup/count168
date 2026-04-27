import React from "react";
import BankSearchableAccountPick from "./BankSearchableAccountPick.jsx";
import { parseProfitSharingToRows } from "../bankProcessHelpers.js";

export default function BankProcessFormModal({
  editMode,
  form,
  setForm,
  accounts,
  countriesList,
  banksList,
  onClose,
  onSubmit,
  onOpenCountryModal,
  onOpenBankModal,
  onOpenProfitShareModal,
  onOpenBankFormNoteModal,
  onOpenAddAccountForField,
}) {
  const hasDayEnd = !!String(form.day_end || "").trim();
  return (
    <div id="addBankModal" className="modal bank-modal" style={{ display: "block" }}>
      <div className="modal-content bank-modal-content">
        <div className="modal-header">
          <h2 id="bankModalTitle">{editMode ? "Edit Process" : "Add Process"}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <form id="addBankProcessForm" className="process-form bank-form" onSubmit={onSubmit}>
            <input type="hidden" name="id" value={form.id} />
            <div className="bank-form-fields-scroll">
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <h3 className="bank-section-title">Bank Information</h3>
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_country">Country (Currency)</label>
                      <div className="select-with-add">
                        {editMode ? (
                          <input id="bank_country" readOnly className="bank-input" value={form.country} />
                        ) : (
                          <select
                            id="bank_country"
                            name="country"
                            className="bank-select"
                            value={form.country}
                            required
                            onChange={(ev) => setForm((prev) => ({ ...prev, country: ev.target.value, bank: "" }))}
                          >
                            <option value="">Select Country</option>
                            {countriesList.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        )}
                        {!editMode ? (
                          <button type="button" className="bank-add-btn" title="Add New Country" onClick={onOpenCountryModal}>+</button>
                        ) : null}
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_bank">Bank</label>
                      <div className="select-with-add">
                        {editMode ? (
                          <input id="bank_bank" readOnly className="bank-input" value={form.bank} />
                        ) : (
                          <select
                            id="bank_bank"
                            name="bank"
                            className="bank-select"
                            value={form.bank}
                            required
                            disabled={!form.country}
                            onChange={(ev) => setForm((prev) => ({ ...prev, bank: ev.target.value }))}
                          >
                            <option value="">Select Bank</option>
                            {banksList.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        )}
                        {!editMode ? (
                          <button type="button" className="bank-add-btn" title="Add New Bank" disabled={!form.country} onClick={onOpenBankModal}>+</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <h3 className="bank-section-title">Detail</h3>
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_card_merchant">Supplier</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.card_merchant_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, card_merchant_id: id }))}
                          accounts={accounts}
                          disabled={false}
                        />
                        <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => onOpenAddAccountForField("card_merchant_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_cost">Buy Price</label>
                      <input
                        id="bank_cost"
                        name="cost"
                        type="text"
                        className="bank-input"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Enter amount"
                        value={form.cost}
                        onChange={(ev) => setForm((prev) => ({ ...prev, cost: ev.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-row bank-row-two-cols bank-row-type-name">
                    <div className="form-group">
                      <label htmlFor="bank_type">Type</label>
                      {editMode ? (
                        <input id="bank_type" readOnly className="bank-input" value={form.type} />
                      ) : (
                        <select id="bank_type" name="type" className="bank-select" value={form.type} required onChange={(ev) => setForm((prev) => ({ ...prev, type: ev.target.value }))}>
                          <option value="">Select Type</option>
                          <option value="PERSONAL">PERSONAL</option>
                          <option value="ENTERPRISE">ENTERPRISE</option>
                          <option value="BUSINESS">BUSINESS</option>
                        </select>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_name">Card Owner</label>
                      <input
                        id="bank_name"
                        name="name"
                        type="text"
                        className="bank-input"
                        placeholder="Enter Card Owner"
                        value={form.name}
                        readOnly={editMode}
                        required={!editMode}
                        onChange={(ev) => setForm((prev) => ({ ...prev, name: String(ev.target.value).toUpperCase() }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_customer">Customer</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.customer_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, customer_id: id }))}
                          accounts={accounts}
                          disabled={false}
                        />
                        <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => onOpenAddAccountForField("customer_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_price">Sell Price</label>
                      <input
                        id="bank_price"
                        name="price"
                        type="text"
                        className="bank-input"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Enter amount"
                        value={form.price}
                        onChange={(ev) => setForm((prev) => ({ ...prev, price: ev.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-row bank-day-start-row">
                    <div className="form-group bank-day-start-input-wrap">
                      <label htmlFor="bank_day_start">Day start</label>
                      <input id="bank_day_start" name="day_start" type="date" className="bank-input" value={form.day_start} onChange={(ev) => setForm((prev) => ({ ...prev, day_start: ev.target.value }))} />
                    </div>
                    <div className="form-group bank-day-end-input-wrap">
                      <label htmlFor="bank_day_end">Day end</label>
                      <input
                        id="bank_day_end"
                        name="day_end"
                        type="date"
                        className="bank-input"
                        min={form.day_start || undefined}
                        value={form.day_end}
                        onChange={(ev) => setForm((prev) => ({ ...prev, day_end: ev.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_profit_account">Company</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.profit_account_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, profit_account_id: id }))}
                          accounts={accounts}
                          disabled={false}
                        />
                        <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => onOpenAddAccountForField("profit_account_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_profit">Profit</label>
                      <input id="bank_profit" name="profit" type="number" className="bank-input" placeholder="Auto calculated" readOnly style={{ backgroundColor: "#f5f5f5" }} value={form.profit} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row bank-form-row-last">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-group bank-day-start-frequency-wrap" style={{ marginBottom: 20 }}>
                    <label htmlFor="bank_day_start_frequency">Frequency</label>
                    <select id="bank_day_start_frequency" name="day_start_frequency" className="bank-input bank-select" value={form.day_start_frequency} onChange={(ev) => setForm((prev) => ({ ...prev, day_start_frequency: ev.target.value }))}>
                      <option value="1st_of_every_month">1st of Every Month</option>
                      <option value="monthly" disabled={hasDayEnd}>Monthly</option>
                    </select>
                  </div>
                  <input type="hidden" name="profit_sharing" value={form.profit_sharing} />
                  <div className="bank-profit-sharing-container form-group">
                    <div className="bank-profit-sharing-header">
                      <h3>Selected Profit Sharing</h3>
                      <button type="button" className="bank-add-btn" title="Add Profit Sharing" onClick={onOpenProfitShareModal}>+</button>
                    </div>
                    <div className="bank-profit-sharing-list" id="selectedProfitSharingList">
                      {parseProfitSharingToRows(form.profit_sharing, accounts).length === 0 ? (
                        <div className="no-profit-sharing"><p>No profit sharing selected</p></div>
                      ) : (
                        parseProfitSharingToRows(form.profit_sharing, accounts).map((row, idx) => (
                          <div key={`${row.accountLabel}-${idx}`} className="bank-profit-sharing-item" style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                            <span>{row.accountLabel}</span>
                            {" — "}
                            <span>{row.amount}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_contract">Contract</label>
                      <select id="bank_contract" name="contract" className="bank-select" value={form.contract} onChange={(ev) => setForm((prev) => ({ ...prev, contract: ev.target.value }))} required>
                        <option value="">Select Contract</option>
                        <option value="1 MONTH">1 MONTH</option>
                        <option value="2 MONTHS">2 MONTHS</option>
                        <option value="3 MONTHS">3 MONTHS</option>
                        <option value="6 MONTHS">6 MONTHS</option>
                        <option value="1+1">1+1 MONTH</option>
                        <option value="1+2">1+2 MONTHS</option>
                        <option value="1+3">1+3 MONTHS</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_insurance">Insurance</label>
                      <input id="bank_insurance" name="insurance" type="text" className="bank-input" inputMode="decimal" autoComplete="off" placeholder="Enter amount" value={form.insurance} onChange={(ev) => setForm((prev) => ({ ...prev, insurance: ev.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group bank-remark-wrap" style={{ marginTop: 12 }}>
                    <div className="bank-remark-actions">
                      <button type="button" id="bank_sop_btn" className="btn btn-save" onClick={() => onOpenBankFormNoteModal("sop")}>SOP</button>
                      <button type="button" id="bank_remark_btn" className="btn btn-save" onClick={() => onOpenBankFormNoteModal("remark")}>Remark</button>
                    </div>
                    {(form.sop || form.remark) ? (
                      <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>{[form.sop && "SOP filled", form.remark && "Remark filled"].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-actions bank-actions">
              <button type="submit" className="btn btn-save" id="bankSubmitBtn">{editMode ? "Update Process" : "Add Process"}</button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
