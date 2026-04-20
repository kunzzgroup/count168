<?php
session_start();
require_once 'config.php'; // 使用统一的数据库配置

// 不缓存 HTML，commit 后刷新即可拿到带最新 ?v= 的页面
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 超时时间（秒）
define('SESSION_TIMEOUT', 3600); // 1小时

// 检查remember me cookie自动登录
if (!isset($_SESSION['user_id']) && isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];

    // 验证remember token
    $stmt = $pdo->prepare("SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND company_id = 'c168' AND status = 'active'");
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        // 重新建立session
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['last_activity'] = time();

        // 更新最后登录时间
        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);
    }
}

// 检查用户是否已登录
if (isset($_SESSION['user_id'])) {
    // 检查session超时（如果没有remember me的话）
    if (
        isset($_SESSION['last_activity']) &&
        (time() - $_SESSION['last_activity'] > SESSION_TIMEOUT) &&
        !isset($_COOKIE['remember_token'])
    ) {
        // 清除 session
        session_unset();
        session_destroy();

        // 重定向到登录页
        header("Location: index.php");
        exit();
    }

    // 检查owner是否已通过二级密码验证
    if (isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner') {
        if (!isset($_SESSION['secondary_password_verified']) || $_SESSION['secondary_password_verified'] !== true) {
            // Owner未通过二级密码验证，重定向到二级密码验证页面
            header("Location: owner_secondary_password.php");
            exit();
        }
    }

    // 先处理 logout（member 也会通过 sidebar 跳转到 dashboard.php?logout=1，必须在此处理后再重定向）
    if (isset($_GET['logout'])) {
        if (isset($_SESSION['user_id'])) {
            try {
                $stmt = $pdo->prepare("UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?");
                $stmt->execute([$_SESSION['user_id']]);
            } catch (PDOException $e) { /* user 表可能无此字段，member 从 account 登录 */
            }
        }
        session_unset();
        session_destroy();
        if (isset($_COOKIE['remember_token'])) {
            setcookie('remember_token', '', time() - 3600, "/", "", false, true);
        }
        header("Location: index.php");
        exit();
    }

    // member 不显示 Home 页，只显示 Win/Loss：访问 dashboard 时重定向到 member.php
    if (isset($_SESSION['user_type']) && strtolower($_SESSION['user_type']) === 'member') {
        header("Location: member.php");
        exit();
    }

    // 更新活动时间戳
    $_SESSION['last_activity'] = time();

} else {
    // 未登录，重定向到登录页
    header("Location: index.php");
    exit();
}

// 获取用户信息
$user_id = $_SESSION['user_id'];
$login_id = $_SESSION['login_id'];
$name = $_SESSION['name'];
$role = $_SESSION['role'];

// 获取用户权限
$stmt = $pdo->prepare("SELECT permissions FROM user WHERE id = ?");
$stmt->execute([$user_id]);
$userPermissions = $stmt->fetchColumn();
$permissions = $userPermissions ? json_decode($userPermissions, true) : [];

$company_id = 'c168'; // 固定值
$avatarLetter = strtoupper($name[0]);
// 为JavaScript准备用户数据
$userData = [
    'name' => $name,
    'login_id' => $login_id,
    'role' => $role,
    'avatar_letter' => $avatarLetter,
    'permissions' => $permissions
];

// React SPA 入口（不再由 PHP 渲染 HTML）
$frontendEntry = '/dashboard-frontend/dist/index.html';
header("Location: {$frontendEntry}");
exit();