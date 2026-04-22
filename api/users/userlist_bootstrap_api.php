<?php
/**
 * SPA bootstrap for User List (/admin). Returns the same data shape as userlist.php without HTML shell.
 */
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../session_check.php';
require_once __DIR__ . '/../get_companies_helper.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not logged in'], JSON_UNESCAPED_UNICODE);
    exit;
}

$current_user_role = $_SESSION['role'] ?? '';
$current_user_id = $_SESSION['user_id'] ?? null;

$user_companies = [];
try {
    if ($current_user_id) {
        if ($current_user_role === 'owner') {
            $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id;
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true);
        }
    }
} catch (PDOException $e) {
    error_log('userlist_bootstrap: companies: ' . $e->getMessage());
}

$company_id = isset($_GET['company_id']) ? (int) $_GET['company_id'] : (int) ($_SESSION['company_id'] ?? 0);

if ($current_user_id && count($user_companies) > 0) {
    $valid_company = false;
    if ($company_id) {
        foreach ($user_companies as $comp) {
            if ((int) $comp['id'] === $company_id) {
                $valid_company = true;
                break;
            }
        }
    }
    if (!$valid_company) {
        $company_id = (int) $user_companies[0]['id'];
        $_SESSION['company_id'] = $company_id;
    } elseif (isset($_GET['company_id']) && $company_id === (int) $_GET['company_id']) {
        $_SESSION['company_id'] = $company_id;
    } elseif (!isset($_GET['company_id']) && $company_id === (int) ($_SESSION['company_id'] ?? 0)) {
        $_SESSION['company_id'] = $company_id;
    }
} else {
    $company_id = (int) ($_SESSION['company_id'] ?? 0);
}

