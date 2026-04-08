<?php
/**
 * Process Accounting Inbox API
 * 返回「当天需要算账」的 Bank Process 列表（用于 Process List 标题旁的“需要算账”Inbox）
 * 规则：
 * - 1st of Every Month：首笔整月账单起，「何时出现在待算账」取 max(当月1号, dts_created)，避免 day_start 早于创建日时提前出现（旧数据不拿）；金额仍按当期应付日（1号）起算整月或比例，不用创建日摊分。
 * - Maintenance 删交易后 Resend 成功：bank_process.accounting_resend_relax_created_floor=1 期间，上述「创建日门槛」与 day_start 取较早者，便于用户修正 day_start 后仍进 Accounting Due；从 Accounting Due 入账成功后清零。
 * - Day start 为当月1号且与创建同月：仍自 day_start 当日起可入账（与上条后续整月不同）。
 * - 非1号 day_start：首月按比例从 day_start 起算；若创建日晚于该自然月末则整段跳过（旧数据不拿）；出现日 max(day_start, 创建日)。
 * - Monthly = 每月(day_start 日 - 1)号，如 2月8日开始则每月7号算账
 * - 逾期未入账：若仅在「算账日当天」才显示，用户错过后列表会空白；改为「已过应付日且该自然月尚未 monthly 入账/跳过」则一直显示到该月结清。
 * - 填写 day_end 且长于合同自然结束：多一笔 day_end_tail（例 1st + 非1号 day_start：自然结束次日到 day_end 按当月天数比例）。
 */

session_start();
header('Content-Type: application/json');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../bankprocess_maintenance/maintenance_accounting_resend_lib.php';

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

/**
 * 与 process_post_to_transaction_api::bankProcessDateFieldToYmd 一致：优先 d/m/Y，避免 01/04/2026 被 strtotime 当成美式 1 月 4 日，
 * 从而导致「day_start 在 1 号」分支永远不命中、Resend 后当月进不了 Accounting Due。
 */
