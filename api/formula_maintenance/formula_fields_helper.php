<?php
/**
 * Maintenance - Formula 与 data_capture_templates 字段约定（与 js/datacapturesummary.js 对齐）
 *
 * formula_operators : 公式本体（含占成等乘数，不含 Source 列乘数）
 * source_percent    : Source 列数值，单独存储
 * formula_display   : 列表展示 = 本体 + （Source≠1 时）* (source_percent)
 */

/**
 * 与 datacapturesummary.js isAppendedSourcePercentSuffix 一致
 */
function isAppendedSourcePercentSuffix($afterStar) {
    if (!preg_match('/^\*\s*\((.+)\)\s*$/us', (string) $afterStar, $m)) {
        return false;
    }
    $inner = trim($m[1]);
    if ($inner === '' || preg_match('/[$\[\]]/u', $inner)) {
        return false;
    }
    if (!preg_match('/^[0-9.\s+\-*\/()]+$/u', $inner)) {
        return false;
    }
    if (preg_match('/\/[0-9.]+\s*[-+]/u', $inner)) {
        return false;
    }
    $divParts = explode('/', $inner, 2);
    if (count($divParts) === 2) {
        $left = trim($divParts[0]);
        $rightPart = trim($divParts[1]);
        if (preg_match('/^([0-9.]+)/u', $rightPart, $rm)) {
            $a = (float) $left;
            $b = (float) $rm[1];
            if ((abs($a) > 10 || abs($b) > 10)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * 与 datacapturesummary.js removeTrailingSourcePercentExpression 一致：
 * 只移除末尾展示用 Source 后缀 *(...)；*0.9、*($3/$2) 等公式内乘数一律保留。
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
        if (!$isStarInsideParens && isAppendedSourcePercentSuffix($afterStar)) {
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
        $result = safeEvalMaintenanceNumericExpression($valueStr);
        if ($result === null) {
            return null;
        }
        return (float) $result;
    }
    if (!is_numeric($valueStr)) {
        return null;
    }
    return (float) $valueStr;
}

/** eval 表达式求值；括号不匹配等语法错误时返回 null，避免整页 500 */
function safeEvalMaintenanceNumericExpression($valueStr) {
    try {
        $result = eval('return (' . $valueStr . ');');
        return is_numeric($result) ? (float) $result : null;
    } catch (Throwable $e) {
        return null;
    }
}

/** 占成系数误存为 Source 的典型区间（如 0.9），非真实 Source（0.1、0.14） */
function isLikelyMisplacedCommissionValue($value) {
    $num = evaluateMaintenanceNumericFragment($value);
    if ($num === null) {
        return false;
    }
    return $num > 0.85 && $num < 1;
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
    $suffixVal = trim($m[1]);
    if (!isLikelyMisplacedCommissionValue($suffixVal)) {
        return null;
    }
    return $suffixVal;
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
 * 去重时优先保留公式更完整、且 Source 正确的记录。
 * 避免「带 *0.9 尾段但 source_percent=1」的误存行盖掉 Summary 写入 source=0.1/0.14 的行。
 */
function scoreTemplateRowForMaintenanceDedup(array $row) {
    list($base, , ) = resolveTemplateFormulaBaseAndPercent($row);
    $score = strlen($base);
    if (preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $base)) {
        $score += 100;
    }
    list($resolvedPct, ) = resolveEffectiveSourcePercentForRow($row);
    if ($resolvedPct !== '1' && !isLikelyMisplacedCommissionValue($resolvedPct)) {
        $score += 200;
    }
    $fd = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $ops = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    if (recoverMisplacedCommissionFromDisplaySuffix($fd, $ops) !== null) {
        $score -= 200;
    }
    if (recoverMisplacedCommissionFromSourcePercent($ops, $dbPct) !== null) {
        $score -= 150;
    }
    return $score;
}

/** formula_operators 含 $n 或 [id,n] 时，不从数值公式自动拼尾段 */
function formulaOperatorsUsesCellReferences($body) {
    $s = trim((string) $body);
    if ($s === '') {
        return false;
    }
    return preg_match('/\$\d+/u', $s) || preg_match('/\[[^\]]+[,:\s]\d+\]/u', $s);
}

/**
 * 顾客公式为准：不自动从 formula_display 拼尾段；formula_display 参数仅作 ops 为空时的回退。
 */
function mergeFormulaBaseWithDisplayTail($operatorsBase, $formulaDisplay) {
    $ops = removeTrailingSourcePercentSuffix(trim((string) $operatorsBase));
    if ($ops !== '') {
        return $ops;
    }
    return removeTrailingSourcePercentSuffix(trim((string) $formulaDisplay));
}

/** 公式去掉 Source 后缀与末尾 row 占成（*0.90 等）后的核心段，用于同 Process 同行互相推断 */
function getFormulaCorePrefixKey($base) {
    $b = removeTrailingSourcePercentSuffix(trim((string) $base));
    while ($b !== '' && preg_match('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', $b)) {
        $b = preg_replace('/\*(?:\([^)]+\)|[0-9.]+)\s*$/u', '', $b);
        $b = trim($b);
    }
    return preg_replace('/\s+/', '', strtolower($b));
}

/** 提取公式末尾 row 占成尾段（*0.90），不含 Source 后缀 *(0.14) */
function extractLastBareMultiplierTail($formulaText) {
    $fd = removeTrailingSourcePercentSuffix(trim((string) $formulaText));
    if ($fd === '' || !preg_match('/(\*(?:\([^)]+\)|[0-9.]+))\s*$/u', $fd, $m)) {
        return null;
    }
    return trim($m[1]);
}

function formulaBaseHasBareMultiplierTail($base) {
    return extractLastBareMultiplierTail($base) !== null;
}

function maintenancePeerCoefficientKey(array $row, $coreKey) {
    $product = isset($row['product']) ? $row['product'] : ($row['id_product'] ?? '');
    return strtolower(trim((string) ($row['process'] ?? ''))) . '|'
        . strtolower(trim((string) ($row['currency'] ?? ($row['currency_code'] ?? '')))) . '|'
        . strtolower(trim((string) $product)) . '|'
        . $coreKey;
}

/**
 * 从 DB 各字段收集可用来补 row 系数（*0.90）的候选串。
 *
 * @return string[]
 */
function collectFormulaMergeCandidates(array $row) {
    $opsRaw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    $fd = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $lsv = isset($row['last_source_value']) ? trim((string) $row['last_source_value']) : '';
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';

    $candidates = [];
    $seen = [];
    $push = function ($v) use (&$candidates, &$seen) {
        $v = trim((string) $v);
        if ($v === '' || strcasecmp($v, 'Formula') === 0 || strcasecmp($v, 'Source') === 0) {
            return;
        }
        $k = preg_replace('/\s+/', '', $v);
        if (isset($seen[$k])) {
            return;
        }
        $seen[$k] = true;
        $candidates[] = $v;
    };

    $push($lsv);
    $push($fd);
    $push($opsRaw);

    $misplacedFd = recoverMisplacedCommissionFromDisplaySuffix($fd, $opsRaw);
    if ($misplacedFd !== null) {
        $push('*' . formatSourcePercentForMaintenanceList($misplacedFd));
    }
    $misplacedSp = recoverMisplacedCommissionFromSourcePercent($opsRaw, $dbPct);
    if ($misplacedSp !== null) {
        $push('*' . formatSourcePercentForMaintenanceList($misplacedSp));
    }

    return $candidates;
}

/**
 * 从公式文本末尾解析 Source 后缀 *(...)；占成误存 *(0.9) 不算 Source。
 */
function parseTrailingSourceSuffixFromText($text, $operatorsBase) {
    $t = trim((string) $text);
    if ($t === '' || strcasecmp($t, 'Formula') === 0 || strcasecmp($t, 'Source') === 0) {
        return null;
    }
    if (!preg_match('/\*\s*\(([0-9.+\-*\/()\s]+)\)\s*$/u', $t, $m)) {
        return null;
    }
    if (recoverMisplacedCommissionFromDisplaySuffix($t, $operatorsBase) !== null) {
        return null;
    }
    return formatSourcePercentForMaintenanceList(trim($m[1]));
}

/**
 * 是否应从 last_source_value 等合并 row 占成（*0.90）。
 * 真实 Source（0.1、0.14）行：不合并 lsv，改由同 id_product 同行推断补 *0.90。
 */
function maintenanceRowShouldMergeRowCoefficientCandidates(array $row) {
    list($resolvedPct, ) = resolveEffectiveSourcePercentForRow($row);
    if ($resolvedPct !== '1' && !isLikelyMisplacedCommissionValue($resolvedPct)) {
        return false;
    }

    $opsRaw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';

    return recoverMisplacedCommissionFromSourcePercent($opsRaw, $dbPct) !== null
        || formatSourcePercentForMaintenanceList($dbPct) === '1'
        || $dbPct === '';
}

/** 列表行是否允许同行 row 占成推断（仅排除误存 Source=0.9 这类） */
function maintenanceRowEligibleForPeerRowCoefficient(array $row) {
    $src = isset($row['source']) ? trim((string) $row['source']) : '1';
    $formatted = formatSourcePercentForMaintenanceList($src);
    if ($formatted === '' || $formatted === '1') {
        return true;
    }
    return !isLikelyMisplacedCommissionValue($formatted);
}

/** 只返回 formula_operators 本体，不从 display/lsv 自动拼乘数 */
function mergeFormulaBaseFromAllCandidates($base, array $row) {
    $ops = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    if ($ops !== '') {
        return removeTrailingSourcePercentSuffix($ops);
    }
    return removeTrailingSourcePercentSuffix(trim((string) $base));
}

/**
 * 同 Process + Currency 下，若 ELCS 等行已有 *0.90，给缺尾段的 H99166 等同核心公式行补上。
 */
function applyPeerRowCoefficientInferenceToDisplayRows(array &$rows) {
    $tailsByPeerKey = [];
    foreach ($rows as $row) {
        $edit = isset($row['formula_edit']) ? trim((string) $row['formula_edit']) : '';
        if ($edit === '') {
            continue;
        }
        $core = getFormulaCorePrefixKey($edit);
        if ($core === '') {
            continue;
        }
        $tail = extractLastBareMultiplierTail($edit);
        if ($tail === null) {
            continue;
        }
        $peerKey = maintenancePeerCoefficientKey($row, $core);
        $tailsByPeerKey[$peerKey] = $tail;
    }

    foreach ($rows as &$row) {
        if (!maintenanceRowEligibleForPeerRowCoefficient($row)) {
            continue;
        }
        $edit = isset($row['formula_edit']) ? trim((string) $row['formula_edit']) : '';
        if ($edit === '' || formulaBaseHasBareMultiplierTail($edit)) {
            continue;
        }
        $core = getFormulaCorePrefixKey($edit);
        if ($core === '') {
            continue;
        }
        $peerKey = maintenancePeerCoefficientKey($row, $core);
        if (!isset($tailsByPeerKey[$peerKey])) {
            continue;
        }
        $tail = $tailsByPeerKey[$peerKey];
        $newBase = mergeFormulaBaseWithDisplayTail($edit, $edit . $tail);
        $src = isset($row['source']) ? trim((string) $row['source']) : '1';
        if (recoverMisplacedCommissionFromSourcePercent($edit, $src) !== null) {
            $src = '1';
        } else {
            $tailBare = preg_replace('/^\*/', '', $tail);
            $tailBare = trim($tailBare, '() ');
            $tailNum = evaluateMaintenanceNumericFragment($tailBare);
            $srcNum = evaluateMaintenanceNumericFragment($src);
            if ($tailNum !== null && $srcNum !== null && abs($tailNum - $srcNum) < 0.001) {
                $src = '1';
            }
        }
        $row['formula_edit'] = $newBase;
        $row['source'] = formatSourcePercentForMaintenanceList($src);
        $row['formula'] = buildFormulaDisplayParenFromParts($newBase, $src, 1);
    }
    unset($row);
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
    $lsv = isset($row['last_source_value']) ? trim((string) $row['last_source_value']) : '';
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    $dbEn = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;

    foreach ([$fdOriginal, $lsv] as $candidate) {
        $parsed = parseTrailingSourceSuffixFromText($candidate, $opsRaw);
        if ($parsed !== null && $parsed !== '1') {
            return [$parsed, $dbEn ?: 1];
        }
    }

    if (recoverMisplacedCommissionFromSourcePercent($opsRaw, $dbPct) !== null) {
        return ['1', $dbEn ?: 1];
    }
    if ($dbPct === '') {
        return ['1', 0];
    }
    $formatted = formatSourcePercentForMaintenanceList($dbPct);
    return [$formatted, $dbEn ?: ($formatted !== '1' ? 1 : 0)];
}

/**
 * 从库记录得到公式本体 + 有效 Source（对齐 Data Capture Summary 展示规则）。
 *
 * @return array{0:string,1:string,2:int}
 */
function resolveTemplateFormulaBaseAndPercent(array $row) {
    $opsRaw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    $fdOriginal = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    $dbEn = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;

    list($pct, $en) = resolveEffectiveSourcePercentForRow($row);

    $misplaced = recoverMisplacedCommissionFromDisplaySuffix($fdOriginal, $opsRaw);
    if ($misplaced === null) {
        $misplaced = recoverMisplacedCommissionFromSourcePercent($opsRaw, $dbPct);
    }

    $base = removeTrailingSourcePercentSuffix($opsRaw);
    if ($base === '' && $fdOriginal !== '' && strcasecmp($fdOriginal, 'Formula') !== 0) {
        $base = removeTrailingSourcePercentSuffix($fdOriginal);
    }
    if (maintenanceRowShouldMergeRowCoefficientCandidates($row)) {
        $base = mergeFormulaBaseFromAllCandidates($base !== '' ? $base : $opsRaw, $row);
    }

    if ($misplaced !== null) {
        return [$base, '1', $dbEn ?: 1];
    }

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
        $result = safeEvalMaintenanceNumericExpression($valueStr);
        if ($result === null) {
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
