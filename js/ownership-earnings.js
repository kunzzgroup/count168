let groupEarningsData = [];
let globalAccounts = [];
let groupStates = {};
let currentlyExpandedGroupId = null;

const groupTpl = {
    card: () => document.getElementById('tpl-group-card'),
    row: () => document.getElementById('tpl-account-row')
};

document.addEventListener('DOMContentLoaded', () => {
    fetchGlobalAccounts().then(() => {
        fetchGroupEarnings();
    });
});

function fetchGlobalAccounts() {
    return fetch('api/ownership/get_available_accounts_api.php')
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success') {
                globalAccounts = res.data;
            }
        }).catch(err => console.error(err));
}

function fetchGroupEarnings() {
    const container = document.getElementById('groupCardsContainer');
    const wrapper = document.getElementById('groupEarningsWrapper');
    if (!container || !wrapper) return;

    container.innerHTML = '';
    const loaderWrap = document.createElement('div');
    loaderWrap.className = 'own-loader-container';
    loaderWrap.appendChild(document.createElement('div')).className = 'own-loader';
    container.appendChild(loaderWrap);

    fetch('api/ownership/get_group_ownership_api.php')
        .then(r => r.json())
        .then(res => {
            if (res.status !== 'success') {
                if (typeof showToast === 'function') showToast(res.message || 'Failed to load group earnings', 'error');
                return;
            }
            groupEarningsData = res.data;
            if (groupEarningsData.length > 0) {
                wrapper.style.display = 'block';
                renderGroupCards();
            } else {
                wrapper.style.display = 'none';
            }
        })
        .catch(err => {
            console.error(err);
            if (typeof showToast === 'function') showToast('Failed to fetch group earnings', 'error');
        });
}

function renderGroupCards() {
    const container = document.getElementById('groupCardsContainer');
    container.innerHTML = '';

    groupEarningsData.forEach(group => {
        const id = group.group_id;
        const eqPercent = parseFloat(group.equity_percentage) || 0;
        
        // Sum up the account percentages
        let totalAllocated = 0;
        if (group.accounts) {
            group.accounts.forEach(acc => {
                totalAllocated += parseFloat(acc.percentage) || 0;
            });
        }
        
        const remaining = Math.max(0, 100 - eqPercent);

        const frag = groupTpl.card().content.cloneNode(true);
        const card = frag.querySelector('.own-card');
        card.id = `group-card-${id}`;

        $(card, 'name').textContent = id;
        
        const pctEl = $(card, 'percent');
        pctEl.textContent = `${eqPercent}%`;
        pctEl.id = `group-header-percent-${id}`;

        const remEl = $(card, 'remaining');
        remEl.textContent = `${remaining}% Remaining`; // Represents remaining out of 100 for the group equity itself? Or just mimicking company card.
        remEl.id = `group-header-remain-${id}`;

        const barEl = $(card, 'bar');
        barEl.style.width = `${Math.min(eqPercent, 100)}%`;
        barEl.id = `group-header-bar-${id}`;

        // Body IDs
        $(card, 'body').id = `group-card-body-${id}`;
        $(card, 'loader').id = `group-loader-${id}`;
        $(card, 'editor').id = `group-editor-${id}`;
        $(card, 'rows-container').id = `group-rows-container-${id}`;
        $(card, 'warning').id = `group-warning-${id}`;
        $(card, 'warning-msg').id = `group-warning-msg-${id}`;
        $(card, 'footer-remain').id = `group-footer-remain-${id}`;
        $(card, 'confirm-btn').id = `group-confirm-btn-${id}`;
        
        // Group Equity Setter IDs
        const eqInput = $(card, 'group-eq-input');
        const eqSlider = $(card, 'group-eq-slider');
        eqInput.id = `group-eq-input-${id}`;
        eqSlider.id = `group-eq-slider-${id}`;
        
        eqInput.value = `${eqPercent}%`;
        eqSlider.value = eqPercent;
        
        eqSlider.addEventListener('input', () => {
            const val = parseFloat(eqSlider.value) || 0;
            eqInput.value = `${val}%`;
            if (typeof applySliderBackground === 'function') applySliderBackground(eqSlider);
            groupStates[id].equity_percentage = val;
            updateGroupHeaderDisplay(id, val);
        });
        
        eqInput.addEventListener('change', () => {
            let val = parseFloat(eqInput.value.replace('%', ''));
            if (isNaN(val)) val = 0;
            val = Math.max(0, Math.min(100, val));
            eqInput.value = `${val}%`;
            eqSlider.value = val;
            if (typeof applySliderBackground === 'function') applySliderBackground(eqSlider);
            groupStates[id].equity_percentage = val;
            updateGroupHeaderDisplay(id, val);
        });

        requestAnimationFrame(() => {
            if (typeof applySliderBackground === 'function') applySliderBackground(eqSlider);
        });

        // Event delegation for actions
        card.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            e.stopPropagation();
            switch (action) {
                case 'toggle-group': toggleGroupCard(id); break;
                case 'add-group-row': addGroupAccountRow(id); break;
                case 'cancel-group': cancelGroupEdit(id); break;
                case 'confirm-group': confirmGroupEdit(id); break;
            }
        });

        container.appendChild(frag);
    });
}

