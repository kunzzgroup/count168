import { formatRateAmount } from "./transactionFormat.js";

export function toNumberLike(raw) {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export function buildRatePayload({
  toId,
  fromId,
  fromAmt,
  toAmt,
  rateDate,
  txRemark,
  rateCurrencyFrom,
  rateCurrencyTo,
  parsedRateValue,
  rateMiddlemanRate,
  rateMiddlemanAmount,
  rateMiddlemanAccount,
  rateExchangeRateRaw,
  rateFromAccount,
  rateToAccount,
  rateTransferToAccount,
  rateTransferFromAccount,
}) {
  const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
  const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";
  const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

  let middleAmtNum = toNumberLike(rateMiddlemanAmount);
  if (!Number.isFinite(middleAmtNum)) middleAmtNum = 0;

  const fromCode = rateFromAccount?.account_id || "";
  const toCode = rateToAccount?.account_id || "";
  const fromDesc = `Transaction to ${toCode} (Rate: ${rateExchangeRateRaw})`;
  const toDesc = `Transaction from ${fromCode} (Rate: ${rateExchangeRateRaw})`;

  const transferFromCode = rateTransferFromAccount?.account_id || "";
  const transferToCode = rateTransferToAccount?.account_id || "";
  const transferFromDesc = `Transaction to ${transferToCode} (Rate: ${rateExchangeRateRaw})`;
  const transferToDesc = `Transaction from ${transferFromCode} (Rate: ${rateExchangeRateRaw})`;

  const middleDesc =
    middleId && middleAmtNum > 0
      ? `Rate charge (x${rateMiddlemanRate}) from ${rateCurrencyFrom} ${formatRateAmount(fromAmt)}`
      : "";

  const payload = {
    transaction_type: "RATE",
    account_id: toId,
    from_account_id: fromId,
    amount: formatRateAmount(fromAmt),
    transaction_date: rateDate,
    description: "",
    sms: txRemark,
    currency: rateCurrencyFrom,

    rate_from_account_id: fromId,
    rate_from_currency: rateCurrencyFrom,
    rate_from_amount: formatRateAmount(fromAmt),
    rate_from_description: fromDesc,

    rate_to_account_id: toId,
    rate_to_currency: rateCurrencyTo,
    rate_to_amount: formatRateAmount(toAmt),
    rate_to_description: toDesc,

    rate_currency_from: rateCurrencyFrom,
    rate_currency_from_amount: formatRateAmount(fromAmt),
    rate_currency_to: rateCurrencyTo,
    rate_currency_to_amount: formatRateAmount(toAmt),
    rate_exchange_rate: String(parsedRateValue),

    rate_middleman_rate: rateMiddlemanRate,
    rate_middleman_amount: rateMiddlemanAmount ? formatRateAmount(middleAmtNum) : "",
    rate_middleman_account: middleId,

    // backward compatibility (legacy keeps appending these)
    rate_transfer_amount: "",
    rate_account_from_amount: "",
    rate_account_to_amount: "",
  };

  if (transferToId && transferFromId) {
    const originalTransferFromAmount = fromAmt * parsedRateValue;
    payload.rate_transfer_from_account_id = transferToId;
    payload.rate_transfer_from_currency = rateCurrencyTo;
    payload.rate_transfer_from_amount = formatRateAmount(originalTransferFromAmount);
    payload.rate_transfer_from_description = transferFromDesc;

    payload.rate_transfer_to_account_id = transferFromId;
    payload.rate_transfer_to_currency = rateCurrencyTo;
    payload.rate_transfer_to_amount = formatRateAmount(toAmt);
    payload.rate_transfer_to_description = transferToDesc;

    payload.rate_transfer_from_account = transferToId;
    payload.rate_transfer_to_account = transferFromId;

    if (middleId && middleAmtNum > 0) {
      payload.rate_middleman_account_id = middleId;
      payload.rate_middleman_currency = rateCurrencyTo;
      payload.rate_middleman_amount = formatRateAmount(middleAmtNum);
      payload.rate_middleman_description = middleDesc;
    }
  }

  return { payload, middleId, middleAmtNum };
}
