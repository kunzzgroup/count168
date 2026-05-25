<?php
/**
 * Maintenance - Formula 与 data_capture_templates 字段约定（与 js/datacapturesummary.js 对齐）
 *
 * formula_operators : 公式本体（含占成等乘数，不含 Source 列乘数）
 * source_percent    : Source 列数值，单独存储
 * formula_display   : 列表展示 = 本体 + （Source≠1 时）* (source_percent)
 */

/**
 * 与 datacapturesummary.js removeTrailingSourcePercentExpression 一致：
 * 只移除末尾展示用 Source 后缀 *(...)；*0.9 等公式内乘数一律保留。
 */
function removeTrailingSourcePercentSuffix($formulaText) {
    $result = trim((string) $formulaText);
    if ($result === '') {
        return '';
    }
    $previous = '';
    while ($result !== '' && $previous !== $result) {
        $previous = $result;
        $lastStar = strrpos($result, '*');
        if ($lastStar === false) {
            break;
        }
        $beforeStar = substr($result, 0, $lastStar);
        $afterStar = substr($result, $lastStar);
        $openParens = substr_count($beforeStar, '(');
        $closeParens = substr_count($beforeStar, ')');
        $isStarInsideParens = $openParens > $closeParens;
        if (!$isStarInsideParens && preg_match('/^\*\s*\(([0-9.+\-*\/()\s]+)\)\s*$/u', $afterStar)) {
            $result = trim($beforeStar);
            continue;
        }
        break;
    }
    return $result;
}

function parseSourcePercentEnable($sourcePercent, $base) {
    $sp = trim((string) $sourcePercent);
    $rateCompact = str_replace([' ', '%'], '', $sp);
    if ($rateCompact === '' || !preg_match('/^[0-9.\/()+-]+$/', $rateCompact)) {
        return ['base' => $base, 'source_percent' => null, 'enable_source_percent' => null];
    }
    $enable = ($rateCompact === '0' || $rateCompact === '0.0' || $rateCompact === '-0') ? 0 : 1;
    $normalized = formatSourcePercentForMaintenanceList($sp);
    return ['base' => $base, 'source_percent' => $normalized, 'enable_source_percent' => $enable];
}

/**
 * 解析 Maintenance 保存输入：
 * - 优先使用独立字段 source_percent（公式框只放本体）
 * - 否则仅识别公式末尾 *(source) 后缀（与 Summary 展示规则一致）
 * - 不再按「最后一个 *」盲拆，避免误把 *0.90 等占成当成 Source
 */
function parseMaintenanceFormulaInput($raw, $sourcePercentOverride = null) {
    $s = trim((string) $raw);
    if ($s === '') {
        return ['base' => '', 'source_percent' => null, 'enable_source_percent' => null];
    }

    $override = $sourcePercentOverride !== null ? trim((string) $sourcePercentOverride) : '';
    if ($override !== '') {
        $base = removeTrailingSourcePercentSuffix($s);
        return parseSourcePercentEnable($override, $base);
    }

    if (preg_match('/^(.*)\*\(([0-9.+\-*\/()\s]+)\)\s*$/u', $s, $m)) {
        $beforeStar = trim($m[1]);
        $openParens = substr_count($beforeStar, '(');
        $closeParens = substr_count($beforeStar, ')');
        if ($openParens <= $closeParens) {
            return parseSourcePercentEnable(trim($m[2]), $beforeStar);
        }
    }

    return ['base' => removeTrailingSourcePercentSuffix($s), 'source_percent' => null, 'enable_source_percent' => null];
}

function buildFormulaDisplayParenFromParts($base, $sourcePercent, $enableSourcePercent) {
    $b = trim((string) $base);
    $en = (int) $enableSourcePercent;
    if ($b === '') {
        return '';
    }
    if (!$en) {
        return $b;
    }
    $pctDisplay = formatSourcePercentForMaintenanceList($sourcePercent);
    if ($pctDisplay === '' || $pctDisplay === '1') {
        return $b;
    }
    return $b . ' * (' . $pctDisplay . ')';
}

/**
 * 编辑框只放公式本体；Source 在独立列编辑。
 */
function buildFormulaEditFromParts($base, $sourcePercent, $enableSourcePercent) {
    return trim((string) $base);
}

/**
 * 从库记录得到公式本体 + Source（本体仅剥 *(source) 展示后缀，不剥占成系数）。
 *
 * @return array{0:string,1:string,2:int}
 */
function resolveTemplateFormulaBaseAndPercent(array $row) {
    $raw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    if ($raw === '') {
        $raw = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    }
    $base = removeTrailingSourcePercentSuffix($raw);
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    $dbEn = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;
    return [$base, $dbPct, $dbEn];
}

function buildFormulaDisplayParenFromRow(array $row) {
    list($base, $pct, $en) = resolveTemplateFormulaBaseAndPercent($row);
    return buildFormulaDisplayParenFromParts($base, $pct, $en);
}

function buildFormulaEditFromRow(array $row) {
    list($base, , ) = resolveTemplateFormulaBaseAndPercent($row);
    return $base;
}

/**
 * 与 js/datacapturesummary.js 中 formatSourcePercentForDisplay 对齐，
 * 供 Maintenance - Formula 列表「Source」列展示。
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
