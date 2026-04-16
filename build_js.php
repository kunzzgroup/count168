<?php
$js = file_get_contents('js/ownership.js');

// Because we're loading both files on the same page, we need to scope them or rename ALL globals heavily.
// Wrapping the whole file in an IIFE would scope the variables, but some might be relied upon globally?
// "allCompaniesData", "allGroupIds" etc are global in ownership.js
// Let's wrap ownership-group.js in an IIFE and pass window variables if needed, OR uniquely prefix them.

$replacements = [
    // Global variable renaming to avoid conflict
    'companiesData' => 'geGroupsData',
    'allCompaniesData' => 'geAllGroupIds', // wait, api returns just 'groups' under 'data'
    'companyStates' => 'geGroupStates',
    'currentlyExpandedId' => 'geCurrentlyExpandedId',
    'allGroupIds' => 'geUniqueGroupIds',
    'draggedRowIdx' => 'geDraggedRowIdx',
    'draggedCompanyId' => 'geDraggedGroupId',
    'selectedCompanyIds' => 'geSelectedGroupIds',
    'selectionMode' => 'geSelectionMode',
    'activeGroupFilter' => 'geActiveGroupFilter',

    // API endpoints
    'get_companies_api.php?all=1' => 'get_group_ownership_api.php',
    'save_ownership_api.php' => 'save_group_ownership_api.php',
    'link_partner_api.php' => 'link_group_partner_api.php',

    // DOM containers
    'companyCardsContainer' => 'groupCardsContainer',
    'tpl-company-card' => 'tpl-group-card',

    // Text & Function names
    'companyId' => 'groupId',
    'Company' => 'Group',
    // In PHP from JS: "data.group" or "data.groups"
];

foreach ($replacements as $find => $replace) {
    if (strpos($js, $find) !== false) {
        $js = str_replace($find, $replace, $js);
    }
}

// Special fixes
// get_group_ownership_api.php returns { data: { equities: {}, groups: {} } }
// Instead of allCompaniesData, we need it to parse the new structure
$js = str_replace(
    "geAllGroupIds = res.data;",
    "geAllGroupIds = Object.keys(res.data.groups).map(k => ({id: k, name: k, group_id: k})); geGroupEquityMap = res.data.equities; geRawGroups = res.data.groups;",
    $js
);

file_put_contents('js/ownership-group.js', $js);
echo "OK JS rewritten";
