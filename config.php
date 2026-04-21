<?php
$host = 'localhost';
$dbname = 'u857194726_count168';
$dbuser = 'u857194726_count168';
$dbpass = 'Kholdings1688@';

// 设置PHP时区为马来西亚时间
date_default_timezone_set('Asia/Kuala_Lumpur');

// 全局禁用任何 PHP 接口和表单页面的浏览器缓存 (防止各模块出现显示同步遗漏问题)
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $dbuser, $dbpass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 设置MySQL连接的时区
    $pdo->exec("SET time_zone = '+08:00'");
    
} catch(PDOException $e) {
    // 抛出异常而不是直接 die，让调用者可以处理
    throw new PDOException("数据库连接失败: " . $e->getMessage());
}

// SMTP 发信（必填才能发到 Gmail）：填好后重置密码邮件走 SMTP，否则用 mail() 易失败
// Gmail 步骤：1) 开启两步验证 2) 申请应用专用密码 https://myaccount.google.com/apppasswords 3) 下面填好
$smtp_host = 'smtp.gmail.com';
$smtp_port = 465;
$smtp_user = 'maxjk77777@gmail.com';           // 你的 Gmail，如 yourname@gmail.com
$smtp_pass = 'icwe kjwy otmg pjkw';           // 上一步生成的应用专用密码（16 位）
$smtp_from_email = '';     // 留空则用 smtp_user
$smtp_from_name = 'EazyCount';

/**
 * Public URL path to this application root (no trailing slash), e.g. "" or "/count168test".
 * Used for redirects to the login page and for rewriting asset paths in the React login bundle.
 */
function app_url_base(): string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $docRoot = @realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    $appDir = @realpath(__DIR__);
    $docNorm = $docRoot ? str_replace('\\', '/', $docRoot) : '';
    $appNorm = $appDir ? str_replace('\\', '/', $appDir) : '';
    if ($docNorm !== '' && $appNorm !== '' && strpos($appNorm, $docNorm) === 0) {
        $rel = substr($appNorm, strlen($docNorm));
        $cached = rtrim($rel, '/');
    } else {
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $dir = rtrim(dirname($script), '/');
        if ($dir === '.' || $dir === '/') {
            $cached = '';
        } else {
            $cached = $dir;
        }
    }
    return $cached;
}

/**
 * Login entry URL without index.php (directory URL). Ends with / except document root uses "/".
 */
function login_entry_url(): string
{
    $b = app_url_base();
    return $b === '' ? '/' : $b . '/';
}

/**
 * Transaction dashboard URL without .php (e.g. /dashboard or /subdir/dashboard).
 * Requires Apache mod_rewrite rule: ^dashboard/?$ -> dashboard.php (see .htaccess).
 */
function dashboard_entry_url(): string
{
    $b = app_url_base();
    return ($b === '' ? '' : $b) . '/dashboard';
}
?>