import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import MoneyDecimal from "../../lib/money/moneyDecimal.js";
import {
  buildClientRequestId,
  countRateDecimalPlaces,
  formatDmy,
  formatRateAmount,
  parseRateExpression,
} from "../../lib/transactionFormat.js";
import { buildRatePayload, toNumberLike } from "../../lib/transactionSubmitHelpers.js";
import { formatYmd, parseYmd } from "../../lib/dashboardDateUtils.js";

const TX_TYPES = ["CONTRA", "PAYMENT", "CLAIM", "PROFIT", "RATE", "ADJUSTMENT", "CLEAR"];

function sanitizeAmountInput(value) {
  const raw = String(value ?? "").replace(/,/g, "");
  if (raw === "") return "";
  const filtered = raw.replace(/[^\d.-]/g, "");
  if (filtered === "") return "";
  const hasLeadingMinus = filtered.startsWith("-");
  let unsigned = filtered.replace(/-/g, "");
  const firstDotIdx = unsigned.indexOf(".");
  if (firstDotIdx !== -1) {
    unsigned = `${unsigned.slice(0, firstDotIdx + 1)}${unsigned.slice(firstDotIdx + 1).replace(/\./g, "")}`;
  }
  return hasLeadingMinus ? `-${unsigned}` : unsigned;
}

