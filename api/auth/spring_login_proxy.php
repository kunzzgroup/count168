<?php
/**
 * 浏览器同源 POST → 服务端转发到 Spring（不经由公网访问本机 IP）。
 * 解析顺序见项目根目录 spring_internal_bases.php
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

require_once dirname(__DIR__, 2) . '/spring_internal_bases.php';

if (!function_exists('curl_init')) {
    http_response_code(501);
    echo json_encode(['status' => 'error', 'message' => 'curl extension required']);
    exit;
}

$lastErr = '';
$lastUrl = '';
foreach (eazycount_spring_internal_bases() as $base) {
    $url = $base . '/api/auth/login';
    $lastUrl = $url;
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
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($errno === 0) {
        http_response_code($code > 0 ? $code : 502);
        echo $resp !== false ? $resp : '';
        exit;
    }
    $lastErr = $err;
}

http_response_code(502);
echo json_encode([
    'status' => 'error',
    'message' => 'Upstream unreachable',
    'detail' => $lastErr,
    'attempted' => $lastUrl,
]);
