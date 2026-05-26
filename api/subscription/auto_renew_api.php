<?php
/**
 * Auto renew subscription settings API.
 * Path: api/subscription/auto_renew_api.php
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../includes/auto_renew.php';
require_once __DIR__ . '/../c168/c168_domain_access.php';

session_start();

function auto_renew_json_response(bool $success, string $message, $data = null, ?int $httpCode = null): void
{
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id']) || !isset($_SESSION['company_id'])) {
    auto_renew_json_response(false, 'Unauthorized access', null, 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    auto_renew_json_response(false, 'Invalid request method', null, 405);
}

$userType = strtolower(trim((string) ($_SESSION['user_type'] ?? '')));
if ($userType === 'member') {
    auto_renew_json_response(false, 'Members cannot access auto renew settings', null, 403);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}
$action = strtolower(trim((string) ($input['action'] ?? 'get')));

try {
    auto_renew_ensure_columns($pdo);

    if (!auto_renew_page_access($pdo, $_SESSION)) {
        session_write_close();
        auto_renew_json_response(false, 'Access denied', null, 403);
    }

    if ($action === 'list_companies') {
        session_write_close();
        auto_renew_json_response(true, 'success', [
            'companies' => auto_renew_list_client_companies($pdo),
            'can_edit' => auto_renew_can_edit($_SESSION, $pdo),
        ]);
    }

    $targetCompanyId = auto_renew_resolve_target_company_id($pdo, $input, $_SESSION);
    if (!$targetCompanyId) {
        session_write_close();
        auto_renew_json_response(false, 'Invalid target company', null, 400);
    }

    $stmt = $pdo->prepare('
        SELECT company_id, expiration_date, auto_renew_enabled, auto_renew_period,
               payment_customer_id, payment_subscription_id,
               auto_renew_updated_at, auto_renew_updated_by
        FROM company
        WHERE id = ?
        LIMIT 1
    ');
    $stmt->execute([$targetCompanyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        auto_renew_json_response(false, 'Company not found', null, 404);
    }

    $canEdit = auto_renew_can_edit($_SESSION, $pdo);

    if ($action === 'get') {
        session_write_close();
        auto_renew_json_response(true, 'success', array_merge(
            auto_renew_format_row($row),
            [
                'can_edit' => $canEdit,
                'company_numeric_id' => $targetCompanyId,
            ]
        ));
    }

    if ($action === 'update') {
        if (!$canEdit) {
            session_write_close();
            auto_renew_json_response(false, 'Only C168 owner or admin can update auto renew settings', null, 403);
        }

        $enabled = !empty($input['auto_renew_enabled']);
        $period = auto_renew_normalize_period($input['auto_renew_period'] ?? null);
        $expirationDate = !empty($row['expiration_date']) ? (string) $row['expiration_date'] : null;

        if ($enabled && !$expirationDate) {
            session_write_close();
            auto_renew_json_response(false, 'Expiration date must be set before enabling auto renew', null, 400);
        }

        if ($enabled && !$period) {
            session_write_close();
            auto_renew_json_response(false, 'Renewal period is required when auto renew is enabled', null, 400);
        }

        if (!$enabled) {
            $period = null;
        }

        $updatedBy = (string) ($_SESSION['login_id'] ?? 'system');
        $updateStmt = $pdo->prepare('
            UPDATE company
            SET auto_renew_enabled = ?,
                auto_renew_period = ?,
                auto_renew_updated_at = NOW(),
                auto_renew_updated_by = ?
            WHERE id = ?
        ');
        $updateStmt->execute([
            $enabled ? 1 : 0,
            $period,
            $updatedBy,
            $targetCompanyId,
        ]);

        $row['auto_renew_enabled'] = $enabled ? 1 : 0;
        $row['auto_renew_period'] = $period;
        $row['auto_renew_updated_at'] = date('Y-m-d H:i:s');
        $row['auto_renew_updated_by'] = $updatedBy;

        session_write_close();
        auto_renew_json_response(true, 'Auto renew settings saved', array_merge(
            auto_renew_format_row($row),
            [
                'can_edit' => true,
                'company_numeric_id' => $targetCompanyId,
            ]
        ));
    }

    session_write_close();
    auto_renew_json_response(false, 'Unknown action', null, 400);
} catch (PDOException $e) {
    error_log('auto_renew_api PDO: ' . $e->getMessage());
    session_write_close();
    auto_renew_json_response(false, 'Database error', null, 500);
} catch (Throwable $e) {
    error_log('auto_renew_api: ' . $e->getMessage());
    session_write_close();
    auto_renew_json_response(false, 'System error', null, 500);
}
