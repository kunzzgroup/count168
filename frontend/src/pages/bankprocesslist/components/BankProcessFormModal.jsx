import React from "react";
import BankSearchableAccountPick from "./BankSearchableAccountPick.jsx";
import BankFormDateField from "./BankFormDateField.jsx";
import {
  parseProfitSharingToRows,
  parseBankContractTermMonths,
  contractBillingEndYmdForBankForm,
  bankProcessFrequencyNormalized,
  BANK_PROCESS_CONTRACT_OPTIONS,
  formatBankProcessContractLabel,
} from "../bankProcessHelpers.js";

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
  lang,
  t,
}) {
  const hasDayEnd = !!String(form.day_end || "").trim();
  const dayStart = String(form.day_start || "").trim();
  const contract = String(form.contract || "").trim();
  const frequency = bankProcessFrequencyNormalized(form.day_start_frequency);
  const isOnce = frequency === "once";
  let dayEndMin = dayStart || undefined;
  if (!isOnce && dayStart && contract) {
    const term = parseBankContractTermMonths(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(dayStart, term, frequency) : null;
    if (calculated) {
      dayEndMin = calculated;
    }
  }

  return (
    <div id="addBankModal" className="modal bank-modal" style={{ display: "block" }}>
      <div className="modal-content bank-modal-content">
        <div className="modal-header">
          <h2 id="bankModalTitle">{editMode ? t("editProcess") : t("addProcess")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <form id="addBankProcessForm" className="process-form bank-form" onSubmit={onSubmit}>
            <input type="hidden" name="id" value={form.id} />
            <div className="bank-form-fields-scroll">
              <div className="bank-form-row">
                <div className="bank-form-cell bank-form-cell-left">
                  <h3 className="bank-section-title">{t("bankInformation")}</h3>
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_country">{t("countryCurrency")}</label>
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
                            <option value="">{t("selectCountry")}</option>
                            {countriesList.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        )}
                        {!editMode ? (
                          <button type="button" className="bank-add-btn" title={t("addNewCountry")} onClick={onOpenCountryModal}>+</button>
                        ) : null}
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_bank">{t("bank")}</label>
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
                            <option value="">{t("selectBank")}</option>
                            {banksList.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        )}
                        {!editMode ? (
                          <button type="button" className="bank-add-btn" title={t("addNewBank")} disabled={!form.country} onClick={onOpenBankModal}>+</button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <h3 className="bank-section-title">{t("detail")}</h3>
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_card_merchant">{t("supplier")}</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.card_merchant_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, card_merchant_id: id }))}
                          accounts={accounts}
                          disabled={false}
                          t={t}
                        />
                        <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField("card_merchant_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_cost">{t("buyPrice")}</label>
                      <input
                        id="bank_cost"
                        name="cost"
                        type="text"
                        className="bank-input"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={t("enterAmount")}
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
                      <label htmlFor="bank_type">{t("type")}</label>
                      {editMode ? (
                        <input id="bank_type" readOnly className="bank-input" value={form.type} />
                      ) : (
                        <select id="bank_type" name="type" className="bank-select" value={form.type} required onChange={(ev) => setForm((prev) => ({ ...prev, type: ev.target.value }))}>
                          <option value="">{t("selectType")}</option>
                          <option value="PERSONAL">{t("personal")}</option>
                          <option value="ENTERPRISE">{t("enterprise")}</option>
                          <option value="BUSINESS">{t("business")}</option>
                        </select>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_name">{t("cardOwner")}</label>
                      <input
                        id="bank_name"
                        name="name"
                        type="text"
                        className="bank-input"
                        placeholder={t("enterCardOwner")}
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
                      <label htmlFor="bank_customer">{t("customer")}</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.customer_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, customer_id: id }))}
                          accounts={accounts}
                          disabled={false}
                          t={t}
                        />
                        <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField("customer_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_price">{t("sellPrice")}</label>
                      <input
                        id="bank_price"
                        name="price"
                        type="text"
                        className="bank-input"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={t("enterAmount")}
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
                    <BankFormDateField
                      fieldKey="bank_day_start"
                      htmlFor="bank_day_start"
                      label={t("dayStart")}
                      value={form.day_start}
                      placeholder={t("pickDate")}
                      wrapClassName="bank-day-start-input-wrap"
                    />
                    <BankFormDateField
                      fieldKey="bank_day_end"
                      htmlFor="bank_day_end"
                      label={t("dayEnd")}
                      value={form.day_end}
                      disabled={isOnce}
                      minYmd={isOnce ? undefined : dayEndMin}
                      placeholder={t("pickDate")}
                      wrapClassName="bank-day-end-input-wrap"
                      className={isOnce ? "bank-day-end-input-wrap--muted" : ""}
                    />
                  </div>
                </div>
                <div className="bank-form-cell bank-form-cell-right">
                  <div className="form-row bank-row-two-cols">
                    <div className="form-group">
                      <label htmlFor="bank_profit_account">{t("companyAccount")}</label>
                      <div className="account-select-with-buttons">
                        <BankSearchableAccountPick
                          value={form.profit_account_id}
                          onChange={(id) => setForm((prev) => ({ ...prev, profit_account_id: id }))}
                          accounts={accounts}
                          disabled={false}
                          t={t}
                        />
                        <button type="button" className="bank-add-btn" title={t("addAccount")} onClick={() => onOpenAddAccountForField("profit_account_id")}>+</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_profit">{t("profit")}</label>
                      <input id="bank_profit" name="profit" type="number" className="bank-input" placeholder={t("autoCalculated")} readOnly style={{ backgroundColor: "#f5f5f5" }} value={form.profit} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bank-form-row bank-form-row-last">
                <div className="bank-form-cell bank-form-cell-left">
                  <div className="form-group bank-day-start-frequency-wrap" style={{ marginBottom: 20 }}>
                    <label htmlFor="bank_day_start_frequency">{t("frequency")}</label>
                    <select
                      id="bank_day_start_frequency"
                      name="day_start_frequency"
                      className="bank-input bank-select"
                      value={bankProcessFrequencyNormalized(form.day_start_frequency)}
                      onChange={(ev) => {
                        const next = ev.target.value;
                        setForm((prev) => {
                          const prevNorm = bankProcessFrequencyNormalized(prev.day_start_frequency);
                          if (next === "once" && prevNorm !== "once") {
                            return { ...prev, day_start_frequency: next, day_end: "", contract: "", insurance: "" };
                          }
                          return { ...prev, day_start_frequency: next };
                        });
                      }}
                    >
                      <option value="1st_of_every_month">{t("firstOfEveryMonth")}</option>
                      <option value="monthly" disabled={hasDayEnd}>{t("monthly")}</option>
                      <option value="once">{t("onceFrequency")}</option>
                    </select>
                  </div>
                  <input type="hidden" name="profit_sharing" value={form.profit_sharing} />
                  <div className="bank-profit-sharing-container form-group">
                    <div className="bank-profit-sharing-header">
                      <h3>{t("selectedProfitSharing")}</h3>
                      <button type="button" className="bank-add-btn" title={t("addProfitSharing")} onClick={onOpenProfitShareModal}>+</button>
                    </div>
                    <div className="bank-profit-sharing-list" id="selectedProfitSharingList">
                      {parseProfitSharingToRows(form.profit_sharing, accounts).length === 0 ? (
                        <div className="no-profit-sharing"><p>{t("noProfitSharingSelected")}</p></div>
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
                      <label htmlFor="bank_contract">{t("contract")}</label>
                      <select
                        id="bank_contract"
                        name="contract"
                        className="bank-select"
                        value={form.contract}
                        onChange={(ev) => setForm((prev) => ({ ...prev, contract: ev.target.value }))}
                        required={!isOnce}
                        disabled={isOnce}
                      >
                        <option value="">{t("contract")}</option>
                        {BANK_PROCESS_CONTRACT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {formatBankProcessContractLabel(lang, opt.value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bank_insurance">{t("insurance")}</label>
                      <input id="bank_insurance" name="insurance" type="text" className="bank-input" inputMode="decimal" autoComplete="off" placeholder={t("enterAmount")} value={form.insurance} disabled={isOnce} onChange={(ev) => setForm((prev) => ({ ...prev, insurance: ev.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group bank-remark-wrap" style={{ marginTop: 12 }}>
                    <div className="bank-remark-actions">
                      <button type="button" id="bank_sop_btn" className="btn btn-save" onClick={() => onOpenBankFormNoteModal("sop")}>{t("sop")}</button>
                      <button type="button" id="bank_remark_btn" className="btn btn-save" onClick={() => onOpenBankFormNoteModal("remark")}>{t("remark")}</button>
                    </div>
                    {(form.sop || form.remark) ? (
                      <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>{[form.sop && t("sopFilled"), form.remark && t("remarkFilled")].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-actions bank-actions">
              <button type="submit" className="btn btn-save" id="bankSubmitBtn">{editMode ? t("updateProcess") : t("addProcess")}</button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
