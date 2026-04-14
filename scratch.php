<?php
require 'db.php';
$stmt = $pdo->prepare("
    SELECT t.id, t.transaction_date, t.amount, t.currency_id as t_curr, dcd.currency_id as dcd_curr, a.name, a.role
    FROM transactions t
    LEFT JOIN data_capture_details dcd ON dcd.id = t.capture_detail_id
    JOIN account a ON t.account_id = a.id
    WHERE t.company_id = 95
      AND a.name = 'PG'
");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
