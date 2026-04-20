<?php
/**
 * Spring 登录成功后的一次性会话桥接：从 Spring 拉取 session 字段写入 PHP $_SESSION，再跳转业务页。
 * 需与 Spring 同环境变量：APP_INTERNAL_BOOTSTRAP_KEY；服务端拉 Spring 优先 SPRING_INTERNAL_BASE，否则 SPRING_API_BASE，默认 http://127.0.0.1:8090。
 */

if (session_status() === PHP_SESSION_NONE) {
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_start();
}

$token = isset($_GET['t']) ? (string) $_GET['t'] : '';
if ($token === '') {
    header('Location: index.php');
    exit();
}

$internalRaw = getenv('SPRING_INTERNAL_BASE');
if ($internalRaw !== false && $internalRaw !== '') {
    $springBase = rtrim($internalRaw, '/');
} elseif (getenv('SPRING_API_BASE') !== false && getenv('SPRING_API_BASE') !== '') {
    $springBase = rtrim(getenv('SPRING_API_BASE'), '/');
} else {
    $springBase = 'http://127.0.0.1:8090';
}
$internalKey = getenv('APP_INTERNAL_BOOTSTRAP_KEY') !== false && getenv('APP_INTERNAL_BOOTSTRAP_KEY') !== ''
    ? getenv('APP_INTERNAL_BOOTSTRAP_KEY')
    : 'dev-local-only-change-me';

$url = $springBase . '/api/internal/session-bootstrap/' . rawurlencode($token);
$ctx = stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => 'X-Eazycount-Internal: ' . $internalKey . "\r\n",
        'timeout' => 10,
        'ignore_errors' => true,
    ],
]);

$raw = @file_get_contents($url, false, $ctx);
$httpStatus = null;
$ok = false;
if ($raw !== false && isset($http_response_header) && is_array($http_response_header)) {
    foreach ($http_response_header as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})\s#', $h, $m)) {
            $httpStatus = (int) $m[1];
        }
        if (preg_match('#^HTTP/\S+\s+200\s#', $h)) {
            $ok = true;
            break;
        }
    }
}

if (!$ok) {
    error_log('login_bootstrap: session fetch failed, http=' . ($httpStatus !== null ? (string) $httpStatus : 'unknown') . ' url=' . $springBase);
    header('Location: index.php');
    exit();
}

$data = json_decode($raw, true);
if (!is_array($data) || empty($data['session']) || !is_array($data['session']) || empty($data['nextRedirect'])) {
    header('Location: index.php');
    exit();
}

foreach ($data['session'] as $k => $v) {
    $_SESSION[$k] = $v;
}

// Remember Me：须由 PHP 域写入 Cookie（与 Spring 可能不同源）
if (!empty($_SESSION['_bootstrap_remember_token'])) {
    $rt = (string) $_SESSION['_bootstrap_remember_token'];
    unset($_SESSION['_bootstrap_remember_token']);
    setcookie('remember_token', $rt, time() + (30 * 24 * 60 * 60), '/', '', false, true);
}

header('Location: ' . $data['nextRedirect']);
exit();
