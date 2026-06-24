<?php
/**
 * Bank Data Capture 公司级表格草稿 API（SALARY / COMMISSION / BONUS）
 * GET  ?action=get&process_key=SALARY&currency_id=810
 * POST ?action=save  body: { process_key, currency_id, draft_json }
 */
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
session_start();
session_write_close();
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';

const DRAFT_SAVE_PROCESS_CODES = ['SALARY', 'COMMISSION', 'BONUS'];

function draftApiEnsureTable(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS data_capture_draft (
            id INT NOT NULL AUTO_INCREMENT,
            scope_type ENUM('group', 'company') NOT NULL,
            group_id VARCHAR(50) NULL,
            company_id INT NULL,
            process_key VARCHAR(64) NOT NULL,
            currency_id INT NOT NULL,
            draft_json LONGTEXT NOT NULL,
            updated_by INT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uk_group_process_currency (group_id, process_key, currency_id),
            UNIQUE KEY uk_company_process_currency (company_id, process_key, currency_id),
            KEY idx_scope_type (scope_type),
            KEY idx_group_id (group_id),
            KEY idx_company_id (company_id),
            KEY idx_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    draftApiMigrateLegacyCompanyDraft($pdo);
}

function draftApiMigrateLegacyCompanyDraft(PDO $pdo): void
{
    static $migrated = false;
    if ($migrated) {
        return;
    }
    $migrated = true;

    $stmt = $pdo->query("SHOW TABLES LIKE 'data_capture_company_draft'");
    if ($stmt->rowCount() === 0) {
        return;
    }

    $pdo->exec("
        INSERT INTO data_capture_draft
            (scope_type, group_id, company_id, process_key, currency_id, draft_json, updated_by, updated_at)
        SELECT
            'company', NULL, company_id, UPPER(TRIM(process_key)), currency_id, draft_json, updated_by, updated_at
        FROM data_capture_company_draft
        ON DUPLICATE KEY UPDATE
            draft_json = VALUES(draft_json),
            updated_by = VALUES(updated_by),
            updated_at = VALUES(updated_at)
    ");
}

function draftApiIsSaveableProcess(string $code): bool
{
    $code = strtoupper(trim($code));
    return $code !== '' && in_array($code, DRAFT_SAVE_PROCESS_CODES, true);
}

function draftApiResolveCompanyId(): ?int
{
    if (isset($_SESSION['company_id']) && (int)$_SESSION['company_id'] > 0) {
        return (int)$_SESSION['company_id'];
    }
    if (isset($_GET['company_id']) && (int)$_GET['company_id'] > 0) {
        return (int)$_GET['company_id'];
    }
    if (isset($_POST['company_id']) && (int)$_POST['company_id'] > 0) {
        return (int)$_POST['company_id'];
    }
    return null;
}

function draftApiAssertCompanyAccess(PDO $pdo, int $companyId): void
{
    $currentUserId = $_SESSION['user_id'] ?? null;
    if (!$currentUserId) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => '未登录', 'data' => null]);
        exit;
    }

    $sessionCompanyId = isset($_SESSION['company_id']) ? (int)$_SESSION['company_id'] : 0;
    if ($sessionCompanyId > 0 && $sessionCompanyId === $companyId) {
        return;
    }

    $role = isset($_SESSION['role']) ? strtolower(trim((string)$_SESSION['role'])) : '';
    $userType = isset($_SESSION['user_type']) ? strtolower(trim((string)$_SESSION['user_type'])) : '';

    if ($role === 'owner' || $userType === 'owner') {
        $ownerId = (int)($_SESSION['owner_id'] ?? $currentUserId);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?');
        $stmt->execute([$companyId, $ownerId]);
        if ((int)$stmt->fetchColumn() === 0) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '无权限访问该公司', 'data' => null]);
            exit;
        }
        return;
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?');
    $stmt->execute([(int)$currentUserId, $companyId]);
    if ((int)$stmt->fetchColumn() > 0) {
        return;
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?');
    $stmt->execute([$companyId, (int)$currentUserId]);
    if ((int)$stmt->fetchColumn() === 0) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '无权限访问该公司', 'data' => null]);
        exit;
    }
}

