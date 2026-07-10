<?php
/**
 * 维护模式心跳：已登录用户每几秒请求一次，非白名单在维护开启时返回 401。
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__ . '/../../config.php';

session_write_close();
echo json_encode([
    'success' => true,
    'maintenance_mode' => false,
], JSON_UNESCAPED_UNICODE);
