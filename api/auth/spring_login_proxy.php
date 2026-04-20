<?php
/**
 * 浏览器同源 POST → 服务端转发到本机 Spring（不经由公网访问 127.0.0.1）。
 * 优先 SPRING_INTERNAL_BASE，其次 SPRING_API_BASE，默认 http://127.0.0.1:8090
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$internal = getenv('SPRING_INTERNAL_BASE');
if ($internal === false || $internal === '') {
    $internal = getenv('SPRING_API_BASE');
}
if ($internal === false || $internal === '') {
    $internal = 'http://127.0.0.1:8090';
}
$internal = rtrim($internal, '/');
$url = $internal . '/api/auth/login';

if (!function_exists('curl_init')) {
    http_response_code(501);
    echo json_encode(['status' => 'error', 'message' => 'curl extension required']);
    exit;
}

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

if ($errno !== 0) {
    http_response_code(502);
    echo json_encode(['status' => 'error', 'message' => 'Upstream unreachable', 'detail' => $err]);
    exit;
}

http_response_code($code > 0 ? $code : 502);
echo $resp !== false ? $resp : '';
