import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseRateExpression, buildClientRequestId, parseBalanceValue, countRateDecimalPlaces } from "../transactionFormat.js";
import { formatRateAmount } from "../transactionFormat.js";
import { buildRatePayload, toNumberLike } from "../transactionSubmitHelpers.js";
import { submitTransaction } from "../transactionApi.js";
import { transactionQueryKeys } from "../transactionQueryKeys.js";
import { MoneyDecimal } from "../../../utils/moneyDecimal.js";
import { resolveGridRowToAccountOption } from "../transactionPaymentLogic.js";

export function useTransactionForm({
  todayDmy,
  pushToast,
  onSearch,
  refreshContraInboxBadge,
  filterSnapshot,
  accountOptions,
}) {
  const [txType, setTxType] = useState("CONTRA");
  const [txDate, setTxDate] = useState(null);
  const [txToAccount, setTxToAccount] = useState(null);
  const [txFromAccount, setTxFromAccount] = useState(null);
  const [txCurrency, setTxCurrency] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txRemark, setTxRemark] = useState("");
  const [txConfirm, setTxConfirm] = useState(false);
  const [winLoseSide, setWinLoseSide] = useState("WIN");
  const [submitting, setSubmitting] = useState(false);

  const [rateDate, setRateDate] = useState(null);
  const [rateToAccount, setRateToAccount] = useState(null);
  const [rateFromAccount, setRateFromAccount] = useState(null);
  const [rateCurrencyFrom, setRateCurrencyFrom] = useState("");
  const [rateCurrencyTo, setRateCurrencyTo] = useState("");
  const [rateCurrencyFromAmount, setRateCurrencyFromAmount] = useState("");
  const [rateExchangeRateRaw, setRateExchangeRateRaw] = useState("");
  const [rateCurrencyToAmount, setRateCurrencyToAmount] = useState("");
  /** Legacy `rate_currency_to_amount.dataset.grossAmount` — submit uses this, not the net preview in `rateCurrencyToAmount`. */
  const [rateToAmountGrossStr, setRateToAmountGrossStr] = useState("");
  /** Legacy `rate_currency_from_amount.dataset` gross slot (only populated after RATE row Reverse swap). */
  const [rateFromAmountGrossStr, setRateFromAmountGrossStr] = useState("");

  const [rateTransferToAccount, setRateTransferToAccount] = useState(null);
  const [rateTransferFromAccount, setRateTransferFromAccount] = useState(null);

  const [rateMiddlemanAccount, setRateMiddlemanAccount] = useState(null);
  const [rateMiddlemanRate, setRateMiddlemanRate] = useState("");
  const [rateMiddlemanAmount, setRateMiddlemanAmount] = useState("");
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: ({ companyId, payload, clientRequestId }) => submitTransaction({ companyId, payload, clientRequestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
    },
  });

    const handleBalanceCellClick = useCallback(
    (row, side) => {
      if (filterSnapshot?.mutationsBlocked) return;
      if (!row) return;
      const isLeftTable = side === "left";
      const balanceAttr =
        row.balance_full != null && String(row.balance_full).trim() !== "" ? row.balance_full : row.balance;
      const rowCurrency =
        row.currency && String(row.currency).trim() ? String(row.currency).trim().toUpperCase() : "";
      const resolved = resolveGridRowToAccountOption(row, accountOptions);
      if (!resolved) {
        pushToast("Could not resolve account for this row", "error");
        return;
      }
      const accountCurrency = resolved.currency ? String(resolved.currency).trim().toUpperCase() : "";
      const syncCurrency = rowCurrency || accountCurrency || null;

      const parsedBalance = parseBalanceValue(balanceAttr);
      const isRateView = txType === "RATE";
      const isProfitType = !isRateView && txType === "PROFIT";
      const treatAsPositiveRow = isRateView
        ? isLeftTable
        : isProfitType
          ? (parsedBalance === null ? isLeftTable : parsedBalance >= 0)
          : isLeftTable;

      const parts = [];
      let amountSet = false;
      let amountDisplay = "";

      if (parsedBalance !== null) {
        const absStr = MoneyDecimal.abs(String(parsedBalance)).toString();
        amountDisplay = MoneyDecimal.formatFixedHalfUp(absStr, 2);
        amountSet = true;
      }

      if (isRateView) {
        if (treatAsPositiveRow) {
          setRateToAccount(resolved);
          setRateTransferFromAccount(resolved);
        } else {
          setRateFromAccount(resolved);
          setRateTransferToAccount(resolved);
        }
        if (amountSet) setRateCurrencyFromAmount(amountDisplay);
        if (syncCurrency) setRateCurrencyFrom(syncCurrency);
        parts.push(`${treatAsPositiveRow ? "From" : "To"} Account: ${row.account_id || resolved.account_id}`);
        if (amountSet) parts.push(`Amount: ${amountDisplay}`);
        if (syncCurrency) parts.push(`Currency: ${syncCurrency}`);
        if (parts.length) pushToast(`Synced ${parts.join(", ")}`, "success");
        else if (amountSet) pushToast(`Synced Amount: ${amountDisplay}`, "success");
        return;
      }

      if (treatAsPositiveRow) {
        setTxToAccount(resolved);
      } else {
        setTxFromAccount(resolved);
      }
      if (amountSet) setTxAmount(amountDisplay);
      if (syncCurrency) setTxCurrency(syncCurrency);

      parts.push(`${treatAsPositiveRow ? "From" : "To"} Account: ${row.account_id || resolved.account_id}`);
      if (amountSet) parts.push(`Amount: ${amountDisplay}`);
      if (syncCurrency) parts.push(`Currency: ${syncCurrency}`);
      if (parts.length) pushToast(`Synced ${parts.join(", ")}`, "success");
      else if (amountSet) pushToast(`Synced Amount: ${amountDisplay}`, "success");
    },
    [accountOptions, filterSnapshot?.mutationsBlocked, pushToast, txType],
  );

  const needsFromTo = ["CONTRA", "PAYMENT", "RECEIVE", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
  const showStandardFromAndReverse = txType !== "RATE" && needsFromTo;
  const isAdjustment = txType === "ADJUSTMENT";

  const onReverseAccounts = useCallback(() => {
    if (filterSnapshot?.mutationsBlocked) return;
    const to = txToAccount;
    const from = txFromAccount;
    setTxToAccount(from);
    setTxFromAccount(to);
  }, [filterSnapshot?.mutationsBlocked, txToAccount, txFromAccount]);

  // RATE: legacy `initMiddleManAmountCalculation` — MoneyDecimal chain, middle-man then gross/net preview.
  useEffect(() => {
    if (txType !== "RATE") return;

    const clean = (v) => String(v ?? "").replace(/,/g, "").trim();

    let middleStr = "";
    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      const mmrDec = MoneyDecimal.toDecimal(clean(rateMiddlemanRate) || "0", 0);
      if (fromDec.gt(0) && mmrDec.gt(0)) {
        middleStr = formatRateAmount(fromDec.times(mmrDec).toString());
      }
    } catch {
      middleStr = "";
    }
    setRateMiddlemanAmount(middleStr);

    const parsed = parseRateExpression(rateExchangeRateRaw);
    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      if (!parsed.valid || !fromDec.gt(0)) {
        setRateCurrencyToAmount("");
        setRateToAmountGrossStr("");
        return;
      }
      const rateDec = MoneyDecimal.toDecimal(parsed.value, 0);
      if (!rateDec.gt(0)) {
        setRateCurrencyToAmount("");
        setRateToAmountGrossStr("");
        return;
      }
      const gross = fromDec.times(rateDec);
      const grossDisplayStr = formatRateAmount(gross.toString());
      setRateToAmountGrossStr(grossDisplayStr);

      let displayVal = gross;
      if (middleStr) {
        try {
          const fee = MoneyDecimal.toDecimal(middleStr.replace(/,/g, ""), 0);
          if (fee.gt(0)) displayVal = gross.minus(fee);
        } catch {
          /* ignore */
        }
      }
      setRateCurrencyToAmount(formatRateAmount(displayVal.toString()));
    } catch {
      setRateCurrencyToAmount("");
      setRateToAmountGrossStr("");
    }
  }, [txType, rateCurrencyFromAmount, rateExchangeRateRaw, rateMiddlemanRate]);

  const onRateCurrencyRowReverse = useCallback(() => {
    const tmpAmt = rateCurrencyFromAmount;
    setRateCurrencyFromAmount(rateCurrencyToAmount);
    setRateCurrencyToAmount(tmpAmt);
    const tmpGrossTo = rateToAmountGrossStr;
    setRateToAmountGrossStr(rateFromAmountGrossStr);
    setRateFromAmountGrossStr(tmpGrossTo);
  }, [rateCurrencyFromAmount, rateCurrencyToAmount, rateToAmountGrossStr, rateFromAmountGrossStr]);

  const onSubmitTx = async () => {
    if (!txConfirm) return;
    if (submitting) return;
    if (filterSnapshot?.mutationsBlocked) {
      pushToast("Read-only mode: cannot submit transactions", "error");
      return;
    }

    const companyId = filterSnapshot?.companyId;
    if (!companyId) return;

    if (!txType) {
      pushToast("Please select transaction type", "error");
      return;
    }

    const toId = txToAccount?.id ? String(txToAccount.id) : "";
    const fromId = txFromAccount?.id ? String(txFromAccount.id) : "";

    if (!toId) {
      pushToast("Please select To Account", "error");
      return;
    }

    const needsFromTo = ["CONTRA", "PAYMENT", "RECEIVE", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
    const isAdjustment = txType === "ADJUSTMENT";

    if (txType === "PROFIT") {
      if (!fromId) {
        pushToast("PROFIT: Please select From Account", "error");
        return;
      }
      if (toId && fromId && toId === fromId) {
        pushToast("PROFIT: Select To Account and Select From Account cannot be the same", "error");
        return;
      }
    }

    if (needsFromTo && (!fromId || fromId === toId)) {
      pushToast("PAYMENT/RECEIVE/CONTRA/CLAIM/CLEAR transaction requires From Account", "error");
      return;
    }

    if (!txDate) {
      pushToast("Please select transaction date", "error");
      return;
    }

    if (txType === "RATE") {
      const toId = rateToAccount?.id ? String(rateToAccount.id) : "";
      const fromId = rateFromAccount?.id ? String(rateFromAccount.id) : "";
      if (!toId) {
        pushToast("Please select To Account", "error");
        return;
      }
      if (!fromId) {
        pushToast("Rate transaction requires From Account", "error");
        return;
      }
      if (!rateCurrencyFrom || !rateCurrencyTo) {
        pushToast("Please select both currencies", "error");
        return;
      }
      const fromAmt = toNumberLike(rateCurrencyFromAmount);
      const toGrossRaw = String(rateToAmountGrossStr || "").trim().replace(/,/g, "");
      const toGrossStr = toGrossRaw !== "" ? toGrossRaw : String(rateCurrencyToAmount || "").trim().replace(/,/g, "");
      const grossNum = toNumberLike(toGrossStr);
      if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(grossNum) || grossNum <= 0) {
        pushToast("Please enter valid currency amounts", "error");
        return;
      }
      const parsedRate = parseRateExpression(rateExchangeRateRaw);
      if (!parsedRate.valid) {
        pushToast("Please enter a valid rate value (supports * and /, max 8 decimal places)", "error");
        return;
      }
      if (!rateDate) {
        pushToast("Please select transaction date", "error");
        return;
      }

      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

      if ((middleId || String(rateMiddlemanRate || "").trim()) && !middleId) {
        pushToast("Please select Middle-Man account", "error");
        return;
      }
      if ((middleId || String(rateMiddlemanRate || "").trim()) && (!rateMiddlemanRate || Number(rateMiddlemanRate) <= 0)) {
        pushToast("Please enter Middle-Man rate multiplier", "error");
        return;
      }
      const mmrNorm = String(rateMiddlemanRate ?? "")
        .replace(/,/g, "")
        .trim();
      if (middleId && mmrNorm !== "" && countRateDecimalPlaces(mmrNorm) > 8) {
        pushToast("Middle-Man rate supports max 8 decimal places", "error");
        return;
      }

      setSubmitting(true);
      try {
        const clientRequestId = buildClientRequestId();
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
        });

        const res = await submitMutation.mutateAsync({ companyId, payload, clientRequestId });
        if (res?.success) {
          const approvalStatus = res?.data?.approval_status ? String(res.data.approval_status).toUpperCase() : "";
          if (approvalStatus === "PENDING") {
            pushToast("Submitted. Waiting for Manager+ approval to take effect.", "info");
          } else {
            pushToast(res?.message || "RATE transaction submitted successfully", "success");
          }
          await refreshContraInboxBadge();
          setTxConfirm(false);
          setRateCurrencyFromAmount("");
          setRateExchangeRateRaw("");
          setRateCurrencyToAmount("");
          setRateToAmountGrossStr("");
          setRateFromAmountGrossStr("");
          setRateMiddlemanRate("");
          setRateMiddlemanAmount("");
          setRateToAccount(null);
          setRateFromAccount(null);
          setRateTransferToAccount(null);
          setRateTransferFromAccount(null);
          setRateMiddlemanAccount(null);
          await onSearch({ forceRefresh: true });
          return;
        }
        pushToast(res?.message || "Submit failed", "error");
      } catch (e) {
        console.error(e);
        pushToast("Network error. Please try again.", "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const amountStr = String(txAmount ?? "").trim();
    const n = Number(amountStr);
    if (!Number.isFinite(n) || amountStr === "") {
      pushToast(isAdjustment ? "Please enter a non-zero adjustment amount" : "Please enter a valid amount (>= 0)", "error");
      return;
    }
    if (!isAdjustment && n < 0) {
      pushToast("Please enter a valid amount (>= 0)", "error");
      return;
    }
    if (isAdjustment && n === 0) {
      pushToast("Please enter a non-zero adjustment amount", "error");
      return;
    }

    if (!txCurrency) {
      pushToast("Please select Currency", "error");
      return;
    }

    setSubmitting(true);
    try {
      const clientRequestId = buildClientRequestId();
      const payload = {
        transaction_type: txType === "PROFIT" ? winLoseSide : txType,
        account_id: toId,
        from_account_id: isAdjustment ? "" : fromId || "",
        amount: txAmount,
        transaction_date: txDate,
        description: "",
        sms: txRemark,
        currency: txCurrency,
      };

      const res = await submitMutation.mutateAsync({ companyId, payload, clientRequestId });
      if (res?.success) {
        const approvalStatus = res?.data?.approval_status ? String(res.data.approval_status).toUpperCase() : "";
        if (approvalStatus === "PENDING") {
          pushToast("Submitted. Waiting for Manager+ approval to take effect.", "info");
        } else {
          pushToast(res?.message || "Transaction submitted successfully", "success");
        }
        await refreshContraInboxBadge();
        setTxAmount("");
        setTxConfirm(false);
        await onSearch({ forceRefresh: true });
        return;
      }
      pushToast(res?.message || "Submit failed", "error");
    } catch (e) {
      console.error(e);
      pushToast("Network error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    txType,
    setTxType,
    txDate,
    setTxDate,
    txToAccount,
    setTxToAccount,
    txFromAccount,
    setTxFromAccount,
    txCurrency,
    setTxCurrency,
    txAmount,
    setTxAmount,
    txRemark,
    setTxRemark,
    txConfirm,
    setTxConfirm,
    winLoseSide,
    setWinLoseSide,
    submitting,
    setSubmitting,
    needsFromTo,
    showStandardFromAndReverse,
    isAdjustment,
    onReverseAccounts,
    rateDate,
    setRateDate,
    rateToAccount,
    setRateToAccount,
    rateFromAccount,
    setRateFromAccount,
    rateCurrencyFrom,
    setRateCurrencyFrom,
    rateCurrencyTo,
    setRateCurrencyTo,
    rateCurrencyFromAmount,
    setRateCurrencyFromAmount,
    rateExchangeRateRaw,
    setRateExchangeRateRaw,
    rateCurrencyToAmount,
    setRateCurrencyToAmount,
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
    setRateMiddlemanAmount,
    onSubmitTx,
    handleBalanceCellClick,
  };
}
