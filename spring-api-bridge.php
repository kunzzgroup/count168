<?php
/**
 * 无 Nginx/mod_proxy 时：浏览器同源 /api/* → 本机 Spring（与 spring_internal_bases.php 一致）。
 * 由根目录 .htaccess 重写进入；勿直接暴露到公网若未校验路径。
 */
declare(strict_types=1);

header('X-Robots-Tag: noindex');

if (!function_exists('curl_init')) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'message' => 'curl not available']);
    exit;
}

$forward = isset($_GET['__forward']) ? (string) $_GET['__forward'] : '';
if ($forward === '' || strpos($forward, '/api/') !== 0 || strpos($forward, '..') !== false) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}
unset($_GET['__forward']);
$query = http_build_query($_GET);

require_once __DIR__ . '/spring_internal_bases.php';

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$ctIn = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';

$body = null;
$extraHeaders = [];
if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
    if ($ctIn !== '' && stripos($ctIn, 'multipart/') === 0) {
        $body = file_get_contents('php://input');
        $extraHeaders[] = 'Content-Type: ' . $ctIn;
    } elseif ($ctIn !== '' && stripos($ctIn, 'application/json') === 0) {
        $body = file_get_contents('php://input');
        if ($ctIn !== '') {
            $extraHeaders[] = 'Content-Type: ' . $ctIn;
        }
    } else {
        $body = http_build_query($_POST);
        if ($body !== '' && $ctIn === '') {
            $extraHeaders[] = 'Content-Type: application/x-www-form-urlencoded';
        } elseif ($ctIn !== '') {
            $extraHeaders[] = 'Content-Type: ' . $ctIn;
        }
    }
}

foreach (eazycount_spring_internal_bases() as $sb) {
    $url = rtrim($sb, '/') . $forward;
    if ($query !== '') {
        $url .= (strpos($url, '?') !== false ? '&' : '?') . $query;
    }

    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CUSTOMREQUEST => $method,
    ];
    if ($body !== null && $body !== '') {
        $opts[CURLOPT_POSTFIELDS] = $body;
    }
    $hdrs = $extraHeaders;
    if (!empty($_SERVER['HTTP_COOKIE'])) {
        $hdrs[] = 'Cookie: ' . $_SERVER['HTTP_COOKIE'];
    }
    if ($hdrs !== []) {
        $opts[CURLOPT_HTTPHEADER] = $hdrs;
    }
    curl_setopt_array($ch, $opts);

    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    if ($errno !== 0 || $raw === false) {
        continue;
    }

    $parts = explode("\r\n\r\n", $raw, 2);
    if (count($parts) < 2) {
        continue;
    }
    $headBlock = $parts[0];
    $respBody = $parts[1];
    $status = 502;
    $skipOut = ['transfer-encoding' => true, 'connection' => true];
    foreach (explode("\r\n", $headBlock) as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})\s#', $line, $m)) {
            $status = (int) $m[1];
            continue;
        }
        $colon = strpos($line, ':');
        if ($colon === false) {
            continue;
        }
        $name = strtolower(trim(substr($line, 0, $colon)));
        if (isset($skipOut[$name])) {
            continue;
        }
        if ($name === 'content-type' || strncmp($name, 'access-control-', 15) === 0) {
            header($line, false);
        }
    }
    http_response_code($status > 0 ? $status : 502);
    echo $respBody;
    exit;
}

http_response_code(502);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['status' => 'error', 'message' => 'Spring upstream unreachable']);
