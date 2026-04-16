<?php
$js = file_get_contents('js/ownership-group.js');

// 1. Remove the DOMContentLoaded wrapper that auto-fetches
$js = preg_replace('/document\.addEventListener\(\'DOMContentLoaded\', \(\) => \{(.*?)\}\);/is', '
    window.initGroupEarnings = function() { 
        if(window._geInitialized) return; 
        window._geInitialized = true; 
        fetchCompanies(); // this is the cloned function name inside our IIFE
    };
    $1
', $js);

// 2. Wrap the whole file in an IIFE to scope the function names so they don't overwrite ownership.js
$js = "(function() {\n" . $js . "\n})();";

file_put_contents('js/ownership-group.js', $js);
echo "IIFE applied";
