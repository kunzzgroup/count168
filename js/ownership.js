document.addEventListener('DOMContentLoaded', () => {
    fetchCompanies();
});

let companiesData = [];
let companyStates = {};
let currentlyExpandedId = null;

let draggedRowIdx = null;
let draggedCompanyId = null;

// Template references (cached on first use)
const tpl = {
    card: () => document.getElementById('tpl-company-card'),
    row: () => document.getElementById('tpl-account-row')
};

// Helper: query inside a cloned template fragment by data-bind
function $(el, bind) {
    return el.querySelector(`[data-bind="${bind}"]`);
}

// ---------------------------------------------
// Data Fetching
// ---------------------------------------------

function fetchCompanies() {
    const container = document.getElementById('companyCardsContainer');
    container.textContent = '';
    const loaderWrap = document.createElement('div');
    loaderWrap.className = 'own-loader-container';
    loaderWrap.appendChild(document.createElement('div')).className = 'own-loader';
    container.appendChild(loaderWrap);

    fetch('api/ownership/get_companies_api.php')
        .then(res => res.json())
        .then(res => {
            if (res.status === 'success') {
                companiesData = res.data;
                renderCompanyCards();
            } else {
                showToast(res.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to fetch companies', 'error');
        });
}

// ---------------------------------------------
// Card Rendering (template-based)
// ---------------------------------------------

function renderCompanyCards() {
    const container = document.getElementById('companyCardsContainer');
    container.innerHTML = '';

    if (companiesData.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'own-empty-state';
        empty.textContent = 'No companies found.';
        container.appendChild(empty);
        return;
    }

    companiesData.forEach(comp => {
        const alloc = parseFloat(comp.allocated_percentage) || 0;
        const remaining = Math.max(0, 100 - alloc);
        const id = comp.id;

        // Clone card template
        const frag = tpl.card().content.cloneNode(true);
        const card = frag.querySelector('.own-card');
        card.id = `card-${id}`;

        // Fill data bindings
        $(card, 'name').textContent = comp.name;
        
        const dateEl = $(card, 'date');
        if (dateEl) {
            if (comp.expiration_date) {
                const expStr = comp.expiration_date.split(' ')[0];
                dateEl.textContent = `Exp: ${expStr}`;
            } else {
                dateEl.textContent = '';
            }
        }
        const pctEl = $(card, 'percent');
        pctEl.textContent = `${alloc}%`;
        pctEl.id = `header-percent-${id}`;

        const remEl = $(card, 'remaining');
        remEl.textContent = `${remaining}% Remaining`;
        remEl.id = `header-remain-${id}`;

        const barEl = $(card, 'bar');
        barEl.style.width = `${Math.min(alloc, 100)}%`;
        barEl.id = `header-bar-${id}`;

        // Body IDs
        $(card, 'body').id = `card-body-${id}`;
        $(card, 'loader').id = `loader-${id}`;
        $(card, 'editor').id = `editor-${id}`;
        $(card, 'rows-container').id = `rows-container-${id}`;
        $(card, 'partner-input').id = `partner-login-${id}`;
        $(card, 'warning').id = `warning-${id}`;
        $(card, 'warning-msg').id = `warning-msg-${id}`;
        $(card, 'footer-remain').id = `footer-remain-${id}`;
        $(card, 'confirm-btn').id = `confirm-btn-${id}`;

        // Bind actions via event delegation
        card.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            e.stopPropagation();
            switch (action) {
                case 'toggle': toggleCard(id, e); break;
                case 'add-row': addAccountRow(id); break;
                case 'cancel': cancelEdit(id); break;
                case 'confirm': confirmEdit(id); break;
                case 'link-partner': linkExternalPartner(id, e); break;
            }
        });

        container.appendChild(frag);
    });
}

// ---------------------------------------------
// Card Toggle & Data Loading
// ---------------------------------------------

