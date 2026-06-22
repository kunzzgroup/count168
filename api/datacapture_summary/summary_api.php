<?php
// 确保 Session Cookie 在同站 POST（如 fetch 提交）时会被发送，避免无痕/部分环境下 403
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'),
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}
session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../includes/money_decimal.php';
require_once __DIR__ . '/summary_api_lib.php';
require_once __DIR__ . '/summary_bootstrap.php';

dcSummaryApiInitScope();

$action = isset($_GET['action']) ? $_GET['action'] : 'load';

$templateActions = ['save_template', 'delete_template', 'templates'];
if (in_array($action, $templateActions, true)) {
    require __DIR__ . '/summary_templates_api.php';
    exit;
}

$stateActions = ['get_summary_state', 'save_summary_state'];
if (in_array($action, $stateActions, true)) {
    require __DIR__ . '/summary_state_api.php';
    exit;
}
if ($action === 'submit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once __DIR__ . '/summary_submit_handler.php';
    dcSummaryApiHandleSubmit();
    exit;
} else {
    // Default action: Load currencies and accounts (group ledger vs subsidiary company)
    try {
        $groupCodeForCatalog = dcNormalizeGroupId(
            $scopeParams['view_group'] ?? $scopeParams['group_id'] ?? ($groupIdForAccess ?? '')
        );
        $isGroupCatalog = !empty($capture_scope_group);
        $currencies = dcSummaryLoadFormCurrencies($pdo, $isGroupCatalog, (int) $company_id, $groupCodeForCatalog);
        $accounts = dcSummaryLoadFormAccounts($pdo, $isGroupCatalog, (int) $company_id, $groupCodeForCatalog);

        error_log(
            'Summary form catalog - scope='
            . ($isGroupCatalog ? 'group' : 'company')
            . ' group=' . $groupCodeForCatalog
            . ' accounts=' . count($accounts)
            . ' currencies=' . count($currencies)
            . ' company_id=' . (int) $company_id
        );

        echo json_encode([
            'success' => true,
            'currencies' => $currencies,
            'accounts' => $accounts,
            'scope' => $isGroupCatalog ? 'group' : 'company',
            'debug' => [
                'accounts_count' => count($accounts),
                'currencies_count' => count($currencies),
                'company_id' => $company_id,
                'capture_scope_group' => $isGroupCatalog,
                'group_code' => $groupCodeForCatalog,
            ]
        ]);
        
    } catch (Exception $e) {
        error_log("API Error: " . $e->getMessage());
        echo json_encode([
            'success' => false,
            'message' => $e->getMessage(),
            'data' => null
        ]);
    }
}
?>