function inboxBankProcessDateFieldToYmd($raw): ?string
{
    if ($raw === null) {
        return null;
    }
    $s = trim((string) $raw);
    if ($s === '') {
        return null;
    }
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        if ($mo >= 1 && $mo <= 12 && $d >= 1 && $d <= 31 && checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    if (preg_match('#^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$#', $s, $m)) {
        $d = (int) $m[1];
        $mo = (int) $m[2];
        $y = (int) $m[3];
        if ($mo >= 1 && $mo <= 12 && $d >= 1 && $d <= 31 && checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    $dateStr = str_replace('/', '-', $s);
    if (preg_match('/^\d{1,2}-\d{1,2}$/', $dateStr)) {
        $dateStr .= '-' . date('Y');
    }
    $ts = strtotime($dateStr);
    return $ts !== false ? date('Y-m-d', $ts) : null;
}

/** Pro-rated cost/price/profit for partial first month: day_start to end of that month */
function partialFirstMonthAmounts(string $dayStart, float $cost, float $price, float $profit): array
{
    $norm = inboxBankProcessDateFieldToYmd($dayStart);
    $ts = $norm !== null ? strtotime($norm) : strtotime($dayStart);
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

/**
 * 每月1号算账 + day_start 非1号：整月锚点从「次月1号」起共 N 个，合同自然截止日为 (次月1号) + (N-1) 个月。
 * day_start 在1号时与 billingContractExclusiveEndYmd 相同。
 */
function billingContractExclusiveEndYmdFirstOfMonth(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        $start = new DateTimeImmutable($dayStartYmd);
        if ((int) $start->format('j') === 1) {
            return $start->modify("+{$termMonths} months")->format('Y-m-d');
        }
        $firstAnchor = $start->modify('first day of next month');
        return $firstAnchor->modify('+' . ($termMonths - 1) . ' months')->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function contractExclusiveEndYmdForFrequency(string $startYmd, ?string $contract, ?string $frequency): ?string
{
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return null;
    }
    if ($frequency === 'monthly') {
        return billingContractExclusiveEndYmd($startYmd, $term);
    }
    return billingContractExclusiveEndYmdFirstOfMonth($startYmd, $term);
}

/**
 * 合同自然结束 + day_end：day_end 为最后一天计入（可长于合同自然结束）；与 day_end 尾段账单一致。
 */
function isWithinRecurringBillingWindow(string $todayYmd, ?string $dayStartYmd, ?string $contract, ?string $dayEndYmd, ?string $frequency = null): bool
{
    if ($dayStartYmd === null || trim($dayStartYmd) === '') {
        return true;
    }
    $normStart = inboxBankProcessDateFieldToYmd($dayStartYmd);
    if ($normStart !== null) {
        $start = $normStart;
    } else {
        $ts0 = strtotime($dayStartYmd);
        if ($ts0 === false) {
            return true;
        }
        $start = date('Y-m-d', $ts0);
    }
    if ($todayYmd < $start) {
        return false;
    }

    $freq = ($frequency === 'monthly') ? 'monthly' : '1st_of_every_month';
    $exclusiveFirstDayAfter = contractExclusiveEndYmdForFrequency($start, $contract, $freq);

    $contractLastInclusive = null;
    if ($exclusiveFirstDayAfter !== null) {
        try {
            $contractLastInclusive = (new DateTimeImmutable($exclusiveFirstDayAfter))->modify('-1 day')->format('Y-m-d');
        } catch (Throwable $e) {
            $contractLastInclusive = null;
        }
    }

    $dayEndInc = null;
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $dayEndInc = date('Y-m-d', strtotime($dayEndYmd));
    }

    if ($contractLastInclusive === null && $dayEndInc === null) {
        return true;
    }
    if ($contractLastInclusive !== null && $dayEndInc === null) {
        return $todayYmd <= $contractLastInclusive;
    }
    if ($contractLastInclusive === null) {
        return $todayYmd <= $dayEndInc;
    }
    if ($dayEndInc > $contractLastInclusive) {
        return $todayYmd <= $dayEndInc;
    }
    return $todayYmd <= min($contractLastInclusive, $dayEndInc);
}

/** $fromYmd、$toYmd 均含当日；各段按当月天数比例分摊整月金额。 */
function prorateInclusiveDateRange(string $fromYmd, string $toYmd, float $cost, float $price, float $profit): array
{
    if ($fromYmd > $toYmd) {
        return ['cost' => 0.0, 'price' => 0.0, 'profit' => 0.0];
    }
    try {
        $cur = new DateTimeImmutable($fromYmd);
        $end = new DateTimeImmutable($toYmd);
    } catch (Throwable $e) {
        return ['cost' => 0.0, 'price' => 0.0, 'profit' => 0.0];
    }
    $tc = 0.0;
    $tp = 0.0;
    $tf = 0.0;
    while ($cur <= $end) {
        $dim = (int) $cur->format('t');
        $monthEnd = $cur->modify('last day of this month');
        $chunkEnd = $monthEnd <= $end ? $monthEnd : $end;
        $d0 = (int) $cur->format('j');
        $d1 = (int) $chunkEnd->format('j');
        $chunkDays = $d1 - $d0 + 1;
        if ($dim > 0 && $chunkDays > 0) {
            $ratio = $chunkDays / $dim;
            $tc += $cost * $ratio;
            $tp += $price * $ratio;
            $tf += $profit * $ratio;
        }
        $cur = $chunkEnd->modify('+1 day');
    }
    return [
        'cost' => round($tc, 2),
        'price' => round($tp, 2),
        'profit' => round($tf, 2),
    ];
}

function isDayEndTailAlreadyPosted(PDO $pdo, int $companyId, int $processId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND period_type IN ('day_end_tail','day_end_tail_skipped') LIMIT 1");
    $stmt->execute([$companyId, $processId]);
    return (bool) $stmt->fetch();
}

function isBillingCompleteBeforeDayEndTail(PDO $pdo, int $companyId, int $processId, string $exclusiveEndYmd, string $startDate, int $startDayOfMonth, bool $hasPeriodType): bool
{
    if (!$hasPeriodType) {
        return true;
    }
    try {
        $lastInclusive = (new DateTimeImmutable($exclusiveEndYmd))->modify('-1 day');
        $y = (int) $lastInclusive->format('Y');
        $mo = (int) $lastInclusive->format('n');
        $lastYm = $lastInclusive->format('Y-n');
        $startYm = (new DateTimeImmutable($startDate))->format('Y-n');
        if ($startDayOfMonth !== 1 && $startYm === $lastYm) {
            return isPartialFirstMonthAlreadyPosted($pdo, $companyId, $processId);
        }
        return hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $y, $mo);
    } catch (Throwable $e) {
        return false;
    }
}

/** dts_created 的日历日（仅用于少数「与创建月」相关的展示判断；算账锚点一律为 day_start）。 */
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

/** Resend 后：旧数据不拿的创建日门槛用 bmp_inboxEffectiveCreatedYmd 放宽。 */
function inboxEffectiveCreatedYmdForProcess(array $processRow, string $todayYmd, ?string $parsedDayStartYmd): string
{
    $base = createdYmdOrFallbackToday($processRow, $todayYmd);
    $relax = !empty($processRow['accounting_resend_relax_created_floor']);
    return bmp_inboxEffectiveCreatedYmd($base, $parsedDayStartYmd, $relax);
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
function fetchActiveBankProcessesForInbox(PDO $pdo, int $companyId, bool $hasFrequency, bool $hasResendRelaxCol): array
{
    $sql = "SELECT bp.id, bp.name, bp.bank, bp.country, bp.cost, bp.price, bp.profit,
            bp.card_merchant_id, bp.customer_id, bp.profit_account_id, bp.day_start, bp.day_end, bp.contract, bp.dts_created" .
        ($hasFrequency ? ", bp.day_start_frequency" : "") .
        ($hasResendRelaxCol ? ", bp.accounting_resend_relax_created_floor" : "") . "
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
                if (!empty($item['is_day_end_tail'])) {
                    $item['already_posted_today'] = isDayEndTailAlreadyPosted($pdo, $companyId, (int) $item['id']);
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

    //$today = date('Y-m-d');
    $today = '2026-05-01';

    $hasFrequency = hasBankProcessFrequencyColumn($pdo);
    $hasIssueFlagColumn = tableHasColumn($pdo, 'bank_process', 'issue_flag');
    $hasFlagColumn = tableHasColumn($pdo, 'bank_process', 'flag');
    $hasPeriodType = false;
    try {
        $hasPeriodType = tableHasColumn($pdo, 'process_accounting_posted', 'period_type');
    } catch (Throwable $e) {
        // ignore
    }
    $hasResendRelaxCol = tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor');

    $rows = fetchActiveBankProcessesForInbox($pdo, $company_id, $hasFrequency, $hasResendRelaxCol);
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
            $startDate = inboxBankProcessDateFieldToYmd($dayStart);
            if ($startDate === null) {
                continue;
            }
            $startTs = strtotime($startDate);
            if ($startTs === false) {
                continue;
            }
            if ($today < $startDate) {
                continue;
            }
            $createdYmd = inboxEffectiveCreatedYmdForProcess($r, $today, $startDate);
            if ($today < maxYmd($startDate, $createdYmd)) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $dayStart, $r['contract'] ?? null, $r['day_end'] ?? null, '1st_of_every_month')) {
                continue;
            }
            // If day_start is the 1st, there's no "partial first month" period at all.
            $startDayOfMonth = (int) date('j', $startTs);
            if ($startDayOfMonth === 1) {
                continue;
            }
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
            $partialStart = $startDate;
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
        $startDate = '';
        $startTs = false;
        if (!empty($dayStart)) {
            $parsedStart = inboxBankProcessDateFieldToYmd($dayStart);
            if ($parsedStart !== null) {
                $tsParsed = strtotime($parsedStart);
                if ($tsParsed !== false) {
                    $startDate = $parsedStart;
                    $startTs = $tsParsed;
                }
            }
        }
        $createdYmd = inboxEffectiveCreatedYmdForProcess($r, $today, $startDate !== '' ? $startDate : null);
        $contract = $r['contract'] ?? null;
        $dayEnd = $r['day_end'] ?? null;

        if ($frequency === '1st_of_every_month') {
            if (empty($dayStart)) {
                continue;
            }
            if ($startTs === false) {
                continue;
            }
                // First calendar month when day_start is on the 1st (1st_of_every_month)：自 day_start 当月起可入账，金额按 day_start 起算（与创建/提交日无关）。
                try {
                    $startDayOfMonth = (int) date('j', $startTs);
                    $startYm = (new DateTimeImmutable($startDate))->format('Y-n');
                    $todayYm = (new DateTimeImmutable($today))->format('Y-n');
                    $billYear = (int) date('Y', $startTs);
                    $billMonth = (int) date('n', $startTs);
                    if ($startDayOfMonth === 1
                        && $todayYm === $startYm
                        && $today >= $startDate
                        && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $company_id, (int) $r['id'], $billYear, $billMonth)
                        && isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd, '1st_of_every_month')) {
                        $need = true;
                        $monthlyBillingMonth = $startYm;
                    }
                } catch (Throwable $e) {
                    // ignore
                }
                if ($need) {
                    $cost = (float) ($r['cost'] ?? 0);
                    $price = (float) ($r['price'] ?? 0);
                    $profit = (float) ($r['profit'] ?? 0);
                    $firstMonthProrateStart = $startDate;
                    $pr = prorateToMonthEndFromStart($firstMonthProrateStart, $cost, $price, $profit);
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
                } elseif (!isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd, '1st_of_every_month')) {
                    $need = false;
                } else {
                    try {
                        $iter = new DateTimeImmutable($firstAccountingDate);
                        $iter = $iter->modify('first day of this month');
                        $endCap = (new DateTimeImmutable($today))->modify('first day of this month');
                        $term = getBillingTermMonthsFromContract($contract);
                        $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmdFirstOfMonth($startDate, $term) : null;
                        while ($iter <= $endCap) {
                            $y = (int) $iter->format('Y');
                            $mo = (int) $iter->format('n');
                            $firstOfThis = $iter->format('Y-m-d');
                            if ($exclusiveEnd !== null && $firstOfThis >= $exclusiveEnd) {
                                break;
                            }
                            // 创建日前不展示（例：day_start 3/1、创建 4/7 → 4/1 不出账，4/7 起出 4 月整月账单）
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
        } else {
            // Monthly（prepaid）：每月 day_start 当天应付；逾期仍显示至该月结清
            if (empty($dayStart)) {
                continue;
            }
            if ($startTs === false) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd, 'monthly')) {
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
                        if ($due < $createdYmd) {
                            try {
                                $billYm = $iter->format('Y-n');
                                $createdYmOnly = (new DateTimeImmutable($createdYmd))->format('Y-n');
                                if ($billYm !== $createdYmOnly) {
                                    $iter = $iter->modify('+1 month');
                                    continue;
                                }
                            } catch (Throwable $e) {
                                $iter = $iter->modify('+1 month');
                                continue;
                            }
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
            // 账单自然月与创建月相同时：若创建日晚于当期应付日，仍按应付日（与 day_start 一致）起算摊至月底，不用创建日。
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
                            $pr = prorateToMonthEndFromStart($dueYmd, $cost, $price, $profit);
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

    // 2b) 填写了 day_end 且长于合同自然结束日：多一笔尾段按比例（例：自然结束 6/1、day_end 6/3 → 6/1–6/3）
    if ($hasPeriodType) {
        foreach ($rows as $r) {
            $frequency = $hasFrequency ? ($r['day_start_frequency'] ?? '1st_of_every_month') : '1st_of_every_month';
            $dayEndRaw = $r['day_end'] ?? null;
            if ($dayEndRaw === null || trim((string) $dayEndRaw) === '' || strtotime((string) $dayEndRaw) === false) {
                continue;
            }
            $dayStart = $r['day_start'] ?? null;
            if (empty($dayStart)) {
                continue;
            }
            $startDate = inboxBankProcessDateFieldToYmd($dayStart);
            if ($startDate === null) {
                continue;
            }
            $dayEndInc = date('Y-m-d', strtotime($dayEndRaw));
            $contract = $r['contract'] ?? null;
            $term = getBillingTermMonthsFromContract($contract);
            if ($term === null || $term < 1) {
                continue;
            }
            $exclusiveEnd = contractExclusiveEndYmdForFrequency($startDate, $contract, $frequency);
            if ($exclusiveEnd === null || $dayEndInc < $exclusiveEnd) {
                continue;
            }
            $processId = (int) $r['id'];
            if (isDayEndTailAlreadyPosted($pdo, $company_id, $processId)) {
                continue;
            }
            $startTsNorm = strtotime($startDate);
            $startDayOfMonth = $startTsNorm !== false ? (int) date('j', $startTsNorm) : 1;
            if (!isBillingCompleteBeforeDayEndTail($pdo, $company_id, $processId, $exclusiveEnd, $startDate, $startDayOfMonth, $hasPeriodType)) {
                continue;
            }
            if ($today < $exclusiveEnd) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $dayStart, $contract, $r['day_end'] ?? null, $frequency)) {
                continue;
            }
            $createdYmdTail = inboxEffectiveCreatedYmdForProcess($r, $today, $startDate);
            if ($today < maxYmd($startDate, $createdYmdTail)) {
                continue;
            }
            $cost = (float) ($r['cost'] ?? 0);
            $price = (float) ($r['price'] ?? 0);
            $profit = (float) ($r['profit'] ?? 0);
            $tail = prorateInclusiveDateRange($exclusiveEnd, $dayEndInc, $cost, $price, $profit);
            if ($tail['cost'] <= 0 && $tail['price'] <= 0 && $tail['profit'] <= 0) {
                continue;
            }
            try {
                $bm = (new DateTimeImmutable($exclusiveEnd))->format('Y-n');
            } catch (Throwable $e) {
                continue;
            }
            $needToday[] = [
                'id' => $processId,
                'name' => ($r['name'] ?? '') ?: ($r['bank'] ?? ''),
                'bank' => $r['bank'] ?? '',
                'country' => $r['country'] ?? '',
                'day_start' => $dayStart,
                'contract' => $contract ?? '',
                'cost' => $tail['cost'],
                'price' => $tail['price'],
                'profit' => $tail['profit'],
                'already_posted_today' => false,
                'is_partial_first_month' => false,
                'is_day_end_tail' => true,
                'is_manual_inactive' => false,
                'monthly_billing_month' => $bm,
            ];
        }
    }

    // 3) 用户从 active 改为 inactive 的流程：进入 Accounting Due；做完 Transaction 后该行从列表消失，status 保持 inactive
    $inactivePending = fetchInactiveBankProcessesPendingTransaction($pdo, $company_id, $hasPeriodType, $hasIssueFlagColumn, $hasFlagColumn);
    foreach ($inactivePending as $r) {
        $miDayStart = $r['day_start'] ?? null;
        if (empty($miDayStart) || inboxBankProcessDateFieldToYmd((string) $miDayStart) === null) {
            continue;
        }
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