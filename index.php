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
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EazyCount</title>
    <link rel="stylesheet" href="css/style.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/index.css?v=<?php echo time(); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>

<body class="bg">

    

    <div class="login-container">

        <!-- 整个登录表单上方的跑马灯维护提示（不在 form 里面） -->
        <div class="maintenance-marquee-wrapper" id="maintenanceMarqueeWrapper" style="display: none;">
                <div class="maintenance-marquee-track" id="maintenanceMarqueeTrack">
                    <!-- 维护内容将在这里动态加载 -->
                </div>
        </div>
    
        <div class="role-tabs">
                <button class="role-tab <?php echo (!isset($_GET['role']) || $_GET['role'] === 'admin') ? 'active' : ''; ?>" id="admin-tab">Admin</button>
                <button class="role-tab <?php echo (isset($_GET['role']) && $_GET['role'] === 'member') ? 'active' : ''; ?>" id="member-tab">Member</button>
        </div>

        <div class="login-card">
            
            <div class="form-content">
                <form class="login-form" id="loginForm" method="POST">
                    <div class="input-group">
                        <i class="fas fa-building input-icon"></i>
                        <input type="text" placeholder="Company / Group ID" id="company-id" name="company_id" data-i18n-placeholder="companyId" required />
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-user input-icon"></i>
                        <input type="text" placeholder="Username" id="user-id" name="login_id" data-account-field="account_id" data-i18n-placeholder="username" required />
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" placeholder="Password" id="password" name="password" data-i18n-placeholder="password" required />
                    </div>

                    <div class="form-options">
                        <label class="remember-switch">
                            <input type="checkbox" name="remember_me" value="1" />
                            <span class="slider"></span>
                            <span class="remember-text" data-i18n="rememberMe">Remember me</span>
                        </label>
                        <a href="reset-password.php" class="forgot-link" data-i18n="forgetPassword" style="display: <?php echo (isset($_GET['role']) && $_GET['role'] === 'member') ? 'none' : 'block'; ?>">Forget Password?</a>
                    </div>

                    <button type="submit" class="login-btn">
                        <span data-i18n="login">Login</span>
                    </button>

                    <div class="language-switch-container" aria-label="Language switch">
                        <button type="button" class="lang-btn active" id="lang-en" data-lang="en" aria-label="English">
                            <span class="lang-label">English</span>
                        </button>
                        <button type="button" class="lang-btn" id="lang-zh" data-lang="zh" aria-label="中文">
                            <span class="lang-label">中文</span>
                        </button>
                    </div>

                    <!-- <div class="language-switch-container">
                        <a href="/cn/index.php" class="lang-switch" id="lang-switch" title="Switch Language">
                            <span class="lang-option">中文</span>
                            <span class="lang-option active">English</span>
                        </a>
                    </div> -->
                </form>
            </div>
        </div>
    </div>

    <!-- Telegram 图片 - 固定在右下角 -->
    <img src="images/telegram.png" alt="Telegram" class="telegram-icon" />

    <!-- 登录页自定义弹窗（与重置密码页风格一致） -->
    <div id="alertModalOverlay" class="modal-overlay" aria-hidden="true">
        <div class="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
            <div class="modal-icon-wrap">
                <i class="fas fa-exclamation-triangle modal-icon" aria-hidden="true"></i>
            </div>
            <h3 id="modalTitle" class="modal-title" data-i18n="notice">Notice</h3>
            <p id="modalMessage" class="modal-message"></p>
            <div class="modal-actions">
                <button type="button" id="modalConfirmBtn" class="modal-btn modal-btn-primary" data-i18n="confirm">Confirm</button>
            </div>
        </div>
    </div>

    <script src="js/index.js?v=<?php echo time(); ?>"></script>
</body>

</html>