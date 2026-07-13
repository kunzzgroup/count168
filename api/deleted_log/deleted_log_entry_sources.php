<?php
/**
 * Deleted Log：按「前台 SPA / 删除接口」分组（与 deleted_logs.page 写入值一致）。
 *
 * 约定：凡物理 DELETE 且调用 deletedLog() 的入口，都必须出现在某一 tab 的 pages 列表中。
 * Soft-delete（如 Games Process → waiting）不进本页。
 */
function deleted_log_entry_source_definitions(): array
{
    return [
        '' => [
            'label' => 'All · 全部',
            'hint' => '所有已记录的物理删除',
            'pages' => [],
        ],
        'account' => [
            'label' => 'Account · 账号',
            'hint' => 'Account List：删账号、币种、多公司关联、Link',
            'pages' => [
                'account-list.php',
                '/api/accounts/delete_accounts_api.php',
                '/api/accounts/delete_currency_api.php',
                '/api/accounts/account_currency_api.php',
                '/api/accounts/bulk_account_currency_api.php',
                '/api/accounts/account_company_api.php',
                '/api/accounts/account_link_api.php',
            ],
        ],
        'txn_maint' => [
            'label' => 'Txn Maint · 交易维护',
            'hint' => 'Transaction Maintenance 批量删流水',
            'pages' => [
                '/api/transactions/maintenance_delete_api.php',
            ],
        ],
        'payment' => [
            'label' => 'Payment · 收付款',
            'hint' => 'Payment Maintenance 删收付款相关流水',
            'pages' => [
                '/api/payment_maintenance/delete_api.php',
            ],
        ],
        'bank_maint' => [
            'label' => 'Bank Maint · 银行流程维护',
            'hint' => 'Bank Process Maintenance 删 Bank 入账流水',
            'pages' => [
                '/api/bankprocess_maintenance/delete_api.php',
            ],
        ],
        'capture' => [
            'label' => 'Capture · 抓数维护',
            'hint' => 'Capture Maintenance 删抓数主表/明细/已提交',
            'pages' => [
                '/api/capture_maintenance/delete_api.php',
            ],
        ],
        'formula' => [
            'label' => 'Formula · 公式',
            'hint' => 'Formula Maintenance 删模板',
            'pages' => [
                '/api/formula_maintenance/delete_api.php',
            ],
        ],
        'process' => [
            'label' => 'Process · 流程列表',
            'hint' => 'Process List 物理删除 Bank Process 主档',
            'pages' => [
                '/api/processes/delete_processes_api.php',
                'processlist.php',
            ],
        ],
        'ownership' => [
            'label' => 'Ownership · 股权',
            'hint' => 'Ownership 移除股权 / 合伙行',
            'pages' => [
                '/api/ownership/remove_owner_api.php',
                'remove_owner_api.php',
            ],
        ],
        'auto_renew' => [
            'label' => 'Auto Renew · 自动续费',
            'hint' => 'Auto Renew 清理相关流水',
            'pages' => [
                '/api/subscription/auto_renew_api.php',
            ],
        ],
        'marquee' => [
            'label' => 'Marquee · 跑马灯',
            'hint' => 'Announcement / 系统维护区跑马灯',
            'pages' => [
                '/api/maintenance/delete_api.php',
            ],
        ],
    ];
}

/**
 * @return array{label:string,hint:string,pages:array<int,string>}|null
 */
function deleted_log_entry_source_for_key(string $key): ?array
{
    $all = deleted_log_entry_source_definitions();
    return array_key_exists($key, $all) ? $all[$key] : null;
}
