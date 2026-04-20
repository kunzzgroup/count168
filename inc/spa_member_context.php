<?php
/**
 * Member Win/Loss SPA 所需变量（原 member.php 中 session 校验之后、HTML 之前的逻辑）。
 * 前置条件：已 require config.php、session_check.php，且当前用户为 member。
 */

$accountDbId = (int) $_SESSION['user_id'];
$accountCode = $_SESSION['login_id'] ?? '';
$accountName = $_SESSION['name'] ?? '';
$currentCompanyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : 0;

// MEMBER 有连接其他账号时：不管怎样刷新都只在自己的账号（每次加载/刷新强制恢复为登录账号）
if (isset($_SESSION['member_login_account_id'])) {
    $memberLoginAccountId = (int) $_SESSION['member_login_account_id'];
    $st = $pdo->prepare('SELECT id, account_id, name FROM account WHERE id = ?');
    $st->execute([$memberLoginAccountId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $accountDbId = (int) $row['id'];
        $accountCode = $row['account_id'] ?? '';
        $accountName = $row['name'] ?? '';
        $_SESSION['user_id'] = $accountDbId;
        $_SESSION['login_id'] = $accountCode;
        $_SESSION['name'] = $accountName;
        $_SESSION['account_id'] = $accountCode;
    }
}

require_once dirname(__DIR__) . '/api/get_companies_helper.php';

// 获取当前 member 用户有权限的公司列表（用于前端公司按钮切换）
$memberCompanies = [];
$debugInfo = []; // 用于调试
try {
    $currentUserId   = $accountDbId;
    $currentUserRole = strtolower($_SESSION['role'] ?? '');
    $currentUserType = strtolower($_SESSION['user_type'] ?? '');

    $debugInfo['user_id'] = $currentUserId;
    $debugInfo['user_type'] = $currentUserType;
    $debugInfo['user_role'] = $currentUserRole;

    if ($currentUserType === 'member') {
        // member：user_id 就是 account.id，通过 account_company 关联公司
        // 首先检查 account_company 表中是否有数据
        $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM account_company WHERE account_id = ?');
        $checkStmt->execute([$currentUserId]);
        $accountCompanyCount = $checkStmt->fetchColumn();
        $debugInfo['account_company_count'] = $accountCompanyCount;

        if ($accountCompanyCount > 0) {
            // 先检查 account_company 表中存储的 company_id 值
            $checkCompanyIdsStmt = $pdo->prepare('SELECT company_id FROM account_company WHERE account_id = ?');
            $checkCompanyIdsStmt->execute([$currentUserId]);
            $storedCompanyIds = $checkCompanyIdsStmt->fetchAll(PDO::FETCH_COLUMN);
            $debugInfo['stored_company_ids'] = $storedCompanyIds;

            // 检查这些 company_id 是否在 company 表中存在
            if (!empty($storedCompanyIds)) {
                $placeholders = str_repeat('?,', count($storedCompanyIds) - 1) . '?';
                $checkExistsStmt = $pdo->prepare("SELECT id FROM company WHERE id IN ($placeholders)");
                $checkExistsStmt->execute($storedCompanyIds);
                $existingCompanyIds = $checkExistsStmt->fetchAll(PDO::FETCH_COLUMN);
                $debugInfo['existing_company_ids'] = $existingCompanyIds;
                $debugInfo['missing_company_ids'] = array_diff($storedCompanyIds, $existingCompanyIds);
            }

            // 查询公司列表 - company 表只有 company_id 字段，没有 name 字段
            // 使用 company_id 作为显示名称
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.company_id AS company_name
                FROM company c
                INNER JOIN account_company ac ON c.id = ac.company_id
                WHERE ac.account_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
            ");
            $stmt->execute([$currentUserId]);
            $memberCompanies = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // 如果查询结果为空，尝试直接查询
            if (empty($memberCompanies) && !empty($storedCompanyIds)) {
                $placeholders = str_repeat('?,', count($storedCompanyIds) - 1) . '?';
                $directStmt = $pdo->prepare("
                    SELECT id, company_id, company_id AS company_name
                    FROM company
                    WHERE id IN ($placeholders) AND company_id != ''
                    ORDER BY company_id ASC
                ");
                $directStmt->execute($storedCompanyIds);
                $memberCompanies = $directStmt->fetchAll(PDO::FETCH_ASSOC);
                $debugInfo['used_direct_query'] = true;
            }

            $debugInfo['companies_found'] = count($memberCompanies);

            // 如果查询结果为空，记录详细信息
            if (empty($memberCompanies) && !empty($storedCompanyIds)) {
                error_log("Member {$currentUserId} has records in account_company, but JOIN query returned empty. Stored company_id: " . implode(', ', $storedCompanyIds));
            }
        } else {
            error_log("Member {$currentUserId} has no associated companies in account_company table");
            $debugInfo['error'] = 'No data in account_company table';
        }
    } elseif ($currentUserRole === 'owner') {
        // owner：查询自己名下所有公司
        $ownerId = $_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? $currentUserId;
        $allOwnerComps = getCompaniesByOwner($pdo, $ownerId, false);
        $memberCompanies = array_map(function ($c) {
            $c['company_name'] = $c['company_id'];
            return $c;
        }, $allOwnerComps);
        $debugInfo['companies_found'] = count($memberCompanies);
    } else {
        // 普通后台用户：通过 user_company_map 关联公司
        $allUserComps = getCompaniesByUser($pdo, $_SESSION['user_id'] ?? $currentUserId);
        $memberCompanies = array_map(function ($c) {
            $c['company_name'] = $c['company_id'];
            return $c;
        }, $allUserComps);
        $debugInfo['companies_found'] = count($memberCompanies);
    }
} catch (PDOException $e) {
    error_log('Failed to load member company list: ' . $e->getMessage());
    error_log('Debug info: ' . json_encode($debugInfo, JSON_UNESCAPED_UNICODE));
    $memberCompanies = [];
    $debugInfo['exception'] = $e->getMessage();
}

$today = date('d/m/Y');
// Capture Date 默认与 Dashboard 一致：本周一至今天
$today_dt = new DateTime('today');
$day_of_week = (int) $today_dt->format('w');
$days_to_monday = $day_of_week === 0 ? 6 : $day_of_week - 1;
$monday_dt = (clone $today_dt)->modify("-{$days_to_monday} days");
$default_date_from = $monday_dt->format('d/m/Y');
$default_date_to = $today_dt->format('d/m/Y');

$hasIntegrityWarnings = !empty($debugInfo['missing_company_ids']) || !empty($debugInfo['error']) || !empty($debugInfo['exception']);
$showMemberDebug = isset($debugInfo) && is_array($debugInfo) && ((empty($memberCompanies) && !empty($debugInfo)) || $hasIntegrityWarnings);

$memberBootstrap = [
    'defaultDateFrom' => $default_date_from,
    'defaultDateTo' => $default_date_to,
    'captureDateRangeDisplay' => $default_date_from . ' - ' . $default_date_to,
    'memberCompanies' => array_values(is_array($memberCompanies) ? $memberCompanies : []),
    'currentCompanyId' => (int) $currentCompanyId,
    'showCompanyFilter' => (!empty($memberCompanies) && is_array($memberCompanies) && count($memberCompanies) > 1),
    'showDebug' => $showMemberDebug,
    'debugInfo' => $debugInfo,
];
