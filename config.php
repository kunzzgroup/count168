<?php
/**
 * Root config entry for Hostinger cron / legacy PHP that require ./config.php.
 * Canonical config lives in includes/config.php (+ config.local.php).
 */
require_once __DIR__ . '/includes/config.php';

if (!headers_sent()) {
    header('X-Robots-Tag: noindex, nofollow');
}