function updateGroupHeaderDisplay(id, eqPercent) {
    const pctEl = document.getElementById(`group-header-percent-${id}`);
    const remEl = document.getElementById(`group-header-remain-${id}`);
    const barEl = document.getElementById(`group-header-bar-${id}`);

    if (pctEl) pctEl.textContent = `${eqPercent}%`;
    if (remEl) {
        if (eqPercent > 100) {
            remEl.textContent = 'Over limit!';
            remEl.classList.add('own-over-limit');
            if (barEl) barEl.classList.add('own-bar-danger');
        } else {
            remEl.textContent = `${(100 - eqPercent).toFixed(2)}% Remaining`;
            remEl.classList.remove('own-over-limit');
            if (barEl) barEl.classList.remove('own-bar-danger');
        }
    }
    if (barEl) barEl.style.width = `${Math.min(eqPercent, 100)}%`;
}

function toggleGroupCard(id) {
    const card = document.getElementById(`group-card-${id}`);
    const isExpanded = card.classList.contains('expanded');

    if (!isExpanded && currentlyExpandedGroupId && currentlyExpandedGroupId !== id) {
        cancelGroupEdit(currentlyExpandedGroupId, true);
    }

    if (isExpanded) {
        cancelGroupEdit(id, true);
    } else {
        card.classList.add('expanded');
        currentlyExpandedGroupId = id;
        loadGroupData(id);
    }
}

function loadGroupData(id) {
    const loader = document.getElementById(`group-loader-${id}`);
    const editor = document.getElementById(`group-editor-${id}`);
    loader.style.display = 'none'; // Data is already fetched
    editor.classList.remove('own-editor-hidden');
    
    const groupData = groupEarningsData.find(g => g.group_id === id);
    
    groupStates[id] = {
        equity_percentage: parseFloat(groupData.equity_percentage) || 0,
        rows: (groupData.accounts || []).map(o => ({
            account_id: o.account_id,
            percentage: parseFloat(o.percentage)
        }))
    };
    
    // reset eq states to bound data
    const eqInput = document.getElementById(`group-eq-input-${id}`);
    const eqSlider = document.getElementById(`group-eq-slider-${id}`);
    eqInput.value = `${groupStates[id].equity_percentage}%`;
    eqSlider.value = groupStates[id].equity_percentage;
    if (typeof applySliderBackground === 'function') applySliderBackground(eqSlider);

    renderGroupCardBodyRows(id);
}

function cancelGroupEdit(id, forceCollapse = false) {
    document.getElementById(`group-card-${id}`).classList.remove('expanded');
    if (currentlyExpandedGroupId === id) currentlyExpandedGroupId = null;

    const groupData = groupEarningsData.find(g => g.group_id === id);
    if (groupData) {
        updateGroupHeaderDisplay(id, parseFloat(groupData.equity_percentage) || 0);
    }
}

function renderGroupCardBodyRows(id) {
    const container = document.getElementById(`group-rows-container-${id}`);
    container.innerHTML = '';

    groupStates[id].rows.forEach((row, idx) => {
        container.appendChild(createGroupRowElement(id, idx, row));
    });

    updateGroupCalculations(id);
}

