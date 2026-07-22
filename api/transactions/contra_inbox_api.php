<?php
/**
 * Approval Inbox API (Manager+)
 * 返回当前公司所有待批准的审批交易（approval_status = PENDING）
 * 路径: api/transactions/contra_inbox_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/contra_inbox_lib.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('请先登录', 401);
        exit;
    }
    $userRole = strtolower($_SESSION['role'] ?? '');
    $userType = strtolower($_SESSION['user_type'] ?? 'user');
    if ($userType === 'member' || !contraInboxIsManagerOrAboveRole($userRole)) {
        api_error('无权访问', 403);
        exit;
    }
    if (!contraInboxTableHasColumn($pdo, 'transactions', 'approval_status')) {
        echo json_encode([
            'success' => true,
            'message' => '',
            'data' => [],
            'sig' => sha1(''),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $companyId = contraInboxResolveCompanyId($pdo);
    $items = contraInboxFetchPending($pdo, $companyId);
    echo json_encode([
        'success' => true,
        'message' => '',
        'data' => $items,
        'sig' => contraInboxSignatureFromItems($items),
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}