function toggleCard(companyId, event) {
    const card = document.getElementById(`card-${companyId}`);
    const isExpanded = card.classList.contains('expanded');

    if (!isExpanded && currentlyExpandedId && currentlyExpandedId !== companyId) {
        cancelEdit(currentlyExpandedId, true);
    }

    if (isExpanded) {
        cancelEdit(companyId, true);
    } else {
        card.classList.add('expanded');
        currentlyExpandedId = companyId;
        loadCompanyData(companyId);
    }
}

function loadCompanyData(companyId) {
    const loader = document.getElementById(`loader-${companyId}`);
    const editor = document.getElementById(`editor-${companyId}`);
    loader.style.display = 'flex';
    editor.classList.add('own-editor-hidden');

    Promise.all([
        fetch(`api/ownership/get_available_accounts_api.php?company_id=${companyId}`).then(r => r.json()),
        fetch(`api/ownership/get_owners_api.php?company_id=${companyId}`).then(r => r.json())
    ]).then(([accountsRes, ownersRes]) => {
        loader.style.display = 'none';
        editor.classList.remove('own-editor-hidden');

        companyStates[companyId] = {
            accounts: accountsRes.status === 'success' ? accountsRes.data : [],
            rows: (ownersRes.status === 'success' ? ownersRes.data : []).map(o => ({
                account_id: o.account_id,
                percentage: parseFloat(o.percentage),
                role: o.role || '',
                user_raw_id: o.user_raw_id || null,
                ownership_id: o.ownership_id || null,
                is_external_partner: parseInt(o.is_external_partner) === 1,
                read_only: o.read_only !== null && o.read_only !== undefined ? parseInt(o.read_only) : 1
            }))
        };

        renderCardBodyRows(companyId);
    }).catch(err => {
        console.error(err);
        showToast('Error loading data', 'error');
        loader.style.display = 'none';
    });
}

function cancelEdit(companyId, forceCollapse = false) {
    document.getElementById(`card-${companyId}`).classList.remove('expanded');
    if (currentlyExpandedId === companyId) currentlyExpandedId = null;

    const compIdx = companiesData.findIndex(c => parseInt(c.id) === companyId);
    if (compIdx >= 0) {
        updateCardHeaderDisplay(companyId, parseFloat(companiesData[compIdx].allocated_percentage) || 0);
    }
}

// ---------------------------------------------
// Row Rendering (template-based)
// ---------------------------------------------

function renderCardBodyRows(companyId) {
    const container = document.getElementById(`rows-container-${companyId}`);
    container.innerHTML = '';

    companyStates[companyId].rows.forEach((row, idx) => {
        container.appendChild(createRowElement(companyId, idx, row));
    });

    updateCalculations(companyId);
}

