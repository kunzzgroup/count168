<?php

require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../../session_check.php';
require_once __DIR__ . '/../../includes/c168_domain_access.php';

$userId = (int) ($_SESSION['user_id'] ?? 0);
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$userType = strtolower((string) ($_SESSION['user_type'] ?? ''));
$companyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : null;

$permissions = [];
if ($userId > 0 && $userType !== 'member') {
    try {
        $stmt = $pdo->prepare("SELECT permissions FROM user WHERE id = ?");
        $stmt->execute([$userId]);
        $rawPermissions = $stmt->fetchColumn();
        $permissions = $rawPermissions ? (json_decode($rawPermissions, true) ?: []) : [];
    } catch (Throwable $e) {
        error_log('sidebar-context permissions failed: ' . $e->getMessage());
    }
}

$companyCode = strtoupper(trim((string) ($_SESSION['company_code'] ?? '')));
$expirationDate = null;
$companyPerms = [];
$hasBank = false;
$hasGambling = false;
$isCurrentCompanyC168 = $companyCode === 'C168';

if ($companyId) {
    try {
        $stmt = $pdo->prepare("SELECT company_id, expiration_date, permissions FROM company WHERE id = ?");
        $stmt->execute([$companyId]);
        $company = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($company) {
            $companyCode = strtoupper(trim((string) ($company['company_id'] ?? $companyCode)));
            $expirationDate = $company['expiration_date'] ?? null;
            $companyPerms = json_decode((string) ($company['permissions'] ?? '[]'), true) ?: [];
            $hasBank = in_array('Bank', $companyPerms, true);
            $hasGambling = in_array('Games', $companyPerms, true) || in_array('Gambling', $companyPerms, true);
            $isCurrentCompanyC168 = $companyCode === 'C168';
        }
    } catch (Throwable $e) {
        error_log('sidebar-context company load failed: ' . $e->getMessage());
    }
}

$expirationCountdownText = '';
if ($expirationDate) {
    $now = new DateTime();
    $now->setTime(0, 0, 0);
    $expiration = new DateTime($expirationDate);
    $expiration->setTime(0, 0, 0);
    $diffDays = (int) $now->diff($expiration)->format('%r%a');
    if ($diffDays < 0) {
        $expirationCountdownText = 'Expired';
    } elseif ($diffDays === 0) {
        $expirationCountdownText = 'Expires today';
    } else {
        $expirationCountdownText = $diffDays . ' days left';
    }
}

api_success([
    'user' => [
        'user_id' => $userId,
        'login_id' => $_SESSION['login_id'] ?? null,
        'name' => $_SESSION['name'] ?? null,
        'role' => $role,
        'user_type' => $userType,
    ],
    'company' => [
        'company_id' => $companyId,
        'company_code' => $companyCode,
        'has_gambling' => $hasGambling,
        'has_bank' => $hasBank,
        'expiration_countdown_text' => $expirationCountdownText,
    ],
    'permissions' => $permissions,
    'flags' => [
        'has_c168_domain_page_access' => $isCurrentCompanyC168 && userHasC168DomainPageAccess($role),
    ],
], 'OK', 'OK_SIDEBAR_CONTEXT');

