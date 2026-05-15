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
  const reserveReverseColumnClass = showStandardFromAndReverse || standardHidden ? " tx-add-form-row--reserve-reverse" : "";

  return (
    <div className="transaction-add-section">
      {/* Row: Type | Date range (standard + RATE 同一套 outlined + transaction-date-range-group；两 picker 同页挂载供 init 绑定) */}
      <div className={`tx-add-form-row tx-add-form-row--pair${reserveReverseColumnClass}`}>
        <div className="report-outlined-anchor tx-add-field-col">
          <div className="report-outlined-shell report-outlined-shell--no-label">
            <div className="report-outlined-inner">
              <div className="tx-add-icon-field">
                <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-exchange-alt" /></span>
                <select
                  id="transaction_type"
                  className="transaction-select"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                  aria-label="Type"
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

        <div className="report-outlined-anchor tx-add-field-col">
          <div className="report-outlined-shell report-outlined-shell--no-label">
            <div className="report-outlined-inner">
              <div
                className="transaction-date-range-group tx-add-date-range-stack"
                style={{ display: txType === "RATE" ? "none" : "block" }}
                aria-hidden={txType === "RATE"}
              >
                <div
                  className="date-range-picker"
                  id="add-tx-date-range-picker"
                  role="button"
                  tabIndex={0}
                  aria-label="Date range"
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
              <div
                className="transaction-date-range-group tx-add-date-range-stack"
                style={{ display: txType === "RATE" ? "block" : "none" }}
                aria-hidden={txType !== "RATE"}
              >
                <div
                  className="date-range-picker"
                  id="rate-tx-date-range-picker"
                  role="button"
                  tabIndex={0}
                  aria-label="Date range"
                  data-drp-from="rate_tx_date_from"
                  data-drp-to="rate_tx_date_to"
                  data-drp-display="rate-tx-date-range-display"
                  data-drp-hide-presets="true"
                >
                  <i className="fas fa-calendar-alt" />
                  <span id="rate-tx-date-range-display" />
                  <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                </div>
                <input type="hidden" id="rate_tx_date_from" readOnly aria-hidden="true" />
                <input type="hidden" id="rate_tx_date_to" readOnly aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        id="standard-transaction-fields"
        className="tx-add-standard-fields-stack"
        style={{
          display: standardHidden ? "none" : "flex",
        }}
      >
        {/* Row: To Account | From Account | Reverse */}
        <div className={`tx-add-form-row tx-add-form-row--accounts${showStandardFromAndReverse ? " tx-add-form-row--with-reverse" : ""}`}>
          <div className="report-outlined-anchor tx-add-field-col">
            <div className="report-outlined-shell report-outlined-shell--no-label">
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-minus" /></span>
                  <AccountSelect
                    ariaLabel="To Account"
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
                <div className="report-outlined-shell report-outlined-shell--no-label">
                  <div className="report-outlined-inner">
                    <div className="tx-add-icon-field">
                      <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-plus" /></span>
                      <AccountSelect
                        ariaLabel="From Account"
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
            <div className="report-outlined-shell report-outlined-shell--no-label">
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-coins" /></span>
                  <select
                    id="transaction_currency"
                    className="transaction-select"
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value)}
                    aria-label="Currency"
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
            <div className="report-outlined-shell report-outlined-shell--no-label">
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-dollar-sign" /></span>
                  <input
                    type="number"
                    step="0.01"
                    id="action_amount"
                    className="transaction-input"
                    placeholder="amount"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    aria-label="Amount"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row: Remark (full width) */}
        <div className="tx-add-form-row" id="remark_form_group">
          <div className="report-outlined-anchor tx-add-field-col tx-add-field-col--full">
            <div className="report-outlined-shell report-outlined-shell--no-label">
              <div className="report-outlined-inner">
                <div className="tx-add-icon-field">
                  <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-pen" /></span>
                  <input
                    type="text"
                    id="action_sms"
                    className="transaction-input text-uppercase"
                    placeholder="Remarks"
                    value={txRemark}
                    onChange={(e) => setTxRemark(e.target.value.toUpperCase())}
                    aria-label="Remark"
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
        <div className="rate-section rate-section--accounts-outlined">
          <div className="tx-add-form-row tx-add-form-row--accounts tx-add-form-row--with-reverse">
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell">
                <span className="report-outlined-label report-outlined-label--tx-add-icon" id="rate-line1-to-acc-label">
                  To Account
                </span>
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-minus" /></span>
                    <AccountSelect
                      ariaLabelledBy="rate-line1-to-acc-label"
                      placeholder="--Select To Account--"
                      options={accountOptions}
                      value={rateToAccount}
                      onChange={setRateToAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell">
                <span className="report-outlined-label report-outlined-label--tx-add-icon" id="rate-line1-from-acc-label">
                  From Account
                </span>
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-plus" /></span>
                    <AccountSelect
                      ariaLabelledBy="rate-line1-from-acc-label"
                      placeholder="--Select From Account--"
                      options={accountOptions}
                      value={rateFromAccount}
                      onChange={setRateFromAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              id="rate_account_reverse_btn"
              className="transaction-account-reverse-btn tx-add-account-reverse rate-reverse-btn"
              title="Reverse accounts"
              aria-label="Reverse accounts"
              onClick={() => {
                setRateToAccount(rateFromAccount);
                setRateFromAccount(rateToAccount);
                onRateCurrencyRowReverse?.();
              }}
            >
              Reverse
            </button>
          </div>
        </div>

        <div className="rate-section rate-section--currency-outlined">
          <div className="tx-add-form-row tx-add-form-row--rate-five-cols">
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-coins" /></span>
                    <select
                      id="rate_currency_from"
                      className="transaction-select"
                      value={rateCurrencyFrom}
                      onChange={(e) => setRateCurrencyFrom(e.target.value)}
                      aria-label="From currency"
                    >
                      <option value="">--Select--</option>
                      {currencyOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-dollar-sign" /></span>
                    <input
                      type="number"
                      step="0.01"
                      id="rate_currency_from_amount"
                      className="transaction-input"
                      placeholder="Amount"
                      value={rateCurrencyFromAmount}
                      onChange={(e) => setRateCurrencyFromAmount(e.target.value)}
                      aria-label="From amount"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-exchange-alt" /></span>
                    <input
                      type="text"
                      inputMode="decimal"
                      id="rate_exchange_rate"
                      className="transaction-input"
                      placeholder="rate"
                      value={rateExchangeRateRaw}
                      onChange={(e) => setRateExchangeRateRaw(e.target.value)}
                      aria-label="Exchange rate"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-coins" /></span>
                    <select
                      id="rate_currency_to"
                      className="transaction-select"
                      value={rateCurrencyTo}
                      onChange={(e) => setRateCurrencyTo(e.target.value)}
                      aria-label="To currency"
                    >
                      <option value="">--Select--</option>
                      {currencyOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-dollar-sign" /></span>
                    <input
                      type="number"
                      step="0.01"
                      id="rate_currency_to_amount"
                      className="transaction-input"
                      placeholder="Amount"
                      readOnly
                      value={rateCurrencyToAmount}
                      aria-label="To amount"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rate-section rate-section--accounts-outlined">
          <div className="tx-add-form-row tx-add-form-row--accounts tx-add-form-row--with-reverse">
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell">
                <span className="report-outlined-label report-outlined-label--tx-add-icon" id="rate-line2-to-acc-label">
                  To Account
                </span>
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-minus" /></span>
                    <AccountSelect
                      ariaLabelledBy="rate-line2-to-acc-label"
                      placeholder="--Select To Account--"
                      options={accountOptions}
                      value={rateTransferToAccount}
                      onChange={setRateTransferToAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell">
                <span className="report-outlined-label report-outlined-label--tx-add-icon" id="rate-line2-from-acc-label">
                  From Account
                </span>
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-user-plus" /></span>
                    <AccountSelect
                      ariaLabelledBy="rate-line2-from-acc-label"
                      placeholder="--Select From Account--"
                      options={accountOptions}
                      value={rateTransferFromAccount}
                      onChange={setRateTransferFromAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              id="rate_transfer_reverse_btn"
              className="transaction-account-reverse-btn tx-add-account-reverse rate-reverse-btn"
              title="Reverse accounts"
              aria-label="Reverse accounts"
              onClick={() => {
                setRateTransferToAccount(rateTransferFromAccount);
                setRateTransferFromAccount(rateTransferToAccount);
              }}
            >
              Reverse
            </button>
          </div>
        </div>

        <div className="rate-section rate-section--middleman-outlined">
          <div className="tx-add-form-row tx-add-form-row--rate-three-cols">
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-handshake" /></span>
                    <AccountSelect
                      ariaLabel="Middle-man account"
                      placeholder="Middleman Account"
                      options={accountOptions}
                      value={rateMiddlemanAccount}
                      onChange={setRateMiddlemanAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-percent" /></span>
                    <input
                      type="number"
                      step="0.0001"
                      id="rate_middleman_rate"
                      className="transaction-input"
                      placeholder="Rate multiplier"
                      value={rateMiddlemanRate}
                      onChange={(e) => setRateMiddlemanRate(e.target.value)}
                      aria-label="Rate multiplier"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="report-outlined-anchor tx-add-field-col">
              <div className="report-outlined-shell report-outlined-shell--no-label">
                <div className="report-outlined-inner">
                  <div className="tx-add-icon-field">
                    <span className="tx-add-input-icon" aria-hidden="true"><i className="fas fa-dollar-sign" /></span>
                    <input
                      type="number"
                      step="0.01"
                      id="rate_middleman_amount"
                      className="transaction-input"
                      placeholder="Amount"
                      readOnly
                      value={rateMiddlemanAmount}
                      aria-label="Middle-man amount"
                    />
                  </div>
                </div>
              </div>
            </div>
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
