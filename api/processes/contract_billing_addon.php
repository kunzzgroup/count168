<?php
/**
 * 1+X 合同（1+1 / 1+2 / 1+3）在「首自然月按剩余天数」摊分时的卖价加价：Sell = 整月卖价 + 摊分后利润（例 2000 + 733.33），利润收回为 price−cost。
 * 与 manual_inactive 入账的合约乘数语义一致；仅 ratio&lt;1 的 remaining-days 场景生效。
 */

declare(strict_types=1);

/** 与 manual_inactive 相同：1+1/1+2/1+3 → (1+X)，其余 → 1 */
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
 * @param float|null $prorationRatio 本次入账使用的「剩余天数/当月天数」；为 null 或 ≥1 时不调整
 */
function applyOnePlusXRemainingDaysSellAddon(?string $contract, float $origPrice, float &$cost, float &$price, float &$profit, ?float $prorationRatio): void
{
    if ($prorationRatio === null || $prorationRatio >= 1.0 - 1e-9) {
        return;
    }
    if (getManualInactiveMultiplierFromContract($contract) <= 1) {
        return;
    }
    $prProfit = $profit;
    $price = round($origPrice + $prProfit, 2);
    $profit = round($price - $cost, 2);
}
