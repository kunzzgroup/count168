<?php
$html = file_get_contents('ownership.php');
preg_match('/<template id="tpl-company-card">.*?<\/template>/s', $html, $matches);
$tplCompany = $matches[0];
$tplGroup = str_replace('tpl-company-card', 'tpl-group-card', $tplCompany);
$tplGroup = str_replace('own-company-name', 'own-group-name', $tplGroup);
$tplGroup = str_replace('own-company-date', 'own-group-date', $tplGroup);

$equityHtml = '<div class="own-account-row own-equity-row" style="border-bottom: 2px solid var(--own-gray-300); margin-bottom: 12px; padding-bottom: 12px;"><div style="width: 120px; font-weight: 500;">Group Equity %</div><div class="own-ownership-input-group"><input type="text" class="own-percent-input" data-bind="group-equity-input" value="0%"><div class="own-slider-container"><input type="range" class="own-slider" data-bind="group-equity-slider" min="0" max="100" step="1"></div></div></div>';

$tplGroup = str_replace('<div class="own-table-headers">', $equityHtml . "\n" . '<div class="own-table-headers">', $tplGroup);
$html = str_replace('</template>', '</template>' . "\n\n" . $tplGroup, $html);
file_put_contents('ownership.php', $html);
echo "TPL ADDED";
