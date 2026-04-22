<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../get_companies_helper.php';

session_start();

function sendJson(bool $success, string $message = '', $data = null): void
{
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

if (!isset($_SESSION['user_id'])) {
    sendJson(false, 'Unauthorized');
}

$currentUserId = (int) ($_SESSION['user_id'] ?? 0);
$currentUserRole = strtolower((string) ($_SESSION['role'] ?? ''));
$companyId = isset($_GET['company_id']) ? (int) $_GET['company_id'] : (int) ($_SESSION['company_id'] ?? 0);
$showAll = isset($_GET['showAll']);

if ($currentUserId <= 0 || $companyId <= 0) {
    sendJson(false, 'Invalid session context');
}

try {
    if ($currentUserRole === 'owner') {
        $ownerId = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $currentUserId;
        $userCompanies = getCompaniesByOwner($pdo, (int) $ownerId, true);
    } else {
        $userCompanies = getCompaniesByUser($pdo, $currentUserId, true);
    }
} catch (Throwable $e) {
    error_log('userlist_bootstrap companies query failed: ' . $e->getMessage());
    $userCompanies = [];
}

$validCompanyIds = array_map(static fn($c) => (int) ($c['id'] ?? 0), $userCompanies);
if (!in_array($companyId, $validCompanyIds, true) && count($validCompanyIds) > 0) {
    $companyId = (int) $validCompanyIds[0];
}
$_SESSION['company_id'] = $companyId;

$ownerShadow = null;
try {
    $stmt = $pdo->prepare("
        SELECT o.id, o.owner_code AS login_id, o.name, o.email, 'owner' AS role, o.status, NULL AS last_login, NULL AS created_by, 1 AS is_owner_shadow
        FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE c.id = ?
    ");
    $stmt->execute([$companyId]);
    $ownerShadow = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
} catch (Throwable $e) {
    error_log('userlist_bootstrap owner shadow query failed: ' . $e->getMessage());
}

try {
    $userSql = "
        SELECT DISTINCT
            u.id,
            u.login_id,
            u.name,
            u.email,
            u.role,
            u.status,
            u.last_login,
            u.created_by,
            0 AS is_owner_shadow
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        WHERE ucm.company_id = ?" . ($currentUserRole !== 'owner' ? " AND LOWER(u.role) != 'partnership'" : "") . "
        ORDER BY
            CASE WHEN u.login_id REGEXP '^[0-9]' THEN 0 ELSE 1 END,
            CASE WHEN u.login_id REGEXP '^[0-9]' THEN CAST(u.login_id AS UNSIGNED) ELSE ASCII(UPPER(u.login_id)) END,
            u.login_id ASC
    ";
    $stmt = $pdo->prepare($userSql);
    $stmt->execute([$companyId]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    sendJson(false, 'Failed to load users: ' . $e->getMessage());
}

if ($ownerShadow && $currentUserRole === 'owner') {
    array_unshift($users, $ownerShadow);
}

try {
    $stmt = $pdo->prepare("
        SELECT a.id, a.account_id, a.name, a.status
        FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE ac.company_id = ? AND a.status = 'active'
        ORDER BY a.account_id ASC
    ");
    $stmt->execute([$companyId]);
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('userlist_bootstrap accounts query failed: ' . $e->getMessage());
    $accounts = [];
}

try {
    $stmt = $pdo->prepare("
        SELECT p.id, p.process_id, d.name AS description, p.status
        FROM process p
        LEFT JOIN description d ON p.description_id = d.id
        WHERE p.status = 'active' AND p.company_id = ?
        ORDER BY p.process_id ASC
    ");
    $stmt->execute([$companyId]);
    $processes = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('userlist_bootstrap processes query failed: ' . $e->getMessage());
    $processes = [];
}

$isC168Company = false;
try {
    $stmt = $pdo->prepare("SELECT 1 FROM company WHERE id = ? AND UPPER(company_id) = 'C168' LIMIT 1");
    $stmt->execute([$companyId]);
    $isC168Company = (bool) $stmt->fetchColumn();
} catch (Throwable $e) {
    error_log('userlist_bootstrap c168 check failed: ' . $e->getMessage());
}

sendJson(true, 'ok', [
    'current_user_id' => $currentUserId,
    'current_user_role' => $currentUserRole,
    'current_company_id' => $companyId,
    'show_all' => $showAll,
    'is_c168_company' => $isC168Company,
    'companies' => $userCompanies,
    'users' => $users,
    'accounts' => $accounts,
    'processes' => $processes,
]);
