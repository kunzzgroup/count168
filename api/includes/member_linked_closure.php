<?php

/**
 * 当前会话 member 在公司下的「可关联账户」闭包内的 account.id 列表，
 * 与 api/accounts/account_link_api.php ::getLinkedAccountsForMember() 遍历一致。
 */
if (!function_exists('member_linked_member_closure_ids')) {
    function member_linked_member_closure_ids(PDO $pdo, int $account_id, int $company_id): array
    {
        $account_id = (int) $account_id;
        $company_id = (int) $company_id;
        if ($account_id <= 0 || $company_id <= 0) {
            return [];
        }
        $visited = [];
        $queue = [$account_id];

        while (!empty($queue)) {
            $current_id = (int) array_shift($queue);
            if (isset($visited[$current_id])) {
                continue;
            }
            $visited[$current_id] = true;

            $stmt = $pdo->prepare("
                SELECT account_id_2 AS linked_id, link_type, source_account_id
                FROM account_link WHERE account_id_1 = ? AND company_id = ?
                AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND source_account_id = ?))
                UNION
                SELECT account_id_1 AS linked_id, link_type, source_account_id
                FROM account_link WHERE account_id_2 = ? AND company_id = ?
                AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND source_account_id = ?))
            ");
            $stmt->execute([$current_id, $company_id, $current_id, $current_id, $company_id, $current_id]);
            $linked_data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($linked_data as $row) {
                $linked_id = (int) ($row['linked_id'] ?? 0);
                if (!isset($visited[$linked_id])) {
                    $visited[$linked_id] = true;
                    if (($row['link_type'] ?? '') === 'bidirectional') {
                        $queue[] = $linked_id;
                    }
                }
            }
        }

        return array_map('intval', array_keys($visited));
    }
}
