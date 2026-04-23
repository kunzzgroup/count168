<?php
require_once 'session_check.php';
require_once __DIR__ . '/includes/c168_domain_access.php';

$userId = $_SESSION['user_id'] ?? null;
$userRole = strtolower((string) ($_SESSION['role'] ?? ''));

if (!$userId || !userCanAccessC168InformationApis($pdo) || !userHasC168DomainPageAccess($userRole)) {
    header("Location: /dashboard");
    exit();
}

header("Location: /domain");
exit();
