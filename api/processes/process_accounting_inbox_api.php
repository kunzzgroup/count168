<?php
/**
 * Process Accounting Inbox API
 * 返回「当天需要算账」的 Bank Process 列表（用于 Process List 标题旁的“需要算账”Inbox）
 * 规则：
 * - 1st of Every Month = 每月1号算账；若设置了 Day start（如 2月20），则先出现一笔「首月按比例」：sell price/当月天数*（20号到月底天数），客户先还这笔，1号起再还全额。
 * - Monthly = 每月(day_start 日 - 1)号，如 2月8日开始则每月7号算账
 * - 逾期未入账：若仅在「算账日当天」才显示，用户错过后列表会空白；改为「已过应付日且该自然月尚未 monthly 入账/跳过」则一直显示到该月结清。
 */

session_start();
header('Content-Type: application/json');

require_once __DIR__ . '/../../config.php';

/** 统一 JSON 响应 */
function jsonResponse(bool $success, string $message = '', $data = null): void
{
    $payload = ['success' => $success, 'message' => $message];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload);
}

function tableHasColumn(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    return $stmt->rowCount() > 0;
}

/** Pro-rated cost/price/profit for partial first month: day_start to end of that month */
function partialFirstMonthAmounts(string $dayStart, float $cost, float $price, float $profit): array
{
    $ts = strtotime($dayStart);
    if ($ts === false) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    $daysRemaining = $daysInMonth - $dayOfMonth + 1;
    if ($daysInMonth <= 0) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $ratio = $daysRemaining / $daysInMonth;
    return [
        'cost' => round($cost * $ratio, 2),
        'price' => round($price * $ratio, 2),
        'profit' => round($profit * $ratio, 2),
    ];
}

/** Pro-rated amounts from $startYmd (inclusive) to end of that month (inclusive). */
function prorateToMonthEndFromStart(string $startYmd, float $cost, float $price, float $profit): array
{
    $ts = strtotime($startYmd);
    if ($ts === false) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    if ($daysInMonth <= 0) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysRemaining = $daysInMonth - $dayOfMonth + 1;
    $daysRemaining = max(0, $daysRemaining);
    $ratio = $daysRemaining / $daysInMonth;
    return [
        'cost' => round($cost * $ratio, 2),
        'price' => round($price * $ratio, 2),
        'profit' => round($profit * $ratio, 2),
    ];
}

/** 检查 bank_process 表是否有 day_start_frequency 列 */
function hasBankProcessFrequencyColumn(PDO $pdo): bool
{
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM bank_process LIKE 'day_start_frequency'");
        return $stmt && $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function getBankProcessIssueFlagSql(string $tableAlias, bool $hasIssueFlagColumn, bool $hasFlagColumn): string
{
    if ($hasIssueFlagColumn && $hasFlagColumn) {
        return "COALESCE(NULLIF($tableAlias.`flag`, ''), NULLIF($tableAlias.`issue_flag`, ''))";
    }
    if ($hasFlagColumn) return "$tableAlias.`flag`";
    if ($hasIssueFlagColumn) return "$tableAlias.`issue_flag`";
    return "NULL";
}

function normalizedBankIssueFlagSql(string $columnRef): string
{
    return "LOWER(REPLACE(REPLACE(TRIM(COALESCE($columnRef, '')), '-', '_'), ' ', '_'))";
}

/** 合同总月数：1+2→3 个月；未知则 null（不截断） */
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

function billingContractExclusiveEndYmd(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        return (new DateTimeImmutable($dayStartYmd))->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/** 合同期内 + day_end（若有） */
function isWithinRecurringBillingWindow(string $todayYmd, ?string $dayStartYmd, ?string $contract, ?string $dayEndYmd): bool
{
    if ($dayStartYmd === null || $dayStartYmd === '' || strtotime($dayStartYmd) === false) {
        return true;
    }
    $start = date('Y-m-d', strtotime($dayStartYmd));
    if ($todayYmd < $start) {
        return false;
    }
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $end = date('Y-m-d', strtotime($dayEndYmd));
        // Treat day_end as exclusive end (end day itself should not show)
        if ($todayYmd >= $end) {
            return false;
        }
    }
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return true;
    }
    $exclusiveEnd = billingContractExclusiveEndYmd($start, $term);
    return $exclusiveEnd === null || $todayYmd < $exclusiveEnd;
}

