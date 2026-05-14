import AccountSelect from "./AccountSelect.jsx";

export default function TransactionAddSection({
  txType,
  setTxType,
  todayDmy,
  accountOptions,
  txToAccount,
  setTxToAccount,
  selectedCategories,
  showStandardFromAndReverse,
  txFromAccount,
  setTxFromAccount,
  onReverseAccounts,
  txCurrency,
  setTxCurrency,
  currencyOptions,
  txAmount,
  setTxAmount,
  rateDate,
  rateToAccount,
  setRateToAccount,
  rateFromAccount,
  setRateFromAccount,
  rateCurrencyFrom,
  setRateCurrencyFrom,
  rateCurrencyFromAmount,
  setRateCurrencyFromAmount,
  rateExchangeRateRaw,
  setRateExchangeRateRaw,
  rateCurrencyTo,
  setRateCurrencyTo,
  rateCurrencyToAmount,
  onRateCurrencyRowReverse,
  rateTransferToAccount,
  setRateTransferToAccount,
  rateTransferFromAccount,
  setRateTransferFromAccount,
  rateMiddlemanAccount,
  setRateMiddlemanAccount,
  rateMiddlemanRate,
  setRateMiddlemanRate,
  rateMiddlemanAmount,
  winLoseSide,
  setWinLoseSide,
  txRemark,
  setTxRemark,
  txConfirm,
  setTxConfirm,
  submitting,
  onSubmitTx,
  onSearch,
  searchLoading,
}) {
  const standardHidden = txType === "RATE";
  const reserveReverseColumnClass = showStandardFromAndReverse && !standardHidden ? " tx-add-form-row--reserve-reverse" : "";

  return (
    <div className="transaction-add-section">
      {/* Row: Type | Date (Date hidden in RATE mode) */}
      <div className={`tx-add-form-row tx-add-form-row--pair${standardHidden ? " tx-add-form-row--type-only" : ""}${reserveReverseColumnClass}`}>
        <div className="report-outlined-anchor tx-add-field-col">
          <div className="report-outlined-shell">
            <span className="report-outlined-label report-outlined-label--tx-add-icon" id="tx-add-type-label">
              Type
            </span>
            <div className="report-outlined-inner">
              <div className="tx-add-icon-field">
                <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-exchange-alt" /></span>
                <select
                  id="transaction_type"
                  className="transaction-select"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                  aria-labelledby="tx-add-type-label"
                >
                  <option value="CONTRA">CONTRA</option>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="RECEIVE">RECEIVE</option>
                  <option value="CLAIM">CLAIM</option>
                  <option value="PROFIT">PROFIT</option>
                  <option value="RATE">RATE</option>
                  <option value="ADJUSTMENT">ADJUSTMENT</option>
                  <option value="CLEAR">CLEAR</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {!standardHidden && (
          <div className="report-outlined-anchor tx-add-field-col">
            <div className="report-outlined-shell">
              <span className="report-outlined-label report-outlined-label--txn-add-date" id="tx-add-date-label">
                Date range
              </span>
              <div className="report-outlined-inner">
                <div className="transaction-date-range-group">
                  <div
                    className="date-range-picker"
                    id="add-tx-date-range-picker"
                    role="button"
                    tabIndex={0}
                    aria-labelledby="tx-add-date-label"
                    data-drp-from="add_tx_date_from"
                    data-drp-to="add_tx_date_to"
                    data-drp-display="add-tx-date-range-display"
                    data-drp-hide-presets="true"
                  >
                    <i className="fas fa-calendar-alt" />
                    <span id="add-tx-date-range-display" />
                    <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                  </div>
                  <input type="hidden" id="add_tx_date_from" readOnly aria-hidden="true" />
                  <input type="hidden" id="add_tx_date_to" readOnly aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        id="standard-transaction-fields"
        style={{
          display: standardHidden ? "none" : "flex",
          flexDirection: "column",
          gap: "clamp(8px, 0.7vw, 14px)",
        }}
      >
        {/* Row: To Account | From Account | Reverse */}
        <div className={`tx-add-form-row tx-add-form-row--accounts${showStandardFromAndReverse ? " tx-add-form-row--with-reverse" : ""}`}>
          <div className="report-outlined-anchor tx-add-field-col">
            <div className="report-outlined-shell">
              <span className="report-outlined-label report-outlined-label--tx-add-icon" id="tx-add-to-acc-label">
                To Account
              </span>
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-plus" /></span>
                  <AccountSelect
                    ariaLabelledBy="tx-add-to-acc-label"
                    placeholder="--Select To Account--"
                    options={accountOptions}
                    value={txToAccount}
                    onChange={setTxToAccount}
                    selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                  />
                </div>
              </div>
            </div>
          </div>

          {showStandardFromAndReverse ? (
            <>
              <div className="report-outlined-anchor tx-add-field-col">
                <div className="report-outlined-shell">
                  <span className="report-outlined-label report-outlined-label--tx-add-icon" id="tx-add-from-acc-label">
                    From Account
                  </span>
                  <div className="report-outlined-inner">
                    <div className="tx-add-icon-field">
                      <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-minus" /></span>
                      <AccountSelect
                        ariaLabelledBy="tx-add-from-acc-label"
                        placeholder="--Select From Account--"
                        options={accountOptions}
                        value={txFromAccount}
                        onChange={setTxFromAccount}
                        selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                id="account_reverse_btn"
                className="transaction-account-reverse-btn tx-add-account-reverse"
                title="Reverse accounts"
                aria-label="Reverse accounts"
                onClick={onReverseAccounts}
              >
                Reverse
              </button>
            </>
          ) : null}
        </div>

        {/* Row: Currency | Amount */}
        <div className={`tx-add-form-row tx-add-form-row--pair${reserveReverseColumnClass}`}>
          <div className="report-outlined-anchor tx-add-field-col">
            <div className="report-outlined-shell">
              <span className="report-outlined-label report-outlined-label--tx-add-icon" id="tx-add-currency-label">
                Currency
              </span>
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-coins" /></span>
                  <select
                    id="transaction_currency"
                    className="transaction-select"
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value)}
                    aria-labelledby="tx-add-currency-label"
                  >
                    <option value="">--Select Currency--</option>
                    {currencyOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="report-outlined-anchor tx-add-field-col">
            <div className="report-outlined-shell">
              <span className="report-outlined-label report-outlined-label--tx-add-icon" id="tx-add-amount-label">
                Amount
              </span>
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-dollar-sign" /></span>
                  <input
                    type="number"
                    step="0.01"
                    id="action_amount"
                    className="transaction-input"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    aria-labelledby="tx-add-amount-label"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row: Remark (full width) */}
        <div className="tx-add-form-row" id="remark_form_group">
          <div className="report-outlined-anchor tx-add-field-col tx-add-field-col--full">
            <div className="report-outlined-shell">
              <span className="report-outlined-label report-outlined-label--tx-add-icon" id="tx-add-remark-label">
                Remark
              </span>
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-pen" /></span>
                  <input
                    type="text"
                    id="action_sms"
                    className="transaction-input text-uppercase"
                    value={txRemark}
                    onChange={(e) => setTxRemark(e.target.value.toUpperCase())}
                    aria-labelledby="tx-add-remark-label"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {txType === "PROFIT" && (
          <div className="tx-add-form-row tx-add-winlose-row">
            <span className="tx-add-winlose-heading">Win / Lose</span>
            <div className="transaction-win-lose-row">
              <label className="transaction-radio-label">
                <input type="radio" name="win_lose_side" value="WIN" checked={winLoseSide === "WIN"} onChange={() => setWinLoseSide("WIN")} />
                WIN
              </label>
              <label className="transaction-radio-label">
                <input type="radio" name="win_lose_side" value="LOSE" checked={winLoseSide === "LOSE"} onChange={() => setWinLoseSide("LOSE")} />
                LOSE
              </label>
            </div>
          </div>
        )}

        <div className="transaction-form-group" style={{ display: "none" }}>
          <label className="transaction-label">Description</label>
          <input type="text" id="action_description" className="transaction-input text-uppercase" />
        </div>
      </div>

      <div id="rate-transaction-fields" className="rate-fields" style={{ display: txType === "RATE" ? "flex" : "none" }}>
        <div className="rate-section">
          <label className="transaction-label">Date</label>
          <input type="text" id="rate_transaction_date" className="transaction-input" value={rateDate || todayDmy} placeholder="dd/mm/yyyy" readOnly style={{ cursor: "pointer" }} />
        </div>

        <div className="rate-section">
          <label className="transaction-label">Account</label>
          <div className="rate-row rate-row-two-cols">
            <div className="custom-select-wrapper">
              <AccountSelect placeholder="--Select To Account--" options={accountOptions} value={rateToAccount} onChange={setRateToAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <div className="custom-select-wrapper">
              <AccountSelect placeholder="--Select From Account--" options={accountOptions} value={rateFromAccount} onChange={setRateFromAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <button type="button" id="rate_account_reverse_btn" className="transaction-account-reverse-btn rate-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts" onClick={() => { setRateToAccount(rateFromAccount); setRateFromAccount(rateToAccount); onRateCurrencyRowReverse?.(); }}>
              Reverse
            </button>
          </div>
        </div>

        <div className="rate-section">
          <label className="transaction-label">Currency</label>
          <div className="rate-row rate-row-five-cols">
            <select id="rate_currency_from" className="transaction-select" value={rateCurrencyFrom} onChange={(e) => setRateCurrencyFrom(e.target.value)}>
              <option value="">Currency</option>
              {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" step="0.01" id="rate_currency_from_amount" className="transaction-input" placeholder="Amount" value={rateCurrencyFromAmount} onChange={(e) => setRateCurrencyFromAmount(e.target.value)} />
            <input type="text" inputMode="decimal" id="rate_exchange_rate" className="transaction-input" placeholder="Rate" value={rateExchangeRateRaw} onChange={(e) => setRateExchangeRateRaw(e.target.value)} />
            <select id="rate_currency_to" className="transaction-select" value={rateCurrencyTo} onChange={(e) => setRateCurrencyTo(e.target.value)}>
              <option value="">Currency</option>
              {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" step="0.01" id="rate_currency_to_amount" className="transaction-input" placeholder="Amount" readOnly value={rateCurrencyToAmount} />
          </div>
        </div>

        <div className="rate-section">
          <label className="transaction-label">Account</label>
          <div className="rate-row rate-row-two-cols">
            <div className="custom-select-wrapper">
              <AccountSelect placeholder="--Select To Account--" options={accountOptions} value={rateTransferToAccount} onChange={setRateTransferToAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <div className="custom-select-wrapper">
              <AccountSelect placeholder="--Select From Account--" options={accountOptions} value={rateTransferFromAccount} onChange={setRateTransferFromAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <button type="button" id="rate_transfer_reverse_btn" className="transaction-account-reverse-btn rate-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts" onClick={() => { setRateTransferToAccount(rateTransferFromAccount); setRateTransferFromAccount(rateTransferToAccount); }}>
              Reverse
            </button>
          </div>
        </div>

        <div className="rate-section">
          <label className="transaction-label">Middle-Man</label>
          <div className="rate-row rate-row-three-cols">
            <div className="custom-select-wrapper">
              <AccountSelect placeholder="--Select Account--" options={accountOptions} value={rateMiddlemanAccount} onChange={setRateMiddlemanAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <input type="number" step="0.0001" id="rate_middleman_rate" className="transaction-input" placeholder="Rate multiplier" value={rateMiddlemanRate} onChange={(e) => setRateMiddlemanRate(e.target.value)} />
            <input type="number" step="0.01" id="rate_middleman_amount" className="transaction-input" placeholder="Amount" readOnly value={rateMiddlemanAmount} />
          </div>
        </div>
      </div>

      <div className="transaction-confirm-actions">
        <label className="transaction-checkbox-label transaction-confirm-label">
          <input type="checkbox" id="confirm_submit" className="transaction-checkbox" checked={txConfirm} onChange={(e) => setTxConfirm(e.target.checked)} />
          Confirm Submit
        </label>
        <div className="transaction-action-btns">
          <button type="button" id="submit_btn" className="transaction-submit-btn" disabled={!txConfirm || submitting} onClick={onSubmitTx}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
          <button type="button" id="action_search_btn" className="transaction-search-btn" onClick={onSearch} disabled={searchLoading}>
            Search
          </button>
        </div>
      </div>
    </div>
  );
}
