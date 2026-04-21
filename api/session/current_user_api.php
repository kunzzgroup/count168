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

if ($companyId && $pdo instanceof PDO) {
    try {
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
        'company_id' => $companyId ?: null,
        'needs_owner_secondary' => $needsOwnerSecondary,
        'expiration_hint' => $expirationHint,
        'expiration_status' => $expirationStatus,
    ],
], JSON_UNESCAPED_UNICODE);