function draftApiResolveCurrencyId(PDO $pdo, int $companyId, $currencyId): ?int
{
    if ($currencyId === null || $currencyId === '') {
        return null;
    }
    $currencyId = (int)$currencyId;
    if ($currencyId <= 0) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id FROM currency WHERE company_id = ? AND id = ? LIMIT 1');
    $stmt->execute([$companyId, $currencyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? (int)$row['id'] : null;
}

function draftApiUpdatedBy(): ?int
{
    $uid = $_SESSION['user_id'] ?? null;
    if ($uid === null || $uid === '') {
        return null;
    }
    $uid = (int)$uid;
    return $uid > 0 ? $uid : null;
}

try {
    $companyId = draftApiResolveCompanyId();
    if (!$companyId) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => '缺少公司信息', 'data' => null]);
        exit;
    }

    draftApiAssertCompanyAccess($pdo, $companyId);
    draftApiEnsureTable($pdo);

    $action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';

    if ($action === 'get') {
        $processKey = strtoupper(trim((string)($_GET['process_key'] ?? '')));
        $currencyId = draftApiResolveCurrencyId($pdo, $companyId, $_GET['currency_id'] ?? null);

        if (!draftApiIsSaveableProcess($processKey)) {
            echo json_encode(['success' => true, 'data' => null]);
            exit;
        }
        if (!$currencyId) {
            echo json_encode(['success' => false, 'message' => 'Invalid currency_id', 'data' => null]);
            exit;
        }

        $stmt = $pdo->prepare('
            SELECT draft_json, updated_at
            FROM data_capture_draft
            WHERE scope_type = \'company\'
              AND company_id = ?
              AND process_key = ?
              AND currency_id = ?
            LIMIT 1
        ');
        $stmt->execute([$companyId, $processKey, $currencyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $data = null;
        if ($row && !empty($row['draft_json'])) {
            $decoded = json_decode($row['draft_json'], true);
            if (is_array($decoded)) {
                $data = $decoded;
            }
        }

        echo json_encode([
            'success' => true,
            'data' => $data,
            'updated_at' => $row['updated_at'] ?? null,
        ]);
        exit;
    }

    if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
            exit;
        }

        $processKey = strtoupper(trim((string)($payload['process_key'] ?? '')));
        $currencyId = draftApiResolveCurrencyId($pdo, $companyId, $payload['currency_id'] ?? null);
        $draftJson = $payload['draft_json'] ?? null;

        if (!draftApiIsSaveableProcess($processKey)) {
            echo json_encode(['success' => true, 'skipped' => true, 'message' => 'Process not eligible for draft']);
            exit;
        }
        if (!$currencyId) {
            echo json_encode(['success' => false, 'message' => 'Invalid currency_id']);
            exit;
        }
        if (!is_array($draftJson)) {
            echo json_encode(['success' => false, 'message' => 'draft_json must be an object']);
            exit;
        }

        $encoded = json_encode($draftJson, JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            echo json_encode(['success' => false, 'message' => 'Failed to encode draft_json']);
            exit;
        }

        $updatedBy = draftApiUpdatedBy();
        $stmt = $pdo->prepare('
            INSERT INTO data_capture_draft
                (scope_type, group_id, company_id, process_key, currency_id, draft_json, updated_by, updated_at)
            VALUES (\'company\', NULL, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                draft_json = VALUES(draft_json),
                updated_by = VALUES(updated_by),
                updated_at = NOW()
        ');
        $stmt->execute([$companyId, $processKey, $currencyId, $encoded, $updatedBy]);

        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
} catch (Throwable $e) {
    error_log('company_draft_api error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'data' => null]);
}
