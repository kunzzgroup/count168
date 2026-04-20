<?php
// 使用统一的session检查
require_once __DIR__ . '/session_check.php';

// 强制浏览器使用最新页面与资源，避免旧缓存
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 检查用户类型是否为member
if (strtolower($_SESSION['user_type'] ?? '') !== 'member') {
    header('Location: index.php');
    exit();
}

$accountDbId = (int)$_SESSION['user_id'];
$accountCode = $_SESSION['login_id'] ?? '';
$accountName = $_SESSION['name'] ?? '';
$currentCompanyId = isset($_SESSION['company_id']) ? (int)$_SESSION['company_id'] : 0;

// MEMBER 有连接其他账号时：不管怎样刷新都只在自己的账号（每次加载/刷新强制恢复为登录账号）
if (isset($_SESSION['member_login_account_id'])) {
    $memberLoginAccountId = (int)$_SESSION['member_login_account_id'];
    $st = $pdo->prepare("SELECT id, account_id, name FROM account WHERE id = ?");
    $st->execute([$memberLoginAccountId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $accountDbId = (int)$row['id'];
        $accountCode = $row['account_id'] ?? '';
        $accountName = $row['name'] ?? '';
        $_SESSION['user_id'] = $accountDbId;
        $_SESSION['login_id'] = $accountCode;
        $_SESSION['name'] = $accountName;
        $_SESSION['account_id'] = $accountCode;
    }
}

require_once __DIR__ . '/api/get_companies_helper.php';

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
        $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM account_company WHERE account_id = ?");
        $checkStmt->execute([$currentUserId]);
        $accountCompanyCount = $checkStmt->fetchColumn();
        $debugInfo['account_company_count'] = $accountCompanyCount;
        
        if ($accountCompanyCount > 0) {
            // 先检查 account_company 表中存储的 company_id 值
            $checkCompanyIdsStmt = $pdo->prepare("SELECT company_id FROM account_company WHERE account_id = ?");
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
        $memberCompanies = array_map(function($c) {
            $c['company_name'] = $c['company_id'];
            return $c;
        }, $allOwnerComps);
        $debugInfo['companies_found'] = count($memberCompanies);
    } else {
        // 普通后台用户：通过 user_company_map 关联公司
        $allUserComps = getCompaniesByUser($pdo, $_SESSION['user_id'] ?? $currentUserId);
        $memberCompanies = array_map(function($c) {
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

// 临时调试输出（生产环境可以注释掉）
// 如果需要查看调试信息，可以取消下面的注释
// if (empty($memberCompanies)) {
//     error_log('Member 公司列表为空。调试信息: ' . json_encode($debugInfo, JSON_UNESCAPED_UNICODE));
// }

$today = date('d/m/Y');
// Capture Date 默认与 Dashboard 一致：本周一至今天
$today_dt = new DateTime('today');
$day_of_week = (int)$today_dt->format('w');
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
    'currentCompanyId' => (int)$currentCompanyId,
    'showCompanyFilter' => (!empty($memberCompanies) && is_array($memberCompanies) && count($memberCompanies) > 1),
    'showDebug' => $showMemberDebug,
    'debugInfo' => $debugInfo,
];

$assetVer = function ($file) {
    $path = __DIR__ . '/' . $file;
    return file_exists($path) ? filemtime($path) : time();
};
$reactBundlePath = __DIR__ . '/dashboard-app/assets/dashboard-react.js';
$reactBundleOk = is_file($reactBundlePath);
$reactBundleVer = $reactBundleOk ? filemtime($reactBundlePath) : time();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Member Win/Loss</title>
    <link rel="icon" type="image/png" href="images/count_logo.png">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/member.css?v=<?php echo $assetVer('css/member.css'); ?>">
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists(__DIR__ . '/css/global-13inch.css') ? filemtime(__DIR__ . '/css/global-13inch.css') : time(); ?>">
</head>
<body class="transaction-page member-winloss-page">
    <?php include 'sidebar.php'; ?>

    <?php if (!$reactBundleOk): ?>
        <div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 40rem;">
            <p><strong>React 未构建。</strong>请在 <code>dashboard-web</code> 执行 <code>npm install</code> 与 <code>npm run build</code>。</p>
            <p>产物：<code>dashboard-app/assets/dashboard-react.js</code></p>
        </div>
    <?php else: ?>
        <script>
            window.MEMBER_ACCOUNT_ID = <?php echo (int)$accountDbId; ?>;
            window.MEMBER_ACCOUNT_CODE = <?php echo json_encode($accountCode ?? ''); ?>;
            window.MEMBER_ACCOUNT_NAME = <?php echo json_encode($accountName ?? ''); ?>;
            window.MEMBER_COMPANY_ID = <?php echo (int)$currentCompanyId; ?>;
            window.__MEMBER_BOOTSTRAP = <?php echo json_encode($memberBootstrap, JSON_UNESCAPED_UNICODE); ?>;
            window.__SPA_DEFAULT_ROUTE = '/member';
            window.__COUNT_ASSET_BASE = '';
            window.__MEMBER_JS_VER = <?php echo (int)$assetVer('js/member.js'); ?>;
        </script>
        <div id="root"></div>
        <script type="module" src="dashboard-app/assets/dashboard-react.js?v=<?php echo (int)$reactBundleVer; ?>"></script>
    <?php endif; ?>

</body>
</html>