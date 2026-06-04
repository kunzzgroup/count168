<?php
/**
 * One-off: bootstrap group tenants for all owners (same as 20260604 migration).
 * Usage: php database/scripts/run_group_tenant_bootstrap.php
 */
declare(strict_types=1);

$root = dirname(__DIR__, 2);
require_once $root . '/includes/config.php';
require_once $root . '/includes/group_tenant_bootstrap.php';

try {
    gc_bootstrap_all_group_tenants($pdo);
    echo "Group tenant bootstrap completed.\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Bootstrap failed: ' . $e->getMessage() . "\n");
    exit(1);
}
