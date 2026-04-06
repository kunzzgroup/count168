<?php
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
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Ownership</title>
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/ownership.css?v=<?php echo $assetVer('css/ownership.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <style>
        body { background-color: #ffffff; }
    </style>
</head>
<body>
    <?php include 'sidebar.php'; ?>
    
    <div class="own-container">
        <h1 class="own-page-title">ACCOUNT OWNERSHIP</h1>

        <!-- Companies will be injected here via JS -->
        <div id="companyCardsContainer">
            <!-- Loader -->
            <div class="own-loader-container">
                <div class="own-loader"></div>
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
