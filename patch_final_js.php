<?php
$js = file_get_contents('js/ownership-group.js');
$js = preg_replace('/fetch\(\`api\/ownership\/get_available_accounts_api\.php\?company_id=\$\{groupId\}\`\)/is', 'fetch(\'api/ownership/get_available_accounts_api.php\')', $js);
$js = preg_replace('/fetch\(\`api\/ownership\/get_owners_api\.php\?company_id=\$\{groupId\}\`\)/is', 'Promise.resolve({json:()=>({status:"success", data:[]})})', $js);

// Hide Group buttons in Group Earnings tab since they are Groups themselves
$js = preg_replace('/const joinBtn = document.createElement\(\'button\'\);.*?joinBtn\.addEventListener.*?ungroupBtn\.addEventListener.*?\}/is', '
    const joinBtn = document.createElement("button");
    const ungroupBtn = document.createElement("button");
    joinBtn.style.display = "none";
    ungroupBtn.style.display = "none";
', $js);

file_put_contents('js/ownership-group.js', $js);
echo "Final JS Patched.";
