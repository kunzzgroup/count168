<?php
/**
 * Automated Monthly Accounting Script
 * Reference: Enhanced with date-checking logic and detailed logging.
 * This script is intended to be run via a daily Cron Job.
 */

// Load configuration
require_once __DIR__ . '/config.php';

/**
 * Detailed Logging
 */
function logMessage($msg, $level = 'INFO')
{
    $file = __DIR__ . '/auto_accounting_log.txt';
    $time = date('Y-m-d H:i:s');
    $formattedMsg = "[$time] [$level] $msg";
    
    // Output to console/terminal
    echo $formattedMsg . PHP_EOL;
    
    // Append to log file
    file_put_contents($file, $formattedMsg . PHP_EOL, FILE_APPEND);
}

/**
 * Helper logic ported from process_accounting_inbox_api.php
 */

function hasBankProcessFrequencyColumn(PDO $pdo): bool
{
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM bank_process LIKE 'day_start_frequency'");
        return $stmt && $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function tableHasColumn(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    return $stmt->rowCount() > 0;
}

function getBillingTermMonthsFromContract(?string $contract): ?int
{
    if ($contract === null || trim($contract) === '') return null;
    $c = trim($contract);
    if (preg_match('/^1\+(\d+)$/i', $c, $m)) return 1 + (int) $m[1];
    if (preg_match('/^(\d+)\s*MONTHS?$/i', $c, $m)) return max(1, (int) $m[1]);
    return null;
}

function billingContractExclusiveEndYmd(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) return null;
    try {
        return (new DateTimeImmutable($dayStartYmd))->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function isWithinRecurringBillingWindow(string $todayYmd, ?string $dayStartYmd, ?string $contract, ?string $dayEndYmd): bool
{
    if ($dayStartYmd === null || $dayStartYmd === '' || strtotime($dayStartYmd) === false) return true;
    $start = date('Y-m-d', strtotime($dayStartYmd));
    if ($todayYmd < $start) return false;
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $end = date('Y-m-d', strtotime($dayEndYmd));
        if ($todayYmd > $end) return false;
    }
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) return true;
    $exclusiveEnd = billingContractExclusiveEndYmd($start, $term);
    return $exclusiveEnd === null || $todayYmd < $exclusiveEnd;
}

function hasMonthlyPostedOrSkippedInCalendarMonth(PDO $pdo, int $companyId, int $processId, int $year, int $month): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND YEAR(posted_date) = ? AND MONTH(posted_date) = ? AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '') LIMIT 1");
    $stmt->execute([$companyId, $processId, $year, $month]);
    return (bool) $stmt->fetch();
}

function isPartialFirstMonthAlreadyPosted(PDO $pdo, int $companyId, int $processId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND period_type IN ('partial_first_month','partial_first_month_skipped') LIMIT 1");
    $stmt->execute([$companyId, $processId]);
    return (bool) $stmt->fetch();
}

function calendarMonthDueYmd(int $year, int $month, int $dueDay): string
{
    $last = (int) date('t', mktime(0, 0, 0, $month, 1, $year));
    $d = min(max(1, $dueDay), $last);
    return sprintf('%04d-%02d-%02d', $year, $month, $d);
}

function partialFirstMonthAmounts(string $dayStart, float $cost, float $price, float $profit): array
{
    $ts = strtotime($dayStart);
    if ($ts === false) return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    $daysRemaining = $daysInMonth - $dayOfMonth + 1;
    if ($daysInMonth <= 0) return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    $ratio = $daysRemaining / $daysInMonth;
    return [
        'cost' => round($cost * $ratio, 2),
        'price' => round($price * $ratio, 2),
        'profit' => round($profit * $ratio, 2),
    ];
}

/**
 * Transaction Insertion Logic
 */

function insertTransaction(PDO $pdo, array $data)
{
    $columns = array_keys($data);
    $placeholders = implode(',', array_fill(0, count($columns), '?'));
    $sql = "INSERT INTO transactions (`" . implode('`,`', $columns) . "`) VALUES ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($data));
    return $pdo->lastInsertId();
}

