<?php
/**
 * 1+N 合同规则：
 * - active：统一按 1 个月价格计算；
 * - manual_inactive：仅在 inactive 赔付时，按 +N 月数放大（由 getManualInactiveMultiplierFromContract 控制）。
 */

declare(strict_types=1);

/** 与 manual_inactive 相同：1+1/1+2/1+3 → N，其余 → 1 */
function getManualInactiveMultiplierFromContract(?string $contract): int
{
    if ($contract === null || $contract === '') {
        return 1;
    }
    $c = trim($contract);
    if (preg_match('/^1\+(\d+)$/i', $c, $m)) {
        return max(1, (int) $m[1]);
    }
    return 1;
}

/** @deprecated active 场景不再使用 1+N 放大，仅保留兼容。 */
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
    // New rule: active billing always keeps 1-month amounts.
    // 1+N compensation is handled only in manual_inactive flow.
    return;
}
