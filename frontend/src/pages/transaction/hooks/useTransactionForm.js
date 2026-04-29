import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseRateExpression, buildClientRequestId } from "../transactionFormat.js";
import { formatRateAmount } from "../transactionFormat.js";
import { buildRatePayload, toNumberLike } from "../transactionSubmitHelpers.js";
import { submitTransaction } from "../transactionApi.js";

export function useTransactionForm({
  todayDmy,
  pushToast,
  onSearch,
  refreshContraInboxBadge,
  filterSnapshot,
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

  const [rateTransferToAccount, setRateTransferToAccount] = useState(null);
  const [rateTransferFromAccount, setRateTransferFromAccount] = useState(null);

  const [rateMiddlemanAccount, setRateMiddlemanAccount] = useState(null);
  const [rateMiddlemanRate, setRateMiddlemanRate] = useState("");
  const [rateMiddlemanAmount, setRateMiddlemanAmount] = useState("");
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: ({ companyId, payload, clientRequestId }) => submitTransaction({ companyId, payload, clientRequestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tx-search"] });
      queryClient.invalidateQueries({ queryKey: ["tx-contra-inbox"] });
    },
  });

  const handleBalanceCellClick = useCallback((account, side) => {
    if (!account) return;
    if (side === "left") {
      setTxToAccount(account);
      setTxCurrency(account.currency || "");
      setTxAmount(String(account.balance || ""));
    } else {
      setTxFromAccount(account);
      setTxCurrency(account.currency || "");
      setTxAmount(String(account.balance || ""));
    }
  }, []);

  const needsFromTo = ["CONTRA", "PAYMENT", "RECEIVE", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
  const showStandardFromAndReverse = txType !== "RATE" && needsFromTo;
  const isAdjustment = txType === "ADJUSTMENT";

  const onReverseAccounts = useCallback(() => {
    const to = txToAccount;
    const from = txFromAccount;
    setTxToAccount(from);
    setTxFromAccount(to);
  }, [txToAccount, txFromAccount]);

  const prevTxTypeRef = useRef(txType);
  const fpTxDateRef = useRef(null);
  const fpRateDateRef = useRef(null);

  // Rate calculation effects
  useEffect(() => {
    if (txType !== "RATE") return;
    const parsed = parseRateExpression(rateExchangeRateRaw);
    const fromAmt = Number(String(rateCurrencyFromAmount || "").replace(/,/g, "").trim());
    if (!parsed.valid || !Number.isFinite(fromAmt) || fromAmt <= 0) {
      setRateCurrencyToAmount("");
      return;
    }
    const toAmt = fromAmt * parsed.value;
    setRateCurrencyToAmount(formatRateAmount(toAmt));
  }, [txType, rateExchangeRateRaw, rateCurrencyFromAmount]);

  useEffect(() => {
    if (txType !== "RATE") return;
    const base = Number(String(rateCurrencyFromAmount || "").replace(/,/g, "").trim());
    const mult = Number(String(rateMiddlemanRate || "").replace(/,/g, "").trim());
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(mult) || mult <= 0) {
      setRateMiddlemanAmount("");
      return;
    }
    setRateMiddlemanAmount(formatRateAmount(base * mult));
  }, [txType, rateCurrencyFromAmount, rateMiddlemanRate]);

  const onSubmitTx = async () => {
    if (!txConfirm) return;
    if (submitting) return;

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
      const toAmt = toNumberLike(rateCurrencyToAmount);
      if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(toAmt) || toAmt <= 0) {
        pushToast("Please enter valid currency amounts", "error");
        return;
      }
      const parsedRate = parseRateExpression(rateExchangeRateRaw);
      if (!parsedRate.valid) {
        pushToast("Please enter a valid rate value (supports * and /)", "error");
        return;
      }
      if (!rateDate) {
        pushToast("Please select transaction date", "error");
        return;
      }

      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

      if ((middleId || rateMiddlemanRate) && !middleId) {
        pushToast("Please select Middle-Man account", "error");
        return;
      }
      if ((middleId || rateMiddlemanRate) && (!rateMiddlemanRate || Number(rateMiddlemanRate) <= 0)) {
        pushToast("Please enter Middle-Man rate multiplier", "error");
        return;
      }

      setSubmitting(true);
      try {
        const clientRequestId = buildClientRequestId();
        const { payload } = buildRatePayload({
          toId,
          fromId,
          fromAmt,
          toAmt,
          rateDate,
          txRemark,
          rateCurrencyFrom,
          rateCurrencyTo,
          parsedRateValue: parsedRate.value,
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
          setRateMiddlemanRate("");
          setRateMiddlemanAmount("");
          setRateToAccount(null);
          setRateFromAccount(null);
          setRateTransferToAccount(null);
          setRateTransferFromAccount(null);
          setRateMiddlemanAccount(null);
          await onSearch();
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
        await onSearch();
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
    prevTxTypeRef,
    fpTxDateRef,
    fpRateDateRef,
    onSubmitTx,
    handleBalanceCellClick,
  };
}
