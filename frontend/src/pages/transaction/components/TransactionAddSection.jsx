import AccountSelect from "./AccountSelect.jsx";

export default function TransactionAddSection({
  txType,
  setTxType,
  todayDmy,
  txDate,
  rateDate,
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
  txRemark,
  setTxRemark,
  txConfirm,
  setTxConfirm,
  submitting,
  onSubmitTx,
  onSearch,
  searchLoading,
  mutationsBlocked = false,
}) {
  const standardHidden = txType === "RATE";
  const dateDisplayStandard = txDate?.trim() || todayDmy;
  const dateDisplayRate = rateDate?.trim() || todayDmy;

  return (
    <div className={`transaction-add-section${mutationsBlocked ? " transaction-add-section--read-only" : ""}`}>
      <div className="transaction-form-group">
        <label className="transaction-label" htmlFor="transaction_type">
          Type
        </label>
        <select
          id="transaction_type"
          className="transaction-select"
          value={txType}
          disabled={mutationsBlocked}
          onChange={(e) => setTxType(e.target.value)}
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

      <div id="standard-transaction-fields" style={{ display: standardHidden ? "none" : "block" }}>
        <div className="transaction-form-group">
          <label className="transaction-label" htmlFor="transaction_date">
            Date
          </label>
          <div className="transaction-add-datepicker-wrap">
            <input
              type="text"
              id="transaction_date"
              className="transaction-input"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              placeholder="dd/mm/yyyy"
              value={dateDisplayStandard}
            />
            <input type="hidden" id="add_tx_date_from" readOnly aria-hidden="true" />
            <input type="hidden" id="add_tx_date_to" readOnly aria-hidden="true" />
            <div
              className={`date-range-picker transaction-add-datepicker-hitbox${mutationsBlocked ? " transaction-add-datepicker-hitbox--read-only" : ""}`}
              id="add-tx-date-range-picker"
              role="button"
              tabIndex={mutationsBlocked ? -1 : 0}
              aria-label="Transaction date"
              data-drp-from="add_tx_date_from"
              data-drp-to="add_tx_date_to"
              data-drp-display="add-tx-date-range-display"
              data-drp-hide-presets="true"
              data-drp-collapse-single="true"
            >
              <span id="add-tx-date-range-display" className="transaction-add-datepicker-sr-span" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Account</label>
          <div className={`transaction-account-inputs${showStandardFromAndReverse ? "" : " transaction-account-inputs--to-only"}`}>
            <AccountSelect
              ariaLabel="To Account"
              placeholder="--Select To Account--"
              options={accountOptions}
              value={txToAccount}
              onChange={setTxToAccount}
              disabled={mutationsBlocked}
              selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
            />
            {showStandardFromAndReverse ? (
              <>
                <AccountSelect
                  ariaLabel="From Account"
                  placeholder="--Select From Account--"
                  options={accountOptions}
                  value={txFromAccount}
                  onChange={setTxFromAccount}
                  disabled={mutationsBlocked}
                  selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                />
                <button
                  type="button"
                  id="account_reverse_btn"
                  className="transaction-account-reverse-btn"
                  title="Reverse accounts"
                  aria-label="Reverse accounts"
                  disabled={mutationsBlocked}
                  onClick={onReverseAccounts}
                >
                  Reverse
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label" htmlFor="transaction_currency">
            Currency
          </label>
          <select
            id="transaction_currency"
            className="transaction-select"
            value={txCurrency}
            disabled={mutationsBlocked}
            onChange={(e) => setTxCurrency(e.target.value)}
          >
            <option value="">--Select Currency--</option>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="transaction-form-group">
          <label className="transaction-label" htmlFor="action_amount">
            Amount
          </label>
          <input
            type="number"
            step="0.01"
            id="action_amount"
            className="transaction-input"
            value={txAmount}
            disabled={mutationsBlocked}
            onChange={(e) => setTxAmount(e.target.value)}
          />
        </div>
      </div>

      <div id="rate-transaction-fields" className="rate-fields" style={{ display: txType === "RATE" ? "flex" : "none" }}>
        <div className="transaction-form-group">
          <label className="transaction-label" htmlFor="rate_transaction_date">
            Date
          </label>
          <div className="transaction-date-rate-wrap-inner">
            <input
              type="text"
              id="rate_transaction_date"
              className="transaction-input"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              placeholder="dd/mm/yyyy"
              value={dateDisplayRate}
            />
            <input type="hidden" id="rate_tx_date_from" readOnly aria-hidden="true" />
            <input type="hidden" id="rate_tx_date_to" readOnly aria-hidden="true" />
            <div
              className={`date-range-picker transaction-add-datepicker-hitbox${mutationsBlocked ? " transaction-add-datepicker-hitbox--read-only" : ""}`}
              id="rate-tx-date-range-picker"
              role="button"
              tabIndex={mutationsBlocked ? -1 : 0}
              aria-label="Rate transaction date"
              data-drp-from="rate_tx_date_from"
              data-drp-to="rate_tx_date_to"
              data-drp-display="rate-tx-date-range-display"
              data-drp-hide-presets="true"
              data-drp-collapse-single="true"
            >
              <span id="rate-tx-date-range-display" className="transaction-add-datepicker-sr-span" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Account</label>
          <div className="transaction-account-inputs">
            <AccountSelect
              ariaLabel="To Account"
              placeholder="--Select To Account--"
              options={accountOptions}
              value={rateToAccount}
              onChange={setRateToAccount}
              disabled={mutationsBlocked}
              selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
            />
            <AccountSelect
              ariaLabel="From Account"
              placeholder="--Select From Account--"
              options={accountOptions}
              value={rateFromAccount}
              onChange={setRateFromAccount}
              disabled={mutationsBlocked}
              selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
            />
            <button
              type="button"
              id="rate_account_reverse_btn"
              className="transaction-account-reverse-btn rate-reverse-btn"
              title="Reverse accounts"
              aria-label="Reverse accounts"
              disabled={mutationsBlocked}
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

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Currency</label>
          <div className="rate-row rate-row-five-cols">
            <select
              id="rate_currency_from"
              className="transaction-select"
              value={rateCurrencyFrom}
              disabled={mutationsBlocked}
              onChange={(e) => setRateCurrencyFrom(e.target.value)}
              aria-label="From currency"
            >
              <option value="">Currency</option>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              id="rate_currency_from_amount"
              className="transaction-input"
              placeholder="Amount"
              value={rateCurrencyFromAmount}
              disabled={mutationsBlocked}
              onChange={(e) => setRateCurrencyFromAmount(e.target.value)}
              aria-label="From amount"
            />
            <input
              type="text"
              inputMode="decimal"
              id="rate_exchange_rate"
              className="transaction-input"
              placeholder="Rate"
              value={rateExchangeRateRaw}
              disabled={mutationsBlocked}
              onChange={(e) => setRateExchangeRateRaw(e.target.value)}
              aria-label="Exchange rate"
            />
            <select
              id="rate_currency_to"
              className="transaction-select"
              value={rateCurrencyTo}
              disabled={mutationsBlocked}
              onChange={(e) => setRateCurrencyTo(e.target.value)}
              aria-label="To currency"
            >
              <option value="">Currency</option>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              id="rate_currency_to_amount"
              className="transaction-input"
              placeholder="Amount"
              readOnly
              disabled={mutationsBlocked}
              value={rateCurrencyToAmount}
              aria-label="To amount"
            />
          </div>
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Account</label>
          <div className="transaction-account-inputs">
            <AccountSelect
              ariaLabel="To Account"
              placeholder="--Select To Account--"
              options={accountOptions}
              value={rateTransferToAccount}
              onChange={setRateTransferToAccount}
              disabled={mutationsBlocked}
              selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
            />
            <AccountSelect
              ariaLabel="From Account"
              placeholder="--Select From Account--"
              options={accountOptions}
              value={rateTransferFromAccount}
              onChange={setRateTransferFromAccount}
              disabled={mutationsBlocked}
              selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
            />
            <button
              type="button"
              id="rate_transfer_reverse_btn"
              className="transaction-account-reverse-btn rate-reverse-btn"
              title="Reverse accounts"
              aria-label="Reverse accounts"
              disabled={mutationsBlocked}
              onClick={() => {
                setRateTransferToAccount(rateTransferFromAccount);
                setRateTransferFromAccount(rateTransferToAccount);
              }}
            >
              Reverse
            </button>
          </div>
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Middle-Man</label>
          <div className="rate-row rate-row-mm">
            <div className="rate-mm-to-wrap">
              <AccountSelect
                ariaLabel="Middle-Man account"
                placeholder="--Select Account--"
                options={accountOptions}
                value={rateMiddlemanAccount}
                onChange={setRateMiddlemanAccount}
                disabled={mutationsBlocked}
                selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
              />
            </div>
            <input
              type="number"
              step="0.0001"
              id="rate_middleman_rate"
              className="transaction-input"
              placeholder="Rate multiplier"
              value={rateMiddlemanRate}
              disabled={mutationsBlocked}
              onChange={(e) => setRateMiddlemanRate(e.target.value)}
              aria-label="Rate multiplier"
            />
            <input
              type="number"
              step="0.01"
              id="rate_middleman_amount"
              className="transaction-input"
              placeholder="Amount"
              readOnly
              disabled={mutationsBlocked}
              value={rateMiddlemanAmount}
              aria-label="Middle-man amount"
            />
          </div>
        </div>
      </div>

      <div className="transaction-form-group" style={{ display: "none" }}>
        <label className="transaction-label" htmlFor="action_description">
          Description
        </label>
        <input type="text" id="action_description" className="transaction-input text-uppercase" />
      </div>

      <div
        className="transaction-form-group"
        id="remark_form_group"
        style={{ display: txType === "RATE" ? "none" : undefined }}
      >
        <label className="transaction-label" htmlFor="action_sms">
          Remark
        </label>
        <input
          type="text"
          id="action_sms"
          className="transaction-input text-uppercase"
          value={txRemark}
          disabled={mutationsBlocked}
          onChange={(e) => setTxRemark(e.target.value.toUpperCase())}
        />
      </div>

      <div className="transaction-confirm-actions">
        <label className="transaction-checkbox-label transaction-confirm-label">
          <input
            type="checkbox"
            id="confirm_submit"
            className="transaction-checkbox"
            checked={txConfirm}
            disabled={mutationsBlocked}
            onChange={(e) => setTxConfirm(e.target.checked)}
          />
          Confirm Submit
        </label>
        <div className="transaction-action-btns">
          <button
            type="button"
            id="submit_btn"
            className="transaction-submit-btn"
            disabled={!txConfirm || submitting || mutationsBlocked}
            onClick={onSubmitTx}
          >
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
