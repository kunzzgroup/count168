<?php

/**
 * data_capture_details.processed_amount：按「分」ROUND_HALF_UP（四舍五入）的 SQL 片段。
 * 用于 SUM(每行量化) 时保持与前端展示口径一致。
 *
 * @param string $col 列全名，如 dcd.processed_amount
 */
function dcd_processed_amount_sql_quant2(string $col = 'dcd.processed_amount'): string
{
    // MySQL ROUND(x, 2) 对 DECIMAL 等价于 HALF_UP；与当前报表展示口径对齐
    return 'ROUND((' . $col . '), 2)';
}

/**
 * PHP 侧量化到 2 位并使用 HALF_UP，作为 SQL 口径的等价实现。
 */
function dcd_processed_amount_float_quant2(float $value): float
{
    if (!is_finite($value)) {
        return 0.0;
    }
    $out = round($value, 2, PHP_ROUND_HALF_UP);
    return ($out === 0.0 || $out === -0.0) ? 0.0 : $out;
}
