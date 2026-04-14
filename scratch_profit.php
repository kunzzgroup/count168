<?php
require 'includes/db.php';

$ids = implode(',', [89, 90, 95]); // Some company IDs based on git log... wait, I don't know the exact company IDs.
$stmt = $pdo->prepare("
    SELECT c.company_id, c.group_id, curr.code as currency_code, a.role, SUM(t.amount) as total
    FROM transactions t
    JOIN account a ON t.account_id = a.id
    JOIN account_company ac ON ac.account_id = a.id AND ac.company_id = t.company_id
    JOIN user_company c ON c.id = t.company_id
    LEFT JOIN currency curr ON curr.id = t.currency_id
    WHERE c.group_id = 'IG'
      AND a.role IN ('PROFIT', 'EXPENSES')
    GROUP BY c.company_id, a.role, curr.code
");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
