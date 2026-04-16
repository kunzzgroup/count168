<?php
$js = file_get_contents('js/ownership-group.js');

// 1. Where the card is created, add logic for group equity
$findCreateCard = "const frag = tpl.card().content.cloneNode(true);
    const card = frag.querySelector('.own-card');
    card.dataset.id = groupId;";

$replaceCreateCard = "const frag = tpl.card().content.cloneNode(true);
    const card = frag.querySelector('.own-card');
    card.dataset.id = groupId;

    // --- Group Equity Binding ---
    if (!geGroupStates[groupId].equity_percentage) geGroupStates[groupId].equity_percentage = 0;
    const eqInput = $(card, 'group-equity-input');
    const eqSlider = $(card, 'group-equity-slider');
    if (eqInput && eqSlider) {
        let currentEq = geGroupStates[groupId].equity_percentage;
        eqInput.value = currentEq + '%';
        eqSlider.value = currentEq;

        const syncEq = (val) => {
            let num = parseFloat(val);
            if (isNaN(num)) num = 0;
            if (num < 0) num = 0;
            if (num > 100) num = 100;
            const finalVal = parseFloat(num.toFixed(2));
            geGroupStates[groupId].equity_percentage = finalVal;
            eqInput.value = finalVal + '%';
            eqSlider.value = finalVal;
        };

        eqSlider.addEventListener('input', (e) => syncEq(e.target.value));
        eqInput.addEventListener('change', (e) => syncEq(e.target.value.replace('%', '')));
    }
    // ----------------------------";

$js = str_replace($findCreateCard, $replaceCreateCard, $js);

// 2. Where initialization occurs, init geGroupStates equity
$findInitState = "geGroupStates[groupId] = {
            accounts: groupData ? groupData.accounts.map(a => ({...a, originalId: a.account_id})) : [],
            partner: partnerObj ? {...partnerObj} : null,
            removedPartner: false
        };";

$replaceInitState = "geGroupStates[groupId] = {
            equity_percentage: geGroupEquityMap[groupId] !== undefined ? geGroupEquityMap[groupId] : 0,
            accounts: groupData ? groupData.accounts.map(a => ({...a, account_id: a.id, originalId: a.id})) : [],
            partner: partnerObj ? {...partnerObj} : null,
            removedPartner: false
        };";
$js = str_replace($findInitState, $replaceInitState, $js);

// 3. Update the load function to fetch equities
$findInitCall = "geActiveGroupFilter = null;";
$replaceInitCall = "window.geGroupEquityMap = {}; window.geRawGroups = {};\n    geActiveGroupFilter = null;";
$js = str_replace($findInitCall, $replaceInitCall, $js);

// 4. In `saveGroup` (formerly saveCompany), we must pass the equity_percentage to backend
$findSavePayload = "const payload = {
        group_id: groupId,
        accounts: accsToSave,
        remove_partner: st.removedPartner
    };";

$replaceSavePayload = "const payload = {
        group_id: groupId,
        equity_percentage: st.equity_percentage,
        accounts: accsToSave,
        remove_partner: st.removedPartner
    };";
$js = str_replace($findSavePayload, $replaceSavePayload, $js);

file_put_contents('js/ownership-group.js', $js);
echo "JS PATCHED";
