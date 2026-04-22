<?php
/**
 * Group Earnings API — Add External Partner to a group
 * POST body: { "group_id": "AP", "login_id": "JK123", "force_type": "" }
 *
 * Supports three link modes:
 *   1. External Login ID  → owner_type='owner',  account_id=partner owner id, partner_group_id=NULL
 *   2. External Group ID  → owner_type='owner',  account_id=partner owner id, partner_group_id=<group>
 *   3. Self-owned Group ID (same-owner cross-group read-only visibility)
 *                         → owner_type='group',  account_id=owner_id=current owner id, partner_group_id=<group>
 */
session_start();
session_write_close();
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);
$group_id        = trim($data['group_id'] ?? '');
$login_or_group_id = trim($data['login_id'] ?? '');
$force_type      = trim($data['force_type'] ?? '');

if (!$group_id || !$login_or_group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Group ID and Login ID/Group ID are required']);
    exit();
}

// Auto-create / upgrade table
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_ownership (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(50) NOT NULL,
            owner_id INT NOT NULL,
            account_id INT NOT NULL,
            owner_type ENUM('owner','user','group') NOT NULL DEFAULT 'owner',
            percentage DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            partner_group_id VARCHAR(50) DEFAULT NULL,
            read_only TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_group_account (group_id, account_id, owner_type, partner_group_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
} catch (Exception $e) {}

// Idempotent migrations for legacy installs
try { $pdo->exec("ALTER TABLE group_ownership MODIFY COLUMN owner_type ENUM('owner','user','group') NOT NULL DEFAULT 'owner'"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE group_ownership DROP INDEX uq_group_account"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE group_ownership ADD UNIQUE KEY uq_group_account (group_id, account_id, owner_type, partner_group_id)"); } catch (Exception $e) {}

try {
    $currentOwnerId = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);

    // Sanity: the source group_id must actually belong to the current owner
    $stmtOwn = $pdo->prepare("
        SELECT 1 FROM company
        WHERE owner_id = ?
          AND UPPER(TRIM(group_id)) = UPPER(TRIM(?))
          AND company_id <> ''
        LIMIT 1
    ");
    $stmtOwn->execute([$currentOwnerId, $group_id]);
    if (!$stmtOwn->fetchColumn()) {
        echo json_encode(['status' => 'error', 'message' => 'Source group does not belong to you']);
        exit();
    }

    // A same-group self-link has no meaning (linking IG -> IG)
    if (strcasecmp(trim($group_id), trim($login_or_group_id)) === 0) {
        echo json_encode(['status' => 'error', 'message' => 'Cannot link a group to itself']);
        exit();
    }

    // ── Step 1: Self-owned group match (highest priority) ───────────────
    // If the input matches ANY of the current owner's groups, treat as self-link.
    $selfGroupMatch = null;
    if ($force_type === '' || $force_type === 'group' || $force_type === 'self_group') {
        $stmtSelf = $pdo->prepare("
            SELECT TRIM(c.group_id) AS group_id
            FROM company c
            WHERE c.owner_id = ?
              AND c.group_id IS NOT NULL
              AND TRIM(c.group_id) <> ''
              AND UPPER(TRIM(c.group_id)) = UPPER(TRIM(?))
              AND c.company_id <> ''
            LIMIT 1
        ");
        $stmtSelf->execute([$currentOwnerId, $login_or_group_id]);
        $row = $stmtSelf->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $selfGroupMatch = $row['group_id'];
        }
    }

    // ── Step 2: External Login ID match (owner_code) ────────────────────
    $partnerByLogin = null;
    if (!$selfGroupMatch && ($force_type === '' || $force_type === 'login')) {
        $stmtLogin = $pdo->prepare("
            SELECT id, name, owner_code
            FROM owner
            WHERE UPPER(owner_code) = UPPER(?)
              AND id != ?
              AND status = 'active'
        ");
        $stmtLogin->execute([$login_or_group_id, $currentOwnerId]);
        $partnerByLogin = $stmtLogin->fetch(PDO::FETCH_ASSOC);
    }

    // ── Step 3: External Group ID match ─────────────────────────────────
    $partnerByGroup = null;
    $hasCompanyOwnership = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
    if (!$selfGroupMatch && ($force_type === '' || $force_type === 'group')) {
        if ($hasCompanyOwnership) {
            $stmtGrp = $pdo->prepare("
                SELECT o.id, o.name, grp.group_id
                FROM owner o
                JOIN (
                    SELECT c.owner_id, TRIM(c.group_id) COLLATE utf8mb4_unicode_ci AS group_id
                    FROM company c
                    WHERE c.group_id IS NOT NULL AND TRIM(c.group_id) <> ''
                    UNION
                    SELECT co.account_id AS owner_id, TRIM(co.partner_group_id) COLLATE utf8mb4_unicode_ci AS group_id
                    FROM company_ownership co
                    WHERE co.owner_type = 'owner'
                      AND co.partner_group_id IS NOT NULL
                      AND TRIM(co.partner_group_id) <> ''
                ) grp ON grp.owner_id = o.id
                WHERE UPPER(grp.group_id) = UPPER(TRIM(?) COLLATE utf8mb4_unicode_ci)
                  AND o.id != ?
                  AND o.status = 'active'
                LIMIT 1
            ");
            $stmtGrp->execute([$login_or_group_id, $currentOwnerId]);
        } else {
            $stmtGrp = $pdo->prepare("
                SELECT o.id, o.name, TRIM(c.group_id) AS group_id
                FROM company c
                JOIN owner o ON c.owner_id = o.id
                WHERE UPPER(TRIM(c.group_id)) = UPPER(TRIM(?))
                  AND o.id != ?
                  AND o.status = 'active'
                LIMIT 1
            ");
            $stmtGrp->execute([$login_or_group_id, $currentOwnerId]);
        }
        $partnerByGroup = $stmtGrp->fetch(PDO::FETCH_ASSOC);
    }

    // ── Resolution ──────────────────────────────────────────────────────
    // Priority: self_group > (cross-owner group vs login conflict)
    $partner = null;
    $matched_by_group = null;
    $isSelfLink = false;

    if ($selfGroupMatch) {
        $isSelfLink = true;
        $matched_by_group = strtoupper($selfGroupMatch);
        // Build a synthetic partner row for reuse in messaging
        $partner = [
            'id'   => $currentOwnerId,
            'name' => 'Your group "' . $selfGroupMatch . '"',
        ];
    } elseif ($partnerByLogin && $partnerByGroup) {
        echo json_encode([
            'status'  => 'conflict',
            'message' => 'Multiple matches found.',
            'data'    => [
                'login_partner' => $partnerByLogin['name'] . ' (' . $partnerByLogin['owner_code'] . ')',
                'group_partner' => $partnerByGroup['name'] . ' (Group: ' . $partnerByGroup['group_id'] . ')',
            ],
        ]);
        exit();
    } elseif ($partnerByGroup) {
        $partner = $partnerByGroup;
        $matched_by_group = strtoupper($login_or_group_id);
    } elseif ($partnerByLogin) {
        $partner = $partnerByLogin;
    }

    if (!$partner) {
        echo json_encode(['status' => 'error', 'message' => 'Owner account or Group ID not found or inactive']);
        exit();
    }

    $partnerId = (int) $partner['id'];

    // Login-ID route never allows linking yourself
    if (!$isSelfLink && $currentOwnerId === $partnerId) {
        echo json_encode(['status' => 'error', 'message' => 'Cannot link yourself as an external partner']);
        exit();
    }

    // Check if already linked
    if ($isSelfLink) {
        $stmtLink = $pdo->prepare("
            SELECT id FROM group_ownership
            WHERE group_id = ?
              AND owner_type = 'group'
              AND account_id = ?
              AND UPPER(partner_group_id) = UPPER(?)
        ");
        $stmtLink->execute([$group_id, $currentOwnerId, $matched_by_group]);
        if ($stmtLink->fetch()) {
            echo json_encode(['status' => 'error', 'message' => "Group '{$matched_by_group}' is already linked to this group"]);
            exit();
        }
    } else {
        $stmtLink = $pdo->prepare("
            SELECT id FROM group_ownership
            WHERE group_id = ?
              AND owner_type = 'owner'
              AND account_id = ?
        ");
        $stmtLink->execute([$group_id, $partnerId]);
        if ($stmtLink->fetch()) {
            echo json_encode(['status' => 'error', 'message' => 'Partner is already linked to this group']);
            exit();
        }
    }

    // Insert the link row (0% by default — the ownership slider is not the goal here)
    if ($isSelfLink) {
        $stmtInsert = $pdo->prepare("
            INSERT INTO group_ownership
                (group_id, owner_id, account_id, owner_type, percentage, partner_group_id, read_only)
            VALUES (?, ?, ?, 'group', 0, ?, 1)
        ");
        $stmtInsert->execute([$group_id, $currentOwnerId, $currentOwnerId, $matched_by_group]);

        echo json_encode([
            'status'  => 'success',
            'message' => "Group '{$matched_by_group}' now has read-only visibility into group '{$group_id}'",
        ]);
    } else {
        $stmtInsert = $pdo->prepare("
            INSERT INTO group_ownership
                (group_id, owner_id, account_id, owner_type, percentage, partner_group_id)
            VALUES (?, ?, ?, 'owner', 0, ?)
        ");
        $stmtInsert->execute([$group_id, $currentOwnerId, $partnerId, $matched_by_group]);

        echo json_encode([
            'status'  => 'success',
            'message' => "Partner '{$partner['name']}' linked to group '{$group_id}' successfully",
        ]);
    }

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
