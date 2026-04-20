<?php

require_once __DIR__ . '/../api_response.php';

// 保持与旧接口兼容，复用既有计算逻辑
ob_start();
require_once __DIR__ . '/../transactions/dashboard_api.php';
$raw = ob_get_clean();

$decoded = json_decode((string) $raw, true);
if (!is_array($decoded)) {
    api_error('Invalid dashboard response', 500, ['raw' => $raw], 'ERR_UPSTREAM_INVALID');
    exit;
}

if (!empty($decoded['success'])) {
    api_success($decoded['data'] ?? null, $decoded['message'] ?? 'OK', 'OK_DASHBOARD_SUMMARY');
    exit;
}

$message = $decoded['message'] ?? 'Dashboard request failed';
$code = ($message === '用户未登录') ? 'ERR_UNAUTHORIZED' : 'ERR_BAD_REQUEST';
$status = ($code === 'ERR_UNAUTHORIZED') ? 401 : 400;
api_error($message, $status, $decoded['data'] ?? null, $code);