function recordProcessAccountingPosted(PDO $pdo, int $companyId, int $processId, string $date, string $periodType, bool $hasPeriodTypeField): void
{
    try {
        if ($hasPeriodTypeField) {
            $ins = $pdo->prepare("INSERT IGNORE INTO process_accounting_posted (company_id, process_id, posted_date, period_type) VALUES (?, ?, ?, ?)");
            $ins->execute([$companyId, $processId, $date, $periodType]);
        } else {
            $ins = $pdo->prepare("INSERT IGNORE INTO process_accounting_posted (company_id, process_id, posted_date) VALUES (?, ?, ?)");
            $ins->execute([$companyId, $processId, $date]);
        }
    } catch (Throwable $e) {
        logMessage("Failed to record posted status for Process #$processId: " . $e->getMessage(), 'ERROR');
    }
}

/**
 * Main Logic
 */

logMessage("--- Automated Monthly Accounting Process Started ---");

try {
    $today = date('Y-m-d');
    $hasFrequencyCol = hasBankProcessFrequencyColumn($pdo);
    $hasPeriodTypeField = tableHasColumn($pdo, 'process_accounting_posted', 'period_type');

    // Fetch all active bank processes
    $sql = "SELECT bp.*, c.owner_id 
            FROM bank_process bp
            LEFT JOIN company c ON bp.company_id = c.id
            WHERE bp.status = 'active'";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    logMessage("Analyzing " . count($rows) . " active bank processes for $today.");

    $createdStats = 0;

    foreach ($rows as $r) {
        $processId = (int)$r['id'];
        $processLabel = ($r['name'] ?? '') ?: ($r['bank'] ?? "Process #$processId");
        $frequency = $hasFrequencyCol ? ($r['day_start_frequency'] ?? '1st_of_every_month') : '1st_of_every_month';
        $dayStart = $r['day_start'] ?? null;
        $contract = $r['contract'] ?? null;
        $dayEnd = $r['day_end'] ?? null;
        $companyId = (int)$r['company_id'];
        $ownerId = $r['owner_id'];

        logMessage("Checking Process: $processLabel (ID: $processId, Freq: $frequency, Start: " . ($dayStart ?: 'N/A') . ")");

        // 1) Logic for Partial First Month
        if ($frequency === '1st_of_every_month' && !empty($dayStart) && $hasPeriodTypeField) {
            $startDate = date('Y-m-d', strtotime($dayStart));
            if ($today >= $startDate && isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd)) {
                if (!isPartialFirstMonthAlreadyPosted($pdo, $companyId, $processId)) {
                    logMessage(">> Process #$processId: Detected partial first month due.");
                    
                    $partial = partialFirstMonthAmounts($dayStart, (float)$r['cost'], (float)$r['price'], (float)$r['profit']);
                    
                    // Generate transactions
                    $baseTxn = [
                        'company_id' => $companyId,
                        'transaction_date' => $startDate,
                        'transaction_type' => 'WIN',
                        'created_at' => date('Y-m-d H:i:s'),
                        'created_by_owner' => $ownerId,
                        'approval_status' => 'APPROVED',
                        'approved_at' => date('Y-m-d H:i:s'),
                        'approved_by_owner' => $ownerId,
                        'source_bank_process_id' => $processId,
                        'source_bank_process_period_type' => 'partial_first_month'
                    ];

                    if ($r['card_merchant_id'] && $partial['cost'] > 0) {
                        $txn = $baseTxn; $txn['account_id'] = $r['card_merchant_id']; $txn['amount'] = $partial['cost']; 
                        $txn['description'] = "Auto: Buy Price for $processLabel (partial first month)";
                        insertTransaction($pdo, $txn);
                    }
                    if ($r['customer_id'] && $partial['price'] > 0) {
                        $txn = $baseTxn; $txn['account_id'] = $r['customer_id']; $txn['amount'] = $partial['price']; $txn['transaction_type'] = 'LOSE';
                        $txn['description'] = "Auto: Sell Price for $processLabel (partial first month)";
                        insertTransaction($pdo, $txn);
                    }
                    if ($r['profit_account_id'] && $partial['profit'] > 0) {
                        $txn = $baseTxn; $txn['account_id'] = $r['profit_account_id']; $txn['amount'] = $partial['profit'];
                        $txn['description'] = "Auto: Profit for $processLabel (partial first month)";
                        insertTransaction($pdo, $txn);
                    }

                    recordProcessAccountingPosted($pdo, $companyId, $processId, $startDate, 'partial_first_month', true);
                    logMessage(">> Process #$processId: Partial first month bill generated.");
                    $createdStats++;
                }
            }
        }

        // 2) Logic for Regular Monthly Billing
        $needRegular = false;
        $billingMonthYm = null;
        $ledgerDate = $today;

        if ($frequency === '1st_of_every_month') {
            try {
                $cur = new DateTimeImmutable($today);
                $firstOf = $cur->modify('first day of this month')->format('Y-m-d');
                $y = (int)date('Y', strtotime($firstOf));
                $mo = (int)date('n', strtotime($firstOf));
                
                // If there's a dayStart, regular billing only starts FROM "first day of next month" relative to dayStart
                $canStartRegular = true;
                if (!empty($dayStart)) {
                    $firstAccountingDate = date('Y-m-d', strtotime('first day of next month', strtotime($dayStart)));
                    if ($today < $firstAccountingDate) $canStartRegular = false;
                }

                if ($canStartRegular && $today >= $firstOf && isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd)) {
                    if (!hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $y, $mo)) {
                        $needRegular = true;
                        $billingMonthYm = "$y-$mo";
                        $ledgerDate = $firstOf;
                    } else {
                        logMessage(">> Process #$processId ($frequency): Already posted/skipped for $y-$mo.");
                    }
                } else {
                    logMessage(">> Process #$processId ($frequency): Not due yet or outside window.");
                }
            } catch (Throwable $e) {}
        } else {
            // "Monthly" frequency: day_start - 1
            if (!empty($dayStart)) {
                $startTs = strtotime($dayStart);
                $startDayOfMonth = (int)date('j', $startTs);
                $accountingDay = max(1, $startDayOfMonth - 1);
                
                try {
                    $curIter = new DateTimeImmutable($today);
                    $y = (int)$curIter->format('Y');
                    $mo = (int)$curIter->format('n');
                    $due = calendarMonthDueYmd($y, $mo, $accountingDay);

                    if ($today >= $due && isWithinRecurringBillingWindow($today, $dayStart, $contract, $dayEnd)) {
                        if (!hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $y, $mo)) {
                            $needRegular = true;
                            $billingMonthYm = "$y-$mo";
                            $ledgerDate = $due;
                        } else {
                            logMessage(">> Process #$processId ($frequency): Already posted/skipped for $y-$mo.");
                        }
                    } else {
                        logMessage(">> Process #$processId ($frequency): Not due yet (due on $due).");
                    }
                } catch (Throwable $e) {}
            }
        }

        if ($needRegular) {
            logMessage(">> Process #$processId: Detected regular monthly bill due for $billingMonthYm.");
            
            $baseTxn = [
                'company_id' => $companyId,
                'transaction_date' => $ledgerDate,
                'transaction_type' => 'WIN',
                'created_at' => date('Y-m-d H:i:s'),
                'created_by_owner' => $ownerId,
                'approval_status' => 'APPROVED',
                'approved_at' => date('Y-m-d H:i:s'),
                'approved_by_owner' => $ownerId,
                'source_bank_process_id' => $processId,
                'source_bank_process_period_type' => 'monthly'
            ];

            if ($r['card_merchant_id'] && $r['cost'] > 0) {
                $txn = $baseTxn; $txn['account_id'] = $r['card_merchant_id']; $txn['amount'] = $r['cost']; 
                $txn['description'] = "Auto: Buy Price for $processLabel ($billingMonthYm)";
                insertTransaction($pdo, $txn);
            }
            if ($r['customer_id'] && $r['price'] > 0) {
                $txn = $baseTxn; $txn['account_id'] = $r['customer_id']; $txn['amount'] = $r['price']; $txn['transaction_type'] = 'LOSE';
                $txn['description'] = "Auto: Sell Price for $processLabel ($billingMonthYm)";
                insertTransaction($pdo, $txn);
            }
            if ($r['profit_account_id'] && $r['profit'] > 0) {
                $txn = $baseTxn; $txn['account_id'] = $r['profit_account_id']; $txn['amount'] = $r['profit'];
                $txn['description'] = "Auto: Profit for $processLabel ($billingMonthYm)";
                insertTransaction($pdo, $txn);
            }

            recordProcessAccountingPosted($pdo, $companyId, $processId, $ledgerDate, 'monthly', $hasPeriodTypeField);
            logMessage(">> Process #$processId: Regular monthly bill generated for $billingMonthYm.");
            $createdStats++;
        }
    }

    logMessage("Completed. Generated bills for $createdStats processes.");

} catch (Exception $e) {
    logMessage("FATAL ERROR: " . $e->getMessage(), 'CRITICAL');
}

logMessage("--- Automated Monthly Accounting Process Finished ---");