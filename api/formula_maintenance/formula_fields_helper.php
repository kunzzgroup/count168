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

    if (preg_match('/^(.*)\*\s*\(([0-9.+\-*\/()\s]+)\)\s*$/u', $s, $m)) {
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

function appendBareMultiplierTailIfMissing($base, $multiplier) {
    $b = trim((string) $base);
    $mult = trim((string) $multiplier);
    if ($b === '' || $mult === '') {
        return $b;
    }
    $tail = '*' . formatSourcePercentForMaintenanceList($mult);
    $bNorm = preg_replace('/\s+/', '', $b);
    $tailNorm = preg_replace('/\s+/', '', $tail);
    if ($tailNorm === '' || substr($bNorm, -strlen($tailNorm)) === $tailNorm) {
        return $b;
    }
    return $b . $tail;
}

/**
 * 旧 Maintenance 误把占成存成末尾 *(0.9)：本体与 operators 相同且 operators 无占成尾段。
 */
function recoverMisplacedCommissionFromDisplaySuffix($formulaDisplay, $operatorsBase) {
    $fd = trim((string) $formulaDisplay);
    if ($fd === '' || !preg_match('/\*\s*\(([0-9.+\-*\/()\s]+)\)\s*$/u', $fd, $m)) {
        return null;
    }
    $body = removeTrailingSourcePercentSuffix($fd);
    $ops = removeTrailingSourcePercentSuffix(trim((string) $operatorsBase));
    if ($ops === '' || preg_replace('/\s+/', '', $body) !== preg_replace('/\s+/', '', $ops)) {
        return null;
    }
    if (preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $ops)) {
        return null;
    }
    return trim($m[1]);
}

/**
 * source_percent 误存占成（如 0.9）：operators 无尾段乘数且数值在 (0.85,1) 区间。
 */
function recoverMisplacedCommissionFromSourcePercent($operatorsBase, $sourcePercent) {
    $ops = removeTrailingSourcePercentSuffix(trim((string) $operatorsBase));
    if ($ops === '' || preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $ops)) {
        return null;
    }
    $src = formatSourcePercentForMaintenanceList($sourcePercent);
    if ($src === '' || $src === '1') {
        return null;
    }
    $num = evaluateMaintenanceNumericFragment($src);
    if ($num === null || $num <= 0.85 || $num >= 1) {
        return null;
    }
    return $src;
}

/** Summary 保存的 formula_display / last_source_value，优先较完整的一条 */
function pickCanonicalFormulaDisplayRaw(array $row) {
    $fd = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $lsv = isset($row['last_source_value']) ? trim((string) $row['last_source_value']) : '';
    $opsRaw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';

    if ($lsv === '' || strcasecmp($lsv, 'Source') === 0) {
        return $fd;
    }
    if ($fd === '' || strcasecmp($fd, 'Formula') === 0) {
        return $lsv;
    }
    if (recoverMisplacedCommissionFromDisplaySuffix($fd, $opsRaw) !== null) {
        return $lsv;
    }

    $fdBody = removeTrailingSourcePercentSuffix($fd);
    $lsvBody = removeTrailingSourcePercentSuffix($lsv);
    $fdScore = strlen($fdBody) + (preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $fdBody) ? 50 : 0);
    $lsvScore = strlen($lsvBody) + (preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $lsvBody) ? 50 : 0);
    if ($lsvScore > $fdScore) {
        return $lsv;
    }
    return $fd;
}

/**
 * 去重时优先保留公式更完整的记录（避免 Maintenance 误存的新 id 覆盖 Summary 正确数据）。
 */
function scoreTemplateRowForMaintenanceDedup(array $row) {
    list($base, , ) = resolveTemplateFormulaBaseAndPercent($row);
    $score = strlen($base);
    if (preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $base)) {
        $score += 100;
    }
    $fd = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $ops = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    if (recoverMisplacedCommissionFromDisplaySuffix($fd, $ops) !== null) {
        $score -= 200;
    }
    return $score;
}

