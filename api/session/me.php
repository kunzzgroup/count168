<?php
/**
 * 返回当前登录会话信息（给 React SPA 使用）
 * 路径: /api/session/me.php
 */

require_once __DIR__ . '/../../session_check.php';
require_once __DIR__ . '/../api_response.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $companyCode = null;
    $companyName = null;
    $companyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : null;

    if ($companyId) {
        $stmt = $pdo->prepare("SELECT company_id FROM company WHERE id = ? LIMIT 1");
        $stmt->execute([$companyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $companyCode = $row['company_id'] ?? null;
            $companyName = $row['company_id'] ?? null;
        }
    }

    api_success([
        'user_id' => isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null,
        'login_id' => $_SESSION['login_id'] ?? null,
        'name' => $_SESSION['name'] ?? null,
        'role' => $_SESSION['role'] ?? null,
        'user_type' => $_SESSION['user_type'] ?? null,
        'company_id' => $companyId,
        'company_code' => $companyCode,
        'company_name' => $companyName
    ]);
} catch (Throwable $e) {
    api_error('读取会话信息失败', 500, ['details' => $e->getMessage()]);
}