function createRowElement(companyId, idx, rowData) {
    const frag = tpl.row().content.cloneNode(true);
    const div = frag.querySelector('.own-account-row');
    div.dataset.index = idx;

    // Populate account select
    const select = $(div, 'account-select');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- SELECT ACCOUNT --';
    select.appendChild(defaultOpt);

    companyStates[companyId].accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${acc.account_name} (${acc.name})`;
        if (acc.id == rowData.account_id) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => updateRowData(companyId, idx, 'account_id', select.value));

    // Percentage input
    const input = $(div, 'percent-input');
    input.value = `${rowData.percentage}%`;
    input.id = `input-${companyId}-${idx}`;
    input.addEventListener('change', () => updateSliderFromInput(companyId, idx, input.value));

    // Slider
    const slider = $(div, 'slider');
    slider.value = rowData.percentage;
    slider.id = `slider-${companyId}-${idx}`;
    slider.addEventListener('input', () => updateInputFromSlider(companyId, idx, slider.value));

    // Action buttons (via event delegation — only delete now)
    div.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        switch (action) {
            case 'delete': removeRow(companyId, idx); break;
        }
    });

    // Read Only toggle: show for Partnership users OR External Partners
    const badge = $(div, 'read-only-badge');
    const roCheck = $(div, 'read-only-check');

    const isPartnership = (rowData.role || '').toLowerCase() === 'partnership';
    const showToggle = isPartnership || rowData.is_external_partner;

    if (badge && roCheck) {
        badge.style.display = 'flex';
        badge.style.visibility = showToggle ? 'visible' : 'hidden';

        if (showToggle) {
            roCheck.checked = rowData.read_only === 1;

            roCheck.addEventListener('change', () => {
                companyStates[companyId].rows[idx].read_only = roCheck.checked ? 1 : 0;
                // Immediate API call removed, this will be saved on confirm
            });
        }
    }

    // Initialize slider gradient
    requestAnimationFrame(() => applySliderBackground(slider));

    // Drag and drop logic
    const dragHandle = div.querySelector('.own-drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('mousedown', () => div.setAttribute('draggable', 'true'));
        dragHandle.addEventListener('mouseup', () => div.removeAttribute('draggable'));
        dragHandle.addEventListener('mouseleave', () => div.removeAttribute('draggable'));
    }

    div.addEventListener('dragstart', (e) => {
        draggedRowIdx = idx;
        draggedCompanyId = companyId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
        setTimeout(() => div.classList.add('own-dragging'), 0);
    });

    div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedCompanyId !== companyId || draggedRowIdx === idx) return;

        const bounding = div.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        if (e.clientY > offset) {
            div.style.borderBottom = '2px solid var(--own-primary-blue)';
            div.style.borderTop = '';
            div.style.transform = 'translateY(-2px)';
        } else {
            div.style.borderTop = '2px solid var(--own-primary-blue)';
            div.style.borderBottom = '';
            div.style.transform = 'translateY(2px)';
        }
    });

    div.addEventListener('dragleave', () => {
        div.style.borderTop = '';
        div.style.borderBottom = '';
        div.style.transform = '';
    });

    div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.style.borderTop = '';
        div.style.borderBottom = '';
        div.style.transform = '';
        
        if (draggedCompanyId !== companyId || draggedRowIdx === null) return;
        if (draggedRowIdx === idx) return;

        const bounding = div.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        const insertAfter = e.clientY > offset;

        const rows = companyStates[companyId].rows;
        const [movedRow] = rows.splice(draggedRowIdx, 1);
        
        let newIdx = idx;
        if (draggedRowIdx < idx) {
            newIdx = insertAfter ? idx : idx - 1;
        } else {
            newIdx = insertAfter ? idx + 1 : idx;
        }
        
        rows.splice(newIdx, 0, movedRow);
        renderCardBodyRows(companyId);
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('own-dragging');
        div.removeAttribute('draggable');
        draggedRowIdx = null;
        draggedCompanyId = null;
        
        const allRows = document.querySelectorAll(`#rows-container-${companyId} .own-account-row`);
        allRows.forEach(r => {
            r.style.borderTop = '';
            r.style.borderBottom = '';
            r.style.transform = '';
        });
    });

    return frag;
}

// ---------------------------------------------
// Row Data Operations
// ---------------------------------------------

function addAccountRow(companyId) {
    companyStates[companyId].rows.push({ account_id: '', percentage: 0, role: '', user_raw_id: null, read_only: 1 });
    renderCardBodyRows(companyId);
}

function removeRow(companyId, idx) {
    companyStates[companyId].rows.splice(idx, 1);
    renderCardBodyRows(companyId);
}

function updateRowData(companyId, idx, field, value) {
    companyStates[companyId].rows[idx][field] = value;
    if (field === 'percentage') updateCalculations(companyId);
    if (field === 'account_id') {
        // Sync role / user info from accounts list so toggle can detect Partnership
        const acc = companyStates[companyId].accounts.find(a => a.id === value);
        if (acc) {
            companyStates[companyId].rows[idx].role = (acc.role || '').toLowerCase();
            const isUser = String(value).startsWith('U_');
            companyStates[companyId].rows[idx].user_raw_id = isUser ? parseInt(value.replace('U_', '')) : null;
            companyStates[companyId].rows[idx].read_only = 1; // default read-only for new Partnership row
        } else {
            companyStates[companyId].rows[idx].role = '';
            companyStates[companyId].rows[idx].user_raw_id = null;
        }
        renderCardBodyRows(companyId);
    }
}


