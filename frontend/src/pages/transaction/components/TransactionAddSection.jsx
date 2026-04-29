import AccountSelect from "../AccountSelect.jsx";

export default function TransactionAddSection({
  txType,
  setTxType,
  txDate,
  todayDmy,
  setTxDate,
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
  return (
    <div className="transaction-add-section">
      <div className="transaction-form-group">
        <label className="transaction-label">Type</label>
        <select id="transaction_type" className="transaction-select" value={txType} onChange={(e) => setTxType(e.target.value)}>
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

      <div id="standard-transaction-fields" style={{ display: txType === "RATE" ? "none" : "block" }}>
        <div className="transaction-form-group">
          <label className="transaction-label">Date</label>
          <input type="text" id="transaction_date" className="transaction-input" value={txDate || todayDmy} onChange={(e) => setTxDate(e.target.value)} placeholder="dd/mm/yyyy" readOnly style={{ cursor: "pointer" }} />
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Account</label>
          <div className="transaction-account-inputs">
            <AccountSelect buttonId="action_account_from" dropdownId="action_account_from_dropdown" placeholder="--Select To Account--" options={accountOptions} value={txToAccount} onChange={setTxToAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            {showStandardFromAndReverse ? (
              <>
                <AccountSelect buttonId="action_account_id" dropdownId="action_account_id_dropdown" placeholder="--Select From Account--" options={accountOptions} value={txFromAccount} onChange={setTxFromAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
                <button type="button" id="account_reverse_btn" className="transaction-account-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts" onClick={onReverseAccounts}>
                  Reverse
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Currency</label>
          <select id="transaction_currency" className="transaction-select" value={txCurrency} onChange={(e) => setTxCurrency(e.target.value)}>
            <option value="">--Select Currency--</option>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="transaction-form-group">
          <label className="transaction-label">Amount</label>
          <input type="number" step="0.01" id="action_amount" className="transaction-input" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
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
              <AccountSelect buttonId="rate_account_from" dropdownId="rate_account_from_dropdown" placeholder="--Select To Account--" options={accountOptions} value={rateToAccount} onChange={setRateToAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <div className="custom-select-wrapper">
              <AccountSelect buttonId="rate_account_to" dropdownId="rate_account_to_dropdown" placeholder="--Select From Account--" options={accountOptions} value={rateFromAccount} onChange={setRateFromAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <button type="button" id="rate_account_reverse_btn" className="transaction-account-reverse-btn rate-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts" onClick={() => { setRateToAccount(rateFromAccount); setRateFromAccount(rateToAccount); }}>
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
              <AccountSelect buttonId="rate_transfer_from_account" dropdownId="rate_transfer_from_account_dropdown" placeholder="--Select To Account--" options={accountOptions} value={rateTransferToAccount} onChange={setRateTransferToAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <div className="custom-select-wrapper">
              <AccountSelect buttonId="rate_transfer_to_account" dropdownId="rate_transfer_to_account_dropdown" placeholder="--Select From Account--" options={accountOptions} value={rateTransferFromAccount} onChange={setRateTransferFromAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
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
              <AccountSelect buttonId="rate_middleman_account" dropdownId="rate_middleman_account_dropdown" placeholder="--Select Account--" options={accountOptions} value={rateMiddlemanAccount} onChange={setRateMiddlemanAccount} selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories} />
            </div>
            <input type="number" step="0.0001" id="rate_middleman_rate" className="transaction-input" placeholder="Rate multiplier" value={rateMiddlemanRate} onChange={(e) => setRateMiddlemanRate(e.target.value)} />
            <input type="number" step="0.01" id="rate_middleman_amount" className="transaction-input" placeholder="Amount" readOnly value={rateMiddlemanAmount} />
          </div>
        </div>
      </div>

      <div className="transaction-two-col">
        {txType === "PROFIT" && (
          <div className="transaction-form-group">
            <label className="transaction-label">Win/Lose</label>
            <div className="transaction-win-lose-row">
              <label className="transaction-radio-label"><input type="radio" name="win_lose_side" value="WIN" checked={winLoseSide === "WIN"} onChange={() => setWinLoseSide("WIN")} />WIN</label>
              <label className="transaction-radio-label"><input type="radio" name="win_lose_side" value="LOSE" checked={winLoseSide === "LOSE"} onChange={() => setWinLoseSide("LOSE")} />LOSE</label>
            </div>
          </div>
        )}
        <div className="transaction-form-group" style={{ display: "none" }}>
          <label className="transaction-label">Description</label>
          <input type="text" id="action_description" className="transaction-input text-uppercase" />
        </div>
        <div className="transaction-form-group" id="remark_form_group" style={{ display: txType === "RATE" ? "none" : undefined }}>
          <label className="transaction-label">Remark</label>
          <input type="text" id="action_sms" className="transaction-input text-uppercase" value={txRemark} onChange={(e) => setTxRemark(e.target.value.toUpperCase())} />
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
