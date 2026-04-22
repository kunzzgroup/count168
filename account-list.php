<?php
require_once 'session_check.php';

$query = $_SERVER['QUERY_STRING'] ?? '';
$target = '/account-list' . ($query !== '' ? ('?' . $query) : '');
header('Location: ' . $target);
exit();

