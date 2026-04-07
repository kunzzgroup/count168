<?php
session_start();
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);
$company_id = intval($data['company_id'] ?? 0);
$login_or_group_id = trim($data['login_id'] ?? '');

if (!$company_id || !$login_or_group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Valid Company ID and Login ID/Group ID are required']);
    exit();
}

try {
    // 1. First, try to find the owner by their Login ID (owner_code)
    $stmt = $pdo->prepare("SELECT id, name FROM owner WHERE UPPER(owner_code) = UPPER(?) AND status = 'active'");
    $stmt->execute([$login_or_group_id]);
    $partner = $stmt->fetch(PDO::FETCH_ASSOC);
    $matched_by_group = null;

    // 2. If not found, try to find the owner by Group ID in the company table
    if (!$partner) {
        $stmtGrp = $pdo->prepare("
            SELECT o.id, o.name 
            FROM company c
            JOIN owner o ON c.owner_id = o.id
            WHERE UPPER(c.group_id) = UPPER(?) AND o.status = 'active'
            LIMIT 1
        ");
        $stmtGrp->execute([$login_or_group_id]);
        $partner = $stmtGrp->fetch(PDO::FETCH_ASSOC);
        if ($partner) {
            $matched_by_group = strtoupper($login_or_group_id);
        }
    }

    if (!$partner) {
        echo json_encode(['status' => 'error', 'message' => 'Owner account or Group ID not found or inactive']);
        exit();
    }

    $partnerId = $partner['id'];

    // Prevent self-linking (if JK tries to link himself)
    $stmtCheckNative = $pdo->prepare("SELECT owner_id FROM company WHERE id = ?");
    $stmtCheckNative->execute([$company_id]);
    $nativeOwner = $stmtCheckNative->fetchColumn();

    if ($nativeOwner == $partnerId) {
        echo json_encode(['status' => 'error', 'message' => 'This account is already the main owner of the company']);
        exit();
    }

    // 2. Check if already linked
    $stmtLink = $pdo->prepare("SELECT id FROM company_ownership WHERE company_id = ? AND owner_type = 'owner' AND account_id = ?");
    $stmtLink->execute([$company_id, $partnerId]);
    if ($stmtLink->fetch()) {
        echo json_encode(['status' => 'error', 'message' => 'Partner is already linked to this company']);
        exit();
    }

    // 3. Link by inserting a 0% entry into company_ownership
    $stmtInsert = $pdo->prepare("INSERT INTO company_ownership (company_id, owner_type, account_id, percentage) VALUES (?, 'owner', ?, 0)");
    $stmtInsert->execute([$company_id, $partnerId]);

    // 4. If matched by Group ID, physically update the company's group_id so it completely joins the other person's group
    if ($matched_by_group) {
        $stmtUpdateGrp = $pdo->prepare("UPDATE company SET group_id = ? WHERE id = ?");
        $stmtUpdateGrp->execute([$matched_by_group, $company_id]);
    }

    echo json_encode([
        'status' => 'success',
        'message' => "Partner '{$partner['name']}' linked successfully"
    ]);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error']);
}
?>
