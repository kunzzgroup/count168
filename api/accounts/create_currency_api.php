<?php
/**
 * 创建货币 API：JSON body { code, company_id? }，返回 { success, data: { id, code } }
 * 路径: api/accounts/create_currency_api.php
 */
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../includes/partnership_audit_readonly.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
}

function jsonOut(bool $success, string $message, $data = null) {
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data]);
}

function userCanAccessCompany(PDO $pdo, int $companyId, ?string $viewGroup = null): bool {
    if (gc_is_group_login()) {
        return gc_session_can_access_company_id($pdo, $companyId, $viewGroup);
    }
    $userId = $_SESSION['user_id'] ?? 0;
    $role = $_SESSION['role'] ?? '';
    $ownerId = $_SESSION['owner_id'] ?? $userId;
    if ($role === 'owner') {
        $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
        $stmt->execute([$companyId, $ownerId]);
    } else {
        $stmt = $pdo->prepare("SELECT 1 FROM user_company_map WHERE user_id = ? AND company_id = ? LIMIT 1");
        $stmt->execute([$userId, $companyId]);
    }
    return (bool) $stmt->fetchColumn();
}

function normalizeGroupId(?string $groupId): ?string {
    $g = strtoupper(trim((string)($groupId ?? '')));
    return $g !== '' ? $g : null;
}

function resolveGroupEntityCompanyId(PDO $pdo, string $groupId): int {
    $stmt = $pdo->prepare("
        SELECT id
        FROM company
        WHERE UPPER(TRIM(company_id)) = ?
        LIMIT 1
    ");
    $stmt->execute([$groupId]);
    $id = (int)($stmt->fetchColumn() ?: 0);
    if ($id > 0) {
        return $id;
    }

    $placeholderStmt = $pdo->prepare("
        SELECT id
        FROM company
        WHERE TRIM(COALESCE(company_id, '')) = ''
          AND UPPER(TRIM(group_id)) = ?
        ORDER BY id ASC
        LIMIT 1
    ");
    $placeholderStmt->execute([$groupId]);
    return (int)($placeholderStmt->fetchColumn() ?: 0);
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        jsonOut(false, 'Only POST allowed', null);
        exit;
    }
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonOut(false, '用户未登录', null);
        exit;
    }

    if (is_partnership_audit_read_only_active($pdo)) {
        http_response_code(403);
        jsonOut(false, '只读账号无法创建币种', null);
        exit;
    }

    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
        http_response_code(400);
        jsonOut(false, 'Invalid JSON', null);
        exit;
    }

    $code = isset($input['code']) ? trim((string) $input['code']) : '';
    if ($code === '') {
        http_response_code(400);
        jsonOut(false, 'Currency code is required', null);
        exit;
    }
    $code = strtoupper($code);

    $groupScopeId = normalizeGroupId($input['group_id'] ?? null);
    $companyId = 0;
    if (isset($input['company_id']) && $input['company_id'] !== '' && $input['company_id'] !== null) {
        $companyId = (int) $input['company_id'];
        if ($companyId > 0 && gc_is_group_login()) {
            gc_assert_company_id_allowed_for_login_scope($pdo, $companyId, $groupScopeId);
        }
    } elseif ($groupScopeId !== null) {
        $companyId = resolveGroupEntityCompanyId($pdo, $groupScopeId);
        if ($companyId > 0 && gc_is_group_login()) {
            gc_assert_company_id_allowed_for_login_scope($pdo, $companyId, $groupScopeId);
        }
    }
    if ($companyId <= 0 && isset($_SESSION['company_id'])) {
        $companyId = (int) $_SESSION['company_id'];
    }
    if ($companyId <= 0) {
        http_response_code(400);
        jsonOut(false, '缺少公司信息', null);
        exit;
    }

    if (!userCanAccessCompany($pdo, $companyId, $groupScopeId)) {
        http_response_code(403);
        jsonOut(false, '无权限访问该公司', null);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM currency WHERE code = ? AND company_id = ?");
    $stmt->execute([$code, $companyId]);
    if ($stmt->fetchColumn()) {
        http_response_code(400);
        jsonOut(false, 'Currency ' . $code . ' already exists', null);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO currency (code, company_id) VALUES (?, ?)");
    $stmt->execute([$code, $companyId]);
    $id = (int) $pdo->lastInsertId();

    jsonOut(true, 'OK', ['id' => $id, 'code' => $code]);
} catch (PDOException $e) {
    error_log('create_currency_api: ' . $e->getMessage());
    http_response_code(500);
    jsonOut(false, '数据库错误', null);
} catch (Exception $e) {
    http_response_code(400);
    jsonOut(false, $e->getMessage(), null);
}