// ---------------------------------------------
// Slider & Input Sync
// ---------------------------------------------

function updateInputFromSlider(companyId, idx, value) {
    const pct = parseFloat(value) || 0;
    document.getElementById(`input-${companyId}-${idx}`).value = `${pct}%`;
    applySliderBackground(document.getElementById(`slider-${companyId}-${idx}`));
    companyStates[companyId].rows[idx].percentage = pct;
    updateCalculations(companyId);
}

function updateSliderFromInput(companyId, idx, value) {
    let pct = parseFloat(value.replace('%', ''));
    if (isNaN(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));

    document.getElementById(`slider-${companyId}-${idx}`).value = pct;
    document.getElementById(`input-${companyId}-${idx}`).value = `${pct}%`;
    applySliderBackground(document.getElementById(`slider-${companyId}-${idx}`));
    companyStates[companyId].rows[idx].percentage = pct;
    updateCalculations(companyId);
}

function tweakPercentage(companyId, idx, delta) {
    const newPct = Math.max(0, Math.min(100, companyStates[companyId].rows[idx].percentage + delta));
    document.getElementById(`slider-${companyId}-${idx}`).value = newPct;
    updateInputFromSlider(companyId, idx, newPct);
}

function applySliderBackground(slider) {
    if (!slider) return;
    const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--own-primary-blue) ${pct}%, var(--own-gray-border) ${pct}%)`;
}

// ---------------------------------------------
// Calculations & Display Updates
// ---------------------------------------------

function updateCalculations(companyId) {
    const total = companyStates[companyId].rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
    updateCardHeaderDisplay(companyId, total);

    const remaining = 100 - total;
    const footerRm = document.getElementById(`footer-remain-${companyId}`);
    const warningBadge = document.getElementById(`warning-${companyId}`);
    const confirmBtn = document.getElementById(`confirm-btn-${companyId}`);

    if (total > 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge own-warning-error';
        warningBadge.children[0].textContent = '❌';
        warningBadge.children[1].textContent = 'Total exceeds 100%!';
        if (footerRm) footerRm.textContent = `${Math.abs(remaining).toFixed(2)}% Over Allocated`;
        confirmBtn.disabled = true;
    } else if (total < 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge';
        warningBadge.children[0].textContent = '⚠️';
        warningBadge.children[1].textContent = 'Total is less than 100%';
        if (footerRm) footerRm.textContent = `${remaining.toFixed(2)}% Unallocated`;
        confirmBtn.disabled = false;
    } else {
        warningBadge.style.display = 'none';
        if (footerRm) footerRm.textContent = 'Fully Allocated';
        confirmBtn.disabled = false;
    }
}

function updateCardHeaderDisplay(companyId, total) {
    const remainEl = document.getElementById(`header-remain-${companyId}`);
    const pctEl = document.getElementById(`header-percent-${companyId}`);
    const barEl = document.getElementById(`header-bar-${companyId}`);

    if (pctEl) pctEl.textContent = `${total}%`;

    if (remainEl) {
        if (total > 100) {
            remainEl.textContent = 'Over limit!';
            remainEl.classList.add('own-over-limit');
            if (barEl) barEl.classList.add('own-bar-danger');
        } else {
            remainEl.textContent = `${(100 - total).toFixed(2)}% Remaining`;
            remainEl.classList.remove('own-over-limit');
            if (barEl) barEl.classList.remove('own-bar-danger');
        }
    }
    if (barEl) barEl.style.width = `${Math.min(total, 100)}%`;
}

// ---------------------------------------------
// Save / Confirm
// ---------------------------------------------

function confirmEdit(companyId) {
    const rows = companyStates[companyId].rows;
    let total = 0;
    let hasError = false;

    rows.forEach(r => {
        if (!r.account_id) {
            hasError = true;
            showToast('Please select an account for all rows.', 'error');
        }
        total += parseFloat(r.percentage);
    });

    if (total > 100) { showToast('Total percentage exceeds 100%', 'error'); return; }
    if (hasError) return;

    const accIds = rows.map(r => r.account_id);
    if (accIds.some((item, idx) => accIds.indexOf(item) !== idx)) {
        showToast('Duplicate accounts detected. Please combine them.', 'error');
        return;
    }

    const payload = {
        company_id: companyId,
        owners: rows.map(r => ({
            account_id: r.account_id,
            percentage: parseFloat(r.percentage),
            read_only: r.read_only
        }))
    };

    const confirmBtn = document.getElementById(`confirm-btn-${companyId}`);
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    fetch('api/ownership/batch_save_owners_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
        if (res.status === 'success') {
            showToast(res.message, 'success');
            const compIdx = companiesData.findIndex(c => parseInt(c.id) === companyId);
            if (compIdx >= 0) companiesData[compIdx].allocated_percentage = total;
            cancelEdit(companyId, true);
        } else {
            showToast(res.message, 'error');
        }
    })
    .catch(err => {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
        console.error(err);
        showToast('Server error', 'error');
    });
}

// ---------------------------------------------
// Toast
// ---------------------------------------------

let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('ownToast');
    toast.className = 'own-toast own-show ' + (type === 'success' ? 'own-success' : 'own-error');
    document.getElementById('ownToastMessage').textContent = message;

    const iconEl = document.getElementById('ownToastIcon');
    iconEl.textContent = '';
    const tplId = type === 'success' ? 'tpl-toast-success' : 'tpl-toast-error';
    iconEl.appendChild(document.getElementById(tplId).content.cloneNode(true));

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.className = 'own-toast'; }, 3000);
}

// ---------------------------------------------
// External Partner Linking
// ---------------------------------------------

function linkExternalPartner(companyId, event, forceType = '') {
    const loginIdInput = document.getElementById(`partner-login-${companyId}`);
    const loginId = loginIdInput.value.trim();
    if (!loginId) { showToast('Please enter a Login ID/Group ID', 'error'); return; }

    const btn = event.target.closest('[data-action="link-partner"]');
    btn.disabled = true;
    btn.textContent = 'Linking...';

    fetch('api/ownership/add_external_partner_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, login_id: loginId, force_type: forceType })
    })
    .then(res => res.json())
    .then(res => {
        btn.disabled = false;
        btn.textContent = 'Link Partner';
        if (res.status === 'success') {
            showToast(res.message, 'success');
            loginIdInput.value = '';
            cancelEdit(companyId, true);
            setTimeout(() => toggleCard(companyId, null), 300);
        } else if (res.status === 'conflict') {
            showConflictModal(companyId, event, res.data);
        } else {
            showToast(res.message, 'error');
        }
    })
    .catch(err => {
        btn.disabled = false;
        btn.textContent = 'Link Partner';
        console.error(err);
        showToast('Server error', 'error');
    });
}

// ---------------------------------------------
// Conflict Modal
// ---------------------------------------------

function showConflictModal(companyId, event, data) {
    const tpl = document.getElementById('tpl-conflict-modal');
    if (!tpl) return;
    
    const clone = tpl.content.cloneNode(true);
    const overlay = clone.querySelector('.own-modal-overlay');

    // Populate data
    clone.querySelector('[data-bind="login-name"]').textContent = data.login_partner;
    clone.querySelector('[data-bind="group-name"]').textContent = data.group_partner;

    // Attach events
    clone.querySelector('[data-action="choose-login"]').addEventListener('click', () => {
        closeModal();
        linkExternalPartner(companyId, event, 'login');
    });

    clone.querySelector('[data-action="choose-group"]').addEventListener('click', () => {
        closeModal();
        linkExternalPartner(companyId, event, 'group');
    });

    clone.querySelector('[data-action="cancel-conflict"]').addEventListener('click', closeModal);

    function closeModal() {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    document.body.appendChild(overlay);
}
