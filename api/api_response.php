<?php
/**
 * 统一 API JSON 响应格式（新旧兼容）
 * 新协议：code, message, data, request_id
 * 兼容字段：success, error
 */

function api_request_id(): string {
    static $requestId = null;
    if ($requestId !== null) {
        return $requestId;
    }
    try {
        $requestId = bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        $requestId = uniqid('req_', true);
    }
    return $requestId;
}

function api_response(string $code, string $message = '', $data = null, int $httpCode = 200): void {
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    $isOk = strpos($code, 'OK') === 0;
    echo json_encode([
        'code' => $code,
        'message' => $message,
        'data' => $data,
        'request_id' => api_request_id(),
        // backward compatible fields
        'success' => $isOk,
        'error' => $isOk ? null : $message
    ], JSON_UNESCAPED_UNICODE);
}

function api_success($data = null, $message = '', string $code = 'OK') {
    api_response($code, $message, $data, 200);
}

function api_error($message, $httpCode = 400, $data = null, string $code = 'ERR_BAD_REQUEST') {
    api_response($code, $message, $data, $httpCode);
}

function api_unauthorized(string $message = 'Please login first.', $data = null): void {
    api_response('ERR_UNAUTHORIZED', $message, $data, 401);
}

function api_forbidden(string $message = 'Permission denied.', $data = null): void {
    api_response('ERR_FORBIDDEN', $message, $data, 403);
}

function api_secondary_required(string $message = 'Secondary password verification required.', $data = null): void {
    api_response('ERR_SECONDARY_REQUIRED', $message, $data, 403);
}

function api_session_expired(string $message = 'Session expired. Please login again.', $data = null): void {
    api_response('ERR_SESSION_EXPIRED', $message, $data, 401);
}

function api_validation_error(string $message = 'Validation failed.', $data = null): void {
    api_response('ERR_VALIDATION', $message, $data, 422);
}

function api_created($data = null, string $message = 'Created'): void {
    http_response_code(201);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'code' => 'OK_CREATED',
        'message' => $message,
        'data' => $data,
        'request_id' => api_request_id(),
        'success' => true,
        'error' => null
    ], JSON_UNESCAPED_UNICODE);
}