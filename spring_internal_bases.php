<?php
/**
 * 服务端 PHP→Spring 根 URL 列表（按顺序尝试）。
 * 优先级：SPRING_INTERNAL_BASE → SPRING_API_BASE → 同目录 eazy_spring_internal_base.local.php（return 'http://...';）→ 8090 → 8080
 */

function eazycount_spring_internal_bases() {
    foreach (['SPRING_INTERNAL_BASE', 'SPRING_API_BASE'] as $key) {
        $v = getenv($key);
        if ($v !== false && $v !== '') {
            return [rtrim($v, '/')];
        }
    }
    $local = __DIR__ . '/eazy_spring_internal_base.local.php';
    if (is_file($local)) {
        $x = include $local;
        if (is_string($x) && trim($x) !== '') {
            return [rtrim(trim($x), '/')];
        }
    }
    return ['http://127.0.0.1:8090', 'http://127.0.0.1:8080'];
}
