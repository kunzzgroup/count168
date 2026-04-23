<?php
/**
 * Current session user (SPA bootstrap). Read-only; releases session lock quickly.
 */
session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');

$pdo = null;
try {
    require_once __DIR__ . '/../../config.php';
    require_once __DIR__ . '/../../includes/c168_domain_access.php';
} catch (Throwable $e) {
    // Do not fail bootstrap because of DB wiring errors; session data is still enough for routing.
    error_log('current_user_api config load failed: ' . $e->getMessage());
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not logged in', 'data' => null], JSON_UNESCAPED_UNICODE);
    exit;
}

$userType = strtolower((string) ($_SESSION['user_type'] ?? ''));
if ($userType === '') {
    $userType = isset($_SESSION['role']) && strtolower((string) $_SESSION['role']) === 'owner' ? 'owner' : 'user';
}

$needsOwnerSecondary = ($userType === 'owner')
    && (!isset($_SESSION['secondary_password_verified']) || $_SESSION['secondary_password_verified'] !== true);

$companyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : null;
$expirationHint = 'No expiration date';
$expirationStatus = 'normal';
$permissions = [];
$isCurrentCompanyC168 = false;
$hasC168DomainPageAccess = false;
$companyHasGambling = false;
$companyHasBank = false;

if ($companyId && $pdo instanceof PDO) {
    try {
        $stmtPerm = $pdo->prepare("SELECT permissions FROM user WHERE id = ?");
        $stmtPerm->execute([$_SESSION['user_id']]);
        $userPermissions = $stmtPerm->fetchColumn();
        $permissions = $userPermissions ? (json_decode((string) $userPermissions, true) ?: []) : [];

        $companyCode = strtoupper(trim((string) ($_SESSION['company_code'] ?? '')));
        if ($companyCode === 'C168') {
            $isCurrentCompanyC168 = true;
        } else {
            $stmtC168 = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
            $stmtC168->execute([$companyId]);
            $isCurrentCompanyC168 = ((int) $stmtC168->fetchColumn()) > 0;
        }
        $hasC168DomainPageAccess = $isCurrentCompanyC168 && userHasC168DomainPageAccess(strtolower((string) ($_SESSION['role'] ?? '')));

        $stmtCompanyPerm = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
        $stmtCompanyPerm->execute([$companyId]);
        $companyPermsRaw = $stmtCompanyPerm->fetchColumn();
        $companyPerms = $companyPermsRaw ? (json_decode((string) $companyPermsRaw, true) ?: []) : [];
        if (is_array($companyPerms)) {
            $companyHasGambling = in_array('Games', $companyPerms, true) || in_array('Gambling', $companyPerms, true);
            $companyHasBank = in_array('Bank', $companyPerms, true);
        }

        $stmt = $pdo->prepare('SELECT expiration_date FROM company WHERE id = ?');
        $stmt->execute([$companyId]);
        $companyExpirationDate = $stmt->fetchColumn();

        if ($companyExpirationDate) {
            $now = new DateTime();
            $now->setTime(0, 0, 0);
            $expiration = new DateTime((string) $companyExpirationDate);
            $expiration->setTime(0, 0, 0);

            $diff = $now->diff($expiration);
            $diffDays = (int) $diff->format('%r%a');

            if ($diffDays < 0) {
                $expirationHint = 'Expired';
                $expirationStatus = 'expired';
            } elseif ($diffDays === 0) {
                $expirationHint = 'Expires today';
                $expirationStatus = 'warning';
            } elseif ($diffDays <= 7) {
                $expirationHint = $diffDays . ' day' . ($diffDays > 1 ? 's' : '') . ' left';
                $expirationStatus = 'warning';
            } elseif ($diffDays <= 30) {
                $expirationHint = $diffDays . ' days left';
                $expirationStatus = 'normal';
            } else {
                $months = (int) floor($diffDays / 30);
                $days = $diffDays % 30;
                if ($days === 0) {
                    $expirationHint = $months . ' month' . ($months > 1 ? 's' : '') . ' left';
                } else {
                    $expirationHint = $months . 'm ' . $days . 'd left';
                }
                $expirationStatus = 'normal';
            }
        }
    } catch (Throwable $e) {
        error_log('current_user_api expiration: ' . $e->getMessage());
        $expirationHint = 'No expiration date';
    }
}

echo json_encode([
    'success' => true,
    'message' => '',
    'data' => [
        'name' => (string) ($_SESSION['name'] ?? ''),
        'login_id' => (string) ($_SESSION['login_id'] ?? ''),
        'role' => (string) ($_SESSION['role'] ?? ''),
        'user_type' => $userType,
        'permissions' => is_array($permissions) ? array_values($permissions) : [],
        'is_current_company_c168' => $isCurrentCompanyC168,
        'has_c168_domain_page_access' => $hasC168DomainPageAccess,
        'company_has_gambling' => $companyHasGambling,
        'company_has_bank' => $companyHasBank,
        'company_id' => $companyId ?: null,
        'needs_owner_secondary' => $needsOwnerSecondary,
        'expiration_hint' => $expirationHint,
        'expiration_status' => $expirationStatus,
    ],
], JSON_UNESCAPED_UNICODE);
