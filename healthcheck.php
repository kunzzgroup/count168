<?php
/**
 * 不含数据库：用于判断 500 来自 PHP/服务器还是 config/数据库。
 * 部署后访问 https://你的域名/healthcheck.php — 若仍 500，查主机 PHP 版本与错误日志。
 */
header('Content-Type: text/plain; charset=utf-8');
echo 'ok';
