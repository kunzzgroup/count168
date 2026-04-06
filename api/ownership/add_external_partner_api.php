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
$owner_code = trim($data['login_id'] ?? '');

if (!$company_id || !$owner_code) {
    echo json_encode(['status' => 'error', 'message' => 'Valid Company ID and Partner Login ID are required']);
    exit();
}

try {
    // 1. Check if the owner exists based on owner_code
    $stmt = $pdo->prepare("SELECT id, name FROM owner WHERE owner_code = ? AND status = 'active'");
    $stmt->execute([$owner_code]);
    $partner = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$partner) {
        echo json_encode(['status' => 'error', 'message' => 'Owner account not found or inactive']);
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

    echo json_encode([
        'status' => 'success',
        'message' => "Partner '{$partner['name']}' linked successfully"
    ]);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error']);
}
?>