function AccountPicker({ label, placeholder, options, value, onChange, disabled }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    if (!needle) return options;
    return options.filter((o) => String(o.display_text || o.account_id || "").toUpperCase().includes(needle));
  }, [options, q]);

  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#2f6bf6] focus:ring-2 focus:ring-[#2f6bf6]/20"
      />
      <select
        value={value?.id ? String(value.id) : ""}
        disabled={disabled}
        onChange={(e) => {
          const id = e.target.value;
          onChange(options.find((o) => String(o.id) === id) || null);
        }}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] font-semibold outline-none focus:border-[#2f6bf6]"
      >
        <option value="">{placeholder}</option>
        {filtered.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.display_text || o.account_id}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function AddTransactionSheet({
  open,
  onClose,
  m,
  accountOptions = [],
  currencyOptions = [],
  mutationsBlocked = false,
  onSubmit,
  pushToast,
  onTypeSearch,
  typeSearchActive = false,
  onExitTypeSearch,
  prefill = null,
  onPrefillConsumed,
  entryIntent = "add",
}) {
  const bodyRef = useRef(null);
  const typeBlockRef = useRef(null);
  useOverlayLock(open, onClose);

  const [txType, setTxType] = useState("PAYMENT");
  const [txDateYmd, setTxDateYmd] = useState(formatYmd(new Date()));
  const [txToAccount, setTxToAccount] = useState(null);
  const [txFromAccount, setTxFromAccount] = useState(null);
  const [txCurrency, setTxCurrency] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txRemark, setTxRemark] = useState("");
  const [txConfirm, setTxConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rateStep, setRateStep] = useState(1);

  const [rateToAccount, setRateToAccount] = useState(null);
  const [rateFromAccount, setRateFromAccount] = useState(null);
  const [rateCurrencyFrom, setRateCurrencyFrom] = useState("");
  const [rateCurrencyTo, setRateCurrencyTo] = useState("");
  const [rateCurrencyFromAmount, setRateCurrencyFromAmount] = useState("");
  const [rateExchangeRateRaw, setRateExchangeRateRaw] = useState("");
  const [rateCurrencyToAmount, setRateCurrencyToAmount] = useState("");
  const [rateToAmountGrossStr, setRateToAmountGrossStr] = useState("");
  const [rateMiddlemanAccount, setRateMiddlemanAccount] = useState(null);
  const [rateMiddlemanRate, setRateMiddlemanRate] = useState("");
  const [rateMiddlemanAmount, setRateMiddlemanAmount] = useState("");
  const [rateMiddlemanInputAmount, setRateMiddlemanInputAmount] = useState("");
  const [rateTransferToAccount, setRateTransferToAccount] = useState(null);
  const [rateTransferFromAccount, setRateTransferFromAccount] = useState(null);

  const todayDmy = useMemo(() => formatDmy(new Date()), []);
  const txDate = useMemo(() => formatDmy(parseYmd(txDateYmd)), [txDateYmd]);
  const rateDate = txDate;

  const needsFromTo = ["CONTRA", "PAYMENT", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
  const isRate = txType === "RATE";
  const isAdjustment = txType === "ADJUSTMENT";

  const resetForm = useCallback(() => {
    setTxType("PAYMENT");
    setTxDateYmd(formatYmd(new Date()));
    setTxToAccount(null);
    setTxFromAccount(null);
    setTxCurrency("");
    setTxAmount("");
    setTxRemark("");
    setTxConfirm(false);
    setRateStep(1);
    setRateToAccount(null);
    setRateFromAccount(null);
    setRateCurrencyFrom("");
    setRateCurrencyTo("");
    setRateCurrencyFromAmount("");
    setRateExchangeRateRaw("");
    setRateCurrencyToAmount("");
    setRateToAmountGrossStr("");
    setRateMiddlemanAccount(null);
    setRateMiddlemanRate("");
    setRateMiddlemanAmount("");
    setRateMiddlemanInputAmount("");
    setRateTransferToAccount(null);
    setRateTransferFromAccount(null);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || entryIntent !== "search") return;
    const t = window.setTimeout(() => {
      typeBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, entryIntent]);

  useEffect(() => {
    if (!open || !prefill) return;

    const account = prefill.account || null;
    const amount = prefill.amount != null ? String(prefill.amount) : "";
    const currency = prefill.currency ? String(prefill.currency).toUpperCase() : "";
    const side = prefill.side === "right" ? "right" : "left";
    const fillTo = side === "left";

    if (txType === "RATE") {
      if (fillTo) {
        setRateToAccount(account);
        setRateTransferFromAccount(account);
      } else {
        setRateFromAccount(account);
        setRateTransferToAccount(account);
      }
      if (amount) setRateCurrencyFromAmount(amount);
      if (currency) setRateCurrencyFrom(currency);
    } else {
      if (fillTo) setTxToAccount(account);
      else setTxFromAccount(account);
      if (amount) setTxAmount(amount);
      if (currency) setTxCurrency(currency);
    }

    const label = fillTo ? m.toAccount : m.fromAccount;
    const parts = [];
    if (account?.account_id) parts.push(`${label}: ${account.account_id}`);
    if (amount) parts.push(`${m.amount}: ${amount}`);
    if (currency) parts.push(`${m.currency}: ${currency}`);
    if (parts.length) pushToast?.(parts.join(", "), "success");

    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per prefill payload
  }, [open, prefill]);

  useEffect(() => {
    if (!isRate) return;
    const clean = (v) => String(v ?? "").replace(/,/g, "").trim();
    let inputAmtDec = MoneyDecimal.toDecimal("0", 0);
    try {
      const inputStr = clean(rateMiddlemanInputAmount);
      if (inputStr) inputAmtDec = MoneyDecimal.toDecimal(inputStr, 0);
    } catch {
      /* ignore */
    }
    const parsed = parseRateExpression(rateExchangeRateRaw);
    let rateDec = MoneyDecimal.toDecimal("0", 0);
    if (parsed.valid) {
      try {
        rateDec = MoneyDecimal.toDecimal(parsed.value, 0);
      } catch {
        /* ignore */
      }
    }
    let baseFeeDec = MoneyDecimal.toDecimal("0", 0);
    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      const mmrDec = MoneyDecimal.toDecimal(clean(rateMiddlemanRate) || "0", 0);
      if (fromDec.gt(0) && mmrDec.gt(0)) baseFeeDec = fromDec.times(mmrDec);
    } catch {
      /* ignore */
    }
    let convertedInputAmtDec = inputAmtDec;
    if (inputAmtDec.gt(0) && rateDec.gt(0)) convertedInputAmtDec = inputAmtDec.times(rateDec);
    const finalFeeDec = baseFeeDec.plus(convertedInputAmtDec);
    let middleStr = "";
    if (!finalFeeDec.isZero()) middleStr = formatRateAmount(finalFeeDec.toString());
    else if (finalFeeDec.isZero() && (baseFeeDec.gt(0) || !inputAmtDec.isZero())) middleStr = "0.00";
    setRateMiddlemanAmount(middleStr);

    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      if (!parsed.valid || !fromDec.gt(0) || !rateDec.gt(0)) {
        setRateCurrencyToAmount("");
        setRateToAmountGrossStr("");
        return;
      }
      const baseGross = fromDec.times(rateDec);
      let finalGrossForBackend = baseGross;
      if (inputAmtDec.lt(0)) finalGrossForBackend = baseGross.plus(inputAmtDec);
      const grossDisplayStr = formatRateAmount(finalGrossForBackend.toString());
      setRateToAmountGrossStr(grossDisplayStr);
      let displayVal = finalGrossForBackend;
      if (!finalFeeDec.isZero()) displayVal = displayVal.minus(finalFeeDec);
      setRateCurrencyToAmount(formatRateAmount(displayVal.toString()));
    } catch {
      setRateCurrencyToAmount("");
      setRateToAmountGrossStr("");
    }
  }, [
    isRate,
    rateCurrencyFromAmount,
    rateExchangeRateRaw,
    rateMiddlemanRate,
    rateMiddlemanInputAmount,
  ]);

  const handleSubmit = async () => {
    if (!txConfirm || submitting || mutationsBlocked) return;

    if (isRate) {
      const toId = rateToAccount?.id ? String(rateToAccount.id) : "";
      const fromId = rateFromAccount?.id ? String(rateFromAccount.id) : "";
      if (!toId) return pushToast(m.pleaseSelectToAccount, "error");
      if (!fromId) return pushToast(m.rateTransactionNeedFromAccount, "error");
      if (!rateCurrencyFrom || !rateCurrencyTo) return pushToast(m.pleaseSelectBothCurrencies, "error");
      const fromAmt = toNumberLike(rateCurrencyFromAmount);
      const toGrossRaw = String(rateToAmountGrossStr || "").trim().replace(/,/g, "");
      const toGrossStr = toGrossRaw !== "" ? toGrossRaw : String(rateCurrencyToAmount || "").trim().replace(/,/g, "");
      const grossNum = toNumberLike(toGrossStr);
      if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(grossNum) || grossNum <= 0) {
        return pushToast(m.pleaseEnterValidCurrencyAmounts, "error");
      }
      const parsedRate = parseRateExpression(rateExchangeRateRaw);
      if (!parsedRate.valid) return pushToast(m.pleaseEnterValidRateValue, "error");
      if (!rateDate) return pushToast(m.pleaseSelectTransactionDate, "error");
      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";
      if ((middleId || String(rateMiddlemanRate || "").trim()) && !middleId) {
        return pushToast(m.pleaseSelectMiddleManAccount, "error");
      }
      if ((middleId || String(rateMiddlemanRate || "").trim()) && (!rateMiddlemanRate || Number(rateMiddlemanRate) <= 0)) {
        return pushToast(m.pleaseEnterMiddleManRate, "error");
      }
      const mmrNorm = String(rateMiddlemanRate ?? "").replace(/,/g, "").trim();
      if (middleId && mmrNorm !== "" && countRateDecimalPlaces(mmrNorm) > 8) {
        return pushToast(m.middleManRateMaxDecimals, "error");
      }

      setSubmitting(true);
      try {
        const { payload } = buildRatePayload({
          toId,
          fromId,
          fromAmt: rateCurrencyFromAmount,
          toGrossStr,
          rateDate,
          txRemark,
          rateCurrencyFrom,
          rateCurrencyTo,
          parsedRateNormalizedStr: parsedRate.value,
          rateMiddlemanRate,
          rateMiddlemanAmount,
          rateMiddlemanAccount,
          rateExchangeRateRaw,
          rateFromAccount,
          rateToAccount,
          rateTransferToAccount,
          rateTransferFromAccount,
          rateMiddlemanInputAmount,
        });
        const res = await onSubmit(payload, buildClientRequestId());
        if (res?.success) onClose?.();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const toId = txToAccount?.id ? String(txToAccount.id) : "";
    const fromId = txFromAccount?.id ? String(txFromAccount.id) : "";
    if (!toId) return pushToast(m.pleaseSelectToAccount, "error");
    if (txType === "PROFIT") {
      if (!fromId) return pushToast(m.profitPleaseSelectFromAccount, "error");
      if (toId === fromId) return pushToast(m.profitSameAccountError, "error");
    }
    if (needsFromTo && (!fromId || fromId === toId)) {
      return pushToast(m.paymentContraEtcNeedFromAccount, "error");
    }
    if (!txDate) return pushToast(m.pleaseSelectTransactionDate, "error");

    const cleanedAmt = MoneyDecimal.cleanMoneyInput(txAmount);
    if (cleanedAmt === "") {
      return pushToast(isAdjustment ? m.pleaseEnterNonZeroAdjustment : m.pleaseEnterValidAmount, "error");
    }
    let amtDec;
    try {
      amtDec = MoneyDecimal.toDecimal(cleanedAmt);
    } catch {
      return pushToast(m.pleaseEnterValidAmount, "error");
    }
    const isProfitTx = txType === "PROFIT";
    if (isAdjustment && amtDec.isZero()) return pushToast(m.pleaseEnterNonZeroAdjustment, "error");
    if (isProfitTx && amtDec.isZero()) return pushToast(m.profitEnterNonZeroAmount, "error");
    if (!isAdjustment && !isProfitTx && amtDec.lt(0)) {
      return pushToast(m.pleaseEnterValidAmountGteZero, "error");
    }
    if (!txCurrency) return pushToast(m.pleaseSelectCurrency, "error");

    setSubmitting(true);
    try {
      const payload = {
        transaction_type: isProfitTx ? (amtDec.lt(0) ? "LOSE" : "WIN") : txType,
        account_id: toId,
        from_account_id: isAdjustment ? "" : fromId || "",
        amount: isProfitTx ? MoneyDecimal.formatFixedHalfUp(amtDec.abs().toString(), 2) : txAmount,
        transaction_date: txDate,
        description: "",
        sms: txRemark,
        currency: txCurrency,
      };
      const res = await onSubmit(payload, buildClientRequestId());
      if (res?.success) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const isSearchMode = entryIntent === "search";
  const sheetTitle = isSearchMode
    ? m.searchTypeTitle || m.fabSearchPayment || m.search
    : m.addTransaction;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-slate-900/45 backdrop-blur-[2px]">
      <button type="button" className="min-h-0 flex-1" aria-label={m.close} onClick={onClose} />
      <div className="flex max-h-[90dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-[15px] font-bold text-slate-900">{sheetTitle}</p>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div ref={typeBlockRef}>
            <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.type}</label>
            <select
              value={txType}
              disabled={mutationsBlocked && !isSearchMode}
              onChange={(e) => {
                setTxType(e.target.value);
                setRateStep(1);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] font-bold outline-none"
            >
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              {isSearchMode ? null : (
                <button
                  type="button"
                  disabled={!txType}
                  onClick={() => onTypeSearch?.(txType)}
                  className="tap-scale flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-bold text-slate-700 disabled:opacity-40"
                >
                  {m.search}
                </button>
              )}
              {typeSearchActive ? (
                <button
                  type="button"
                  onClick={() => onExitTypeSearch?.()}
                  className="tap-scale flex-1 rounded-xl bg-amber-100 py-2.5 text-[12px] font-bold text-amber-800"
                  title={m.exitTypeSearchAndRefreshTitle}
                >
                  {m.exitTypeSearchAndRefresh}
                </button>
              ) : null}
            </div>
            {isSearchMode ? (
              <p className="mt-2 text-[11px] font-medium leading-snug text-slate-500">
                {m.fabSearchHint ||
                  "Pick a transaction type, then Search to filter accounts by that type."}
              </p>
            ) : null}
          </div>

          {isSearchMode ? null : (
            <>
          <div>
            <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.transactionDate}</label>
            <input
              type="date"
              value={txDateYmd}
              disabled={mutationsBlocked}
              onChange={(e) => setTxDateYmd(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
            />
            <p className="mt-1 text-[11px] text-slate-400">{todayDmy === txDate ? m.today : txDate}</p>
          </div>

          {!isRate && (
            <>
              <AccountPicker
                label={m.toAccount}
                placeholder={m.selectToAccount}
                options={accountOptions}
                value={txToAccount}
                onChange={setTxToAccount}
                disabled={mutationsBlocked}
              />
              {needsFromTo && (
                <AccountPicker
                  label={m.fromAccount}
                  placeholder={m.selectFromAccount}
                  options={accountOptions}
                  value={txFromAccount}
                  onChange={setTxFromAccount}
                  disabled={mutationsBlocked}
                />
              )}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.currency}</label>
                <select
                  value={txCurrency}
                  disabled={mutationsBlocked}
                  onChange={(e) => setTxCurrency(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] font-semibold"
                >
                  <option value="">{m.selectCurrency}</option>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.amount}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={txAmount}
                  disabled={mutationsBlocked}
                  onChange={(e) => setTxAmount(sanitizeAmountInput(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold tabular-nums"
                />
              </div>
            </>
          )}

          {isRate && rateStep === 1 && (
            <>
              <p className="text-[13px] font-semibold text-[#2f6bf6]">{m.rateStep1}</p>
              <AccountPicker
                label={m.toAccount}
                placeholder={m.selectToAccount}
                options={accountOptions}
                value={rateToAccount}
                onChange={setRateToAccount}
                disabled={mutationsBlocked}
              />
              <AccountPicker
                label={m.fromAccount}
                placeholder={m.selectFromAccount}
                options={accountOptions}
                value={rateFromAccount}
                onChange={setRateFromAccount}
                disabled={mutationsBlocked}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.from}</label>
                  <select
                    value={rateCurrencyFrom}
                    disabled={mutationsBlocked}
                    onChange={(e) => setRateCurrencyFrom(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
                  >
                    <option value="">{m.selectCurrency}</option>
                    {currencyOptions.map((c) => (
                      <option key={`f-${c}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.to}</label>
                  <select
                    value={rateCurrencyTo}
                    disabled={mutationsBlocked}
                    onChange={(e) => setRateCurrencyTo(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
                  >
                    <option value="">{m.selectCurrency}</option>
                    {currencyOptions.map((c) => (
                      <option key={`t-${c}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.amount}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateCurrencyFromAmount}
                  disabled={mutationsBlocked}
                  onChange={(e) => setRateCurrencyFromAmount(sanitizeAmountInput(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
                />
              </div>
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.rateMultiplier}</label>
                <input
                  type="text"
                  value={rateExchangeRateRaw}
                  disabled={mutationsBlocked}
                  onChange={(e) => setRateExchangeRateRaw(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
                />
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600">
                <span className="font-semibold">{m.to}:</span> {rateCurrencyToAmount || "—"}
              </div>
            </>
          )}

          {isRate && rateStep === 2 && (
            <>
              <p className="text-[13px] font-semibold text-[#2f6bf6]">{m.rateStep2}</p>
              <p className="text-[11px] text-slate-400">{m.optional}</p>
              <AccountPicker
                label={m.middleMan}
                placeholder={m.selectMiddleManAccount}
                options={accountOptions}
                value={rateMiddlemanAccount}
                onChange={setRateMiddlemanAccount}
                disabled={mutationsBlocked}
              />
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.rateMultiplier}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateMiddlemanRate}
                  disabled={mutationsBlocked}
                  onChange={(e) => setRateMiddlemanRate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
                />
              </div>
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.fee}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateMiddlemanInputAmount}
                  disabled={mutationsBlocked}
                  onChange={(e) => setRateMiddlemanInputAmount(sanitizeAmountInput(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-semibold"
                />
              </div>
              {rateMiddlemanAmount ? (
                <p className="text-[12px] text-slate-500">
                  {m.fee}: {rateMiddlemanAmount}
                </p>
              ) : null}
              <AccountPicker
                label={`${m.toAccount} (${m.optional})`}
                placeholder={m.selectToAccount}
                options={accountOptions}
                value={rateTransferToAccount}
                onChange={setRateTransferToAccount}
                disabled={mutationsBlocked}
              />
              <AccountPicker
                label={`${m.fromAccount} (${m.optional})`}
                placeholder={m.selectFromAccount}
                options={accountOptions}
                value={rateTransferFromAccount}
                onChange={setRateTransferFromAccount}
                disabled={mutationsBlocked}
              />
            </>
          )}

          <div>
            <label className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.remark}</label>
            <textarea
              value={txRemark}
              disabled={mutationsBlocked}
              onChange={(e) => setTxRemark(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus:border-[#2f6bf6]"
            />
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <input
              type="checkbox"
              checked={txConfirm}
              disabled={mutationsBlocked}
              onChange={(e) => setTxConfirm(e.target.checked)}
              className="size-5 rounded border-slate-300 text-[#2f6bf6]"
            />
            <span className="text-[13px] font-semibold text-slate-800">{m.confirmSubmit}</span>
          </label>
            </>
          )}
        </div>

        {isSearchMode ? (
          <div
            className="border-t border-slate-100 px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <button
              type="button"
              disabled={!txType}
              onClick={() => onTypeSearch?.(txType)}
              className="tap-scale w-full rounded-2xl bg-[#2f6bf6] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {m.search}
            </button>
          </div>
        ) : (
        <div
          className="flex gap-2 border-t border-slate-100 px-4 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          {isRate && rateStep === 2 && (
            <button
              type="button"
              onClick={() => setRateStep(1)}
              className="tap-scale flex-1 rounded-2xl bg-slate-100 py-3.5 text-[14px] font-bold text-slate-600"
            >
              {m.prevStep}
            </button>
          )}
          {isRate && rateStep === 1 ? (
            <button
              type="button"
              onClick={() => {
                const toId = rateToAccount?.id ? String(rateToAccount.id) : "";
                const fromId = rateFromAccount?.id ? String(rateFromAccount.id) : "";
                if (!toId) return pushToast(m.pleaseSelectToAccount, "error");
                if (!fromId) return pushToast(m.rateTransactionNeedFromAccount, "error");
                if (!rateCurrencyFrom || !rateCurrencyTo) {
                  return pushToast(m.pleaseSelectBothCurrencies, "error");
                }
                const fromAmt = toNumberLike(rateCurrencyFromAmount);
                if (!Number.isFinite(fromAmt) || fromAmt <= 0) {
                  return pushToast(m.pleaseEnterValidCurrencyAmounts, "error");
                }
                const parsedRate = parseRateExpression(rateExchangeRateRaw);
                if (!parsedRate.valid) return pushToast(m.pleaseEnterValidRateValue, "error");
                setRateStep(2);
              }}
              className="tap-scale flex-[2] rounded-2xl bg-[#2f6bf6] py-3.5 text-[14px] font-bold text-white"
            >
              {m.nextStep}
            </button>
          ) : (
            <button
              type="button"
              disabled={!txConfirm || submitting || mutationsBlocked}
              onClick={handleSubmit}
              className="tap-scale flex-[2] rounded-2xl bg-[#2f6bf6] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {submitting ? m.submitting : m.submit}
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
