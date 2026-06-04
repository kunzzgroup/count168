<?php
/**
 * 用户列表 CRUD API（创建/更新/删除/获取用户）
 * 路径: api/users/userlist_api.php
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/email_validation.php';
require_once __DIR__ . '/../includes/partnership_audit_readonly.php';
require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../get_companies_helper.php';

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行

// 检查用户是否登录
if (!isset($_SESSION['user_id']) || !isset($_SESSION['company_id'])) {
    sendResponse(false, 'Unauthorized access', null);
}

$current_company_id = $_SESSION['company_id'];
$current_user_role = $_SESSION['role'] ?? '';

function canCreateUserByRole($role): bool {
    $hierarchy = [
        'owner' => 0,
        'partnership' => 1,
        'admin' => 2,
        'manager' => 3,
        'supervisor' => 4,
        'accountant' => 5,
        'audit' => 6,
        'customer service' => 7,
    ];
    $normalized = strtolower(trim((string)$role));
    $level = $hierarchy[$normalized] ?? 999;
    return $level < 4;
}

function userlistRoleLevel(string $role): int {
    $hierarchy = [
        'owner' => 0,
        'partnership' => 1,
        'admin' => 2,
        'manager' => 3,
        'supervisor' => 4,
        'accountant' => 5,
        'audit' => 6,
        'customer service' => 7,
    ];
    return $hierarchy[strtolower(trim($role))] ?? 999;
}

/** Audit：manager 及以上可写 read_only；Partnership：仅 owner */
function canSetUserReadOnly(string $currentRole, string $targetUserRole): bool {
    $target = strtolower(trim($targetUserRole));
    $cur = strtolower(trim($currentRole));
    if ($target === 'audit') {
        return userlistRoleLevel($cur) <= userlistRoleLevel('manager');
    }
    if ($target === 'partnership') {
        return $cur === 'owner';
    }
    return false;
}

// 获取当前登录用户（你需要根据你的登录系统调整这个逻辑）
function getCurrentUser() {
    // 这里你需要根据你的登录系统来获取当前用户
    // 示例：如果你在 session 中存储了 login_id
    return $_SESSION['login_id'] ?? 'admin001'; // 默认为 admin001
}

// 检查是否是owner影子记录
function isOwnerShadow($pdo, $id, $company_id) {
    // 先检查user表中是否存在且通过 user_company_map 关联到该 company
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        WHERE u.id = ? AND ucm.company_id = ?
    ");
    $stmt->execute([$id, $company_id]);
    if ($stmt->fetchColumn() > 0) {
        return false; // 是普通用户
    }
    
    // 检查owner表中是否存在且属于该company
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE o.id = ? AND c.id = ?
    ");
    $stmt->execute([$id, $company_id]);
    return $stmt->fetchColumn() > 0; // 是owner影子
}

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

// Response function
function sendResponse($success, $message = '', $data = null) {
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}

/**
 * Map MySQL duplicate-key / PDO errors to short client messages (no SQLSTATE / "Database error").
 */
function userlistDuplicateEntryClientMessage(string $msg): string
{
    if (stripos($msg, 'Duplicate entry') === false) {
        return '';
    }
    $key = '';
    if (preg_match("/for key [`'\"]?([^`'\"\\s]+)/i", $msg, $m)) {
        $key = strtolower($m[1]);
    }
    if ($key === 'email' || substr($key, -6) === '.email' || strpos($key, 'email') !== false) {
        return 'Duplicate email';
    }
    if (strpos($key, 'login') !== false) {
        return 'Duplicate login ID';
    }
    if (strpos($key, 'uniq_user_company') !== false || strpos($key, 'unique_user_company') !== false) {
        return 'Duplicate company link for this user';
    }
    if ($key === 'primary') {
        return 'Duplicate record';
    }
    return 'Duplicate value';
}

/** @return array<int, array<string, mixed>> */
function userlist_fetch_accessible_companies(PDO $pdo): array
{
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) {
        return [];
    }

    gc_hydrate_company_login_group_id($pdo);

    $userRole = strtolower(trim((string) ($_SESSION['role'] ?? '')));
    $userType = strtolower(trim((string) ($_SESSION['user_type'] ?? '')));
    if ($userRole === 'owner' || $userType === 'owner') {
        $ownerId = (int) ($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);
        $rows = getCompaniesByOwner($pdo, $ownerId, true, true);
    } else {
        $rows = getCompaniesByUser($pdo, $userId, true, true);
    }

    $active = [];
    foreach ($rows as $c) {
        if (!empty($c['expiration_date']) && strtotime((string) $c['expiration_date']) < strtotime(date('Y-m-d'))) {
            continue;
        }
        $active[] = $c;
    }

    gc_hydrate_accessible_group_ids($pdo, $active);

    return gc_filter_companies_for_login_scope($active);
}

function userlist_normalize_group_id(?string $groupId): ?string
{
    $g = strtoupper(trim((string) $groupId));

    return $g !== '' ? $g : null;
}

