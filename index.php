<?php
/**
 * 全站唯一 SPA 壳：未登录 = 登录页；已登录 = Dashboard（非 member）或 Member Win/Loss（member）。
 * 子路由用查询参数 r（与 Hash 一致，无前导 #），例如 index.php?r=/dashboard
 */

if (session_status() === PHP_SESSION_NONE) {
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_start();
}

require_once __DIR__ . '/config.php';

$assetVer = function ($file) {
    $path = __DIR__ . '/' . $file;
    return file_exists($path) ? filemtime($path) : time();
};

$reactBundlePath = __DIR__ . '/dashboard-app/assets/dashboard-react.js';
$reactBundleOk = is_file($reactBundlePath);
$reactBundleVer = $reactBundleOk ? filemtime($reactBundlePath) : time();
$springApiBase = getenv('SPRING_API_BASE') !== false && getenv('SPRING_API_BASE') !== '' ? rtrim(getenv('SPRING_API_BASE'), '/') : '';

// 与 dashboard-web/src/routeConfig.js 中 path 列一致（用于 ?r= 白名单）
$knownSpaPaths = [
    '/login', '/reset-password', '/owner-secondary-password', '/dashboard', '/member',
    '/account-list', '/add-account', '/announcement', '/bank-process-list', '/games-process-list',
    '/process-list', '/bankprocess-maintenance', '/capture-maintenance', '/datacapture', '/datacapture-summary',
    '/transaction', '/transaction-maintenance', '/customer-report', '/domain-report', '/domain',
    '/formula-maintenance', '/payment-maintenance', '/ownership', '/permissions', '/user-access',
    '/user-list', '/auto-monthly-accounting', '/check-php-config', '/debug-ag110', '/scratch-db',
];

// 检查 remember me cookie 自动登录（未登录时）
if (!isset($_SESSION['user_id']) && isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];
    $stmt = $pdo->prepare('SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND status = \'active\'');
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['user_type'] = 'user';

        $company_id = null;
        try {
            $stmt2 = $pdo->prepare('
                SELECT c.id
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != \'\'
                ORDER BY c.company_id ASC
                LIMIT 1
            ');
            $stmt2->execute([$user['id']]);
            $company_id = $stmt2->fetchColumn();
        } catch (PDOException $e) {
            error_log('获取用户 company 失败: ' . $e->getMessage());
        }

        if (!$company_id && isset($user['company_id'])) {
            $company_id = $user['company_id'];
        }

        $_SESSION['company_id'] = $company_id ? (int) $company_id : null;
        $_SESSION['last_activity'] = time();

        $stmt = $pdo->prepare('UPDATE user SET last_login = NOW() WHERE id = ?');
        $stmt->execute([$user['id']]);

        header('Location: index.php?r=/dashboard');
        exit();
    }
    setcookie('remember_token', '', time() - 3600, '/', '', false, true);
}

// 已登录：先处理 logout（须在 session_check 与业务逻辑之前）
if (isset($_GET['logout']) && isset($_SESSION['user_id'])) {
    if (isset($_SESSION['user_id'])) {
        try {
            $stmt = $pdo->prepare('UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?');
            $stmt->execute([$_SESSION['user_id']]);
        } catch (PDOException $e) {
            /* user 表可能无此字段，member 从 account 登录 */
        }
    }
    session_unset();
    session_destroy();
    if (isset($_COOKIE['remember_token'])) {
        setcookie('remember_token', '', time() - 3600, '/', '', false, true);
    }
    header('Location: index.php');
    exit();
}

// ─── 未登录：仅输出登录 SPA ───
if (!isset($_SESSION['user_id'])) {
    ?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EazyCount</title>
    <link rel="stylesheet" href="css/style.css?v=<?php echo $assetVer('css/style.css'); ?>" />
    <link rel="stylesheet" href="css/index.css?v=<?php echo $assetVer('css/index.css'); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet"
        href="css/global-13inch.css?v=<?php echo file_exists(__DIR__ . '/css/global-13inch.css') ? filemtime(__DIR__ . '/css/global-13inch.css') : time(); ?>">
    <script>
        window.__SPA_DEFAULT_ROUTE = '/login';
        window.__API_BASE_URL__ = <?php echo json_encode($springApiBase); ?>;
    </script>
    <script src="js/api-bridge.js?v=<?php echo $assetVer('js/api-bridge.js'); ?>"></script>
</head>

<body class="bg">

    <?php if (!$reactBundleOk): ?>
        <div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 40rem;">
            <p><strong>React 登录页未构建。</strong>请在项目内执行：</p>
            <pre style="background:#f3f4f6;padding:1rem;border-radius:8px;">cd dashboard-web&#10;npm install&#10;npm run build</pre>
            <p>完成后刷新本页。产物路径：<code>dashboard-app/assets/dashboard-react.js</code></p>
        </div>
    <?php else: ?>
        <div id="root"></div>
        <script type="module" src="dashboard-app/assets/dashboard-react.js?v=<?php echo (int) $reactBundleVer; ?>"></script>
    <?php endif; ?>

</body>

</html>
<?php
    exit();
}

