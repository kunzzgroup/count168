<?php
/**
 * 浏览器同源 POST → 优先转发 Spring；全部不可达时回退 PHP 直连库登录（与 LoginService 对齐）。
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

require_once dirname(__DIR__, 2) . '/spring_internal_bases.php';

if (function_exists('curl_init')) {
    foreach (eazycount_spring_internal_bases() as $base) {
        $url = $base . '/api/auth/login';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $_POST,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $resp = curl_exec($ch);
        $errno = curl_errno($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno === 0) {
            http_response_code($code > 0 ? $code : 502);
            echo $resp !== false ? $resp : '';
            exit;
        }
    }
}

if (getenv('DISABLE_PHP_LOGIN_FALLBACK') === '1') {
    http_response_code(502);
    echo json_encode([
        'status' => 'error',
        'message' => 'Upstream unreachable',
        'detail' => 'Spring not reachable and PHP fallback disabled',
    ]);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

try {
    require_once dirname(__DIR__, 2) . '/config.php';
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Server configuration error']);
    exit;
}

if (!isset($pdo) || !$pdo) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database unavailable']);
    exit;
}

require_once __DIR__ . '/php_login_core.php';
$result = eazycount_php_login_attempt($pdo, $_POST);

if (!empty($result['ok'])) {
    foreach ($result['session'] as $k => $v) {
        $_SESSION[$k] = $v;
    }
    if (!empty($_SESSION['_bootstrap_remember_token'])) {
        $rt = (string) $_SESSION['_bootstrap_remember_token'];
        unset($_SESSION['_bootstrap_remember_token']);
        setcookie('remember_token', $rt, time() + (30 * 24 * 60 * 60), '/', '', false, true);
    }
    http_response_code(200);
    echo json_encode([
        'status' => 'success',
        'redirect' => $result['next_redirect'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(200);
echo json_encode([
    'status' => 'error',
    'message' => isset($result['message']) ? (string) $result['message'] : 'Login failed',
], JSON_UNESCAPED_UNICODE);
