<?php
/**
 * Maintenance - Formula 与 data_capture_templates 的 formula / source_percent 字段约定
 */

/**
 * 若末尾为 *SourcePercent（且 * 后不是 $ 列引用），拆成公式本体 + source_percent。
 * 未识别则整串作为 base，source_percent / enable 返回 null（调用方不更新库中比例列）。
 */
function parseMaintenanceFormulaInput($raw) {
    $s = trim((string) $raw);
    if ($s === '') {
        return ['base' => '', 'source_percent' => null, 'enable_source_percent' => null];
    }
    $lastStar = strrpos($s, '*');
    if ($lastStar === false) {
        return ['base' => $s, 'source_percent' => null, 'enable_source_percent' => null];
    }
    $base = trim(substr($s, 0, $lastStar));
    $rate = trim(substr($s, $lastStar + 1));
    if ($base === '' || $rate === '') {
        return ['base' => $s, 'source_percent' => null, 'enable_source_percent' => null];
    }
    if (strpos($rate, '$') !== false) {
        return ['base' => $s, 'source_percent' => null, 'enable_source_percent' => null];
    }
    if (preg_match('/^\((.+)\)$/', $rate, $m)) {
        $rate = trim($m[1]);
    }
    $rateCompact = str_replace([' ', '%'], '', $rate);
    if ($rateCompact === '' || !preg_match('/^[0-9.\/+-]+$/', $rateCompact)) {
        return ['base' => $s, 'source_percent' => null, 'enable_source_percent' => null];
    }
    $enable = ($rateCompact === '0' || $rateCompact === '0.0' || $rateCompact === '-0') ? 0 : 1;
    return ['base' => $base, 'source_percent' => $rate, 'enable_source_percent' => $enable];
}

function buildFormulaDisplayParenFromParts($base, $sourcePercent, $enableSourcePercent) {
    $b = trim((string) $base);
    $pct = trim((string) $sourcePercent);
    $en = (int) $enableSourcePercent;
    if ($b === '') {
        return '';
    }
    if (!$en || $pct === '' || $pct === '1' || $pct === '1.0' || $pct === '1.00') {
        return $b;
    }
    return $b . ' * (' . $pct . ')';
}

function buildFormulaEditFromParts($base, $sourcePercent, $enableSourcePercent) {
    $b = trim((string) $base);
    $pct = trim((string) $sourcePercent);
    $en = (int) $enableSourcePercent;
    if ($b === '') {
        return '';
    }
    if (!$en || $pct === '' || $pct === '1' || $pct === '1.0' || $pct === '1.00') {
        return $b;
    }
    return $b . '*' . $pct;
}

/**
 * 求值纯数字片段，供 Maintenance 公式尾段与 source_percent 比较。
 */
function evaluateMaintenanceNumericFragment($value) {
    $valueStr = trim(str_replace(['%', ' '], '', (string) $value));
    if ($valueStr === '' || !preg_match('/^[0-9.+\-*\/()]+$/', $valueStr)) {
        return null;
    }
    if (preg_match('/[+\-*\/]/', $valueStr)) {
        $result = @eval('return (' . $valueStr . ');');
        if (!is_numeric($result)) {
            return null;
        }
        return (float) $result;
    }
    if (!is_numeric($valueStr)) {
        return null;
    }
    return (float) $valueStr;
}

function maintenanceNumericEquals($a, $b) {
    $na = evaluateMaintenanceNumericFragment($a);
    $nb = evaluateMaintenanceNumericFragment($b);
    if ($na === null || $nb === null) {
        return trim((string) $a) === trim((string) $b);
    }
    return abs($na - $nb) < 1e-9;
}

/**
 * *0.008*RATE 中 RATE 为占成/拆分系数；即使数值碰巧等于 source_percent 也不应当作旧数据尾段剥掉。
 */