$owner_shadow = null;
if ($company_id > 0) {
    try {
        $stmt = $pdo->prepare("
            SELECT o.id, o.owner_code as login_id, o.name, o.email, 'owner' as role, o.status, NULL as last_login, NULL as created_by, 1 as is_owner_shadow
            FROM owner o
            INNER JOIN company c ON c.owner_id = o.id
            WHERE c.id = ?
        ");
        $stmt->execute([$company_id]);
        $owner_shadow = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (PDOException $e) {
        error_log('userlist_bootstrap owner shadow: ' . $e->getMessage());
    }
}

$users = [];
if ($company_id) {
    try {
        $stmt = $pdo->prepare("
            SELECT DISTINCT
                u.id,
                u.login_id,
                u.name,
                u.email,
                u.role,
                u.status,
                u.last_login,
                u.created_by,
                0 as is_owner_shadow
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE ucm.company_id = ?" . ($current_user_role !== 'owner' ? " AND LOWER(u.role) != 'partnership'" : '') . "
            ORDER BY
            CASE WHEN login_id REGEXP '^[0-9]' THEN 0 ELSE 1 END,
            CASE WHEN login_id REGEXP '^[0-9]' THEN CAST(login_id AS UNSIGNED) ELSE ASCII(UPPER(login_id)) END,
            login_id ASC
        ");
        $stmt->execute([$company_id]);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($owner_shadow && $current_user_role === 'owner') {
            array_unshift($users, $owner_shadow);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Query failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$accounts = [];
if ($company_id) {
    try {
        $accountStmt = $pdo->prepare("
            SELECT a.id, a.account_id, a.name, a.status
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ? AND a.status = 'active'
            ORDER BY a.account_id ASC
        ");
        $accountStmt->execute([$company_id]);
        $accounts = $accountStmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log('userlist_bootstrap accounts: ' . $e->getMessage());
    }
}

$processes = [];
if ($company_id) {
    try {
        $processStmt = $pdo->prepare("
            SELECT p.id, p.process_id, d.name AS description, p.status
            FROM process p
            LEFT JOIN description d ON p.description_id = d.id
            WHERE p.status = 'active' AND p.company_id = ?
            ORDER BY p.process_id ASC
        ");
        $processStmt->execute([$company_id]);
        $processes = $processStmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log('userlist_bootstrap processes: ' . $e->getMessage());
    }
}

$is_c168_company = false;
if ($company_id) {
    try {
        $stmt = $pdo->prepare("SELECT company_id FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
        $stmt->execute([$company_id]);
        if ($stmt->fetch()) {
            $is_c168_company = true;
        }
    } catch (PDOException $e) {
        error_log('userlist_bootstrap c168: ' . $e->getMessage());
    }
}

$role_hierarchy = [
    'owner' => 0,
    'partnership' => 1,
    'admin' => 2,
    'manager' => 3,
    'supervisor' => 4,
    'accountant' => 5,
    'audit' => 6,
    'customer service' => 7,
];
$low_privilege_roles = ['manager', 'supervisor', 'accountant', 'audit', 'customer service'];
$current_user_level = $role_hierarchy[strtolower((string) $current_user_role)] ?? 999;

$users_out = [];
foreach ($users as $user) {
    $is_owner_shadow = !empty($user['is_owner_shadow']);
    $user_role = strtolower((string) ($user['role'] ?? ''));
    $is_admin_user = $user_role === 'admin';
    $is_owner_user = $user_role === 'owner';
    $is_low_privilege_user = in_array(strtolower((string) $current_user_role), $low_privilege_roles, true);
    $is_self = ($current_user_id && (int) $user['id'] === (int) $current_user_id);
    $target_user_level = $role_hierarchy[$user_role] ?? 999;
    $is_same_level = ($current_user_level === $target_user_level && !$is_self);
    $is_higher_level = ($target_user_level < $current_user_level);

    if ($is_self) {
        $can_edit_delete = true;
        $can_delete = false;
    } elseif ($is_owner_shadow) {
        $can_edit_delete = $current_user_role === 'owner';
        $can_delete = $current_user_role === 'owner';
    } elseif ($is_low_privilege_user && ($is_admin_user || $is_owner_user)) {
        $can_edit_delete = false;
        $can_delete = false;
    } elseif ($is_same_level) {
        $can_edit_delete = true;
        $can_delete = false;
    } elseif ($is_higher_level) {
        $can_edit_delete = true;
        $can_delete = false;
    } else {
        $can_edit_delete = true;
        $can_delete = true;
    }
    $can_toggle_status = $can_edit_delete && !$is_self;

    $last_raw = $user['last_login'] ?? null;
    $last_display = '';
    if ($last_raw) {
        $ts = strtotime((string) $last_raw);
        $last_display = $ts ? date('Y-m-d H:i', $ts) : '';
    }

    $users_out[] = [
        'id' => (int) $user['id'],
        'login_id' => $user['login_id'],
        'name' => $user['name'],
        'email' => $user['email'] ?? '',
        'role' => $user['role'],
        'status' => $user['status'],
        'last_login' => $last_display,
        'created_by' => $user['created_by'] ?? '',
        'is_owner_shadow' => $is_owner_shadow ? 1 : 0,
        'can_edit_delete' => $can_edit_delete,
        'can_delete' => $can_delete,
        'can_toggle_status' => $can_toggle_status,
    ];
}

$filter_prefix = 'transaction';
ob_start();
include __DIR__ . '/../../includes/company_filter.php';
$company_filter_html = ob_get_clean();
// SPA 自行加载 shared_company_filter.js；内嵌 <script> 在 innerHTML 中通常不会执行
$company_filter_html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $company_filter_html);

$show_all = isset($_GET['showAll']);

$jsPath = __DIR__ . '/../../js/userlist.js';
$userlist_mtime = file_exists($jsPath) ? filemtime($jsPath) : time();

echo json_encode([
    'success' => true,
    'data' => [
        'users' => $users_out,
        'accounts' => $accounts,
        'processes' => $processes,
        'user_companies' => $user_companies,
        'company_id' => $company_id,
        'company_filter_html' => $company_filter_html,
        'is_c168_company' => $is_c168_company,
        'show_all' => $show_all,
        'current_user_id' => $current_user_id ? (int) $current_user_id : null,
        'current_user_role' => strtolower((string) $current_user_role),
        'current_company_id' => $company_id ?: null,
        'userlist_js_mtime' => $userlist_mtime,
    ],
], JSON_UNESCAPED_UNICODE);
