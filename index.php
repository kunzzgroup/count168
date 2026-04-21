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

/**
 * 输出已构建的 React 登录页（login-app/）。子目录部署时由 index.php 重写资源前缀。
 */
function render_login_react_spa(): void
{
    $spaPath = __DIR__ . '/login-app/index.html';
    if (!is_readable($spaPath)) {
        if (!headers_sent()) {
            http_response_code(503);
            header('Content-Type: text/html; charset=UTF-8');
        }
        echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>EazyCount</title></head><body>';
        echo '<p>Login UI has not been built yet. From this folder run:</p>';
        echo '<pre>cd login-spa && npm install && npm run build</pre></body></html>';
        return;
    }
    $html = file_get_contents($spaPath);
    $base = app_url_base();
    $prefix = ($base === '' ? '' : $base) . '/login-app/';
    $html = str_replace('/login-app/', $prefix, $html);
    $html = str_replace('__EASYCOUNT_APP_ROOT__', htmlspecialchars($base, ENT_QUOTES, 'UTF-8'), $html);
    if (!headers_sent()) {
        header('Content-Type: text/html; charset=UTF-8');
    }
    echo $html;
}

render_login_react_spa();