function isCommissionRateAfter008Suffix($formula, $tail) {
    $tailCompact = str_replace([' ', '%'], '', trim((string) $tail));
    if ($tailCompact === '') {
        return false;
    }
    $quoted = preg_quote($tailCompact, '#');
    return (bool) preg_match('#\*0\.008\*' . $quoted . '$#u', (string) $formula);
}

/**
 * 移除 formula_operators 末尾误写入的 source_percent（与 datacapturesummary.js 对齐）。
 * 仅当尾段数值等于库中 source_percent 时才剥；不再因 source 非空就盲剥最后一个 *系数，
 * 避免误删 *0.90 / *0.10 等占成系数。
 */
function stripTrailingEmbeddedSourceFromFormula($raw, $dbPct) {
    $s = trim((string) $raw);
    $dbPct = trim((string) $dbPct);
    if ($s === '' || $dbPct === '') {
        return $s;
    }
    for ($i = 0; $i < 24; $i++) {
        if (!preg_match('#^(.*)\*([^*$]+)$#u', $s, $m)) {
            break;
        }
        $prefix = trim($m[1]);
        $tail = trim($m[2]);
        $tailCompact = str_replace([' ', '%'], '', $tail);
        if ($prefix === '' || $tailCompact === '' || strpos($tail, '$') !== false) {
            break;
        }
        if (!preg_match('/^[0-9.\/()+-]+$/', $tailCompact)) {
            break;
        }
        if (preg_match('/^\((.+)\)$/', $tail, $wrapped)) {
            $tail = trim($wrapped[1]);
        }
        if (!maintenanceNumericEquals($tail, $dbPct)) {
            break;
        }
        if (isCommissionRateAfter008Suffix($s, $tail)) {
            break;
        }
        $s = $prefix;
    }
    return $s;
}

/**
 * 从行数据得到「公式本体 + 比例」：若 formula 字段末尾仍带 *source（旧数据），先剥掉再以库 source_percent 为准。
 */
function resolveTemplateFormulaBaseAndPercent(array $row) {
    $raw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    if ($raw === '') {
        $raw = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    }
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    $dbEn = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;
    $base = stripTrailingEmbeddedSourceFromFormula($raw, $dbPct);
    return [$base, $dbPct, $dbEn];
}

function buildFormulaDisplayParenFromRow(array $row) {
    list($base, $pct, $en) = resolveTemplateFormulaBaseAndPercent($row);
    return buildFormulaDisplayParenFromParts($base, $pct, $en);
}

function buildFormulaEditFromRow(array $row) {
    list($base, $pct, $en) = resolveTemplateFormulaBaseAndPercent($row);
    return buildFormulaEditFromParts($base, $pct, $en);
}

/**
 * 与 js/datacapturesummary.js 中 formatSourcePercentForDisplay 对齐，
 * 供 Maintenance - Formula 列表「Source」列展示（与 Data Capture Summary 同源字段 source_percent）。
 */
function formatSourcePercentForMaintenanceList($value) {
    if ($value === null || $value === false) {
        return '1';
    }
    $valueStr = trim(str_replace('%', '', (string) $value));
    if ($valueStr === '') {
        return '1';
    }
    if (preg_match('/[+\-*\/]/', $valueStr)) {
        if (!preg_match('/^[0-9.+\-*\/()\s]+$/', $valueStr)) {
            return $valueStr;
        }
        $result = @eval('return (' . $valueStr . ');');
        if (!is_numeric($result)) {
            return $valueStr;
        }
        $num = (float) $result;
    } else {
        if (!is_numeric($valueStr)) {
            return $valueStr;
        }
        $num = (float) $valueStr;
    }
    if (!is_finite($num)) {
        return $valueStr;
    }
    if (abs($num - round($num)) < 1e-9) {
        return (string) (int) round($num);
    }
    $s = number_format($num, 6, '.', '');
    $s = rtrim(rtrim($s, '0'), '.');
    return $s !== '' ? $s : '0';
}
