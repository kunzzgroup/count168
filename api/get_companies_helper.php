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
        // Detect whether group_ownership table exists (created on first Group Earnings link)
        $hasGroupOwnership = false;
        try {
            $hasGroupOwnership = $pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() > 0;
        } catch (PDOException $e) { /* ignore */ }

        // Common JOIN fragment that maps the current owner to any group it was linked to
        // via group_ownership. When present, we treat every company in that group (belonging
        // to the group's main owner) as accessible to this owner — exactly like
        // a company_ownership row, but multiplied over all companies of the group.
        $groupJoin = $hasGroupOwnership ? "
            LEFT JOIN group_ownership go
                ON go.owner_type = 'owner'
                AND go.account_id = ?
                AND go.percentage > 0
                AND c.owner_id = go.owner_id
                AND LOWER(TRIM(go.group_id)) = LOWER(TRIM(c.group_id))
        " : "";
        $groupSelectCol = $hasGroupOwnership ? "go.partner_group_id" : "NULL";
        $groupWhereOr   = $hasGroupOwnership ? "OR go.id IS NOT NULL" : "";

        if ($fetchAll) {
            $params = [$ownerId, $ownerId];
            if ($hasGroupOwnership) $params[] = $ownerId; // for group_ownership JOIN
            $params = array_merge($params, [$ownerId, $ownerId]);

            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.expiration_date,
                       COALESCE(co.partner_group_id, {$groupSelectCol}, c.group_id) as group_id,
                       IF(c.owner_id = ?, 0, 1) as is_external
                FROM company c
                LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                {$groupJoin}
                WHERE (c.owner_id = ? OR (co.account_id = ? AND co.percentage > 0) {$groupWhereOr}) AND c.company_id != ''
                ORDER BY is_external ASC, c.company_id ASC
            ");
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $session_company_id = $_SESSION['company_id'] ?? null;
            $partner_group    = null;  // from company_ownership (per-company link)
            $native_group     = null;  // from company.group_id
            $go_partner_group = null;  // from group_ownership (per-group link)
            $go_group_id      = null;
            $go_main_owner    = null;

            if ($session_company_id) {
                $stmtGrp = $pdo->prepare("
                    SELECT co.partner_group_id, c.group_id, c.owner_id AS main_owner
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
                    $mainOwnerId   = (int)($grpRow['main_owner'] ?? 0);

                    // If the session company is reachable via a group-level link
                    // (i.e. owner is an external partner of this company's group),
                    // capture the partner-facing group label & owner so we can fetch siblings.
                    if ($hasGroupOwnership && $mainOwnerId && $mainOwnerId !== $ownerId
                        && $native_group && trim($native_group) !== '' && $partner_group === null) {
                        $stmtGo = $pdo->prepare("
                            SELECT partner_group_id
                            FROM group_ownership
                            WHERE owner_type = 'owner'
                              AND account_id = ?
                              AND owner_id   = ?
                              AND percentage > 0
                              AND LOWER(TRIM(group_id)) = LOWER(TRIM(?))
                            LIMIT 1
                        ");
                        $stmtGo->execute([$ownerId, $mainOwnerId, $native_group]);
                        $goRow = $stmtGo->fetch(PDO::FETCH_ASSOC);
                        if ($goRow) {
                            $go_partner_group = $goRow['partner_group_id'] ?: $native_group;
                            $go_group_id      = $native_group;
                            $go_main_owner    = $mainOwnerId;
                        }
                    }
                }
            }

            $params = [];
            $whereParts = [];

            if ($go_partner_group !== null) {
                // Group-level partner path — return all companies in that group (main owner's)
                $whereParts[] = "(c.owner_id = ? AND LOWER(TRIM(c.group_id)) = LOWER(TRIM(?)))";
                $params = array_merge($params, [$go_main_owner, $go_group_id]);
            } elseif ($partner_group !== null && trim($partner_group) !== '') {
                $whereParts[] = "(c.owner_id != ? AND co.account_id = ? AND LOWER(co.partner_group_id) = LOWER(?) AND co.percentage > 0)";
                $params = array_merge($params, [$ownerId, $ownerId, trim($partner_group)]);
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

            $whereSQL = implode(" OR ", $whereParts);
            // Prepend params for SELECT: IF(c.owner_id = ?), LEFT JOIN company_ownership (account_id = ?),
            // and optionally LEFT JOIN group_ownership (account_id = ?)
            $leadingParams = [$ownerId, $ownerId];
            if ($hasGroupOwnership) $leadingParams[] = $ownerId;

            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.expiration_date,
                       COALESCE(co.partner_group_id, {$groupSelectCol}, c.group_id) as group_id,
                       IF(c.owner_id = ?, 0, 1) as is_external
                FROM company c
                LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                {$groupJoin}
                WHERE ($whereSQL) AND c.company_id != ''
                ORDER BY is_external ASC, c.company_id ASC
            ");
            $stmt->execute(array_merge($leadingParams, $params));
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }
}
