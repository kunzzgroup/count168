<?php
/**
 * Dashboard bootstrap: one HTTP request returns current KPI, previous period, and multi-currency earnings.
 * Reuses dashboard_api.php logic in-process (no repeated PHP/HTTP overhead).
 */

session_start();
session_write_close();
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';

if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed',
        'data' => null,
        'error' => 'Database connection failed',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => '用户未登录',
        'data' => null,
        'error' => '用户未登录',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

define('DASHBOARD_API_SKIP_MAIN', true);
require_once __DIR__ . '/dashboard_api.php';

/**
 * Mirror frontend previousPeriodRange().
 *
 * @return array{from:string,to:string}
 */
function dashboard_bootstrap_previous_period(string $fromYmd, string $toYmd): array
{
    $from = DateTimeImmutable::createFromFormat('Y-m-d', $fromYmd);
    $to = DateTimeImmutable::createFromFormat('Y-m-d', $toYmd);
    if (!$from || !$to) {
        return ['from' => $fromYmd, 'to' => $toYmd];
    }
    $dayCount = max(1, (int) $from->diff($to)->days + 1);
    $prevTo = $from->modify('-1 day');
    $prevFrom = $prevTo->modify('-' . ($dayCount - 1) . ' days');
    return [
        'from' => $prevFrom->format('Y-m-d'),
        'to' => $prevTo->format('Y-m-d'),
    ];
}

/**
 * @return array<string, string>
 */
function dashboard_bootstrap_base_params(): array
{
    $params = [];
    $dateFrom = isset($_GET['date_from']) ? trim((string) $_GET['date_from']) : '';
    $dateTo = isset($_GET['date_to']) ? trim((string) $_GET['date_to']) : '';
    if ($dateFrom !== '') {
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== '') {
        $params['date_to'] = $dateTo;
    }

    $companyId = isset($_GET['company_id']) && $_GET['company_id'] !== ''
        ? (string) $_GET['company_id']
        : '';
    $viewGroup = isset($_GET['view_group']) ? trim((string) $_GET['view_group']) : '';

    if ($companyId !== '') {
        $params['company_id'] = $companyId;
        if ($viewGroup !== '') {
            $params['view_group'] = $viewGroup;
        }
    } elseif ($viewGroup !== '') {
        $params['view_group'] = $viewGroup;
        $params['group_id'] = $viewGroup;
    }

    return $params;
}

/**
 * Strip heavy chart series from earnings-only payloads.
 *
 * @param array<string, mixed>|null $data
 * @return array<string, mixed>|null
 */
function dashboard_bootstrap_slim_payload(?array $data): ?array
{
    if (!is_array($data)) {
        return null;
    }
    unset($data['daily_data']);
    return $data;
}

try {
    $baseParams = dashboard_bootstrap_base_params();
    if ($baseParams === []) {
        throw new Exception('Missing dashboard scope');
    }

    $primaryCurrency = isset($_GET['currency']) ? strtoupper(trim((string) $_GET['currency'])) : '';
    $currencyListRaw = isset($_GET['currencies']) ? trim((string) $_GET['currencies']) : '';
    $currencyCodes = [];
    if ($currencyListRaw !== '') {
        foreach (explode(',', $currencyListRaw) as $part) {
            $code = strtoupper(trim($part));
            if ($code !== '' && !in_array($code, $currencyCodes, true)) {
                $currencyCodes[] = $code;
            }
        }
    }
    if ($primaryCurrency !== '' && !in_array($primaryCurrency, $currencyCodes, true)) {
        array_unshift($currencyCodes, $primaryCurrency);
    }
    if ($primaryCurrency === '' && $currencyCodes !== []) {
        $primaryCurrency = $currencyCodes[0];
    }

    $dateFrom = $baseParams['date_from'] ?? date('Y-m-01');
    $dateTo = $baseParams['date_to'] ?? date('Y-m-t');
    $prevRange = dashboard_bootstrap_previous_period($dateFrom, $dateTo);

    $currentParams = $baseParams;
    if ($primaryCurrency !== '') {
        $currentParams['currency'] = $primaryCurrency;
    }
    $currentJson = dashboard_api_capture($currentParams);
    if (empty($currentJson['success']) || !is_array($currentJson['data'])) {
        throw new Exception($currentJson['message'] ?? $currentJson['error'] ?? 'Failed to load dashboard');
    }

    $prevParams = $baseParams;
    $prevParams['date_from'] = $prevRange['from'];
    $prevParams['date_to'] = $prevRange['to'];
    if ($primaryCurrency !== '') {
        $prevParams['currency'] = $primaryCurrency;
    }
    $previousJson = dashboard_api_capture($prevParams);
    $previousData = (!empty($previousJson['success']) && is_array($previousJson['data']))
        ? $previousJson['data']
        : null;

    $earningsCurrent = [];
    $earningsPrevious = [];

    foreach ($currencyCodes as $code) {
        if ($code === $primaryCurrency) {
            $earningsCurrent[] = [
                'code' => $code,
                'payload' => dashboard_bootstrap_slim_payload($currentJson['data']),
            ];
            $earningsPrevious[] = [
                'code' => $code,
                'payload' => dashboard_bootstrap_slim_payload($previousData),
            ];
            continue;
        }

        $curParams = $baseParams;
        $curParams['currency'] = $code;
        $curJson = dashboard_api_capture($curParams);
        $curPayload = (!empty($curJson['success']) && is_array($curJson['data']))
            ? dashboard_bootstrap_slim_payload($curJson['data'])
            : null;

        $prevCurParams = $prevParams;
        $prevCurParams['currency'] = $code;
        $prevCurJson = dashboard_api_capture($prevCurParams);
        $prevCurPayload = (!empty($prevCurJson['success']) && is_array($prevCurJson['data']))
            ? dashboard_bootstrap_slim_payload($prevCurJson['data'])
            : null;

        $earningsCurrent[] = ['code' => $code, 'payload' => $curPayload];
        $earningsPrevious[] = ['code' => $code, 'payload' => $prevCurPayload];
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'current' => $currentJson['data'],
            'previous' => $previousData,
            'earnings' => [
                'current' => $earningsCurrent,
                'previous' => $earningsPrevious,
            ],
            'date_range' => [
                'from' => $dateFrom,
                'to' => $dateTo,
            ],
            'previous_date_range' => $prevRange,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('dashboard_bootstrap_api: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
