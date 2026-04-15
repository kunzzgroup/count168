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

/**
 * 某自然月第 N 日（不超过该月最后一天）— 与 process_accounting_inbox_api 的 calendarMonthDueYmd 一致。
 */
function billingCalendarMonthDueYmd(int $year, int $month, int $dueDay): string
{
    $last = (int) date('t', mktime(0, 0, 0, $month, 1, $year));
    $d = min(max(1, $dueDay), $last);

    return sprintf('%04d-%02d-%02d', $year, $month, $d);
}

/**
 * Frequency=monthly（按同一日对月）：一期服务区间为「上一应付日到本期应付前一日」，
 * 不使用「从应付日到自然月末」的算法。首期应付若等于合同 day_start，区间为 [day_start, day_start+1月-1日]。
 *
 * @return array{0:string,1:string}
 */
function billingMonthlyAnniversaryInclusiveRangeFromDue(string $dueYmd, string $contractStartYmd): array
{
    try {
        if ($dueYmd === $contractStartYmd) {
            $s = new DateTimeImmutable($contractStartYmd);

            return [$contractStartYmd, $s->modify('+1 month')->modify('-1 day')->format('Y-m-d')];
        }
        $due = new DateTimeImmutable($dueYmd);

        return [$due->modify('-1 month')->format('Y-m-d'), $due->modify('-1 day')->format('Y-m-d')];
    } catch (Throwable $e) {
        return [$dueYmd, $dueYmd];
    }
}

/** 含首尾两日的天数；无效或 from>to 时返回 0 */
function billingInclusiveDaysBetween(string $fromYmd, string $toYmd): int
{
    $a = strtotime($fromYmd);
    $b = strtotime($toYmd);
    if ($a === false || $b === false || $fromYmd > $toYmd) {
        return 0;
    }

    return (int) round(($b - $a) / 86400) + 1;
}
