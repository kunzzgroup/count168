<?php

// 默认连接参数（可被 config.local.php 覆盖，服务器上请用 config.local.php 放真实密码）

$host = '127.0.0.1';
$dbname = 'u857194726_c168site';
$dbuser = 'admin';
$dbpass = 'C168_site';

$configLocal = __DIR__ . '/config.local.php';
if (is_readable($configLocal)) {
    require $configLocal;
}

// 设置PHP时区为马来西亚时间
date_default_timezone_set('Asia/Kuala_Lumpur');

if (!function_exists('ec_password_hash_options')) {
    /**
     * Prefer Argon2id on supported runtime; fallback to bcrypt(12).
     */
    function ec_password_hash_options(): array
    {
        if (defined('PASSWORD_ARGON2ID')) {
            return [
                'algo' => PASSWORD_ARGON2ID,
                'options' => [
                    'memory_cost' => 65536,
                    'time_cost' => 4,
                    'threads' => 1,
                ],
            ];
        }

        return [
            'algo' => PASSWORD_BCRYPT,
            'options' => ['cost' => 12],
        ];
    }
}

if (!function_exists('ec_password_hash')) {
    /**
     * Hash password with project standard algorithm/options.
     */
    function ec_password_hash(string $password): string
    {
        $config = ec_password_hash_options();
        return password_hash($password, $config['algo'], $config['options']);
    }
}

if (!function_exists('ec_password_needs_rehash')) {
    /**
     * Check whether a stored hash should be upgraded.
     */
    function ec_password_needs_rehash(string $hash): bool
    {
        $config = ec_password_hash_options();
        return password_needs_rehash($hash, $config['algo'], $config['options']);
    }
}


// 全局禁用任何 PHP 接口和表单页面的浏览器缓存 (防止各模块出现显示同步遗漏问题)

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$pdo = null;

try {

    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4;connect_timeout=5",
        $dbuser,
        $dbpass,
        [PDO::ATTR_TIMEOUT => 5]
    );

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);



    // 设置MySQL连接的时区

    $pdo->exec("SET time_zone = '+08:00'");

} catch (PDOException $e) {

    error_log('Database connection failed: ' . $e->getMessage());

    $pdo = null;

}



// SMTP 发信（必填才能发到 Gmail）：填好后重置密码邮件走 SMTP，否则用 mail() 易失败

// Gmail 步骤：1) 开启两步验证 2) 申请应用专用密码 https://myaccount.google.com/apppasswords 3) 下面填好

$smtp_host = 'smtp.gmail.com';

$smtp_port = 465;

$smtp_user = 'maxjk77777@gmail.com';           // 你的 Gmail，如 yourname@gmail.com

$smtp_pass = 'icwe kjwy otmg pjkw';           // 上一步生成的应用专用密码（16 位）

$smtp_from_email = '';     // 留空则用 smtp_user

$smtp_from_name = 'EazyCount';

?>

