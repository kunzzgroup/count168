<?php
/**
 * Bank Process List：Resend — 清除已入账标记，使 Process 可再次进入 Accounting Due（入账规则不变）。
 */

session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/maintenance_accounting_resend_lib.php';

/** 与 processlist / 前端 isBankInactiveLike：Official、E-INVOICE、Block 不可 Resend（这些在 DB 里常为 status=active） */
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

    $selectCols = ['id', 'status'];
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

    $stmt = $pdo->prepare(
        'SELECT id, process_accounting_posted_id, period_type, transaction_date
         FROM bank_process_maintenance_resend_pending
         WHERE company_id = ? AND bank_process_id = ?'
    );
    $stmt->execute([$company_id, $bankProcessId]);
    $pending = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $orphanClearAllPap = false;
    if (empty($pending)) {
        $hasSourceCol = bmp_resend_tableHasColumn($pdo, 'transactions', 'source_bank_process_id');
        if (!$hasSourceCol) {
            throw new Exception('没有待 Resend 的记录。请先在 Maintenance（Bank Process 或 Payment）中删除对应的 Bank process 入账交易，或从 Accounting Due 移除该行。');
        }
        $cntStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM transactions t WHERE t.source_bank_process_id = ? AND t.company_id = ?'
        );
        $cntStmt->execute([$bankProcessId, $company_id]);
        if ((int) $cntStmt->fetchColumn() > 0) {
            throw new Exception('没有待 Resend 的记录。请先在 Maintenance（Bank Process 或 Payment）中删除对应的 Bank process 入账交易，或从 Accounting Due 移除该行。');
        }
        $papCh = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$papCh || $papCh->rowCount() === 0) {
            throw new Exception('没有待 Resend 的记录。请先在 Maintenance（Bank Process 或 Payment）中删除对应的 Bank process 入账交易，或从 Accounting Due 移除该行。');
        }
        $papCntStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM process_accounting_posted WHERE company_id = ? AND process_id = ?'
        );
        $papCntStmt->execute([$company_id, $bankProcessId]);
        if ((int) $papCntStmt->fetchColumn() === 0) {
            throw new Exception('没有待 Resend 的记录。请先在 Maintenance（Bank Process 或 Payment）中删除对应的 Bank process 入账交易，或从 Accounting Due 移除该行。');
        }
        $orphanClearAllPap = true;
    }

    $pdo->beginTransaction();
    $removedPap = 0;
    if ($orphanClearAllPap) {
        $delAll = $pdo->prepare('DELETE FROM process_accounting_posted WHERE company_id = ? AND process_id = ?');
        $delAll->execute([$company_id, $bankProcessId]);
        $removedPap = $delAll->rowCount();
    } else {
        foreach ($pending as $row) {
            $papId = isset($row['process_accounting_posted_id']) ? (int) $row['process_accounting_posted_id'] : 0;
            if ($papId > 0) {
                $del = $pdo->prepare('DELETE FROM process_accounting_posted WHERE id = ? AND company_id = ?');
                $del->execute([$papId, $company_id]);
                $removedPap += $del->rowCount();
            } else {
                $pt = bmp_normalizePeriodType($row['period_type'] ?? 'monthly');
                $txd = $row['transaction_date'] ?? '1970-01-01';
                $removedPap += bmp_deletePapFallback($pdo, $company_id, $bankProcessId, $pt, (string) $txd);
            }
        }

        $delPend = $pdo->prepare(
            'DELETE FROM bank_process_maintenance_resend_pending WHERE company_id = ? AND bank_process_id = ?'
        );
        $delPend->execute([$company_id, $bankProcessId]);
    }

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