function createGroupRowElement(id, idx, rowData) {
    const frag = groupTpl.row().content.cloneNode(true);
    const div = frag.querySelector('.own-account-row');
    div.dataset.index = idx;

    // Populate account select
    const select = $(div, 'account-select');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- SELECT ACCOUNT --';
    select.appendChild(defaultOpt);

    globalAccounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;  
        // Fallback name rendering
        const mainStr = parseInt(acc.is_main_owner) === 1 ? ' - Main' : '';
        opt.textContent = `${acc.account_name} (${acc.name})${mainStr}`;
        if (acc.id == rowData.account_id || acc.account_name == rowData.account_id) opt.selected = true;
        select.appendChild(opt);
    });
    
    select.addEventListener('change', () => {
        groupStates[id].rows[idx].account_id = select.value;
    });

    // Percentage input
    const input = $(div, 'percent-input');
    input.value = `${rowData.percentage}%`;
    input.id = `group-input-${id}-${idx}`;
    input.addEventListener('change', () => {
        let pct = parseFloat(input.value.replace('%', ''));
        if (isNaN(pct)) pct = 0;
        pct = Math.max(0, Math.min(100, pct));
        input.value = `${pct}%`;
        document.getElementById(`group-slider-${id}-${idx}`).value = pct;
        if (typeof applySliderBackground === 'function') applySliderBackground(document.getElementById(`group-slider-${id}-${idx}`));
        groupStates[id].rows[idx].percentage = pct;
        updateGroupCalculations(id);
    });

    // Slider
    const slider = $(div, 'slider');
    slider.value = rowData.percentage;
    slider.id = `group-slider-${id}-${idx}`;
    slider.addEventListener('input', () => {
        const pct = parseFloat(slider.value) || 0;
        document.getElementById(`group-input-${id}-${idx}`).value = `${pct}%`;
        if (typeof applySliderBackground === 'function') applySliderBackground(slider);
        groupStates[id].rows[idx].percentage = pct;
        updateGroupCalculations(id);
    });

    // Readonly badge - hide in group earnings 
    const badge = $(div, 'read-only-badge');
    if (badge) badge.style.display = 'none';

    // Action buttons
    div.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        switch (action) {
            case 'delete': 
                groupStates[id].rows.splice(idx, 1);
                renderGroupCardBodyRows(id);
                break;
        }
    });

    requestAnimationFrame(() => {
        if (typeof applySliderBackground === 'function') applySliderBackground(slider);
    });

    // Drag drops simply not fully wired for simplicity, we can just let users delete & add
    const dragHandle = div.querySelector('.own-drag-handle');
    if (dragHandle) {
        dragHandle.style.cursor = 'default';
        dragHandle.style.opacity = '0.3';
    }

    return frag;
}

function addGroupAccountRow(id) {
    groupStates[id].rows.push({ account_id: '', percentage: 0 });
    renderGroupCardBodyRows(id);
}

function updateGroupCalculations(id) {
    const total = groupStates[id].rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);

    const remaining = 100 - total;
    const footerRm = document.getElementById(`group-footer-remain-${id}`);
    const warningBadge = document.getElementById(`group-warning-${id}`);
    const confirmBtn = document.getElementById(`group-confirm-btn-${id}`);

    if (total > 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge own-warning-error';
        warningBadge.children[0].textContent = '❌';
        warningBadge.children[1].textContent = 'Total accounts exceed 100%!';
        if (footerRm) footerRm.textContent = `${Math.abs(remaining).toFixed(2)}% Over Allocated inside account config`;
        confirmBtn.disabled = true;
    } else if (total < 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge';
        warningBadge.children[0].textContent = '⚠️';
        warningBadge.children[1].textContent = 'Total accounts is less than 100%';
        if (footerRm) footerRm.textContent = `${remaining.toFixed(2)}% Unallocated`;
        confirmBtn.disabled = false;
    } else {
        warningBadge.style.display = 'none';
        if (footerRm) footerRm.textContent = 'Account Config Fully Allocated';
        confirmBtn.disabled = false;
    }
}

function confirmGroupEdit(id) {
    const rows = groupStates[id].rows;
    let total = 0;
    let hasError = false;

    rows.forEach(r => {
        if (!r.account_id) {
            hasError = true;
            if (typeof showToast === 'function') showToast('Please select an account for all rows.', 'error');
        }
        total += parseFloat(r.percentage);
    });

    if (total > 100) { 
        if (typeof showToast === 'function') showToast('Total account percentage exceeds 100%', 'error'); 
        return; 
    }
    if (hasError) return;

    const accIds = rows.map(r => r.account_id);
    if (accIds.some((item, idx) => accIds.indexOf(item) !== idx)) {
        if (typeof showToast === 'function') showToast('Duplicate accounts detected. Please combine them.', 'error');
        return;
    }

    const payload = {
        group_id: id,
        equity_percentage: groupStates[id].equity_percentage,
        accounts: rows.map(r => ({
            account_id: r.account_id,
            percentage: parseFloat(r.percentage)
        }))
    };

    const confirmBtn = document.getElementById(`group-confirm-btn-${id}`);
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    fetch('api/ownership/save_group_ownership_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
        if (res.status === 'success') {
            if (typeof showToast === 'function') showToast(res.message, 'success');
            const groupDataIdx = groupEarningsData.findIndex(g => g.group_id === id);
            if (groupDataIdx >= 0) {
                groupEarningsData[groupDataIdx].equity_percentage = payload.equity_percentage;
                groupEarningsData[groupDataIdx].accounts = payload.accounts;
            }
            cancelGroupEdit(id, true);
        } else {
            if (typeof showToast === 'function') showToast(res.message, 'error');
        }
    })
    .catch(err => {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
        console.error(err);
        if (typeof showToast === 'function') showToast('Server error', 'error');
    });
}
