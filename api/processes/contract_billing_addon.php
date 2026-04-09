<?php
/**
 * 1+N 合同（1+1 / 1+2 / 1+3）：首自然月若按「剩余天数」partial 入账，则在 partial 金额之上再叠加 N 个「整月」的 buy/sell/profit（全额，不再摊分；不含 insurance）。
 * 例 1+2、Sell 2000、4/9 起：首月 partial sell 1466.67 + 2×整月 2000 = 5466.67；Buy/Profit 同理按整月价叠加。
 * 仅 ratio&lt;1 时生效；manual_inactive 仍单独整笔乘 (1+N)。
 */

declare(strict_types=1);

/** 与 manual_inactive 相同：1+1/1+2/1+3 → (1+N)，其余 → 1 */
function getManualInactiveMultiplierFromContract(?string $contract): int
{
    if ($contract === null || $contract === '') {
        return 1;
    }
    $c = trim($contract);
    if (preg_match('/^1\+(\d+)$/i', $c, $m)) {
        return 1 + (int) $m[1];
    }
    return 1;
}

/**
 * 合同里「+」后面的 N：1+2 → 2 个整月加价；1+1 → 1。支持值如 "1+2 MONTHS"（前缀匹配）。
 */
function getContractOnePlusExtraFullMonths(?string $contract): int
{
    if ($contract === null || trim($contract) === '') {
        return 0;
    }
    $c = strtoupper(trim($contract));
    if (preg_match('/^1\+(\d+)/', $c, $m)) {
        return max(0, (int) $m[1]);
    }
    return 0;
}

/** 从 startYmd 到当月底（含）占当月天数的比例 */
function ratioRemainingDaysInMonthFromStartYmd(string $startYmd): ?float
{
    $ts = strtotime($startYmd);
    if ($ts === false) {
        return null;
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    if ($daysInMonth <= 0) {
        return null;
    }
    $daysRemaining = max(0, $daysInMonth - $dayOfMonth + 1);

    return $daysRemaining / $daysInMonth;
}

/**
 * @param float|null $prorationRatio 本次入账「剩余天数/当月天数」；null 或 ≥1 时不调整
 * @param float        $origCost      整月 Buy
 * @param float        $origPrice     整月 Sell
 * @param float        $origProfit    整月 Profit
 */
function applyOnePlusXRemainingDaysBuySellAddon(
    ?string $contract,
    float $origCost,
    float $origPrice,
    float $origProfit,
    float &$cost,
    float &$price,
    float &$profit,
    ?float $prorationRatio
): void {
    if ($prorationRatio === null || $prorationRatio >= 1.0 - 1e-9) {
        return;
    }
    $n = getContractOnePlusExtraFullMonths($contract);
    if ($n < 1) {
        return;
    }
    $price = round($price + $n * $origPrice, 2);
    $cost = round($cost + $n * $origCost, 2);
    $profit = round($profit + $n * $origProfit, 2);
}
