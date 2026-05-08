<?php
/**
 * Legacy PHP shell → SPA「Deleted Log」页面（逻辑由 React + api/deleted_log_list_api.php 承担）。
 */
require_once __DIR__ . '/session_check.php';
require_once __DIR__ . '/includes/deleted_log_page_scope.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$userType = strtolower((string) ($_SESSION['user_type'] ?? ''));
$canAccess = in_array($role, ['admin', 'owner', 'manager', 'supervisor'], true)
    || $userType === 'owner';
if (!$canAccess) {
    header('Location: dashboard.php');
    exit;
}

$scope = deleted_log_page_company_scope($pdo);
if ($scope['mode'] === 'none') {
    header('Location: dashboard.php');
    exit;
}

$qs = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? ('?' . $_SERVER['QUERY_STRING']) : '';
header('Location: /deleted-log' . $qs);
exit;
