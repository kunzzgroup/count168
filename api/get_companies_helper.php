<?php
/**
 * Helper file to share company query logic between API and inline PHP pages
 * Prevents code duplication and ensures consistent filtering.
 */

if (!function_exists('getCompaniesByUser')) {
    function getCompaniesByUser(PDO $pdo, int $userId, bool $fetchAll = false): array {
        if ($fetchAll) {
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.group_id, c.expiration_date
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
            ");
            $stmt->execute([$userId]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $session_company_id = $_SESSION['company_id'] ?? null;
            $native_group  = null;
            if ($session_company_id) {
                $stmtGrp = $pdo->prepare("SELECT group_id FROM company WHERE id = ? LIMIT 1");
                $stmtGrp->execute([$session_company_id]);
                $grpRow = $stmtGrp->fetch(PDO::FETCH_ASSOC);
                if ($grpRow) {
                    $native_group  = $grpRow['group_id'] ?: null;
                }
            }

            $params = [];
            $whereParts = [];

            if ($native_group !== null && trim($native_group) !== '') {
                $whereParts[] = "(LOWER(c.group_id) = LOWER(?))";
                $params[] = trim($native_group);
            } else {
                $whereParts[] = "(c.group_id IS NULL OR c.group_id = '')";
            }

            $whereSQL = implode(" OR ", $whereParts);
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.group_id, c.expiration_date
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != '' AND ($whereSQL)
                ORDER BY c.company_id ASC
            ");
            array_unshift($params, $userId);
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }
}

if (!function_exists('getCompaniesByOwner')) {
    function getCompaniesByOwner(PDO $pdo, int $ownerId, bool $fetchAll): array {
        // Check if group_ownership table exists (group-level partner linking)
        $hasGroupOwnership = false;
        try {
            $hasGroupOwnership = $pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() > 0;
        } catch (Exception $e) { /* ignore */ }

        // Subquery: companies visible to this owner via group_ownership
        // (1) Cross-owner partner link: when TEST is linked to JK's group 'IG' (percentage > 0),
        //     TEST should see every company whose c.group_id = 'IG'.
        // (2) Same-owner self-link: owner linked his own group IG -> AP, so when the dashboard
        //     is scoped to AP, he should also see his own IG companies (read-only mirror).
        //     For fetchAll we simply need the source group list to widen c.group_id matches.
        $groupVisibleSQL = $hasGroupOwnership
            ? "OR EXISTS (
                    SELECT 1 FROM group_ownership go
                    WHERE go.account_id = ?
                      AND (
                           (go.owner_type = 'owner' AND go.percentage > 0)
                        OR (go.owner_type = 'group' AND go.owner_id = ?)
                      )
                      AND c.group_id IS NOT NULL
                      AND TRIM(c.group_id) <> ''
                      AND LOWER(TRIM(go.group_id)) COLLATE utf8mb4_unicode_ci
                          = LOWER(TRIM(c.group_id)) COLLATE utf8mb4_unicode_ci
                )"
            : "";

        if ($fetchAll) {
            $sql = "
                SELECT DISTINCT c.id, c.company_id, c.expiration_date,
                       COALESCE(co.partner_group_id, c.group_id) as group_id,
                       IF(c.owner_id = ?, 0, 1) as is_external
                FROM company c
                LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE (
                    c.owner_id = ?
                    OR (co.account_id = ? AND co.percentage > 0)
                    $groupVisibleSQL
                ) AND c.company_id != ''
                ORDER BY is_external ASC, c.company_id ASC
            ";
            $params = [$ownerId, $ownerId, $ownerId, $ownerId];
            if ($hasGroupOwnership) {
                // Two placeholders inside EXISTS: account_id=?, owner_id=?
                $params[] = $ownerId;
                $params[] = $ownerId;
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $session_company_id = $_SESSION['company_id'] ?? null;
            $partner_group = null;
            $native_group  = null;
            if ($session_company_id) {
                $stmtGrp = $pdo->prepare("
                    SELECT co.partner_group_id, c.group_id
                    FROM company c
                    LEFT JOIN company_ownership co
                        ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                    WHERE c.id = ?
                    LIMIT 1
                ");
                $stmtGrp->execute([$ownerId, $session_company_id]);
                $grpRow = $stmtGrp->fetch(PDO::FETCH_ASSOC);
                if ($grpRow) {
                    $partner_group = $grpRow['partner_group_id'] ?: null;
                    $native_group  = $grpRow['group_id']         ?: null;
                }
            }

            // Check if this owner has group-level access to the native_group
            // (linked via group_ownership, e.g. TEST linked to JK's group 'IG')
            $hasGroupAccessToNative = false;
            if ($hasGroupOwnership && $native_group !== null && trim($native_group) !== '') {
                $stmtGo = $pdo->prepare("
                    SELECT 1 FROM group_ownership
                    WHERE owner_type = 'owner'
                      AND account_id = ?
                      AND percentage > 0
                      AND LOWER(TRIM(group_id)) COLLATE utf8mb4_unicode_ci
                          = LOWER(TRIM(?)) COLLATE utf8mb4_unicode_ci
                    LIMIT 1
                ");
                $stmtGo->execute([$ownerId, trim($native_group)]);
                $hasGroupAccessToNative = (bool) $stmtGo->fetchColumn();
            }

            // Same-owner cross-group visibility:
            // If the owner has rows (owner_type='group', account_id=owner_id, partner_group_id=native)
            // we also expose the source groups (go.group_id) under the current native view.
            $crossLinkedSourceGroups = [];
            if ($hasGroupOwnership && $native_group !== null && trim($native_group) !== '') {
                $stmtCross = $pdo->prepare("
                    SELECT DISTINCT TRIM(group_id) AS group_id
                    FROM group_ownership
                    WHERE owner_type = 'group'
                      AND account_id = ?
                      AND owner_id = ?
                      AND LOWER(TRIM(partner_group_id)) COLLATE utf8mb4_unicode_ci
                          = LOWER(TRIM(?)) COLLATE utf8mb4_unicode_ci
                ");
                $stmtCross->execute([$ownerId, $ownerId, trim($native_group)]);
                foreach ($stmtCross->fetchAll(PDO::FETCH_ASSOC) as $r) {
                    if (!empty($r['group_id'])) {
                        $crossLinkedSourceGroups[] = $r['group_id'];
                    }
                }
            }

            $params = [];
            $whereParts = [];

            if ($partner_group !== null && trim($partner_group) !== '') {
                $whereParts[] = "(c.owner_id != ? AND co.account_id = ? AND LOWER(co.partner_group_id) = LOWER(?) AND co.percentage > 0)";
                $params = array_merge($params, [$ownerId, $ownerId, trim($partner_group)]);
            } elseif ($hasGroupAccessToNative) {
                // Group-level external access: show every company in this group regardless of owner
                $whereParts[] = "(LOWER(TRIM(c.group_id)) = LOWER(TRIM(?)))";
                $params[] = trim($native_group);
            } elseif ($native_group !== null && trim($native_group) !== '') {
                $whereParts[] = "(c.owner_id = ? AND LOWER(c.group_id) = LOWER(?))";
                $params = array_merge($params, [$ownerId, trim($native_group)]);
            } else {
                $whereParts[] = "(
                    (c.owner_id = ? AND (c.group_id IS NULL OR c.group_id = ''))
                    OR 
                    (c.owner_id != ? AND co.account_id = ? AND co.percentage > 0 AND (
                        co.partner_group_id = '' 
                        OR (co.partner_group_id IS NULL AND (c.group_id IS NULL OR c.group_id = ''))
                    ))
                )";
                $params = array_merge($params, [$ownerId, $ownerId, $ownerId]);
            }

            // Add same-owner cross-group source groups (read-only mirror).
            // Only the owner's own companies in those groups are exposed.
            if (!empty($crossLinkedSourceGroups)) {
                $placeholders = implode(',', array_fill(0, count($crossLinkedSourceGroups), '?'));
                $whereParts[] = "(c.owner_id = ? AND LOWER(TRIM(c.group_id)) IN ($placeholders))";
                $params[] = $ownerId;
                foreach ($crossLinkedSourceGroups as $sg) {
                    $params[] = strtolower(trim($sg));
                }
            }

            $whereSQL = implode(" OR ", $whereParts);
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.expiration_date,
                       COALESCE(co.partner_group_id, c.group_id) as group_id,
                       IF(c.owner_id = ?, 0, 1) as is_external
                FROM company c
                LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE ($whereSQL) AND c.company_id != ''
                ORDER BY is_external ASC, c.company_id ASC
            ");
            array_unshift($params, $ownerId, $ownerId);  // prepend for IF(c.owner_id) and LEFT JOIN condition
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }
}
