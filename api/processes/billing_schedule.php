<?php
/**
 * Recurring billing helpers: contract length (1+1 / 1+2 / 1+3 / "N MONTHS"),
 * monthly due-date list, and whether a calendar day is still inside the billing window.
 */

declare(strict_types=1);

/**
 * Total number of monthly billing periods in the current contract term.
 * Matches UI: 1+1 MONTH → 2 periods, 1+2 → 3, 1+3 → 4; "5 MONTHS" → 5.
 * Returns null if contract is empty or unrecognized → no cap (legacy behaviour).
 */
function getBillingTermMonthsFromContract(?string $contract): ?int
{
    if ($contract === null || trim($contract) === '') {
        return null;
    }
    $c = trim($contract);
    if (preg_match('/^1\+(\d+)$/i', $c, $m)) {
        return 1 + (int) $m[1];
    }
    if (preg_match('/^(\d+)\s*MONTHS?$/i', $c, $m)) {
        return max(1, (int) $m[1]);
    }
    return null;
}

/** First calendar day after the last billing period (exclusive). */
function billingContractExclusiveEndYmd(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        $start = new DateTimeImmutable($dayStartYmd);
        return $start->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * @return string[] Y-m-d, length = $termMonths (same day-of-month as start, +0 … +(term-1) months)
 */
function generateMonthlyBillingDueDates(string $dayStartYmd, int $termMonths): array
{
    if ($termMonths < 1) {
        return [];
    }
    try {
        $start = new DateTimeImmutable($dayStartYmd);
    } catch (Throwable $e) {
        return [];
    }
    $dates = [];
    for ($i = 0; $i < $termMonths; $i++) {
        $dates[] = $start->modify("+{$i} month")->format('Y-m-d');
    }
    return $dates;
}

/**
 * Whether $todayYmd may still show Accounting Due for this process (contract + optional day_end).
 * When term is null, only day_start and day_end apply.
 */
function isWithinRecurringBillingWindow(
    string $todayYmd,
    ?string $dayStartYmd,
    ?string $contract,
    ?string $dayEndYmd
): bool {
    if ($dayStartYmd === null || $dayStartYmd === '' || strtotime($dayStartYmd) === false) {
        return true;
    }
    $start = date('Y-m-d', strtotime($dayStartYmd));
    if ($todayYmd < $start) {
        return false;
    }
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $end = date('Y-m-d', strtotime($dayEndYmd));
        if ($todayYmd > $end) {
            return false;
        }
    }
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return true;
    }
    $exclusiveEnd = billingContractExclusiveEndYmd($start, $term);
    if ($exclusiveEnd === null) {
        return true;
    }
    return $todayYmd < $exclusiveEnd;
}
