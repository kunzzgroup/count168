<?php

require_once __DIR__ . '/../../../api_response.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'GET' && $method !== 'PUT' && $method !== 'POST') {
    api_error('Invalid request method', 405, null, 'ERR_METHOD_NOT_ALLOWED');
    exit;
}

if ($method === 'PUT') {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw ?: '', true);
    if (is_array($json)) {
        $_POST = array_merge($_POST, $json);
        $_SERVER['REQUEST_METHOD'] = 'POST';
    }
}

ob_start();
require __DIR__ . '/../../../transactions/user_currency_order_api.php';
$legacyRaw = ob_get_clean();
$legacy = json_decode((string) $legacyRaw, true);

if (!is_array($legacy)) {
    api_error('Invalid preference response', 500, ['raw' => $legacyRaw], 'ERR_UPSTREAM_INVALID');
    exit;
}

if (!empty($legacy['success'])) {
    api_success($legacy['data'] ?? null, $legacy['message'] ?? 'OK', 'OK_PREFERENCE_CURRENCY_ORDER');
    exit;
}

$status = http_response_code() ?: 400;
api_error((string) ($legacy['message'] ?? 'Preference request failed'), $status, $legacy['data'] ?? null, 'ERR_PREFERENCE_FAILED');

