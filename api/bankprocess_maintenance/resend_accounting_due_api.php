<?php
/**
 * Bank Process List：Resend — 清除已入账标记，使 Process 可再次进入 Accounting Due（入账规则不变）。
 * 成功后置 accounting_resend_relax_created_floor，使 Inbox 在「旧数据不拿」上与日常新建流程区分（见 maintenance_accounting_resend_lib::bmp_inboxEffectiveCreatedYmd）。
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/maintenance_accounting_resend_lib.php';

/** 与 processlist / 前端 isBankInactiveLike：Official、E-INVOICE、Block 不可 Resend（这些在 DB 里常为 status=active） */

/** @return string|null Y-m-d */
function bank_resend_anchor_ymd_from_raw(?string $raw): ?string
{
    if ($raw === null || trim((string) $raw) === '') {
        return null;
    }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', trim((string) $raw), $m)) {
        return null;
    }
    return $m[1] . '-' . $m[2] . '-' . $m[3];
}

/** @return string|null Y-m-d（优先 d/m/Y，其次 yyyy-mm-dd） */
function bank_resend_parse_ymd_from_any_raw(?string $raw): ?string
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
        if (checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    if (preg_match('#^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$#', $s, $m)) {
        $d = (int) $m[1];
        $mo = (int) $m[2];
        $y = (int) $m[3];
        if (checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    return null;
}

function bank_resend_blocking_issue_flag_from_row(array $bpRow): ?string
{
    $combined = '';
    if (isset($bpRow['flag']) && trim((string) $bpRow['flag']) !== '') {
        $combined = trim((string) $bpRow['flag']);
    } elseif (isset($bpRow['issue_flag']) && trim((string) $bpRow['issue_flag']) !== '') {
        $combined = trim((string) $bpRow['issue_flag']);
    }
    $normalized = strtolower(str_replace([' ', '-'], '_', $combined));
    if (in_array($normalized, ['official', 'e_invoice', 'block'], true)) {
        return $normalized;
    }
    return null;
}

function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

/** @return string|null */
function bank_resend_normalizeOptionalYmd($value): ?string
{
    if ($value === null) {
        return null;
    }
    $v = trim((string) $value);
    if ($v === '') {
        return null;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
        throw new Exception('日期格式无效（需 YYYY-MM-DD）');
    }
    return $v;
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('请先登录');
    }
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }
    $company_id = (int) $_SESSION['company_id'];

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('只支持 POST 请求');
    }

    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        throw new Exception('无效的请求数据');
    }
    $bankProcessId = isset($payload['bank_process_id']) ? (int) $payload['bank_process_id'] : 0;
    if ($bankProcessId <= 0) {
        throw new Exception('无效的 Process ID');
    }

    $scheduleFromClient = array_key_exists('day_start', $payload)
        || array_key_exists('day_end', $payload)
        || array_key_exists('day_start_frequency', $payload);
    $newDayStart = null;
    $newDayEnd = null;
    $newFrequency = '1st_of_every_month';
    if ($scheduleFromClient) {
        $newDayStart = bank_resend_normalizeOptionalYmd($payload['day_start'] ?? null);
        $newDayEnd = bank_resend_normalizeOptionalYmd($payload['day_end'] ?? null);
        $newFrequency = trim((string) ($payload['day_start_frequency'] ?? '1st_of_every_month'));
        if (!in_array($newFrequency, ['1st_of_every_month', 'monthly'], true)) {
            $newFrequency = '1st_of_every_month';
        }
        // 与前端 Add/Edit 一致：已设 day_end 时不允许 monthly
        if ($newDayEnd !== null && $newFrequency === 'monthly') {
            $newFrequency = '1st_of_every_month';
        }
    }

    $selectCols = ['id', 'status'];
    if (bmp_resend_tableHasColumn($pdo, 'bank_process', 'day_start')) {
        $selectCols[] = 'day_start';
    }
    if (bmp_resend_tableHasColumn($pdo, 'bank_process', 'issue_flag')) {
        $selectCols[] = 'issue_flag';
    }
    if (bmp_resend_tableHasColumn($pdo, 'bank_process', 'flag')) {
        $selectCols[] = 'flag';
    }
    $stmt = $pdo->prepare('SELECT ' . implode(', ', $selectCols) . ' FROM bank_process WHERE id = ? AND company_id = ? LIMIT 1');
    $stmt->execute([$bankProcessId, $company_id]);
    $bpRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$bpRow) {
        throw new Exception('未找到该 Bank Process 或无权操作');
    }
    if (strtolower(trim((string) ($bpRow['status'] ?? ''))) !== 'active') {
        throw new Exception('仅状态为 Active 的 Process 可使用 Resend');
    }
    if (bank_resend_blocking_issue_flag_from_row($bpRow) !== null) {
        throw new Exception('Official、E-INVOICE、Block 状态的 Process 不可使用 Resend');
    }

    bmp_ensureMaintenanceResendPendingTable($pdo);
    bmp_ensureBankProcessAccountingResendRelaxColumn($pdo);

    $pdo->beginTransaction();
    // 仅清除 day_start 所在月份的 posted 标记，避免一次 Resend 把整合同期都补回。
    $effectiveDayStartYmd = $scheduleFromClient && $newDayStart !== null
        ? $newDayStart
        : bank_resend_parse_ymd_from_any_raw(isset($bpRow['day_start']) ? (string) $bpRow['day_start'] : null);
    if ($effectiveDayStartYmd === null) {
        throw new Exception('无法识别 Day start，Resend 仅支持按 Day start 当月补单月记录。');
    }
    $targetYear = (int) substr($effectiveDayStartYmd, 0, 4);
    $targetMonth = (int) substr($effectiveDayStartYmd, 5, 2);
    // 兜底：
    // 1) 当月全部 posted 标记（含 maintenance 产生的 *_skipped）都清除，避免残留记录继续拦截 Accounting Due；
    // 2) partial_first_month(_skipped) 在 Inbox 中按「是否存在」判定，非按月份判定，因此也要一并清除。
    $delMonthPap = $pdo->prepare(
        "DELETE FROM process_accounting_posted
         WHERE company_id = ? AND process_id = ?
           AND (
               (YEAR(posted_date) = ? AND MONTH(posted_date) = ?)
               OR period_type IN ('partial_first_month','partial_first_month_skipped')
           )"
    );
    $delMonthPap->execute([$company_id, $bankProcessId, $targetYear, $targetMonth]);
    $removedPap = $delMonthPap->rowCount();

    $delPend = $pdo->prepare(
        'DELETE FROM bank_process_maintenance_resend_pending WHERE company_id = ? AND bank_process_id = ?'
    );
    $delPend->execute([$company_id, $bankProcessId]);

    if ($scheduleFromClient) {
        $hasFreqCol = bmp_resend_tableHasColumn($pdo, 'bank_process', 'day_start_frequency');
        if ($hasFreqCol) {
            $upd = $pdo->prepare(
                'UPDATE bank_process SET day_start = ?, day_end = ?, day_start_frequency = ?, dts_modified = NOW() WHERE id = ? AND company_id = ?'
            );
            $upd->execute([$newDayStart, $newDayEnd, $newFrequency, $bankProcessId, $company_id]);
        } else {
            $upd = $pdo->prepare(
                'UPDATE bank_process SET day_start = ?, day_end = ?, dts_modified = NOW() WHERE id = ? AND company_id = ?'
            );
            $upd->execute([$newDayStart, $newDayEnd, $bankProcessId, $company_id]);
        }
    }

    $flg = $pdo->prepare(
        'UPDATE bank_process SET accounting_resend_relax_created_floor = 1, dts_modified = NOW() WHERE id = ? AND company_id = ?'
    );
    $flg->execute([$bankProcessId, $company_id]);

    $pdo->commit();
    jsonResponse(true, '已处理：该 Process 可再次进入 Accounting Due', [
        'bank_process_id' => $bankProcessId,
        'process_accounting_posted_removed' => $removedPap,
    ]);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(false, $e->getMessage(), null, 400);
}
