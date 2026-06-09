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
function ratioRemainingDaysInMonthFromStartYmd(string $startYmd): ?string
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

    return money_div((string) $daysRemaining, (string) $daysInMonth, MONEY_CALC_SCALE);
}

/**
 * @param string|null $prorationRatio 本次入账「剩余天数/当月天数」；null 或 >=1 时不调整
 * @param string      $origCost       整月 Buy
 * @param string      $origPrice      整月 Sell
 * @param string      $origProfit     整月 Profit
 */
function applyOnePlusXRemainingDaysBuySellAddon(
    ?string $contract,
    string $origCost,
    string $origPrice,
    string $origProfit,
    string &$cost,
    string &$price,
    string &$profit,
    ?string $prorationRatio
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

/**
 * Monthly 对日对月：整期 [p0,p1] 对应一笔固定月价（cost/price/profit），仅按 [from,p1] 占整期的日历天数比例缩放。
 * 不可使用 prorateInclusiveDateRange：该函数按「每个自然月」切片乘整月价，跨两自然月的一期会得到比例之和 >1（如 1111→1125）。
 *
 * @return array{cost:string,price:string,profit:string,ratio:?string}
 */
function prorateMonthlyAnniversaryPeriodLinear(
    string $p0,
    string $p1,
    string $from,
    string $cost,
    string $price,
    string $profit
): array {
    if ($from > $p1) {
        return ['cost' => '0.00000000', 'price' => '0.00000000', 'profit' => '0.00000000', 'ratio' => null];
    }
    $adjFrom = $from < $p0 ? $p0 : $from;
    $fullD = billingInclusiveDaysBetween($p0, $p1);
    $useD = billingInclusiveDaysBetween($adjFrom, $p1);
    if ($fullD <= 0) {
        return ['cost' => '0.00000000', 'price' => '0.00000000', 'profit' => '0.00000000', 'ratio' => null];
    }
    $r = money_div((string) $useD, (string) $fullD, MONEY_CALC_SCALE);

    return [
        'cost' => money_mul($cost, $r, 2),
        'price' => money_mul($price, $r, 2),
        'profit' => money_mul($profit, $r, 2),
        'ratio' => $r,
    ];
}

/**
 * Monthly 对日对月：在整期 [p0,p1] 内仅对 [from,to]（与区间求交）占整期比例缩放。
 *
 * @return array{cost:string,price:string,profit:string,ratio:?string}
 */
function prorateMonthlyAnniversaryPeriodLinearBounded(
    string $p0,
    string $p1,
    string $from,
    string $to,
    string $cost,
    string $price,
    string $profit
): array {
    if ($from > $to || $to < $p0 || $from > $p1) {
        return ['cost' => '0.00000000', 'price' => '0.00000000', 'profit' => '0.00000000', 'ratio' => null];
    }
    $adjFrom = $from < $p0 ? $p0 : $from;
    $adjTo = $to > $p1 ? $p1 : $to;
    if ($adjFrom > $adjTo) {
        return ['cost' => '0.00000000', 'price' => '0.00000000', 'profit' => '0.00000000', 'ratio' => null];
    }
    $fullD = billingInclusiveDaysBetween($p0, $p1);
    $useD = billingInclusiveDaysBetween($adjFrom, $adjTo);
    if ($fullD <= 0 || $useD <= 0) {
        return ['cost' => '0.00000000', 'price' => '0.00000000', 'profit' => '0.00000000', 'ratio' => null];
    }
    $r = money_div((string) $useD, (string) $fullD, MONEY_CALC_SCALE);

    return [
        'cost' => money_mul($cost, $r, 2),
        'price' => money_mul($price, $r, 2),
        'profit' => money_mul($profit, $r, 2),
        'ratio' => $r,
    ];
}

/**
 * Resend consolidated / 任意闭区间：按 day_start 锚点逐期 [anchor, anchor+1月-1日] 累加；整期=整月价，尾段不足一期再比例。
 *
 * @return array{cost:string,price:string,profit:string}
 */
function sumMonthlyAnniversaryInclusiveRangeAmounts(
    string $rangeFromYmd,
    string $rangeToYmd,
    string $contractStartYmd,
    string $cost,
    string $price,
    string $profit
): array {
    $zero = ['cost' => '0.00000000', 'price' => '0.00000000', 'profit' => '0.00000000'];
    if ($rangeFromYmd > $rangeToYmd || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $contractStartYmd)) {
        return $zero;
    }
    try {
        $anchor = new DateTimeImmutable($contractStartYmd);
    } catch (Throwable $e) {
        return $zero;
    }
    $tc = '0.00000000';
    $tp = '0.00000000';
    $tf = '0.00000000';
    for ($i = 0; $i < 600; $i++) {
        $p0 = $anchor->format('Y-m-d');
        $p1 = $anchor->modify('+1 month')->modify('-1 day')->format('Y-m-d');
        if ($p1 < $rangeFromYmd) {
            $anchor = (new DateTimeImmutable($p1))->modify('+1 day');
            continue;
        }
        if ($p0 > $rangeToYmd) {
            break;
        }
        $chunk = prorateMonthlyAnniversaryPeriodLinearBounded(
            $p0,
            $p1,
            $rangeFromYmd,
            $rangeToYmd,
            $cost,
            $price,
            $profit
        );
        $tc = money_add($tc, $chunk['cost'], MONEY_CALC_SCALE);
        $tp = money_add($tp, $chunk['price'], MONEY_CALC_SCALE);
        $tf = money_add($tf, $chunk['profit'], MONEY_CALC_SCALE);
        if ($p1 >= $rangeToYmd) {
            break;
        }
        $anchor = (new DateTimeImmutable($p1))->modify('+1 day');
    }

    return [
        'cost' => money_normalize($tc, 2),
        'price' => money_normalize($tp, 2),
        'profit' => money_normalize($tf, 2),
    ];
}

