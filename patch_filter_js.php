<?php
$js = file_get_contents('js/ownership-group.js');
$js = preg_replace('/function _buildGroupFilterBar\(\) \{.*?\}/s', 'function _buildGroupFilterBar() { /* disabled for group view */ }', $js);
$js = preg_replace("/document\.getElementById\('own-group-filter-bar'\)/s", "null", $js);
$js = preg_replace("/document\.getElementById\('own-select-mode-btn'\)/s", "null", $js);
$js = str_replace("_buildGroupFilterBar();", "/* disabled */", $js);
$js = str_replace("document.querySelectorAll('.own-gfb-btn')", "[]", $js);
file_put_contents('js/ownership-group.js', $js);
echo "Filter Bar disabled for clone.";
