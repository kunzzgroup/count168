<?php
/**
 * Bank process 账单类描述（首月 partial_first_month）与日期解析，供 history_api / bankprocess_maintenance 等复用。
 */

declare(strict_types=1);

/**
 * 解析 bank_process.day_start（支持 yyyy-mm-dd、d/m/Y 等），与 history_api 原逻辑一致。
 */
function bankProcessParseDayStartToYmd($raw): ?string
{
    if ($raw === null) {
        return null;
    }
    $s = trim((string) $raw);
    if ($s === '') {
        return null;
    }
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        if ($mo >= 1 && $mo <= 12 && $d >= 1 && $d <= 31 && checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    if (preg_match('#^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$#', $s, $m)) {
        $d = (int) $m[1];
        $mo = (int) $m[2];
        $y = (int) $m[3];
        if ($mo >= 1 && $mo <= 12 && $d >= 1 && $d <= 31 && checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    $dateStr = str_replace('/', '-', $s);
    if (preg_match('/^\d{1,2}-\d{1,2}$/', $dateStr)) {
        $dateStr .= '-' . date('Y');
    }
    $ts = strtotime($dateStr);
    return $ts !== false ? date('Y-m-d', $ts) : null;
}

function bankProcessBillFormatTripartNumber(float $amt): string
{
    if (abs($amt - (float) (int) round($amt)) < 0.00001) {
        return (string) (int) round($amt);
    }
    return number_format($amt, 2, '.', '');
}

/**
 * 首月比例账单描述：Pro-rated(dd/mm - dd/mm)@monthly buy/-sell/profit
 * buy/sell/profit 为 process 面额（与 Add Process 表单一致）；sell 在文案中始终带负号。
 *
 * @param array $t 需含 bp_day_start、process_cost、process_price、process_profit；可选 transaction_date 作 day_start 后备
 */
function bankProcessProRatedFirstMonthDescription(array $t): string
{
    $rawStart = $t['bp_day_start'] ?? null;
    $startYmd = bankProcessParseDayStartToYmd($rawStart);
    if ($startYmd === null) {
        $td = trim((string) ($t['transaction_date'] ?? ''));
        if ($td !== '') {
            if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $td, $m)) {
                $startYmd = $m[1];
            } else {
                $ts = strtotime(str_replace('/', '-', $td));
                if ($ts !== false) {
                    $startYmd = date('Y-m-d', $ts);
                }
            }
        }
    }
    if ($startYmd === null) {
        return 'Pro-rated@monthly';
    }
    $tsStart = strtotime($startYmd . ' 12:00:00');
    if ($tsStart === false) {
        return 'Pro-rated@monthly';
    }
    $endYmd = date('Y-m-t', $tsStart);
    $tsEnd = strtotime($endYmd . ' 12:00:00');
    $startDm = date('d/m', $tsStart);
    $endDm = $tsEnd !== false ? date('d/m', $tsEnd) : date('d/m', $tsStart);

    $buy = isset($t['process_cost']) ? (float) $t['process_cost'] : 0.0;
    $sell = isset($t['process_price']) ? (float) $t['process_price'] : 0.0;
    $profit = isset($t['process_profit']) ? (float) $t['process_profit'] : 0.0;

    $buyS = bankProcessBillFormatTripartNumber($buy);
    $sellS = '-' . bankProcessBillFormatTripartNumber(abs($sell));
    $profS = bankProcessBillFormatTripartNumber($profit);

    return "Pro-rated({$startDm} - {$endDm})@monthly {$buyS}/{$sellS}/{$profS}";
}