function userlist_resolve_owner_id_for_group_scope(PDO $pdo, string $groupScope): int
{
    $g = userlist_normalize_group_id($groupScope);
    if ($g === null) {
        return 0;
    }

    $accessible = userlist_fetch_accessible_companies($pdo);
    foreach ($accessible as $c) {
        $gid = strtoupper(trim((string) ($c['group_id'] ?? '')));
        if ($gid !== $g) {
            continue;
        }
        $oid = (int) ($c['owner_id'] ?? 0);
        if ($oid > 0) {
            return $oid;
        }
    }

    $stmt = $pdo->prepare("
        SELECT owner_id
        FROM company
        WHERE UPPER(TRIM(COALESCE(group_id, ''))) = ?
          AND owner_id IS NOT NULL
        ORDER BY id ASC
        LIMIT 1
    ");
    $stmt->execute([$g]);
    return (int) ($stmt->fetchColumn() ?: 0);
}

/** Legacy helper: resolve anchor company id only (no auto-insert into company). */
function userlist_ensure_group_entity_company_id(PDO $pdo, string $groupScope): int
{
    $g = userlist_normalize_group_id($groupScope);
    if ($g === null) {
        return 0;
    }

    return gc_resolve_group_anchor_company_id($pdo, $g);
}

/**
 * Group view company ids: group entity rows only (AP/IG).
 * Prevents subsidiary users (e.g. 95) from bleeding into group view.
 *
 * @return list<int>
 */
function userlist_company_ids_for_group(array $accessibleCompanies, string $groupId): array
{
    $g = userlist_normalize_group_id($groupId);
    if ($g === null) {
        return [];
    }
    $out = [];
    foreach ($accessibleCompanies as $c) {
        $gid = strtoupper(trim((string) ($c['group_id'] ?? '')));
        $linkSrc = strtoupper(trim((string) ($c['link_source_group'] ?? '')));
        if ($linkSrc !== '') {
            continue;
        }
        $code = strtoupper(trim((string) ($c['company_id'] ?? '')));
        $isGroupEntity = $code === $g || ($code === '' && $gid === $g);
        if (!$isGroupEntity) {
            continue;
        }
        $id = (int) ($c['id'] ?? 0);
        if ($id > 0) {
            $out[] = $id;
        }
    }

    return array_values(array_unique($out));
}

/** @param list<int|string> $companyIds */
function userlist_validate_company_ids_allowed(PDO $pdo, array $companyIds): array
{
    $ids = array_values(array_unique(array_map('intval', $companyIds)));
    $ids = array_values(array_filter($ids, static fn (int $id): bool => $id > 0));
    if ($ids === []) {
        return [];
    }
    $allowed = gc_resolve_allowed_company_numeric_ids($pdo, userlist_fetch_accessible_companies($pdo));
    foreach ($ids as $cid) {
        if (!in_array($cid, $allowed, true)) {
            sendResponse(false, 'One or more selected companies are not allowed');
        }
    }

    return $ids;
}

/** @param list<int> $companyIds */
function userlist_assert_company_ids_match_group_entity(PDO $pdo, array $companyIds, string $groupId): void
{
    $g = userlist_normalize_group_id($groupId);
    if ($g === null || $companyIds === []) {
        return;
    }
    userlist_assert_group_id_allowed($g);
    $entityIds = userlist_company_ids_for_group(userlist_fetch_accessible_companies($pdo), $g);
    foreach ($companyIds as $cid) {
        if (!in_array((int) $cid, $entityIds, true)) {
            sendResponse(false, 'One or more selected companies are not allowed for this group');
        }
    }
}

function userlist_assert_group_id_allowed(string $groupId): void
{
    $g = userlist_normalize_group_id($groupId);
    if ($g === null) {
        sendResponse(false, 'Invalid group');
    }
    if (!gc_is_group_login()) {
        sendResponse(false, 'Group filter is not allowed for company login');
    }
    $accessible = gc_session_accessible_group_ids();
    if ($accessible === [] || !in_array($g, $accessible, true)) {
        // Self-heal stale session cache before denying (AP -> IG switch case).
        try {
            userlist_fetch_accessible_companies($GLOBALS['pdo']);
        } catch (Throwable $e) {
            // Keep original fallback checks below.
        }
        $accessible = gc_session_accessible_group_ids();
    }
    if ($accessible !== [] && !in_array($g, $accessible, true)) {
        sendResponse(false, 'Group not accessible');
    }
    $ident = gc_session_login_identifier();
    if ($accessible === [] && $ident !== null && $ident !== $g) {
        sendResponse(false, 'Group not accessible');
    }
}

function userlistFriendlyDbError(Throwable $e): string
{
    $raw = $e->getMessage();
    $dup = userlistDuplicateEntryClientMessage($raw);
    if ($dup !== '') {
        return $dup;
    }
    if ($e instanceof PDOException) {
        error_log('userlist_api PDO: ' . $raw);
        return 'Could not save changes. Please try again.';
    }
    $prefixes = ['Failed to create user: ', 'Failed to create company association: ', 'Failed to update user: '];
    foreach ($prefixes as $p) {
        if (strpos($raw, $p) === 0) {
            $inner = substr($raw, strlen($p));
            $dupInner = userlistDuplicateEntryClientMessage($inner);
            if ($dupInner !== '') {
                return $dupInner;
            }
        }
    }
    if (stripos($raw, 'SQLSTATE') !== false || stripos($raw, 'Integrity constraint') !== false) {
        error_log('userlist_api DB: ' . $raw);
        return 'Could not save changes. Please try again.';
    }
    return $raw;
}

function userlist_safe_rollback(PDO $pdo): void
{
    try {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    } catch (Throwable $ignored) {
        // Ignore rollback errors to avoid masking the original exception.
    }
}

/**
 * Resolve group entity company ids from company table directly (same strategy as account list API).
 * Priority:
 * 1) company.company_id == GROUP_ID (e.g. AP)
 * 2) placeholder row: empty company_id + group_id == GROUP_ID
 *
 * @return list<int>
 */
function userlist_group_entity_company_ids(PDO $pdo, string $groupScope): array
{
    $g = userlist_normalize_group_id($groupScope);
    if ($g === null) {
        return [];
    }

    $ids = [];

    $stmt = $pdo->prepare("
        SELECT id
        FROM company
        WHERE UPPER(TRIM(company_id)) = ?
        ORDER BY id ASC
    ");
    $stmt->execute([$g]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $nid = (int) $id;
        if ($nid > 0) {
            $ids[] = $nid;
        }
    }

    if ($ids === []) {
        $anchor = gc_resolve_group_anchor_company_id($pdo, $g);
        if ($anchor > 0) {
            $ids[] = $anchor;
        }
    }

    if ($ids === []) {
        foreach (gc_company_numeric_ids_for_group_code($pdo, $g) as $subId) {
            if ($subId > 0) {
                $ids[] = $subId;
            }
        }
    }

    // Safety: keep only ids the current login scope can access.
    $allowed = [];
    foreach (array_values(array_unique($ids)) as $cid) {
        if (gc_session_can_access_company_id($pdo, (int) $cid, $g)) {
            $allowed[] = (int) $cid;
        }
    }

    return $allowed;
}

/**
 * Resolve effective company scope for group/company modes.
 * - Prefer explicit validated company ids from request (real write target).
 * - group_id is only view/access context for validation.
 *
 * @param list<int> $validatedCompanyIds
 */
function userlist_resolve_scope_company_id(PDO $pdo, ?string $groupScope, array $validatedCompanyIds, int $currentCompanyId): int
{
    if ($validatedCompanyIds !== []) {
        return (int) $validatedCompanyIds[0];
    }
    if ($groupScope === null) {
        return $currentCompanyId;
    }
    userlist_assert_group_id_allowed($groupScope);
    $entityIds = userlist_group_entity_company_ids($pdo, $groupScope);
    if ($entityIds !== []) {
        return (int) $entityIds[0];
    }
    $groupCompanyIds = userlist_company_ids_for_group(userlist_fetch_accessible_companies($pdo), $groupScope);
    if ($groupCompanyIds !== []) {
        return (int) $groupCompanyIds[0];
    }
    sendResponse(false, 'No company found for selected group');
}

/**
 * Company IDs for list/delete visibility (same rules as action=get without id).
 *
 * @return list<int>
 */
/**
 * All companies in a group scope (subsidiaries + linked), not group-entity rows only.
 *
 * @return list<int>
 */
function userlist_company_ids_in_group_scope(array $accessibleCompanies, string $groupId): array
{
    $g = userlist_normalize_group_id($groupId);
    if ($g === null) {
        return [];
    }
    $out = [];
    foreach ($accessibleCompanies as $c) {
        $code = strtoupper(trim((string) ($c['company_id'] ?? '')));
        if ($code === '') {
            continue;
        }
        $gid = strtoupper(trim((string) ($c['group_id'] ?? '')));
        $linkSrc = strtoupper(trim((string) ($c['link_source_group'] ?? '')));
        if ($gid !== $g && $linkSrc !== $g) {
            continue;
        }
        $id = (int) ($c['id'] ?? 0);
        if ($id > 0) {
            $out[] = $id;
        }
    }

    return array_values(array_unique($out));
}

function userlist_resolve_filter_company_ids(PDO $pdo, array $input): array
{
    global $current_company_id;
    $groupsAll = !empty($input['groups_all']);
    $groupAll = !empty($input['group_all']);
    $groupId = userlist_normalize_group_id($input['group_id'] ?? null);
    $requestedCompanyId = (int) ($input['company_id'] ?? 0);
    $accessible = userlist_fetch_accessible_companies($pdo);

    if ($groupsAll) {
        if ($groupAll) {
            $allowed = gc_resolve_allowed_company_numeric_ids($pdo, $accessible);
            return array_values(array_filter($allowed, static fn (int $id): bool => $id > 0));
        }
        $out = [];
        foreach (gc_session_accessible_group_ids() as $gid) {
            $g = userlist_normalize_group_id($gid);
            if ($g === null) {
                continue;
            }
            $entityIds = userlist_group_entity_company_ids($pdo, $g);
            if ($entityIds !== []) {
                $out = array_merge($out, $entityIds);
                continue;
            }
            $scoped = userlist_company_ids_in_group_scope($accessible, $g);
            if ($scoped !== []) {
                $out = array_merge($out, $scoped);
            }
        }
        if ($out === []) {
            $allowed = gc_resolve_allowed_company_numeric_ids($pdo, $accessible);
            return array_values(array_filter($allowed, static fn (int $id): bool => $id > 0));
        }
        return array_values(array_unique(array_map('intval', $out)));
    }

    if ($groupId !== null) {
        userlist_assert_group_id_allowed($groupId);
        if ($groupAll) {
            $scoped = userlist_company_ids_in_group_scope($accessible, $groupId);
            if ($scoped !== []) {
                return $scoped;
            }
        }
        $groupCompanyIds = userlist_company_ids_for_group($accessible, $groupId);
        if ($groupCompanyIds === []) {
            $groupCompanyIds = userlist_group_entity_company_ids($pdo, $groupId);
        }

        return $groupCompanyIds === [] ? [] : array_values(array_map('intval', $groupCompanyIds));
    }

    if ($requestedCompanyId > 0) {
        return userlist_validate_company_ids_allowed($pdo, [$requestedCompanyId]);
    }

    return [(int) $current_company_id];
}

/**
 * For group mode, validate/normalize company_ids under selected group context.
 *
 * @param list<int|string> $rawCompanyIds
 * @return list<int>
 */
function userlist_resolve_company_ids_for_group_scope(PDO $pdo, string $groupScope, array $rawCompanyIds): array
{
    userlist_assert_group_id_allowed($groupScope);
    $groupCompanyIds = userlist_company_ids_for_group(userlist_fetch_accessible_companies($pdo), $groupScope);
    $entityIds = userlist_group_entity_company_ids($pdo, $groupScope);
    $allowedIds = $groupCompanyIds;
    if ($entityIds !== []) {
        $allowedIds = array_values(array_unique(array_merge($allowedIds, $entityIds)));
    }
    if ($allowedIds === []) {
        sendResponse(false, 'No company found for selected group');
    }
    $candidateIds = array_values(array_unique(array_filter(array_map('intval', $rawCompanyIds), static fn (int $id): bool => $id > 0)));
    if ($candidateIds === []) {
        if ($entityIds !== []) {
            return [(int) $entityIds[0]];
        }
        return [(int) $allowedIds[0]];
    }
    foreach ($candidateIds as $cid) {
        if (!in_array($cid, $allowedIds, true)) {
            sendResponse(false, 'One or more selected companies are not allowed for this group');
        }
    }
    return $candidateIds;
}

// Validate required fields for create/update
function validateUserData($data, $isUpdate = false) {
    $required = ['login_id', 'name', 'email', 'role', 'status'];
    if (!$isUpdate) {
        $required[] = 'password';
    }
    
    foreach ($required as $field) {
        if (!isset($data[$field]) || trim($data[$field]) === '') {
            return "Field '$field' is required";
        }
    }
    
    // Validate email format
    $emailValidation = validate_email($data['email'] ?? '');
    if (!$emailValidation['ok']) {
        return "Invalid email format";
    }
    $data['email'] = $emailValidation['normalized'];
    
    // Validate role
    $validRoles = ['owner', 'partnership', 'admin', 'manager', 'supervisor', 'accountant', 'audit', 'customer service', 'company'];
    if (!in_array($data['role'], $validRoles)) {
        return "Invalid role";
    }

    // Validate status (添加这个)
    $validStatuses = ['active', 'inactive'];
    if (!in_array($data['status'], $validStatuses)) {
        return "Invalid status";
    }
    
    return true;
}

// Check if login_id already exists
function checkLoginIdExists($pdo, $login_id, $company_id, $excludeId = null) {
    // 使用 user_company_map 来检查 login_id 是否存在
    $sql = "SELECT COUNT(*) 
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE u.login_id = ? AND ucm.company_id = ?";
    $params = [$login_id, $company_id];
    
    if ($excludeId) {
        $sql .= " AND u.id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn() > 0;
}

// Check if email already exists
function checkEmailExists($pdo, $email, $company_id, $excludeId = null) {
    // 使用 user_company_map 来检查 email 是否存在
    $sql = "SELECT COUNT(*) 
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE u.email = ? AND ucm.company_id = ?";
    $params = [$email, $company_id];
    
    if ($excludeId) {
        $sql .= " AND u.id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn() > 0;
}

try {
    if (!$input || !isset($input['action'])) {
        sendResponse(false, 'Invalid request');
    }
    
    $action = $input['action'];
    
    switch ($action) {
        case 'create':
            if (is_partnership_audit_read_only_active($pdo)) {
                sendResponse(false, '只读账号无法执行此操作');
            }
            if (!canCreateUserByRole($current_user_role)) {
                sendResponse(false, 'You do not have permission to create new accounts');
            }

            // Validate input
            $required = ['login_id', 'name', 'password', 'email', 'role', 'status'];
            foreach ($required as $field) {
                if (!isset($input[$field]) || trim($input[$field]) === '') {
                    sendResponse(false, "Field '$field' is required");
                }
            }
            
            // Validate email format
            $emailValidation = validate_email($input['email'] ?? '');
            if (!$emailValidation['ok']) {
                sendResponse(false, "Invalid email format");
            }
            $input['email'] = $emailValidation['normalized'];
            
            // Validate role
            $validRoles = ['partnership', 'admin', 'manager', 'supervisor', 'accountant', 'audit', 'customer service', 'company'];
            if (!in_array($input['role'], $validRoles)) {
                sendResponse(false, "Invalid role");
            }
            
            // Validate status
            $validStatuses = ['active', 'inactive'];
            if (!in_array($input['status'], $validStatuses)) {
                sendResponse(false, "Invalid status");
            }
            
            $groupScope = userlist_normalize_group_id($input['group_id'] ?? null);
            // 验证 company_ids
            global $current_company_id;
            $rawCompanyIds = isset($input['company_ids']) && is_array($input['company_ids']) ? $input['company_ids'] : [];
            if ($groupScope !== null) {
                $company_ids = userlist_resolve_company_ids_for_group_scope($pdo, $groupScope, $rawCompanyIds);
            } else {
                $company_ids = $rawCompanyIds;
                if (empty($company_ids)) {
                    // Company mode fallback keeps original behavior.
                    $company_ids = [$current_company_id];
                }
                $company_ids = userlist_validate_company_ids_allowed($pdo, $company_ids);
            }
            $scope_company_id = userlist_resolve_scope_company_id($pdo, $groupScope, $company_ids, (int) $current_company_id);
            
            // 验证所有 company_ids 是否存在
            if (count($company_ids) > 0) {
                $placeholders = str_repeat('?,', count($company_ids) - 1) . '?';
                $stmt = $pdo->prepare("SELECT id FROM company WHERE id IN ($placeholders)");
                $stmt->execute($company_ids);
                $validCompanies = $stmt->fetchAll(PDO::FETCH_COLUMN);
                
                if (count($validCompanies) !== count($company_ids)) {
                    sendResponse(false, 'One or more selected companies are invalid');
                }
            }
            
            // 使用第一个 company_id 作为主 company_id（用于兼容性）
            $primary_company_id = $company_ids[0];
            
            // Check if login_id already exists in any of the selected companies (通过 user_company_map)
            if (count($company_ids) > 0) {
                $placeholders = str_repeat('?,', count($company_ids) - 1) . '?';
                $stmt = $pdo->prepare("
                    SELECT COUNT(*) 
                    FROM user u
                    INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                    WHERE u.login_id = ? AND ucm.company_id IN ($placeholders)
                ");
                $checkParams = array_merge([$input['login_id']], $company_ids);
                $stmt->execute($checkParams);
                if ($stmt->fetchColumn() > 0) {
                    sendResponse(false, 'Login ID already exists in one of the selected companies');
                }
                
                // Check if email already exists in any of the selected companies (通过 user_company_map)
                $stmt = $pdo->prepare("
                    SELECT COUNT(*) 
                    FROM user u
                    INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                    WHERE u.email = ? AND ucm.company_id IN ($placeholders)
                ");
                $checkParams = array_merge([$input['email']], $company_ids);
                $stmt->execute($checkParams);
                if ($stmt->fetchColumn() > 0) {
                    sendResponse(false, 'Email already exists in one of the selected companies');
                }
            }

            // user.email 为全局 UNIQUE：与所选公司无关，需单独拦截以免落到 PDO 异常
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM user WHERE email = ?');
            $stmt->execute([$input['email']]);
            if ((int) $stmt->fetchColumn() > 0) {
                sendResponse(false, 'Duplicate email');
            }
            
            // Hash password
            $hashedPassword = password_hash($input['password'], PASSWORD_DEFAULT);
            if ($hashedPassword === false) {
                sendResponse(false, 'Failed to hash password');
            }
            
            // Hash secondary_password if provided (for c168 company users)
            $hashedSecondaryPassword = null;
            if (isset($input['secondary_password']) && trim($input['secondary_password']) !== '') {
                // 验证二级密码：必须是6位数字
                if (!preg_match('/^\d{6}$/', $input['secondary_password'])) {
                    sendResponse(false, 'Secondary password must be exactly 6 digits');
                }
                $hashedSecondaryPassword = password_hash($input['secondary_password'], PASSWORD_DEFAULT);
                if ($hashedSecondaryPassword === false) {
                    sendResponse(false, 'Failed to hash secondary password');
                }
            }
            
            // 处理权限数据
            $permissions = isset($input['permissions']) ? json_encode($input['permissions']) : null;

            // 开始事务
            $pdo->beginTransaction();
            
            try {
                // Insert new user (不再使用 company_id，因为已移除)
                $readOnly = 1;
                if (isset($input['read_only']) && canSetUserReadOnly($current_user_role, $input['role'] ?? '')) {
                    $readOnly = (int)$input['read_only'];
                }
                $sql = "INSERT INTO user (login_id, name, password, secondary_password, email, role, permissions, read_only, status, created_by, created_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";
                
                $stmt = $pdo->prepare($sql);
                $result = $stmt->execute([
                    $input['login_id'],
                    $input['name'],
                    $hashedPassword,
                    $hashedSecondaryPassword,
                    $input['email'],
                    $input['role'],
                    $permissions,
                    $readOnly,
                    $input['status'],
                    getCurrentUser()
                ]);
                
                if (!$result) {
                    $errorInfo = $stmt->errorInfo();
                    error_log("Failed to create user - SQL Error: " . print_r($errorInfo, true));
                    throw new Exception('Failed to create user: ' . ($errorInfo[2] ?? 'Unknown database error'));
                }
                
                $newUserId = $pdo->lastInsertId();
                
                if (!$newUserId || $newUserId <= 0) {
                    error_log("Failed to get new user ID after insert");
                    throw new Exception('Failed to get new user ID');
                }
                
                // 在 user_company_map 中创建所有关联
                $mapStmt = $pdo->prepare("INSERT INTO user_company_map (user_id, company_id) VALUES (?, ?)");
                foreach ($company_ids as $company_id) {
                    $mapResult = $mapStmt->execute([$newUserId, $company_id]);
                    if (!$mapResult) {
                        $mapErrorInfo = $mapStmt->errorInfo();
                        error_log("Failed to create user_company_map - SQL Error: " . print_r($mapErrorInfo, true));
                        throw new Exception('Failed to create company association: ' . ($mapErrorInfo[2] ?? 'Unknown database error'));
                    }
                }
                
                // 为新用户在所有关联的公司下初始化权限
                // 如果提供了 account_permissions 或 process_permissions，则在当前公司下设置它们
                // 其他公司则使用默认值（null，表示未设置，默认全部可见）
                if (isset($input['account_permissions']) || isset($input['process_permissions'])) {
                    $accountPerms = null;
                    $processPerms = null;
                    
                    if (isset($input['account_permissions'])) {
                        if (is_array($input['account_permissions']) && count($input['account_permissions']) > 0) {
                            $accountPerms = json_encode($input['account_permissions']);
                        } else {
                            $accountPerms = json_encode([]);
                        }
                    }
                    
                    if (isset($input['process_permissions'])) {
                        if (is_array($input['process_permissions']) && count($input['process_permissions']) > 0) {
                            $processPerms = json_encode($input['process_permissions']);
                        } else {
                            $processPerms = json_encode([]);
                        }
                    }
                    
                    // 只在当前公司下设置权限
                    $permStmt = $pdo->prepare("INSERT INTO user_company_permissions (user_id, company_id, account_permissions, process_permissions) VALUES (?, ?, ?, ?)");
                    $permStmt->execute([$newUserId, $scope_company_id, $accountPerms, $processPerms]);
                }
                
                // 提交事务
                $pdo->commit();
                
                // Post-commit reads must never fail the create result.
                $newUser = [
                    'id' => (int)$newUserId,
                    'login_id' => (string)$input['login_id'],
                    'name' => (string)$input['name'],
                    'email' => (string)$input['email'],
                    'role' => (string)$input['role'],
                    'status' => (string)$input['status'],
                    'last_login' => null,
                    'created_by' => getCurrentUser(),
                    'account_permissions' => null,
                    'process_permissions' => null,
                ];
                try {
                    $stmt = $pdo->prepare("SELECT id, login_id, name, email, role, status, last_login, created_by FROM user WHERE id = ?");
                    $stmt->execute([$newUserId]);
                    $dbUser = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($dbUser) {
                        $newUser = array_merge($newUser, $dbUser);
                    }

                    $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
                    $stmt->execute([$newUserId, $scope_company_id]);
                    $companyPermissions = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($companyPermissions) {
                        $newUser['account_permissions'] = $companyPermissions['account_permissions'];
                        $newUser['process_permissions'] = $companyPermissions['process_permissions'];
                    }
                } catch (Throwable $postCommitReadError) {
                    error_log("Create user post-commit read error: " . $postCommitReadError->getMessage());
                }
                
                sendResponse(true, 'User created successfully', $newUser);
            } catch (PDOException $e) {
                userlist_safe_rollback($pdo);
                error_log("Create user PDO error: " . $e->getMessage());
                error_log("SQL State: " . $e->getCode());
                error_log("Error Info: " . print_r($e->errorInfo, true));
                sendResponse(false, userlistFriendlyDbError($e));
            } catch (Exception $e) {
                userlist_safe_rollback($pdo);
                error_log("Create user error: " . $e->getMessage());
                sendResponse(false, userlistFriendlyDbError($e));
            }
            break;
            
        case 'update':
            if (is_partnership_audit_read_only_active($pdo)) {
                sendResponse(false, '只读账号无法执行此操作');
            }
            if (!isset($input['id'])) {
                sendResponse(false, 'User ID is required');
            }
            
            global $current_company_id, $current_user_role;
            $groupScope = userlist_normalize_group_id($input['group_id'] ?? null);
            $rawCompanyIds = isset($input['company_ids']) && is_array($input['company_ids']) ? $input['company_ids'] : [];
            $will_lose_access = false;
            if ($groupScope !== null) {
                $validatedScopeCompanyIds = userlist_resolve_company_ids_for_group_scope($pdo, $groupScope, $rawCompanyIds);
            } else {
                $validatedScopeCompanyIds = userlist_validate_company_ids_allowed($pdo, $rawCompanyIds);
            }
            $scope_company_id = userlist_resolve_scope_company_id($pdo, $groupScope, $validatedScopeCompanyIds, (int) $current_company_id);
            
            // 检查是否是owner影子
            if (isOwnerShadow($pdo, $input['id'], $scope_company_id)) {
                // 只有owner本人可以更新owner记录
                if ($current_user_role !== 'owner') {
                    sendResponse(false, '只有owner本人可以编辑owner记录');
                }
                
                // 更新owner表
                $updateFields = [];
                $updateValues = [];
                
                if (isset($input['name'])) {
                    $updateFields[] = "name = ?";
                    $updateValues[] = $input['name'];
                }
                
                if (isset($input['email'])) {
                    $emailValidation = validate_email($input['email']);
                    if (!$emailValidation['ok']) {
                        sendResponse(false, "Invalid email format");
                    }
                    $updateFields[] = "email = ?";
                    $updateValues[] = $emailValidation['normalized'];
                }
                
                if (isset($input['status'])) {
                    $validStatuses = ['active', 'inactive'];
                    if (!in_array($input['status'], $validStatuses)) {
                        sendResponse(false, "Invalid status");
                    }
                    $updateFields[] = "status = ?";
                    $updateValues[] = $input['status'];
                }
                
                // Only update password if provided
                if (isset($input['password']) && trim($input['password']) !== '') {
                    $updateFields[] = "password = ?";
                    $updateValues[] = password_hash($input['password'], PASSWORD_DEFAULT);
                }
                
                // Only update secondary_password if provided (for c168 company)
                if (isset($input['secondary_password']) && trim($input['secondary_password']) !== '') {
                    // 验证二级密码：必须是6位数字
                    if (!preg_match('/^\d{6}$/', $input['secondary_password'])) {
                        sendResponse(false, 'Secondary password must be exactly 6 digits');
                    }
                    $updateFields[] = "secondary_password = ?";
                    $updateValues[] = password_hash($input['secondary_password'], PASSWORD_DEFAULT);
                }
                
                if (empty($updateFields)) {
                    sendResponse(false, 'No fields to update');
                }
                
                $updateValues[] = $input['id'];
                $sql = "UPDATE owner SET " . implode(', ', $updateFields) . " WHERE id = ?";
                
                $stmt = $pdo->prepare($sql);
                $result = $stmt->execute($updateValues);
                
                if ($result) {
                    // 获取更新后的owner信息
                    $stmt = $pdo->prepare("
                        SELECT o.id, o.owner_code as login_id, o.name, o.email, 'owner' as role, o.status, NULL as last_login, NULL as created_by
                        FROM owner o
                        INNER JOIN company c ON c.owner_id = o.id
                        WHERE o.id = ? AND c.id = ?
                    ");
                    $stmt->execute([$input['id'], $scope_company_id]);
                    $updatedOwner = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    sendResponse(true, 'Owner updated successfully', $updatedOwner);
                } else {
                    sendResponse(false, 'Failed to update owner');
                }
                break;
            }
            
            // 获取原有的 login_id 并验证用户是否存在
            // 注意：用户可能属于多个公司，所以不限制在当前公司
            $stmt = $pdo->prepare("
                SELECT u.login_id 
                FROM user u
                WHERE u.id = ?
            ");
            $stmt->execute([$input['id']]);
            $originalUser = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$originalUser) {
                sendResponse(false, 'User not found');
            }
            
            // 验证用户是否至少属于当前公司（用于权限检查）
            // 如果用户要编辑其他公司的用户，需要确保有权限
            $stmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM user_company_map 
                WHERE user_id = ? AND company_id = ?
            ");
            $stmt->execute([$input['id'], $scope_company_id]);
            $belongsToCurrentCompany = $stmt->fetchColumn() > 0;
            
            // 如果没有提交 login_id，使用原有的
            if (!isset($input['login_id'])) {
                $input['login_id'] = $originalUser['login_id'];
            }
            
            // Validate input
            $validation = validateUserData($input, true);
            if ($validation !== true) {
                sendResponse(false, $validation);
            }
            
            // Check if login_id already exists in current company (excluding current user)
            // 注意：只检查当前公司内是否有重复的 login_id，允许不同公司有相同的 login_id
            $stmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM user u
                INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                WHERE u.login_id = ? AND u.id != ? AND ucm.company_id = ?
            ");
            $stmt->execute([$input['login_id'], $input['id'], $scope_company_id]);
            if ($stmt->fetchColumn() > 0) {
                sendResponse(false, 'Login ID already exists in current company');
            }
            
            // Check if email already exists in current company (excluding current user)
            // 注意：只检查当前公司内是否有重复的 email，允许不同公司有相同的 email
            $stmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM user u
                INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                WHERE u.email = ? AND u.id != ? AND ucm.company_id = ?
            ");
            $stmt->execute([$input['email'], $input['id'], $scope_company_id]);
            if ($stmt->fetchColumn() > 0) {
                sendResponse(false, 'Email already exists in current company');
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM user WHERE email = ? AND id != ?');
            $stmt->execute([$input['email'], $input['id']]);
            if ((int) $stmt->fetchColumn() > 0) {
                sendResponse(false, 'Duplicate email');
            }
            
            // Prepare update query
            $updateFields = [];
            $updateValues = [];
            
            $updateFields[] = "login_id = ?";
            $updateValues[] = $input['login_id'];
            
            $updateFields[] = "name = ?";
            $updateValues[] = $input['name'];
            
            $updateFields[] = "email = ?";
            $updateValues[] = $input['email'];
            
            $updateFields[] = "role = ?";
            $updateValues[] = $input['role'];

            $updateFields[] = "status = ?";
            $updateValues[] = $input['status'];

            // 保存 read_only（Audit：manager+；Partnership：仅 owner）
            if (isset($input['read_only']) && canSetUserReadOnly($current_user_role, $input['role'] ?? '')) {
                $updateFields[] = "read_only = ?";
                $updateValues[] = (int)$input['read_only'];
            }

            // 添加权限字段到更新列表（系统级权限仍然存储在 user 表）
            $updateFields[] = "permissions = ?";
            $updateValues[] = isset($input['permissions']) ? json_encode($input['permissions']) : null;
            
            // Account 和 Process 权限不再更新到 user 表，而是更新到 user_company_permissions 表
            // 这些字段保留在 $input 中，稍后在事务中处理
            
            // Only update password if provided
            if (isset($input['password']) && trim($input['password']) !== '') {
                $updateFields[] = "password = ?";
                $updateValues[] = password_hash($input['password'], PASSWORD_DEFAULT);
            }
            
            // Only update secondary_password if provided (for c168 company users)
            if (isset($input['secondary_password']) && trim($input['secondary_password']) !== '') {
                // 验证二级密码：必须是6位数字
                if (!preg_match('/^\d{6}$/', $input['secondary_password'])) {
                    sendResponse(false, 'Secondary password must be exactly 6 digits');
                }
                $updateFields[] = "secondary_password = ?";
                $updateValues[] = password_hash($input['secondary_password'], PASSWORD_DEFAULT);
            }
            
            // 添加 WHERE 条件的参数
            $updateValues[] = $input['id'];
            
            // 开始事务
            $pdo->beginTransaction();
            
            try {
                // 更新用户基本信息
                $sql = "UPDATE user SET " . implode(', ', $updateFields) . " WHERE id = ?";
                $stmt = $pdo->prepare($sql);
                $result = $stmt->execute($updateValues);
                
                if (!$result) {
                    throw new Exception('Failed to update user');
                }
                
                // 同步 read_only 到 company_ownership
                if ($current_user_role === 'owner' && isset($input['read_only']) && strtolower($input['role']) === 'partnership') {
                    $updCoStmt = $pdo->prepare("UPDATE company_ownership SET read_only = ? WHERE company_id = ? AND account_id = ? AND owner_type = 'user'");
                    $updCoStmt->execute([(int)$input['read_only'], $scope_company_id, $input['id']]);
                }
                
                // 如果提供了 company_ids，更新 company 关联
                if (isset($input['company_ids']) && is_array($input['company_ids']) && count($input['company_ids']) > 0) {
                    if ($groupScope !== null) {
                        $input['company_ids'] = userlist_resolve_company_ids_for_group_scope($pdo, $groupScope, $input['company_ids']);
                    } else {
                        $input['company_ids'] = userlist_validate_company_ids_allowed($pdo, $input['company_ids']);
                    }
                    // 验证所有 company_ids 是否存在
                    $placeholders = str_repeat('?,', count($input['company_ids']) - 1) . '?';
                    $stmt = $pdo->prepare("SELECT id FROM company WHERE id IN ($placeholders)");
                    $stmt->execute($input['company_ids']);
                    $validCompanies = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    
                    if (count($validCompanies) !== count($input['company_ids'])) {
                        throw new Exception('One or more selected companies are invalid');
                    }
                    
                    // 检查移除后用户是否还属于当前公司（用于提示）
                    // 允许移除当前公司的关联，但会在响应中标记
                    if ($belongsToCurrentCompany && !in_array($scope_company_id, $input['company_ids'])) {
                        $will_lose_access = true;
                    }
                    
                    // 删除旧的 company 关联
                    $stmt = $pdo->prepare("DELETE FROM user_company_map WHERE user_id = ?");
                    $stmt->execute([$input['id']]);
                    
                    // 创建新的 company 关联
                    $mapStmt = $pdo->prepare("INSERT INTO user_company_map (user_id, company_id) VALUES (?, ?)");
                    foreach ($input['company_ids'] as $company_id) {
                        $mapStmt->execute([$input['id'], $company_id]);
                    }
                } else {
                    // 如果没有提供 company_ids，保持原有的关联不变
                    // 但需要确保用户至少属于当前公司（如果原本属于的话）
                }
                
                // 保存 Account 和 Process 权限到 user_company_permissions 表（按当前公司）
                // 只有当提供了 account_permissions 或 process_permissions 时才更新
                if (isset($input['account_permissions']) || isset($input['process_permissions'])) {
                    // 准备权限值
                    $accountPerms = null;
                    $processPerms = null;
                    
                    if (isset($input['account_permissions'])) {
                        if (is_array($input['account_permissions']) && count($input['account_permissions']) > 0) {
                            $accountPerms = json_encode($input['account_permissions']);
                        } else {
                            // 空数组 [] 表示已设置但为空（不选任何账户）
                            $accountPerms = json_encode([]);
                        }
                    }
                    
                    if (isset($input['process_permissions'])) {
                        if (is_array($input['process_permissions']) && count($input['process_permissions']) > 0) {
                            $processPerms = json_encode($input['process_permissions']);
                        } else {
                            // 空数组 [] 表示已设置但为空（不选任何流程）
                            $processPerms = json_encode([]);
                        }
                    }
                    
                    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 来更新或插入
                    $stmt = $pdo->prepare("
                        INSERT INTO user_company_permissions (user_id, company_id, account_permissions, process_permissions) 
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            account_permissions = IF(? IS NOT NULL, VALUES(account_permissions), account_permissions),
                            process_permissions = IF(? IS NOT NULL, VALUES(process_permissions), process_permissions),
                            updated_at = CURRENT_TIMESTAMP
                    ");
                    $stmt->execute([
                        $input['id'], 
                        $scope_company_id, 
                        $accountPerms, 
                        $processPerms,
                        $accountPerms, // 用于条件判断
                        $processPerms  // 用于条件判断
                    ]);
                }
                
                // 提交事务
                $pdo->commit();
                
                // 获取更新后的用户信息；提交后读取失败不应影响保存结果。
                $updatedUser = [
                    'id' => (int) $input['id'],
                    'login_id' => (string) ($input['login_id'] ?? ''),
                    'name' => (string) ($input['name'] ?? ''),
                    'email' => (string) ($input['email'] ?? ''),
                    'role' => (string) ($input['role'] ?? ''),
                    'status' => (string) ($input['status'] ?? ''),
                    'last_login' => null,
                    'created_by' => null,
                    'account_permissions' => null,
                    'process_permissions' => null,
                ];
                try {
                    $stmt = $pdo->prepare("SELECT id, login_id, name, email, role, status, last_login, created_by FROM user WHERE id = ?");
                    $stmt->execute([$input['id']]);
                    $dbUser = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($dbUser) {
                        $updatedUser = array_merge($updatedUser, $dbUser);
                    }

                    // 仅从 user_company_permissions 读取公司级权限。
                    $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
                    $stmt->execute([$input['id'], $scope_company_id]);
                    $companyPermissions = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($companyPermissions) {
                        $updatedUser['account_permissions'] = $companyPermissions['account_permissions'];
                        $updatedUser['process_permissions'] = $companyPermissions['process_permissions'];
                    }
                } catch (Throwable $postCommitReadError) {
                    error_log("Update user post-commit read error: " . $postCommitReadError->getMessage());
                }
                
                $message = 'User updated successfully';
                if ($will_lose_access) {
                    $message .= '。注意：移除后用户将不再属于当前公司，如需继续操作请切换到用户所属的其他公司';
                }
                
                // 在响应中添加 will_lose_access 标志
                $responseData = $updatedUser;
                if (isset($responseData)) {
                    $responseData = array_merge((array)$responseData, ['will_lose_access' => $will_lose_access]);
                } else {
                    $responseData = ['will_lose_access' => $will_lose_access];
                }
                
                sendResponse(true, $message, $responseData);
            } catch (PDOException $e) {
                $pdo->rollBack();
                error_log("Update user PDO error: " . $e->getMessage());
                error_log("SQL State: " . $e->getCode());
                error_log("Error Info: " . print_r($e->errorInfo, true));
                sendResponse(false, userlistFriendlyDbError($e));
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("Update user error: " . $e->getMessage());
                sendResponse(false, userlistFriendlyDbError($e));
            }
            break;
            
        case 'delete':
            if (is_partnership_audit_read_only_active($pdo)) {
                sendResponse(false, '只读账号无法执行此操作');
            }
            if (!isset($input['id'])) {
                sendResponse(false, 'User ID is required');
            }
            
            // 确保ID是整数类型
            $userId = intval($input['id']);
            if ($userId <= 0) {
                sendResponse(false, 'Invalid user ID');
            }
            
            global $current_company_id, $current_user_role;

            $scopeCompanyIds = userlist_resolve_filter_company_ids($pdo, $input);
            if ($scopeCompanyIds === []) {
                sendResponse(false, 'User not found or access denied');
            }
            $groupScope = userlist_normalize_group_id($input['group_id'] ?? null);
            $requestedCompanyId = (int) ($input['company_id'] ?? 0);
            $validatedScopeCompanyIds = $requestedCompanyId > 0
                ? userlist_validate_company_ids_allowed($pdo, [$requestedCompanyId])
                : [];
            $scopeCompanyId = userlist_resolve_scope_company_id(
                $pdo,
                $groupScope,
                $validatedScopeCompanyIds,
                (int) $current_company_id
            );
            
            // 检查用户是否试图删除自己
            $currentUserId = $_SESSION['user_id'] ?? null;
            if ($currentUserId && intval($currentUserId) === $userId) {
                sendResponse(false, 'You cannot delete your own account');
            }
            
            // 检查是否是owner影子
            if (isOwnerShadow($pdo, $userId, $scopeCompanyId)) {
                // 只有owner本人可以删除owner记录
                if ($current_user_role !== 'owner') {
                    sendResponse(false, '只有owner本人可以删除owner记录');
                }
                
                // owner记录不允许删除（因为company表有外键约束）
                sendResponse(false, 'Owner记录不能删除，因为它是公司的所有者');
            }
            
            // Check if user exists and belongs to current list scope (UI company / group)
            $scopePlaceholders = implode(',', array_fill(0, count($scopeCompanyIds), '?'));
            $checkStmt = $pdo->prepare("
                SELECT u.id, u.login_id, u.name, u.role
                FROM user u
                INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                WHERE u.id = ? AND ucm.company_id IN ($scopePlaceholders)
                LIMIT 1
            ");
            $checkStmt->execute(array_merge([$userId], $scopeCompanyIds));
            $user = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$user) {
                sendResponse(false, 'User not found or access denied');
            }
            
            // 检查是否试图删除同等级或更高层级的用户
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
            $current_user_level = $role_hierarchy[strtolower($current_user_role)] ?? 999;
            $target_user_level = $role_hierarchy[strtolower($user['role'] ?? '')] ?? 999;
            
            if ($current_user_level === $target_user_level) {
                sendResponse(false, 'You cannot delete accounts with the same role level');
            }
            
            // 检查是否试图删除比自己层级更高的用户（数字越小，层级越高）
            if ($target_user_level < $current_user_level) {
                sendResponse(false, 'You cannot delete accounts with higher role level');
            }
            
            // 获取当前登录用户ID（用于替换NOT NULL字段）
            $currentUserId = $_SESSION['user_id'] ?? null;
            
            // 获取替换用户ID（用于NOT NULL字段和优先使用替换用户的字段）
            $replacementUserId = null;
            
                // 优先级1: 使用当前登录用户（如果不是要删除的用户）
                if (isset($_SESSION['user_id']) && $_SESSION['user_id'] != $userId) {
                    $currentUserId = $_SESSION['user_id'];
                    // 验证当前用户是否存在且属于同一公司
                    $stmt = $pdo->prepare("
                        SELECT u.id 
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE u.id = ? AND ucm.company_id = ?
                        LIMIT 1
                    ");
                    $stmt->execute([$currentUserId, $scopeCompanyId]);
                    $replacementUserId = $stmt->fetchColumn();
                }
                
                // 优先级2: 如果当前用户不可用，找同公司的活动用户
                if (!$replacementUserId) {
                    $stmt = $pdo->prepare("
                        SELECT u.id 
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE ucm.company_id = ? AND u.id != ? AND u.status = 'active'
                        LIMIT 1
                    ");
                    $stmt->execute([$scopeCompanyId, $userId]);
                    $replacementUserId = $stmt->fetchColumn();
                }
                
                // 优先级3: 如果还是没有活动用户，找任何同公司的用户
                if (!$replacementUserId) {
                    $stmt = $pdo->prepare("
                        SELECT u.id 
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE ucm.company_id = ? AND u.id != ?
                        LIMIT 1
                    ");
                    $stmt->execute([$scopeCompanyId, $userId]);
                    $replacementUserId = $stmt->fetchColumn();
                }
            
            // 定义所有需要处理的表和字段配置
            // 格式: [表名 => [字段名 => ['nullable' => true/false, 'description' => '描述']]]
            $userReferences = [
                'transactions' => [
                    'created_by' => ['nullable' => false, 'description' => '交易记录的创建者']
                ],
                'submitted_processes' => [
                    'user_id' => ['nullable' => false, 'description' => '提交处理记录的用户']
                ],
                'data_captures' => [
                    'created_by' => ['nullable' => true, 'description' => '数据捕获记录的创建者']
                ],
                'process' => [
                    'created_by' => ['nullable' => true, 'description' => '流程记录的创建者'],
                    'modified_by' => ['nullable' => true, 'description' => '流程记录的修改者']
                ],
                'company' => [
                    'created_by' => ['nullable' => true, 'description' => '公司记录的创建者']
                ]
            ];
            
            // 检查NOT NULL字段的引用，如果没有替换用户则阻止删除
            if (!$replacementUserId) {
                $constraints = [];
                foreach ($userReferences as $table => $fields) {
                    foreach ($fields as $field => $config) {
                        if (!$config['nullable']) {
                            try {
                                $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                $checkStmt->execute([$userId]);
                                if ($checkStmt->fetchColumn() > 0) {
                                    $constraints[] = "{$table}.{$field} ({$config['description']})";
                                }
                            } catch (PDOException $e) {
                                // 如果表不存在，跳过
                                error_log("Table {$table} may not exist: " . $e->getMessage());
                            }
                        }
                    }
                }
                
                if (!empty($constraints)) {
                    sendResponse(false, 'Cannot delete user. No replacement user available. The user is referenced by: ' . implode(', ', $constraints) . '. Please ensure there is at least one other user in the company.');
                }
            }
            
            // 开始事务
            $pdo->beginTransaction();
            
            try {
                $updatedCounts = [];
                
                // 统一处理所有表和字段的引用转移
                foreach ($userReferences as $table => $fields) {
                    foreach ($fields as $field => $config) {
                        try {
                            $count = 0;
                            
                            if (!$config['nullable']) {
                                // NOT NULL字段：必须有替换用户才能更新
                                if ($replacementUserId) {
                                    $stmt = $pdo->prepare("UPDATE `{$table}` SET `{$field}` = ? WHERE `{$field}` = ?");
                                    $stmt->execute([$replacementUserId, $userId]);
                                    $count = $stmt->rowCount();
                                } else {
                                    // 如果没有替换用户且是NOT NULL字段，记录错误
                                    error_log("Cannot update {$table}.{$field}: No replacement user available for NOT NULL field");
                                }
                            } else {
                                // NULL字段：优先使用替换用户，如果没有则设置为NULL
                                if ($replacementUserId) {
                                    // 如果有替换用户，优先使用替换用户
                                    $stmt = $pdo->prepare("UPDATE `{$table}` SET `{$field}` = ? WHERE `{$field}` = ?");
                                    $stmt->execute([$replacementUserId, $userId]);
                                    $count = $stmt->rowCount();
                                    
                                    if ($count == 0) {
                                        // 如果没有更新任何行，检查是否真的有引用
                                        $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                        $checkStmt->execute([$userId]);
                                        $hasRefs = $checkStmt->fetchColumn();
                                        if ($hasRefs > 0) {
                                            error_log("Warning: UPDATE {$table}.{$field} returned 0 rows but there are {$hasRefs} references. Replacement user ID: {$replacementUserId}");
                                        }
                                    }
                                } else {
                                    // 如果没有替换用户，尝试设置为NULL
                                    try {
                                        $stmt = $pdo->prepare("UPDATE `{$table}` SET `{$field}` = NULL WHERE `{$field}` = ?");
                                        $stmt->execute([$userId]);
                                        $count = $stmt->rowCount();
                                        
                                        if ($count == 0) {
                                            // 检查是否真的有引用
                                            $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                            $checkStmt->execute([$userId]);
                                            $hasRefs = $checkStmt->fetchColumn();
                                            if ($hasRefs > 0) {
                                                error_log("Warning: UPDATE {$table}.{$field} to NULL returned 0 rows but there are {$hasRefs} references.");
                                            }
                                        }
                                    } catch (PDOException $e) {
                                        // 如果字段不允许NULL或更新失败，记录错误并抛出异常
                                        $errorMsg = "Cannot set {$table}.{$field} to NULL: " . $e->getMessage();
                                        error_log($errorMsg);
                                        throw new Exception($errorMsg . " Please ensure there is a replacement user available.");
                                    }
                                }
                            }
                            
                            // 记录更新数量
                            if ($count > 0) {
                                $updatedCounts[] = "{$table}.{$field} ({$count} records)";
                            }
                        } catch (PDOException $e) {
                            // 如果表不存在或字段不存在，记录错误并抛出异常
                            $errorMsg = "Error updating {$table}.{$field}: " . $e->getMessage();
                            error_log($errorMsg);
                            // 对于NOT NULL字段，必须抛出异常阻止删除
                            if (!$config['nullable']) {
                                throw new Exception($errorMsg . " - Cannot update NOT NULL field without replacement user.");
                            }
                            // 对于NULL字段，如果设置为NULL失败，说明字段可能不允许NULL，抛出异常
                            if ($config['nullable'] && !$replacementUserId) {
                                throw new Exception($errorMsg . " - Cannot set nullable field to NULL. Please ensure there is a replacement user.");
                            }
                        }
                    }
                }
                
                // 验证所有引用是否已被清除（在删除前再次检查）
                $remainingRefs = [];
                foreach ($userReferences as $table => $fields) {
                    foreach ($fields as $field => $config) {
                        try {
                            $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                            $checkStmt->execute([$userId]);
                            $remainingCount = $checkStmt->fetchColumn();
                            if ($remainingCount > 0) {
                                $remainingRefs[] = "{$table}.{$field} ({$remainingCount} records)";
                            }
                        } catch (PDOException $e) {
                            // 表不存在，跳过
                            error_log("Cannot check {$table}.{$field}: " . $e->getMessage());
                        }
                    }
                }
                
                // 如果还有引用，阻止删除并报错
                if (!empty($remainingRefs)) {
                    throw new Exception('Cannot delete user. The user is still referenced by: ' . implode(', ', $remainingRefs) . '. Please ensure there is a replacement user available.');
                }
                
                // 6. 硬删除用户：清除所有公司关联与公司级权限，再删除 user 记录
                // 需求：当 inactive 账号在列表被清除时，数据库也要彻底清除该 Login ID。
                $stmt = $pdo->prepare("DELETE FROM user_company_permissions WHERE user_id = ?");
                $stmt->execute([$userId]);

                $stmt = $pdo->prepare("DELETE FROM user_company_map WHERE user_id = ?");
                $stmt->execute([$userId]);

                $stmt = $pdo->prepare("DELETE FROM user WHERE id = ?");
                $result = $stmt->execute([$userId]);
                $deletedUserRows = $stmt->rowCount();
                
                if (!$result || $deletedUserRows === 0) {
                    throw new Exception('Failed to delete user. No rows were affected. This may be due to foreign key constraints.');
                }
                
                // 提交事务
                $pdo->commit();
                
                // 构建成功消息
                $message = 'User deleted successfully';
                if (!empty($updatedCounts)) {
                    $message .= '. Updated references: ' . implode(', ', $updatedCounts);
                }
                
                sendResponse(true, $message);
                
            } catch (Exception $e) {
                // 回滚事务
                $pdo->rollBack();
                error_log("Delete user error: " . $e->getMessage());
                
                // 检查是否是外键约束错误
                if (strpos($e->getMessage(), 'foreign key') !== false || 
                    strpos($e->getMessage(), '1451') !== false ||
                    strpos($e->getMessage(), 'Cannot delete') !== false ||
                    strpos($e->getMessage(), 'a foreign key constraint fails') !== false) {
                    
                    // 详细检查是哪些表还有引用
                    $remainingRefs = [];
                    foreach ($userReferences as $table => $fields) {
                        foreach ($fields as $field => $config) {
                            try {
                                $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                $checkStmt->execute([$userId]);
                                $count = $checkStmt->fetchColumn();
                                if ($count > 0) {
                                    $remainingRefs[] = "{$table}.{$field} ({$count} records)";
                                }
                            } catch (PDOException $ex) {
                                // 表不存在，跳过
                            }
                        }
                    }
                    
                    $errorMsg = 'Cannot delete user due to foreign key constraint. ';
                    if (!empty($remainingRefs)) {
                        $errorMsg .= 'The user is still referenced by: ' . implode(', ', $remainingRefs) . '. ';
                        $errorMsg .= 'Please ensure there is a replacement user available.';
                    } else {
                        $errorMsg .= 'The user is referenced by other records that could not be transferred.';
                    }
                    
                    sendResponse(false, $errorMsg);
                } else {
                    sendResponse(false, userlistFriendlyDbError($e));
                }
            }
            break;
            
        case 'get':
            global $current_company_id;
            if (isset($input['id'])) {
                // Get specific user - 只从 user 表获取基本字段，权限从 user_company_permissions 表获取
                $stmt = $pdo->prepare("SELECT id, login_id, name, email, role, permissions, status, read_only, created_by, created_at, last_login FROM user WHERE id = ?");
                $stmt->execute([$input['id']]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($user) {
                    // 获取用户关联的所有 company_ids
                    $stmt = $pdo->prepare("SELECT company_id FROM user_company_map WHERE user_id = ?");
                    $stmt->execute([$user['id']]);
                    $companyIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    $user['company_ids'] = $companyIds;
                    
                    // 从 user_company_permissions 表获取当前公司下的权限（如果存在）
                    $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
                    $stmt->execute([$user['id'], $current_company_id]);
                    $companyPermissions = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($companyPermissions) {
                        // 使用公司特定的权限
                        $user['account_permissions'] = $companyPermissions['account_permissions'];
                        $user['process_permissions'] = $companyPermissions['process_permissions'];
                    } else {
                        // 如果公司特定的权限不存在，设置为 null（表示未设置，默认可以看到所有）
                        $user['account_permissions'] = null;
                        $user['process_permissions'] = null;
                    }
                    
                    // 同步获取 company_ownership 中的 read_only 状态（如果有，优先级更高）
                    if (strtolower($user['role']) === 'partnership') {
                        $roStmt = $pdo->prepare("SELECT read_only FROM company_ownership WHERE company_id = ? AND account_id = ? AND owner_type = 'user'");
                        $roStmt->execute([$current_company_id, $user['id']]);
                        $co_ro = $roStmt->fetchColumn();
                        if ($co_ro !== false) {
                            $user['read_only'] = (int)$co_ro;
                        }
                    }
                    
                    sendResponse(true, 'User found', $user);
                } else {
                    // 如果不是user，检查是否是owner影子
                    if (isOwnerShadow($pdo, $input['id'], $current_company_id)) {
                        $stmt = $pdo->prepare("
                            SELECT o.id, o.owner_code as login_id, o.name, o.email, 'owner' as role, o.status, NULL as last_login, NULL as created_by, NULL as permissions
                            FROM owner o
                            INNER JOIN company c ON c.owner_id = o.id
                            WHERE o.id = ? AND c.id = ?
                        ");
                        $stmt->execute([$input['id'], $current_company_id]);
                        $owner = $stmt->fetch(PDO::FETCH_ASSOC);
                        
                        if ($owner) {
                            sendResponse(true, 'Owner found', $owner);
                        } else {
                            sendResponse(false, 'Owner not found or access denied');
                        }
                    } else {
                        sendResponse(false, 'User not found or access denied');
                    }
                }
            } else {
                // Get all users — single company or group-only aggregate (group login)
                $filterCompanyIds = userlist_resolve_filter_company_ids($pdo, $input);
                if ($filterCompanyIds === []) {
                    sendResponse(true, 'Users retrieved successfully', []);
                }

                $placeholders = implode(',', array_fill(0, count($filterCompanyIds), '?'));
                $stmt = $pdo->prepare("
                    SELECT DISTINCT u.id, u.login_id, u.name, u.email, u.role, u.permissions, u.status, u.created_by, u.created_at, u.last_login 
                    FROM user u
                    INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                    WHERE ucm.company_id IN ($placeholders)
                    ORDER BY 
                        CASE 
                            WHEN u.login_id REGEXP '^[0-9]' THEN 0 
                            ELSE 1 
                        END,
                        CASE 
                            WHEN u.login_id REGEXP '^[0-9]' THEN CAST(u.login_id AS UNSIGNED)
                            ELSE ASCII(UPPER(u.login_id))
                        END,
                        u.login_id ASC
                ");
                $stmt->execute($filterCompanyIds);
                $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
                sendResponse(true, 'Users retrieved successfully', $users);
            }
            break;
            
        default:
            sendResponse(false, 'Invalid action');
            break;
    }
    
} catch (PDOException $e) {
    error_log("Database error in userlist_api: " . $e->getMessage());
    error_log("SQL State: " . $e->getCode());
    error_log("Error Info: " . print_r($e->errorInfo, true));
    sendResponse(false, userlistFriendlyDbError($e), null);
} catch (Exception $e) {
    error_log("General error in userlist_api: " . $e->getMessage());
    sendResponse(false, userlistFriendlyDbError($e), null);
}