/** Billing should not backfill before process creation date. */
function createdYmdOrFallbackToday(array $processRow, string $todayYmd): string
{
    $raw = $processRow['dts_created'] ?? null;
    if ($raw === null || trim((string) $raw) === '') {
        return $todayYmd;
    }
    $ts = strtotime((string) $raw);
    if ($ts === false) {
        return $todayYmd;
    }
    return date('Y-m-d', $ts);
}

function maxYmd(string $a, string $b): string
{
    return ($a >= $b) ? $a : $b;
}

/** 该自然月是否已有 monthly / monthly_skipped（用于判断本期是否已处理） */
function hasMonthlyPostedOrSkippedInCalendarMonth(PDO $pdo, int $companyId, int $processId, int $year, int $month): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND YEAR(posted_date) = ? AND MONTH(posted_date) = ? AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '') LIMIT 1");
    $stmt->execute([$companyId, $processId, $year, $month]);
    return (bool) $stmt->fetch();
}

/** 某月第 N 日（不超过该月最后一天） */
function calendarMonthDueYmd(int $year, int $month, int $dueDay): string
{
    $last = (int) date('t', mktime(0, 0, 0, $month, 1, $year));
    $d = min(max(1, $dueDay), $last);
    return sprintf('%04d-%02d-%02d', $year, $month, $d);
}

/** 获取当前公司下可用于 Accounting Inbox 的 active Bank Process 列表 */
function fetchActiveBankProcessesForInbox(PDO $pdo, int $companyId, bool $hasFrequency): array
{
    $sql = "SELECT bp.id, bp.name, bp.bank, bp.country, bp.cost, bp.price, bp.profit,
            bp.card_merchant_id, bp.customer_id, bp.profit_account_id, bp.day_start, bp.day_end, bp.contract, bp.dts_created" .
        ($hasFrequency ? ", bp.day_start_frequency" : "") . "
            FROM bank_process bp
            WHERE bp.company_id = ? AND bp.status = 'active'
            AND (bp.card_merchant_id IS NOT NULL OR bp.customer_id IS NOT NULL OR bp.profit_account_id IS NOT NULL)
            AND (COALESCE(bp.cost,0) > 0 OR COALESCE(bp.price,0) > 0 OR COALESCE(bp.profit,0) > 0)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/** 获取当前公司下 inactive-like 且尚未在本轮做过 manual_inactive 入账的 Bank Process。real inactive 与 OFFICIAL / E-INVOICE 共用这套 Accounting Due 逻辑。 */
function fetchInactiveBankProcessesPendingTransaction(PDO $pdo, int $companyId, bool $hasPeriodType, bool $hasIssueFlagColumn, bool $hasFlagColumn): array
{
    $issueFlagSql = getBankProcessIssueFlagSql('bp', $hasIssueFlagColumn, $hasFlagColumn);
    $sql = "SELECT bp.id, bp.name, bp.bank, bp.country, bp.cost, bp.price, bp.profit, bp.day_start, bp.contract
            FROM bank_process bp
            WHERE bp.company_id = ? AND " . (($hasIssueFlagColumn || $hasFlagColumn)
                ? "(bp.status = 'inactive' OR " . normalizedBankIssueFlagSql($issueFlagSql) . " IN ('official','e_invoice'))"
                : "bp.status = 'inactive'") . "
            AND bp.contract IN ('1+1','1+2','1+3')
            AND (bp.card_merchant_id IS NOT NULL OR bp.customer_id IS NOT NULL OR bp.profit_account_id IS NOT NULL)
            AND (COALESCE(bp.cost,0) > 0 OR COALESCE(bp.price,0) > 0 OR COALESCE(bp.profit,0) > 0)";
    if ($hasPeriodType) {
        $sql .= " AND NOT EXISTS (SELECT 1 FROM process_accounting_posted pap WHERE pap.company_id = bp.company_id AND pap.process_id = bp.id AND pap.period_type IN ('manual_inactive','manual_inactive_skipped') AND pap.posted_date >= DATE(bp.dts_modified))";
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/** 检查首月按比例是否已入账或已跳过 */
function isPartialFirstMonthAlreadyPosted(PDO $pdo, int $companyId, int $processId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND period_type IN ('partial_first_month','partial_first_month_skipped') LIMIT 1");
    $stmt->execute([$companyId, $processId]);
    return (bool) $stmt->fetch();
}

/** 获取已入账或已跳过「首月按比例」的 process_id 列表 */
function getPartialFirstMonthPostedIds(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND period_type IN ('partial_first_month','partial_first_month_skipped')");
    $stmt->execute([$companyId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** 获取指定日期已入账「monthly」的 process_id 列表 */
function getMonthlyPostedIdsForDate(PDO $pdo, int $companyId, string $date, array $processIds): array
{
    if (empty($processIds)) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($processIds), '?'));
    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND posted_date = ? AND process_id IN ($placeholders) AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '')");
    $stmt->execute(array_merge([$companyId, $date], $processIds));
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** 获取曾入账过「monthly」的 process_id 列表（任意日期，用于 Monthly 第一笔是否已做过） */
function getMonthlyEverPostedIds(PDO $pdo, int $companyId): array
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return [];
        }
        $stmt = $pdo->query("SHOW COLUMNS FROM process_accounting_posted LIKE 'period_type'");
        if (!$stmt || $stmt->rowCount() === 0) {
            $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ?");
            $stmt->execute([$companyId]);
            return array_map('intval', array_unique($stmt->fetchAll(PDO::FETCH_COLUMN)));
        }
        $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '')");
        $stmt->execute([$companyId]);
        return array_map('intval', array_unique($stmt->fetchAll(PDO::FETCH_COLUMN)));
    } catch (Throwable $e) {
        return [];
    }
}