/** Monthly 对日对月：从锚点 day_start 起一期的 inclusive 结束日（anchor+1月-1日）。 */
function billingMonthlyAnniversaryPeriodEndFromAnchor(string $anchorYmd): ?string
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $anchorYmd)) {
        return null;
    }
    try {
        return (new DateTimeImmutable($anchorYmd))->modify('+1 month')->modify('-1 day')->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/** Resend Monthly + day_start/day_end：day_end 须为从 day_start 起第 1/2/3… 期的标准结束日。 */
function billingMonthlyResendRangeComplete(string $dayStartYmd, string $dayEndYmd): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayStartYmd) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayEndYmd)) {
        return false;
    }
    if ($dayEndYmd < $dayStartYmd) {
        return false;
    }
    try {
        $anchor = new DateTimeImmutable($dayStartYmd);
    } catch (Throwable $e) {
        return false;
    }
    for ($i = 0; $i < 600; $i++) {
        $periodEnd = billingMonthlyAnniversaryPeriodEndFromAnchor($anchor->format('Y-m-d'));
        if ($periodEnd === null) {
            return false;
        }
        if ($dayEndYmd === $periodEnd) {
            return true;
        }
        if ($dayEndYmd < $periodEnd) {
            return false;
        }
        $anchor = (new DateTimeImmutable($periodEnd))->modify('+1 day');
    }

    return false;
}

/** Week frequency: inclusive period end (start + 6 days). */
function weekPeriodEndInclusiveYmd(string $startYmd): ?string
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startYmd)) {
        return null;
    }
    try {
        return (new DateTimeImmutable($startYmd))->modify('+6 days')->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/** Next period start = current period end (rolling anchor). */
function weekPeriodNextStartYmd(string $startYmd): ?string
{
    return weekPeriodEndInclusiveYmd($startYmd);
}

function weekPeriodIsReadyForAccounting(string $dueYmd, string $periodEndYmd, bool $resendRelax): bool
{
    if ($resendRelax) {
        return true;
    }
    $today = date('Y-m-d');

    return $today >= $periodEndYmd;
}

/** 周期 [due, periodEnd] 是否与指定自然月有重叠 */
function weekPeriodOverlapsCalendarMonth(string $dueYmd, string $periodEndYmd, int $year, int $month): bool
{
    $monthFirst = sprintf('%04d-%02d-01', $year, $month);
    $ts = mktime(0, 0, 0, $month, 1, $year);
    if ($ts === false) {
        return false;
    }
    $monthLast = date('Y-m-t', $ts);

    return $dueYmd <= $monthLast && $periodEndYmd >= $monthFirst;
}

function weekHasPostedOrSkippedForPeriodStart(PDO $pdo, int $companyId, int $processId, string $periodStartYmd): bool
{
    if ($periodStartYmd === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $periodStartYmd)) {
        return false;
    }
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return false;
        }
        $stmtCol = $pdo->query("SHOW COLUMNS FROM process_accounting_posted LIKE 'period_type'");
        $hasPeriodType = $stmtCol && $stmtCol->rowCount() > 0;
        if (!$hasPeriodType) {
            $stmt = $pdo->prepare(
                'SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?) LIMIT 1'
            );
            $stmt->execute([$companyId, $processId, $periodStartYmd]);

            return (bool) $stmt->fetch();
        }
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ?
             AND DATE(posted_date) = DATE(?)
             AND period_type IN ('weekly','weekly_skipped') LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $periodStartYmd]);

        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * 与 Inbox 一致：返回当前应入账的最早未结清周起点（Y-m-d）。
 */
