<?php
/**
 * 兼容旧书签 / 旧链接：永久重定向到非 PHP 入口 index.html（查询串保留）。
 * 若已完全弃用 PHP，可删除本文件，并仅依赖 Web 服务器将 /index.php 重写到 index.html。
 */
header('Location: index.html' . (!empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : ''), true, 301);
exit;
