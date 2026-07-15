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
// 阻止搜索引擎收录（与 .htaccess / meta robots 配合）
header('X-Robots-Tag: noindex, nofollow');


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

// 全局维护模式检查：凡已登录且加载 config 的请求（页面 + API）统一在此拦截
require_once __DIR__ . '/includes/maintenance_gate.php';
if (
    session_status() === PHP_SESSION_ACTIVE
    && isset($_SESSION['user_id'])
    && isset($pdo)
    && $pdo instanceof PDO
    && !maintenance_gate_should_skip_enforcement()
) {
    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $isApiRequest = str_contains($scriptName, '/api/');
    maintenance_gate_enforce_active_session($pdo, $isApiRequest);
}
?>