/**
 * 用 formula_display 补全 formula_operators 中缺失的末尾占成系数（如 *0.90），
 * 仅当 display 比 operators 多出尾段乘数时追加，不硬编码具体数值。
 */
function mergeFormulaBaseWithDisplayTail($operatorsBase, $formulaDisplay) {
    $ops = trim((string) $operatorsBase);
    $fd = removeTrailingSourcePercentSuffix(trim((string) $formulaDisplay));
    if ($ops === '' || $fd === '') {
        return $ops !== '' ? $ops : $fd;
    }
    if (!preg_match('/^(.*)(\*(?:\([^)]+\)|[0-9.]+))\s*$/u', $fd, $m)) {
        return $ops;
    }
    $fdTail = trim($m[2]);
    if ($fdTail === '') {
        return $ops;
    }
    $opsNorm = preg_replace('/\s+/', '', $ops);
    $tailNorm = preg_replace('/\s+/', '', $fdTail);
    if ($tailNorm === '' || substr($opsNorm, -strlen($tailNorm)) === $tailNorm) {
        return $ops;
    }
    return $ops . $fdTail;
}

/**
 * 与 Summary createFormulaDisplayFromExpression 一致：
 * formula_display 末尾有 *(source) 则 Source 为该值；否则 Source 为 1（不展示 *(1)）。
 *
 * @return array{0:string,1:int}
 */
function resolveEffectiveSourcePercentForRow(array $row) {
    $opsRaw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    $fdOriginal = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $dbEn = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;

    if ($fdOriginal !== '' && strcasecmp($fdOriginal, 'Formula') !== 0) {
        if (preg_match('/\*\s*\(([0-9.+\-*\/()\s]+)\)\s*$/u', $fdOriginal, $m)) {
            if (recoverMisplacedCommissionFromDisplaySuffix($fdOriginal, $opsRaw) === null) {
                return [formatSourcePercentForMaintenanceList(trim($m[1])), $dbEn ?: 1];
            }
            return ['1', $dbEn ?: 1];
        }
        return ['1', $dbEn ?: 1];
    }

    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    if (recoverMisplacedCommissionFromSourcePercent($opsRaw, $dbPct) !== null) {
        return ['1', $dbEn ?: 1];
    }
    if ($dbPct === '') {
        return ['1', 0];
    }
    return [formatSourcePercentForMaintenanceList($dbPct), $dbEn];
}

/**
 * 从库记录得到公式本体 + 有效 Source（对齐 Data Capture Summary 展示规则）。
 *
 * @return array{0:string,1:string,2:int}
 */
function resolveTemplateFormulaBaseAndPercent(array $row) {
    $opsRaw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    $fdOriginal = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $fdRaw = pickCanonicalFormulaDisplayRaw($row);
    $base = removeTrailingSourcePercentSuffix($opsRaw);
    $dbEn = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;

    $misplaced = recoverMisplacedCommissionFromDisplaySuffix($fdOriginal, $opsRaw);
    if ($misplaced === null && $fdOriginal === '') {
        $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
        $misplaced = recoverMisplacedCommissionFromSourcePercent($opsRaw, $dbPct);
    }
    if ($misplaced !== null) {
        $seed = $base !== '' ? $base : removeTrailingSourcePercentSuffix($opsRaw);
        if ($fdRaw !== '' && strcasecmp($fdRaw, 'Formula') !== 0) {
            $base = mergeFormulaBaseWithDisplayTail($seed, $fdRaw);
        } else {
            $base = appendBareMultiplierTailIfMissing($seed, $misplaced);
        }
        return [$base, '1', $dbEn ?: 1];
    }

    if ($base === '' && $fdRaw !== '') {
        $base = removeTrailingSourcePercentSuffix($fdRaw);
    } elseif ($fdRaw !== '' && strcasecmp($fdRaw, 'Formula') !== 0) {
        $base = mergeFormulaBaseWithDisplayTail($base, $fdRaw);
    }

    list($pct, $en) = resolveEffectiveSourcePercentForRow($row);
    return [$base, $pct, $en];
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
