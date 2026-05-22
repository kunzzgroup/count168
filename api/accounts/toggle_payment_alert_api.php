<?php
/**
 * Toggle Account Payment Alert API
 * 路径: api/accounts/toggle_payment_alert_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../includes/partnership_audit_readonly.php';
require_once __DIR__ . '/../api_response.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_error('Invalid request method', 405);
    exit;
}

function toggleAlertValidateCompanyAccess(PDO $pdo, int $company_id): void {
    $current_user_id = $_SESSION['user_id'] ?? null;
    if (!$current_user_id) {
        throw new Exception('用户未登录');
    }
    $current_user_role = $_SESSION['role'] ?? '';
    if ($current_user_role === 'owner') {
        $owner_id = $_SESSION['owner_id'] ?? $current_user_id;
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?");
        $stmt->execute([$company_id, $owner_id]);
        if ($stmt->fetchColumn() == 0) {
            throw new Exception('无权限访问该公司');
        }
    } else {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?");
        $stmt->execute([$current_user_id, $company_id]);
        if ($stmt->fetchColumn() == 0) {
            throw new Exception('无权限访问该公司');
        }
    }
}

function alertFormatDomainAutoDisplayAccountId(string $rawAccountId): string {
    $rawAccountId = trim($rawAccountId);
    if ($rawAccountId === '') {
        return $rawAccountId;
    }
    if (strpos($rawAccountId, '_') !== false) {
        $parts = explode('_', $rawAccountId);
        $count = count($parts);
        if ($count >= 3) {
            $last = trim((string)$parts[count($parts) - 1]);
            $prev = trim((string)$parts[count($parts) - 2]);
            if ($last !== '' && ctype_digit($last) && $prev !== '') {
                return $prev;
            }
        }
        if ($count >= 2) {
            $last = trim((string)$parts[$count - 1]);
            if ($last !== '') {
                return $last;
            }
        }
    }
    return $rawAccountId;
}

function alertResolveAccountPk(PDO $pdo, int $companyId, int $numericPk, string $accountCode, string $displayCode): int {
    if ($numericPk > 0) {
        $stmt = $pdo->prepare("SELECT a.id FROM account a INNER JOIN account_company ac ON a.id = ac.account_id WHERE a.id = ? AND ac.company_id = ? LIMIT 1");
        $stmt->execute([$numericPk, $companyId]);
        $found = (int)$stmt->fetchColumn();
        if ($found > 0) {
            return $found;
        }
    }
    $needles = [];
    foreach ([$accountCode, $displayCode] as $code) {
        $code = strtoupper(trim($code));
        if ($code !== '') {
            $needles[$code] = true;
        }
    }
    if (empty($needles)) {
        return 0;
    }
    foreach (array_keys($needles) as $needle) {
        $stmt = $pdo->prepare("SELECT a.id FROM account a INNER JOIN account_company ac ON a.id = ac.account_id WHERE ac.company_id = ? AND UPPER(TRIM(a.account_id)) = ? LIMIT 1");
        $stmt->execute([$companyId, $needle]);
        $found = (int)$stmt->fetchColumn();
        if ($found > 0) {
            return $found;
        }
    }
    $stmt = $pdo->prepare("SELECT a.id, a.account_id FROM account a INNER JOIN account_company ac ON a.id = ac.account_id WHERE ac.company_id = ?");
    $stmt->execute([$companyId]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $raw = strtoupper(trim((string)($row['account_id'] ?? '')));
        if ($raw === '') {
            continue;
        }
        $display = strtoupper(trim(alertFormatDomainAutoDisplayAccountId((string)$row['account_id'])));
        foreach (array_keys($needles) as $needle) {
            if ($raw === $needle || $display === $needle) {
                return (int)$row['id'];
            }
        }
    }
    return 0;
}

function getAccountPaymentAlert(PDO $pdo, int $accountId, int $companyId): ?array {
    $stmt = $pdo->prepare("
        SELECT a.payment_alert FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE a.id = ? AND ac.company_id = ?
    ");
    $stmt->execute([$accountId, $companyId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function updateAccountPaymentAlert(PDO $pdo, int $value, int $accountId): void {
    $stmt = $pdo->prepare("UPDATE account SET payment_alert = ? WHERE id = ?");
    $stmt->execute([$value, $accountId]);
    if ($stmt->rowCount() == 0) throw new Exception('Payment alert 更新失败');
}

try {
    if (!isset($_SESSION['company_id'])) {
        api_error('用户未登录或缺少公司信息', 401);
        exit;
    }
    if (is_partnership_audit_read_only_active($pdo)) {
        api_error('只读账号无法修改支付提醒', 403);
        exit;
    }

    $companyId = isset($_POST['company_id']) && $_POST['company_id'] !== ''
        ? (int)$_POST['company_id']
        : (int)$_SESSION['company_id'];
    if ($companyId <= 0) {
        api_error('用户未登录或缺少公司信息', 401);
        exit;
    }
    toggleAlertValidateCompanyAccess($pdo, $companyId);

    $accountPk = alertResolveAccountPk(
        $pdo,
        $companyId,
        (int)($_POST['account_id'] ?? $_POST['id'] ?? 0),
        trim((string)($_POST['account_code'] ?? '')),
        trim((string)($_POST['display_account_code'] ?? ''))
    );
    if ($accountPk <= 0) {
        api_error('无效的账户ID', 400);
        exit;
    }
    $current = getAccountPaymentAlert($pdo, $accountPk, $companyId);
    if (!$current) {
        api_error('无权限操作此账户', 403);
        exit;
    }
    $newPaymentAlert = $current['payment_alert'] == 1 ? 0 : 1;
    updateAccountPaymentAlert($pdo, $newPaymentAlert, $accountPk);
    api_success(['newPaymentAlert' => $newPaymentAlert], 'Payment alert 更新成功');
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}
