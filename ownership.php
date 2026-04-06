<?php
// require_once 'session_check.php';
// For development/debugging, if session_check isn't included in all files cleanly, we make sure session is started.
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
if (!isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit();
}

// Do not cache
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$assetVer = function ($file) {
    $path = __DIR__ . '/' . $file;
    return file_exists($path) ? filemtime($path) : time();
};
?>
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Ownership</title>
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/ownership.css?v=<?php echo $assetVer('css/ownership.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
</head>
<body>
    <?php include 'sidebar.php'; ?>
    
    <div class="own-container">
        <h1 class="own-page-title">Account Ownership</h1>
        <div class="own-separator-line"></div>
        
        <!-- Company Grid (Populated by JS) -->
        <div class="own-company-grid" id="companyGrid">
            <!-- Loader -->
            <div class="own-loader-container" style="grid-column: 1 / -1;">
                <div class="own-loader"></div>
            </div>
        </div>
    </div>

    <!-- Allocation Modal -->
    <div id="allocationModal" class="own-modal-overlay">
        <div class="own-modal-content">
            <div class="own-modal-header">
                <h2 class="own-modal-title" id="modalCompanyTitle">Company Allocation</h2>
                <button class="own-modal-close" onclick="closeAllocationModal()">&times;</button>
            </div>
            <div class="own-modal-body">
                
                <form id="allocationForm" class="own-allocation-form" onsubmit="saveAllocation(event)">
                    <input type="hidden" id="allocCompanyId">
                    <div class="own-form-title">Assign Ownership</div>
                    <div class="own-form-row">
                        <div class="own-form-group" style="flex: 2;">
                            <label for="allocAccountId">Select Account</label>
                            <select id="allocAccountId" required>
                                <option value="">-- Select Account --</option>
                            </select>
                        </div>
                        <div class="own-form-group" style="flex: 1;">
                            <label for="allocPercentage">Percentage (%)</label>
                            <input type="number" id="allocPercentage" min="0.01" max="100" step="0.01" placeholder="e.g. 50" required>
                        </div>
                        <div class="own-form-group" style="flex: 0 0 auto;">
                            <button type="submit" class="own-btn own-btn-primary" id="saveAllocBtn">Add</button>
                        </div>
                    </div>
                </form>

                <div class="own-owners-list-container">
                    <div class="own-owners-list-title">Current Owners</div>
                    
                    <div class="own-company-progress-container" style="margin-bottom: 20px;">
                        <div class="own-company-progress-bar" id="modalProgressBar" style="width: 0%"></div>
                    </div>
                    <div class="own-company-stats" id="modalProgressStats" style="margin-top: -15px; margin-bottom: 20px;">0% Allocated</div>

                    <table class="own-owners-table">
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Percentage</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="ownersTableBody">
                            <!-- Owners appended here -->
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    </div>

    <!-- Toast Notification Container -->
    <div id="ownToast" class="own-toast">
        <div id="ownToastIcon"></div>
        <div id="ownToastMessage"></div>
    </div>

    <script src="js/ownership.js?v=<?php echo $assetVer('js/ownership.js'); ?>"></script>
</body>
</html>