// ─── 已登录：统一校验（超时、二级密码等）───
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

require_once __DIR__ . '/session_check.php';

$isMemberShell = strtolower($_SESSION['user_type'] ?? '') === 'member';

$rawR = isset($_GET['r']) ? trim((string) $_GET['r']) : '';
if ($rawR !== '' && ($rawR[0] ?? '') !== '/') {
    $rawR = '/' . $rawR;
}

if ($isMemberShell) {
    $spaDefault = '/member';
    require_once __DIR__ . '/inc/spa_member_context.php';
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
    <script>window.__API_BASE_URL__ = <?php echo json_encode($springApiBase); ?>;</script>
    <script src="js/api-bridge.js?v=<?php echo $assetVer('js/api-bridge.js'); ?>"></script>
</head>
<body class="transaction-page member-winloss-page">
    <?php include __DIR__ . '/sidebar.php'; ?>

    <?php if (!$reactBundleOk): ?>
        <div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 40rem;">
            <p><strong>React 未构建。</strong>请在 <code>dashboard-web</code> 执行 <code>npm install</code> 与 <code>npm run build</code>。</p>
            <p>产物：<code>dashboard-app/assets/dashboard-react.js</code></p>
        </div>
    <?php else: ?>
        <script>
            window.MEMBER_ACCOUNT_ID = <?php echo (int) $accountDbId; ?>;
            window.MEMBER_ACCOUNT_CODE = <?php echo json_encode($accountCode ?? ''); ?>;
            window.MEMBER_ACCOUNT_NAME = <?php echo json_encode($accountName ?? ''); ?>;
            window.MEMBER_COMPANY_ID = <?php echo (int) $currentCompanyId; ?>;
            window.__MEMBER_BOOTSTRAP = <?php echo json_encode($memberBootstrap, JSON_UNESCAPED_UNICODE); ?>;
            window.__SPA_DEFAULT_ROUTE = <?php echo json_encode($spaDefault); ?>;
            window.__COUNT_ASSET_BASE = '';
            window.__MEMBER_JS_VER = <?php echo (int) $assetVer('js/member.js'); ?>;
        </script>
        <div id="root"></div>
        <script type="module" src="dashboard-app/assets/dashboard-react.js?v=<?php echo (int) $reactBundleVer; ?>"></script>
    <?php endif; ?>

</body>
</html>
<?php
    exit();
}

// ─── 非 member：Dashboard 壳（原 dashboard.php）───
$user_id = $_SESSION['user_id'];
$login_id = $_SESSION['login_id'];
$name = $_SESSION['name'];
$role = $_SESSION['role'];

$stmt = $pdo->prepare('SELECT permissions FROM user WHERE id = ?');
$stmt->execute([$user_id]);
$userPermissions = $stmt->fetchColumn();
$permissions = $userPermissions ? json_decode($userPermissions, true) : [];

$company_id = 'c168';
$avatarLetter = strtoupper($name[0]);
$userData = [
    'name' => $name,
    'login_id' => $login_id,
    'role' => $role,
    'avatar_letter' => $avatarLetter,
    'permissions' => $permissions,
];

$spaDefault = '/dashboard';
if ($rawR !== '' && $rawR !== '/login' && $rawR !== '/member' && in_array($rawR, $knownSpaPaths, true)) {
    $spaDefault = $rawR;
}

?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transaction Dashboard - EazyCount</title>
    <link rel="icon" type="image/png" href="images/count_logo.png">
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/dashboard.css?v=<?php echo $assetVer('css/dashboard.css'); ?>">
    <script>
        window.userData = <?php echo json_encode($userData); ?>;
        window.companyId = <?php echo isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : 'null'; ?>;
        window.__DASHBOARD_JS_VER = <?php echo (int) $assetVer('js/dashboard.js'); ?>;
        window.__COUNT_ASSET_BASE = '';
        window.__SPA_DEFAULT_ROUTE = <?php echo json_encode($spaDefault); ?>;
        window.__API_BASE_URL__ = <?php echo json_encode($springApiBase); ?>;
    </script>
    <script src="js/api-bridge.js?v=<?php echo $assetVer('js/api-bridge.js'); ?>"></script>
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <link rel="stylesheet"
        href="css/global-13inch.css?v=<?php echo file_exists(__DIR__ . '/css/global-13inch.css') ? filemtime(__DIR__ . '/css/global-13inch.css') : time(); ?>">
</head>

<body class="dashboard-page">
    <?php include __DIR__ . '/sidebar.php'; ?>

    <?php if (!$reactBundleOk): ?>
        <div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 40rem;">
            <p><strong>React 仪表盘未构建。</strong>请在项目内执行：</p>
            <pre style="background:#f3f4f6;padding:1rem;border-radius:8px;">cd dashboard-web&#10;npm install&#10;npm run build</pre>
            <p>完成后刷新本页。产物路径：<code>dashboard-app/assets/dashboard-react.js</code></p>
        </div>
    <?php else: ?>
        <div id="root"></div>
        <script type="module" src="dashboard-app/assets/dashboard-react.js?v=<?php echo (int) $reactBundleVer; ?>"></script>
    <?php endif; ?>

</body>

</html>