/** 获取指定日期已入账的 process_id 列表（无 period_type 时） */
function getPostedProcessIdsForDate(PDO $pdo, int $companyId, string $date, array $processIds): array
{
    if (empty($processIds)) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($processIds), '?'));
    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND posted_date = ? AND process_id IN ($placeholders)");
    $stmt->execute(array_merge([$companyId, $date], $processIds));
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** 标记 needToday 中哪些已入账 */
function markAlreadyPostedOnNeedToday(PDO $pdo, array &$needToday, int $companyId, string $today, bool $hasPeriodType): void
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return;
        }
        if ($hasPeriodType) {
            $partialPostedIds = getPartialFirstMonthPostedIds($pdo, $companyId);
            $ids = array_column($needToday, 'id');
            $monthlyPostedIds = getMonthlyPostedIdsForDate($pdo, $companyId, $today, $ids);
            foreach ($needToday as &$item) {
                // manual_inactive 行不按 monthly/partial 标记已入账，否则会误标为已入账导致无法勾选 Transaction
                if (!empty($item['is_manual_inactive'])) {
                    $item['already_posted_today'] = false;
                    continue;
                }
                if (!empty($item['is_partial_first_month'])) {
                    $item['already_posted_today'] = in_array((int) $item['id'], $partialPostedIds, true);
                    continue;
                }
                // 按「账单所属自然月」判断是否已入账（与逾期未显示逻辑一致）
                if (!empty($item['monthly_billing_month']) && preg_match('/^(\d{4})-(\d{1,2})$/', (string) $item['monthly_billing_month'], $m)) {
                    $item['already_posted_today'] = hasMonthlyPostedOrSkippedInCalendarMonth(
                        $pdo,
                        $companyId,
                        (int) $item['id'],
                        (int) $m[1],
                        (int) $m[2]
                    );
                    continue;
                }
                $item['already_posted_today'] = in_array((int) $item['id'], $monthlyPostedIds, true);
            }
        } else {
            $ids = array_column($needToday, 'id');
            $postedIds = getPostedProcessIdsForDate($pdo, $companyId, $today, $ids);
            foreach ($needToday as &$item) {
                if (!empty($item['is_manual_inactive'])) {
                    $item['already_posted_today'] = false;
                    continue;
                }
                $item['already_posted_today'] = in_array((int) $item['id'], $postedIds, true);
            }
        }
        unset($item);
    } catch (Throwable $e) {
        // ignore
    }
}

