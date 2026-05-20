<?php

declare(strict_types=1);

/**
 * Bank Process 弹窗把 Profit Sharing 存成 formatBankAccountDisplay 文案，例如 "DD [DD] - 111"。
 * 入账与 History 展示需用其中的 account_id / name 片段去匹配 account 表。
 *
 * @return list<string> 依次尝试：整段、方括号前的 code、括号内的 name（去重且非空）
 */
function profitSharingAccountLabelLookupCandidates(string $accountLabel): array
{
    $text = trim($accountLabel);
    if ($text === '') {
        return [];
    }
    $out = [$text];
    if (preg_match('/^(.+?)\s*\[([^\]]+)\]\s*$/u', $text, $m)) {
        $before = trim($m[1]);
        $inside = trim($m[2]);
        if ($before !== '') {
            $out[] = $before;
        }
        if ($inside !== '') {
            $out[] = $inside;
        }
    }

    return array_values(array_unique(array_filter($out, static function ($s) {
        return is_string($s) && $s !== '';
    })));
}

/** process_profit_sharing 中的账号片段是否与当前流水行的 account code（或 name）一致 */
function profitSharingLabelMatchesAccountReference(string $profitSharingAccountText, string $accountCodeOrName): bool
{
    $ref = trim($accountCodeOrName);
    if ($ref === '') {
        return false;
    }
    foreach (profitSharingAccountLabelLookupCandidates($profitSharingAccountText) as $c) {
        if (strcasecmp($c, $ref) === 0) {
            return true;
        }
    }

    return false;
}
