<?php
require_once 'session_check.php';

$query = $_SERVER['QUERY_STRING'] ?? '';
$target = '/process-list' . ($query !== '' ? ('?' . $query) : '');
header('Location: ' . $target, true, 302);
exit();
