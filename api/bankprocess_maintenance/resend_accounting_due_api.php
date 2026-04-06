<?php
/**
 * Bank Process List：Resend — 清除已入账标记，使 Process 可再次进入 Accounting Due（入账规则不变）。
 */

session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/maintenance_accounting_resend_lib.php';

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

    $stmt = $pdo->prepare('SELECT id FROM bank_process WHERE id = ? AND company_id = ? LIMIT 1');
    $stmt->execute([$bankProcessId, $company_id]);
    if (!$stmt->fetchColumn()) {
        throw new Exception('未找到该 Bank Process 或无权操作');
    }

    bmp_ensureMaintenanceResendPendingTable($pdo);

    $stmt = $pdo->prepare(
        'SELECT id, process_accounting_posted_id, period_type, transaction_date
         FROM bank_process_maintenance_resend_pending
         WHERE company_id = ? AND bank_process_id = ?'
    );
    $stmt->execute([$company_id, $bankProcessId]);
    $pending = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($pending)) {
        throw new Exception('没有待 Resend 的记录。请先在 Maintenance（Bank Process 或 Payment）中删除对应的 Bank process 入账交易。');
    }

    $pdo->beginTransaction();
    $removedPap = 0;
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