function weekInferEarliestOpenBillingStartYmd(
    PDO $pdo,
    int $companyId,
    int $processId,
    string $contractStartYmd,
    string $createdYmd,
    string $today,
    bool $resendRelax = false
): ?string {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $contractStartYmd)) {
        return null;
    }
    $todayYear = (int) date('Y', strtotime($today));
    $todayMonth = (int) date('n', strtotime($today));
    $due = $contractStartYmd;
    for ($wi = 0; $wi < 520; $wi++) {
        $periodEnd = weekPeriodEndInclusiveYmd($due);
        if ($periodEnd === null) {
            break;
        }
        if (!$resendRelax && $periodEnd > $today) {
            break;
        }
        $eligible = false;
        if (weekPeriodIsReadyForAccounting($due, $periodEnd, $resendRelax)
            && weekPeriodOverlapsCalendarMonth($due, $periodEnd, $todayYear, $todayMonth)) {
            if (!$resendRelax && $due < $createdYmd) {
                try {
                    $cy = (int) date('Y', strtotime($createdYmd));
                    $cm = (int) date('n', strtotime($createdYmd));
                    if (!weekPeriodOverlapsCalendarMonth($due, $periodEnd, $cy, $cm)) {
                        $nextDue = weekPeriodNextStartYmd($due);
                        if ($nextDue === null || $nextDue <= $due) {
                            break;
                        }
                        $due = $nextDue;
                        continue;
                    }
                } catch (Throwable $e) {
                    $nextDue = weekPeriodNextStartYmd($due);
                    if ($nextDue === null || $nextDue <= $due) {
                        break;
                    }
                    $due = $nextDue;
                    continue;
                }
            }
            $eligible = true;
        }
        if ($eligible && !weekHasPostedOrSkippedForPeriodStart($pdo, $companyId, $processId, $due)) {
            return $due;
        }
        if ($periodEnd > $today && !$resendRelax) {
            break;
        }
        $nextDue = weekPeriodNextStartYmd($due);
        if ($nextDue === null || $nextDue <= $due) {
            break;
        }
        $due = $nextDue;
    }

    return null;
}

function calendarMonthFirstYmd(int $year, int $month): string
{
    return sprintf('%04d-%02d-01', $year, $month);
}

function dailyNextDayYmd(string $ymd): ?string
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) {
        return null;
    }
    try {
        return (new DateTimeImmutable($ymd))->modify('+1 day')->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function dailyAmountsForDayCount(string $cost, string $price, string $profit, int $dayCount): array
{
    $dayCount = max(1, $dayCount);
    $mult = (string) $dayCount;

    return [
        'cost' => money_mul($cost, $mult, 2),
        'price' => money_mul($price, $mult, 2),
        'profit' => money_mul($profit, $mult, 2),
    ];
}

/** @return array{start:string,end:string}|null */
function dailyParseConsolidatedBillingRange(?string $billingMonth): ?array
{
    $s = trim((string) $billingMonth);
    if ($s === '' || strpos($s, '|') === false) {
        return null;
    }
    $parts = explode('|', $s, 2);
    $start = trim($parts[0] ?? '');
    $end = trim($parts[1] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) {
        return null;
    }
    if ($start > $end) {
        return null;
    }

    return ['start' => $start, 'end' => $end];
}

function dailyInclusiveDayCount(string $startYmd, string $endYmd): int
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startYmd) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endYmd)) {
        return 0;
    }
    try {
        $s = new DateTimeImmutable($startYmd);
        $e = new DateTimeImmutable($endYmd);
        if ($e < $s) {
            return 0;
        }

        return (int) $s->diff($e)->days + 1;
    } catch (Throwable $e) {
        return 0;
    }
}

function dayHasPostedOrSkippedForDay(PDO $pdo, int $companyId, int $processId, string $dayYmd): bool
{
    if ($dayYmd === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayYmd)) {
        return false;
    }
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return false;
        }
        $stmtCol = $pdo->query("SHOW COLUMNS FROM process_accounting_posted LIKE 'period_type'");
        $hasPeriodType = $stmtCol && $stmtCol->rowCount() > 0;
        if (!$hasPeriodType) {
            $stmt = $pdo->prepare(
                'SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?) LIMIT 1'
            );
            $stmt->execute([$companyId, $processId, $dayYmd]);

            return (bool) $stmt->fetch();
        }
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ?
             AND DATE(posted_date) = DATE(?)
             AND period_type IN ('daily','daily_skipped') LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $dayYmd]);

        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}