try {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, '请先登录', null);
        exit;
    }
    $company_id = (int) ($_SESSION['company_id'] ?? 0);
    if (!$company_id) {
        http_response_code(400);
        jsonResponse(false, '缺少公司信息', null);
        exit;
    }

    $today = date('Y-m-d');

    $hasFrequency = hasBankProcessFrequencyColumn($pdo);
    $hasIssueFlagColumn = tableHasColumn($pdo, 'bank_process', 'issue_flag');
    $hasFlagColumn = tableHasColumn($pdo, 'bank_process', 'flag');
    $hasPeriodType = false;
    try {
        $hasPeriodType = tableHasColumn($pdo, 'process_accounting_posted', 'period_type');
    } catch (Throwable $e) {
        // ignore
    }

    $rows = fetchActiveBankProcessesForInbox($pdo, $company_id, $hasFrequency);
    $needToday = [];

    // 1) Partial first month
    if ($hasFrequency && $hasPeriodType) {
        foreach ($rows as $r) {
            $frequency = $r['day_start_frequency'] ?? '1st_of_every_month';
            if ($frequency !== '1st_of_every_month') {
                continue;
            }
            $dayStart = $r['day_start'] ?? null;
            if (empty($dayStart)) {
                continue;
            }
            if (strtotime($dayStart) === false) {
                continue;
            }
            $startTs = strtotime($dayStart);
            $startDate = date('Y-m-d', $startTs);
            if ($today < $startDate) {
                continue;
            }
            $createdYmd = createdYmdOrFallbackToday($r, $today);
            if ($today < maxYmd($startDate, $createdYmd)) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $dayStart, $r['contract'] ?? null, $r['day_end'] ?? null)) {
                continue;
            }
            // If day_start is the 1st, there's no "partial first month" period at all.
            $startDayOfMonth = (int) date('j', $startTs);
            if ($startDayOfMonth === 1) {
                continue;
            }
            // Old data not taken: if created is after the first-month end, skip this partial period.
            $firstMonthEnd = date('Y-m-t', $startTs);
            if ($createdYmd > $firstMonthEnd) {
                continue;
            }
            $processId = (int) $r['id'];
            if (isPartialFirstMonthAlreadyPosted($pdo, $company_id, $processId)) {
                continue;
            }
            $cost = (float) ($r['cost'] ?? 0);
            $price = (float) ($r['price'] ?? 0);
            $profit = (float) ($r['profit'] ?? 0);
            $partialStart = maxYmd($startDate, $createdYmd);
            if ($partialStart > $firstMonthEnd) {
                continue;
            }
            $partial = prorateToMonthEndFromStart($partialStart, $cost, $price, $profit);
            $needToday[] = [
                'id' => $processId,
                'name' => ($r['name'] ?? '') ?: ($r['bank'] ?? ''),
                'bank' => $r['bank'] ?? '',
                'country' => $r['country'] ?? '',
                'day_start' => $dayStart,
                'contract' => $r['contract'] ?? '',
                'cost' => $partial['cost'],
                'price' => $partial['price'],
                'profit' => $partial['profit'],
                'already_posted_today' => false,
                'is_partial_first_month' => true,
                'is_manual_inactive' => false,
            ];
        }
    }

    // 2) Regular: 每月1号 或 Monthly(day_start-1)；应付日过后整月内仍显示直到该月入账
    foreach ($rows as $r) {
        $frequency = $hasFrequency ? ($r['day_start_frequency'] ?? '1st_of_every_month') : '1st_of_every_month';
        $dayStart = $r['day_start'] ?? null;
        $need = false;
        $monthlyBillingMonth = null;
        $createdYmd = createdYmdOrFallbackToday($r, $today);
        $startTs = (!empty($dayStart)) ? strtotime($dayStart) : false;
        $startDate = $startTs !== false ? date('Y-m-d', $startTs) : '';
        $contract = $r['contract'] ?? null;
        $dayEnd = $r['day_end'] ?? null;

        if ($frequency === '1st_of_every_month') {
            if (empty($dayStart)) {
                try {
                    $cur = new DateTimeImmutable($today);
                    $cur = $cur->modify('first day of this month');
                    $y = (int) $cur->format('Y');
                    $mo = (int) $cur->format('n');
                    $firstOf = $cur->format('Y-m-d');
                    $effectiveDue = maxYmd($firstOf, $createdYmd);
                    if ($today >= $effectiveDue
                        && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $company_id, (int) $r['id'], $y, $mo)) {
                        $need = true;
                        $monthlyBillingMonth = $cur->format('Y-n');
                    }
                } catch (Throwable $e) {
                    $need = false;
                }
            } else {
                if ($startTs === false) {
                    continue;
                }
                // Special case: day_start is on the 1st and the process is created after day_start within the same month.
                // Old data not taken: skip earlier months, but for the created month we should charge from created date to month end.
                // Example: created 2026-04-02, day_start 2026-04-01 → show April bill today (prorated 4/2–4/30).
                try {
                    $startDayOfMonth = (int) date('j', $startTs);
                    $startYm = (new DateTimeImmutable($startDate))->format('Y-n');
                    $createdYm = (new DateTimeImmutable($createdYmd))->format('Y-n');
                    $todayYm = (new DateTimeImmutable($today))->format('Y-n');
                    if ($startDayOfMonth === 1
                        && $createdYm === $startYm
                        && $todayYm === $startYm
                        && $createdYmd > $startDate
                        && $today >= $createdYmd
                        && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $company_id, (int) $r['id'], (int) date('Y', $startTs), (int) date('n', $startTs))) {
                        $need = true;
                        $monthlyBillingMonth = $startYm;
                    }
                } catch (Throwable $e) {
                    // ignore
                }
                if ($need) {
                    // for this special case, apply proration from created date to month end
                    $cost = (float) ($r['cost'] ?? 0);
                    $price = (float) ($r['price'] ?? 0);
                    $profit = (float) ($r['profit'] ?? 0);
                    $pr = prorateToMonthEndFromStart($createdYmd, $cost, $price, $profit);
                    $needToday[] = [
                        'id' => (int) $r['id'],
                        'name' => $r['name'] ?? '',
                        'bank' => $r['bank'] ?? '',
                        'country' => $r['country'] ?? '',
                        'day_start' => $r['day_start'] ?? null,
                        'contract' => $r['contract'] ?? '',
                        'cost' => $pr['cost'],
                        'price' => $pr['price'],
                        'profit' => $pr['profit'],
                        'already_posted_today' => false,
                        'is_partial_first_month' => false,
                        'is_manual_inactive' => false,
                        'monthly_billing_month' => $monthlyBillingMonth,
                    ];
                    continue;
                }
                $firstAccountingTs = strtotime('first day of next month', $startTs);
                $firstAccountingDate = $firstAccountingTs !== false ? date('Y-m-d', $firstAccountingTs) : '';
                if ($firstAccountingDate === '' || $today < $firstAccountingDate) {
                    $need = false;
                } elseif (!isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd)) {
                    $need = false;
                } else {
                    try {
                        $iter = new DateTimeImmutable($firstAccountingDate);
                        $iter = $iter->modify('first day of this month');
                        $endCap = (new DateTimeImmutable($today))->modify('first day of this month');
                        $term = getBillingTermMonthsFromContract($contract);
                        $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmd($startDate, $term) : null;
                        while ($iter <= $endCap) {
                            $y = (int) $iter->format('Y');
                            $mo = (int) $iter->format('n');
                            $firstOfThis = $iter->format('Y-m-d');
                            if ($exclusiveEnd !== null && $firstOfThis >= $exclusiveEnd) {
                                break;
                            }
                            $effectiveDue = maxYmd($firstOfThis, $createdYmd);
                            if ($today >= $effectiveDue
                                && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $company_id, (int) $r['id'], $y, $mo)) {
                                $need = true;
                                $monthlyBillingMonth = $iter->format('Y-n');
                                break;
                            }
                            $iter = $iter->modify('+1 month');
                        }
                    } catch (Throwable $e) {
                        $need = false;
                    }
                }
            }
        } else {
            // Monthly（prepaid）：每月 day_start 当天应付；逾期仍显示至该月结清
            if (empty($dayStart)) {
                continue;
            }
            if ($startTs === false) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd)) {
                continue;
            }
            $processId = (int) $r['id'];
            $startDayOfMonth = (int) date('j', $startTs);
            // Old data not taken for Monthly(prepaid): do NOT backfill a missed due-date.
            // If a due-date already passed before process creation, skip that period entirely and wait for the next due-date.
            if ($startDate !== '' && $today >= $createdYmd) {
                try {
                    $iter = new DateTimeImmutable($startDate);
                    $iter = $iter->modify('first day of this month');
                    $endCap = (new DateTimeImmutable($today))->modify('first day of this month');
                    $startYm = (new DateTimeImmutable($startDate))->format('Y-m');
                    $term = getBillingTermMonthsFromContract($contract);
                    $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmd($startDate, $term) : null;
                    while ($iter <= $endCap) {
                        $y = (int) $iter->format('Y');
                        $mo = (int) $iter->format('n');
                        $due = ($iter->format('Y-m') === $startYm)
                            ? $startDate
                            : calendarMonthDueYmd($y, $mo, $startDayOfMonth);
                        if ($exclusiveEnd !== null && $due >= $exclusiveEnd) {
                            break;
                        }
                        // Skip any period whose due-date is before creation (no backfill).
                        if ($due < $createdYmd) {
                            $iter = $iter->modify('+1 month');
                            continue;
                        }
                        if ($today >= $due
                            && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $company_id, $processId, $y, $mo)) {
                            $need = true;
                            $monthlyBillingMonth = $iter->format('Y-n');
                            break;
                        }
                        $iter = $iter->modify('+1 month');
                    }
                } catch (Throwable $e) {
                    $need = false;
                }
            }
        }

        if ($need) {
            // If this monthly bill is being created after due date in the same calendar month as process creation,
            // only charge from created date to month end (old data not taken).
            $cost = (float) ($r['cost'] ?? 0);
            $price = (float) ($r['price'] ?? 0);
            $profit = (float) ($r['profit'] ?? 0);
            try {
                $createdDt = new DateTimeImmutable($createdYmd);
                if ($monthlyBillingMonth && preg_match('/^(\d{4})-(\d{1,2})$/', (string) $monthlyBillingMonth, $m)) {
                    $billY = (int) $m[1];
                    $billMo = (int) $m[2];
                    $createdYm = $createdDt->format('Y-n');
                    $billYm = sprintf('%04d-%d', $billY, $billMo);
                    if ($createdYm === $billYm) {
                        $dueYmd = null;
                        if ($frequency === '1st_of_every_month') {
                            $dueYmd = sprintf('%04d-%02d-01', $billY, $billMo);
                        } else {
                            // Monthly(prepaid): due day is day_start day-of-month for that billing month
                            if ($startTs !== false) {
                                $dueYmd = calendarMonthDueYmd($billY, $billMo, (int) date('j', $startTs));
                                if ($startDate !== '' && (new DateTimeImmutable($startDate))->format('Y-n') === $billYm) {
                                    $dueYmd = $startDate;
                                }
                            }
                        }
                        if ($dueYmd !== null && $createdYmd > $dueYmd) {
                            $pr = prorateToMonthEndFromStart($createdYmd, $cost, $price, $profit);
                            $cost = $pr['cost'];
                            $price = $pr['price'];
                            $profit = $pr['profit'];
                        }
                    }
                }
            } catch (Throwable $e) {
                // ignore proration failure
            }
            $needToday[] = [
                'id' => (int) $r['id'],
                'name' => $r['name'] ?? '',
                'bank' => $r['bank'] ?? '',
                'country' => $r['country'] ?? '',
                'day_start' => $r['day_start'] ?? null,
                'contract' => $r['contract'] ?? '',
                'cost' => $cost,
                'price' => $price,
                'profit' => $profit,
                'already_posted_today' => false,
                'is_partial_first_month' => false,
                'is_manual_inactive' => false,
                'monthly_billing_month' => $monthlyBillingMonth,
            ];
        }
    }

    // 3) 用户从 active 改为 inactive 的流程：进入 Accounting Due；做完 Transaction 后该行从列表消失，status 保持 inactive
    $inactivePending = fetchInactiveBankProcessesPendingTransaction($pdo, $company_id, $hasPeriodType, $hasIssueFlagColumn, $hasFlagColumn);
    foreach ($inactivePending as $r) {
        $needToday[] = [
            'id' => (int) $r['id'],
            'name' => $r['name'] ?? '',
            'bank' => $r['bank'] ?? '',
            'country' => $r['country'] ?? '',
            'day_start' => $r['day_start'] ?? null,
            'contract' => $r['contract'] ?? '',
            'cost' => $r['cost'] ?? 0,
            'price' => $r['price'] ?? 0,
            'profit' => $r['profit'] ?? 0,
            'already_posted_today' => false,
            'is_partial_first_month' => false,
            'is_manual_inactive' => true,
        ];
    }

    if (!empty($needToday)) {
        markAlreadyPostedOnNeedToday($pdo, $needToday, $company_id, $today, $hasPeriodType);
    }

    jsonResponse(true, '', $needToday);
} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
} catch (PDOException $e) {
    error_log('process_accounting_inbox_api: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, '服务器错误', null);
} 