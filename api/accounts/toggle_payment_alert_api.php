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

    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) {
        api_error('无效的账户ID', 400);
        exit;
    }
    $current = getAccountPaymentAlert($pdo, $id, $companyId);
    if (!$current) {
        api_error('无权限操作此账户', 403);
        exit;
    }
    $newPaymentAlert = $current['payment_alert'] == 1 ? 0 : 1;
    updateAccountPaymentAlert($pdo, $newPaymentAlert, $id);
    api_success(['newPaymentAlert' => $newPaymentAlert], 'Payment alert 更新成功');
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}
