<?php

require_once __DIR__ . '/../api_response.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    api_error('Invalid request method', 405, null, 'ERR_METHOD_NOT_ALLOWED');
    exit;
}

$raw = file_get_contents('php://input');
$json = json_decode($raw ?: '', true);
if (is_array($json) && isset($json['company_id']) && !isset($_POST['company_id'])) {
    $_POST['company_id'] = $json['company_id'];
}

ob_start();
require __DIR__ . '/update_company_session_api.php';
$legacyRaw = ob_get_clean();
$legacy = json_decode((string) $legacyRaw, true);

if (!is_array($legacy)) {
    api_error('Invalid session company response', 500, ['raw' => $legacyRaw], 'ERR_UPSTREAM_INVALID');
    exit;
}

if (!empty($legacy['success'])) {
    api_success($legacy['data'] ?? null, $legacy['message'] ?? 'Company updated', 'OK_SESSION_COMPANY_UPDATED');
    exit;
}

$status = http_response_code() ?: 400;
api_error((string) ($legacy['message'] ?? 'Company update failed'), $status, $legacy['data'] ?? null, 'ERR_SESSION_COMPANY_FAILED');

