document.addEventListener('DOMContentLoaded', () => {
    fetchCompanies();
});

let companiesData = [];
// Store state for each company's inline expansion
// Key: company_id, Value: { accounts: [...], owners: [...] }
let companyStates = {};
let currentlyExpandedId = null;

function fetchCompanies() {
    const container = document.getElementById('companyCardsContainer');
    container.innerHTML = '<div class="own-loader-container"><div class="own-loader"></div></div>';

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

function renderCompanyCards() {
    const container = document.getElementById('companyCardsContainer');
    container.innerHTML = '';

    if (companiesData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--own-gray-text); padding: 40px;">No companies found.</div>';
        return;
    }

    companiesData.forEach(comp => {
        // Initial setup
        const alloc = parseFloat(comp.allocated_percentage) || 0;
        const remaining = Math.max(0, 100 - alloc);
        
        let headerRight = `<button class="own-btn-outline" onclick="toggleCard(${comp.id}, event)">Manage</button>
                           <button class="own-icon-btn" onclick="toggleCard(${comp.id}, event)">
                                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                           </button>`;

        const domStr = `
            <div class="own-card" id="card-${comp.id}">
                <div class="own-card-header" style="cursor: pointer;" onclick="toggleCard(${comp.id}, event)">
                    <div class="own-card-header-left">
                        <div class="own-company-name">${comp.name}</div>
                    </div>
                    <div class="own-card-header-middle">
                        <div class="own-allocation-info">
                            <span class="own-allocation-label">Total Allocation</span>
                            <span class="own-allocation-percentage" id="header-percent-${comp.id}">${alloc}%</span>
                            <span class="own-allocation-remaining" id="header-remain-${comp.id}">${remaining}% Remaining</span>
                        </div>
                        <div class="own-progress-bar-container">
                            <div class="own-progress-bar-fill" id="header-bar-${comp.id}" style="width: ${Math.min(alloc, 100)}%;"></div>
                        </div>
                    </div>
                    <div class="own-card-header-right">
                        ${headerRight}
                    </div>
                </div>
                
                <div class="own-card-body" id="card-body-${comp.id}">
                    <div class="own-loader-container" id="loader-${comp.id}"><div class="own-loader"></div></div>
                    <div id="editor-${comp.id}" style="display:none;">
                        <div class="own-table-headers">
                            <div>Account</div>
                            <div>Ownership%</div>
                        </div>
                        
                        <div id="rows-container-${comp.id}"></div>
                        
                        <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 20px;">
                            <button class="own-btn-add-account" onclick="addAccountRow(${comp.id})" style="margin:0;">+ Add Account</button>
                            <div style="display: flex; gap: 8px; align-items: center; border-left: 1px solid var(--own-gray-border); padding-left: 15px;">
                                <input type="text" id="partner-login-${comp.id}" placeholder="Partner Login ID" 
                                       style="padding: 6px 10px; border: 1px solid var(--own-gray-border); border-radius: 4px; font-size: 14px; width: 160px; outline: none; background: white; color: var(--own-primary-text);">
                                <button class="own-btn-outline" style="margin:0; padding: 6px 12px;" onclick="linkExternalPartner(${comp.id}, event)">Link Partner</button>
                            </div>
                        </div>
                        
                        <div class="own-card-footer">
                            <div class="own-footer-left">
                                <div class="own-warning-badge" id="warning-${comp.id}" style="display: none;">
                                    <span>⚠️</span> <span id="warning-msg-${comp.id}">Total is less than 100%</span>
                                </div>
                                <span class="own-unallocated-text" id="footer-remain-${comp.id}">100% Unallocated</span>
                            </div>
                            <div class="own-footer-right">
                                <button class="own-footer-btn own-btn-cancel" onclick="cancelEdit(${comp.id})">Cancel</button>
                                <button class="own-footer-btn own-btn-confirm" id="confirm-btn-${comp.id}" onclick="confirmEdit(${comp.id})">Confirm</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', domStr);
    });
}

function toggleCard(companyId, event) {
    if (event) {
        // Prevent click bubbling up and triggering multiple times if they clicked a button inside the header
        event.stopPropagation();
    }

    const card = document.getElementById(`card-${companyId}`);
    const isExpanded = card.classList.contains('expanded');
    
    // If opening a new one, consider collapsing others (accordion style)
    if (!isExpanded && currentlyExpandedId && currentlyExpandedId !== companyId) {
        cancelEdit(currentlyExpandedId, true); 
    }

    if (isExpanded) {
        // Close it
        cancelEdit(companyId, true);
    } else {
        // Expand and Load Data
        card.classList.add('expanded');
        currentlyExpandedId = companyId;
        
        loadCompanyData(companyId);
    }
}

function loadCompanyData(companyId) {
    const loader = document.getElementById(`loader-${companyId}`);
    const editor = document.getElementById(`editor-${companyId}`);
    loader.style.display = 'flex';
    editor.style.display = 'none';

    // Fetch accounts and existing owners in parallel
    Promise.all([
        fetch(`api/ownership/get_available_accounts_api.php?company_id=${companyId}`).then(r => r.json()),
        fetch(`api/ownership/get_owners_api.php?company_id=${companyId}`).then(r => r.json())
    ]).then(([accountsRes, ownersRes]) => {
        loader.style.display = 'none';
        editor.style.display = 'block';

        let accounts = [];
        if (accountsRes.status === 'success') {
            accounts = accountsRes.data;
        }
        let owners = [];
        if (ownersRes.status === 'success') {
            owners = ownersRes.data;
        }

        // Initialize state
        companyStates[companyId] = {
            accounts: accounts,
            // deep copy rows state to manage in-memory before clicking confirm
            rows: owners.map(o => ({ account_id: o.account_id, percentage: parseFloat(o.percentage) }))
        };

        renderCardBodyRows(companyId);

    }).catch(err => {
        console.error(err);
        showToast('Error loading data', 'error');
        loader.style.display = 'none';
    });
}

function cancelEdit(companyId, forceCollapse = false) {
    const card = document.getElementById(`card-${companyId}`);
    card.classList.remove('expanded');
    if (currentlyExpandedId === companyId) {
        currentlyExpandedId = null;
    }
    // Re-render header to reset bad state if they tweaked sliders
    const compIdx = companiesData.findIndex(c => parseInt(c.id) === companyId);
    if (compIdx >= 0) {
        const origAlloc = parseFloat(companiesData[compIdx].allocated_percentage) || 0;
        updateCardHeaderDisplay(companyId, origAlloc);
    }
}

// ---------------------------------------------
// Row Rendering & Interactivity
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
    const div = document.createElement('div');
    div.className = 'own-account-row';
    div.dataset.index = idx;
    
    // Select HTML
    let selectOptions = `<option value="">-- SELECT ACCOUNT --</option>`;
    companyStates[companyId].accounts.forEach(acc => {
        const selected = acc.id == rowData.account_id ? 'selected' : '';
        selectOptions += `<option value="${acc.id}" ${selected}>${acc.account_name} (${acc.name})</option>`;
    });

    const isExternal = String(rowData.account_id).startsWith('O_');
    const includeGroupHtml = isExternal ? `
        <label style="display:flex; align-items:center; font-size:12px; margin-left:8px; margin-right:4px; color:#555; cursor:pointer; line-height: 1;" title="Share original Group ID with Partner">
            <input type="checkbox" onchange="updateRowData(${companyId}, ${idx}, 'include_group', this.checked ? 1 : 0)" ${rowData.include_group !== 0 ? 'checked' : ''} style="margin-right:2px; vertical-align: middle;">
            Grp
        </label>
    ` : '';

    div.innerHTML = `
        <div class="own-drag-handle">⋮⋮</div>
        <select class="own-account-select" onchange="updateRowData(${companyId}, ${idx}, 'account_id', this.value)">
            ${selectOptions}
        </select>
        
        <div class="own-ownership-input-group">
            <input type="text" class="own-percent-input" value="${rowData.percentage}%" id="input-${companyId}-${idx}" 
                   onchange="updateSliderFromInput(${companyId}, ${idx}, this.value)">
            
            <div class="own-slider-container">
                <input type="range" class="own-slider" id="slider-${companyId}-${idx}" min="0" max="100" step="1" value="${rowData.percentage}" 
                       oninput="updateInputFromSlider(${companyId}, ${idx}, this.value)">
                <div class="own-slider-labels">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                </div>
            </div>
        </div>

        <div class="own-row-actions">
            <button class="own-btn-square" onclick="tweakPercentage(${companyId}, ${idx}, 1)">+</button>
            <button class="own-btn-square" onclick="tweakPercentage(${companyId}, ${idx}, -1)">-</button>
            <button class="own-btn-square own-btn-delete" title="Remove" onclick="removeRow(${companyId}, ${idx})">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
            </button>
            ${includeGroupHtml}
        </div>
    `;

    // Initialize Slider CSS gradient
    requestAnimationFrame(() => {
        applySliderBackground(document.getElementById(`slider-${companyId}-${idx}`));
    });

    return div;
}

function addAccountRow(companyId) {
    companyStates[companyId].rows.push({ account_id: '', percentage: 0, include_group: 1 });
    renderCardBodyRows(companyId);
}

function removeRow(companyId, idx) {
    companyStates[companyId].rows.splice(idx, 1);
    renderCardBodyRows(companyId);
}

function updateRowData(companyId, idx, field, value) {
    companyStates[companyId].rows[idx][field] = value;
    if (field === 'percentage') {
        updateCalculations(companyId);
    }
    if (field === 'account_id') {
        renderCardBodyRows(companyId); // Re-render to show/hide group checkbox
    }
}

function updateInputFromSlider(companyId, idx, value) {
    const pct = parseFloat(value) || 0;
    document.getElementById(`input-${companyId}-${idx}`).value = `${pct}%`;
    const slider = document.getElementById(`slider-${companyId}-${idx}`);
    applySliderBackground(slider);
    
    companyStates[companyId].rows[idx].percentage = pct;
    updateCalculations(companyId);
}

function updateSliderFromInput(companyId, idx, value) {
    let pct = parseFloat(value.replace('%', ''));
    if (isNaN(pct)) pct = 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    
    document.getElementById(`slider-${companyId}-${idx}`).value = pct;
    document.getElementById(`input-${companyId}-${idx}`).value = `${pct}%`;
    applySliderBackground(document.getElementById(`slider-${companyId}-${idx}`));
    
    companyStates[companyId].rows[idx].percentage = pct;
    updateCalculations(companyId);
}

function tweakPercentage(companyId, idx, delta) {
    let currentPct = companyStates[companyId].rows[idx].percentage;
    let newPct = currentPct + delta;
    if (newPct < 0) newPct = 0;
    if (newPct > 100) newPct = 100;
    
    document.getElementById(`slider-${companyId}-${idx}`).value = newPct;
    updateInputFromSlider(companyId, idx, newPct);
}

function applySliderBackground(slider) {
    if (!slider) return;
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--own-primary-blue) ${value}%, var(--own-gray-border) ${value}%)`;
}

// ---------------------------------------------
// Core Math & Validations
// ---------------------------------------------

function updateCalculations(companyId) {
    let total = 0;
    companyStates[companyId].rows.forEach(r => total += (parseFloat(r.percentage) || 0));

    // Update Header Display dynamically
    updateCardHeaderDisplay(companyId, total);

    // Update Footer Display
    const remaining = 100 - total;
    const footerRm = document.getElementById(`footer-remain-${companyId}`);
    const warningBadge = document.getElementById(`warning-${companyId}`);
    const warningMsg = document.getElementById(`warning-msg-${companyId}`);
    const confirmBtn = document.getElementById(`confirm-btn-${companyId}`);

    if (total < 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge';
        warningBadge.style.backgroundColor = 'var(--own-warning-bg)';
        warningBadge.style.color = 'var(--own-warning-text)';
        warningBadge.style.borderColor = 'var(--own-warning-border)';
        warningBadge.innerHTML = `<span>⚠️</span> <span id="warning-msg-${companyId}">Total is less than 100%</span>`;
        if (footerRm) footerRm.textContent = `${remaining.toFixed(2)}% Unallocated`;
        
        confirmBtn.disabled = false;
        
    } else if (total > 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge';
        warningBadge.style.backgroundColor = '#fef2f2';
        warningBadge.style.color = '#ef4444';
        warningBadge.style.borderColor = '#fecaca';
        warningBadge.innerHTML = `<span>❌</span> <span id="warning-msg-${companyId}">Total exceeds 100%!</span>`;
        if (footerRm) footerRm.textContent = `${Math.abs(remaining).toFixed(2)}% Over Allocated`;
        
        confirmBtn.disabled = true; // Block submission
        
    } else {
        warningBadge.style.display = 'none';
        if (footerRm) footerRm.textContent = `Fully Allocated`;
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
            remainEl.textContent = `Over limit!`;
            remainEl.style.color = 'var(--own-danger-red)';
            if (barEl) barEl.style.backgroundColor = 'var(--own-danger-red)';
        } else {
            remainEl.textContent = `${(100 - total).toFixed(2)}% Remaining`;
            remainEl.style.color = 'var(--own-gray-text)';
            if (barEl) barEl.style.backgroundColor = 'var(--own-primary-blue)';
        }
    }
    if (barEl) {
        barEl.style.width = `${Math.min(total, 100)}%`;
    }
}

// ---------------------------------------------
// Submitting
// ---------------------------------------------

function confirmEdit(companyId) {
    const rows = companyStates[companyId].rows;
    let total = 0;
    let hasError = false;

    // Validate Check
    rows.forEach(r => {
        if (!r.account_id) {
            hasError = true;
            showToast('Please select an account for all rows.', 'error');
        }
        total += parseFloat(r.percentage);
    });

    if (total > 100) {
        showToast('Total percentage exceeds 100%', 'error');
        return;
    }

    if (hasError) return;

    // Detect Duplicates
    const accIds = rows.map(r => r.account_id);
    const hasDupes = accIds.some((item, idx) => accIds.indexOf(item) !== idx);
    if (hasDupes) {
        showToast('Duplicate accounts detected. Please combine them.', 'error');
        return;
    }

    const payload = {
        company_id: companyId,
        owners: rows.map(r => ({ 
            account_id: r.account_id, 
            percentage: parseFloat(r.percentage),
            include_group: r.include_group !== undefined ? parseInt(r.include_group) : 1
        }))
    };

    const confirmBtn = document.getElementById(`confirm-btn-${companyId}`);
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    fetch('api/ownership/batch_save_owners_api.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
        if (res.status === 'success') {
            showToast(res.message, 'success');
            // Update global data so closing/opening works gracefully
            const compIdx = companiesData.findIndex(c => parseInt(c.id) === companyId);
            if (compIdx >= 0) {
                companiesData[compIdx].allocated_percentage = total;
            }
            // Collapse
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
// Toast UI
// ---------------------------------------------
let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('ownToast');
    const msgEl = document.getElementById('ownToastMessage');
    const iconEl = document.getElementById('ownToastIcon');
    
    toast.className = 'own-toast own-show ' + (type === 'success' ? 'own-success' : 'own-error');
    msgEl.textContent = message;
    
    if (type === 'success') {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>';
    } else {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--own-danger-red)" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.className = 'own-toast';
    }, 3000);
}

// ---------------------------------------------
// External Partner Linking
// ---------------------------------------------

function linkExternalPartner(companyId, event) {
    const loginIdInput = document.getElementById(`partner-login-${companyId}`);
    const loginId = loginIdInput.value.trim();
    if (!loginId) {
        showToast('Please enter a Partner Login ID', 'error');
        return;
    }

    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Linking...';

    fetch(`api/ownership/add_external_partner_api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, login_id: loginId })
    })
    .then(res => res.json())
    .then(res => {
        btn.disabled = false;
        btn.textContent = 'Link Partner';
        if (res.status === 'success') {
            showToast(res.message, 'success');
            loginIdInput.value = '';
            // Close and reopen the card to refresh the data
            cancelEdit(companyId, true);
            setTimeout(() => toggleCard(companyId, null), 300);
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
