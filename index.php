<?php
session_start();
require_once 'config.php';

// 如果已经登录，直接跳转到dashboard
if (isset($_SESSION['user_id'])) {
    header("Location: dashboard.php");
    exit();
}

// 检查remember me cookie自动登录
if (isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];

    // 验证remember token
    $stmt = $pdo->prepare("SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND status = 'active'");
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        // 重新建立session
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];

        // 获取用户的 company_id（从 user_company_map 获取第一个，或使用 user 表中的 company_id）
        $company_id = null;
        try {
            // 优先从 user_company_map 获取第一个 company
            $stmt2 = $pdo->prepare("
                SELECT c.id 
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
                LIMIT 1
            ");
            $stmt2->execute([$user['id']]);
            $company_id = $stmt2->fetchColumn();
        } catch (PDOException $e) {
            error_log("获取用户 company 失败: " . $e->getMessage());
        }

        // 如果 user_company_map 中没有，尝试使用 user 表中的 company_id（向后兼容）
        if (!$company_id && isset($user['company_id'])) {
            $company_id = $user['company_id'];
        }

        $_SESSION['company_id'] = $company_id ? (int)$company_id : null;
        $_SESSION['last_activity'] = time();

        // 更新最后登录时间
        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);

        // 跳转到dashboard
        header("Location: dashboard.php");
        exit();
    } else {
        // Token无效或过期，清除cookie
        setcookie('remember_token', '', time() - 3600, "/", "", false, true);
    }
}

$assetVer = function ($file) {
    $path = __DIR__ . '/' . $file;
    return file_exists($path) ? filemtime($path) : time();
};
$reactBundlePath = __DIR__ . '/dashboard-app/assets/dashboard-react.js';
$reactBundleOk = is_file($reactBundlePath);
$reactBundleVer = $reactBundleOk ? filemtime($reactBundlePath) : time();
$springApiBase = getenv('SPRING_API_BASE') !== false && getenv('SPRING_API_BASE') !== '' ? rtrim(getenv('SPRING_API_BASE'), '/') : '';
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
