document.addEventListener('DOMContentLoaded', () => {
    fetchCompanies();
});

let currentCompanies = [];
let currentAllocCompanyId = null;

// Fetch all companies and their allocated percentages
function fetchCompanies() {
    const grid = document.getElementById('companyGrid');
    grid.innerHTML = '<div class="own-loader-container" style="grid-column: 1 / -1;"><div class="own-loader"></div></div>';

    fetch('api/ownership/get_companies_api.php')
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                currentCompanies = res.data;
                renderCompanies();
            } else {
                showToast(res.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to fetch companies', 'error');
        });
}

function renderCompanies() {
    const grid = document.getElementById('companyGrid');
    grid.innerHTML = '';

    if (currentCompanies.length === 0) {
        grid.innerHTML = '<div class="own-empty-state" style="grid-column: 1 / -1;">No companies available</div>';
        return;
    }

    currentCompanies.forEach(comp => {
        const alloc = parseFloat(comp.allocated_percentage) || 0;
        
        // Define statuses based on percentage
        let statusClass = '';
        let statusText = `${alloc}% Allocated`;
        
        if (alloc >= 100) {
            statusClass = 'own-full';
            statusText = '100% Allocated (Full)';
        } else if (alloc > 100) {
            statusClass = 'own-over';
            statusText = `${alloc}% Allocated (Over Limit)`;
        }

        const card = document.createElement('div');
        card.className = 'own-company-card';
        card.onclick = () => openAllocationModal(comp.id, comp.name, alloc);

        card.innerHTML = `
            <div>
                <div class="own-company-card-header">
                    <div class="own-company-title">${comp.name}</div>
                    <div class="own-allocated-badge ${statusClass}">${alloc}%</div>
                </div>
                <div class="own-company-progress-container">
                    <div class="own-company-progress-bar ${statusClass}" style="width: ${Math.min(alloc, 100)}%"></div>
                </div>
            </div>
            <div class="own-company-stats">${statusText}</div>
        `;
        grid.appendChild(card);
    });
}

// ----------------------------------------------------
// Modal Logic
// ----------------------------------------------------

function openAllocationModal(companyId, companyName, currentAlloc) {
    document.getElementById('modalCompanyTitle').textContent = `Manage Ownership: ${companyName}`;
    document.getElementById('allocCompanyId').value = companyId;
    currentAllocCompanyId = companyId;
    
    // Reset form
    document.getElementById('allocationForm').reset();
    
    // Show modal
    document.getElementById('allocationModal').classList.add('own-show');
    
    // Fetch accounts and owners
    fetchAvailableAccounts(companyId);
    fetchOwners(companyId);
}

function closeAllocationModal() {
    document.getElementById('allocationModal').classList.remove('own-show');
    currentAllocCompanyId = null;
    fetchCompanies(); // Refresh cards in case of changes
}

let availableAccounts = [];

function fetchAvailableAccounts(companyId) {
    fetch(`api/ownership/get_available_accounts_api.php?company_id=${companyId}`)
        .then(res => res.json())
        .then(res => {
            if (res.status === 'success') {
                availableAccounts = res.data;
                populateAccountsDropdown();
            } else {
                showToast(res.message, 'error');
            }
        })
        .catch(err => console.error(err));
}

function populateAccountsDropdown() {
    const select = document.getElementById('allocAccountId');
    select.innerHTML = '<option value="">-- Select Account --</option>';
    
    availableAccounts.forEach(acc => {
        // Option text, e.g., "KAG1 (KL ADRIAN) - AGENT"
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${acc.account_name} (${acc.name}) [${acc.role}]`;
        select.appendChild(opt);
    });
}

function fetchOwners(companyId) {
    const tbody = document.getElementById('ownersTableBody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;"><div class="own-loader" style="width: 20px; height: 20px; margin: 0 auto; display: inline-block;"></div></td></tr>';

    fetch(`api/ownership/get_owners_api.php?company_id=${companyId}`)
        .then(res => res.json())
        .then(res => {
            if (res.status === 'success') {
                renderOwners(res.data);
            } else {
                showToast(res.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="3" class="own-empty-state">Failed to load</td></tr>';
        });
}

function renderOwners(owners) {
    const tbody = document.getElementById('ownersTableBody');
    tbody.innerHTML = '';
    
    let totalPercent = 0;

    if (owners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="own-empty-state">No owners allocated yet</td></tr>';
    } else {
        owners.forEach(owner => {
            totalPercent += owner.percentage;
            const tr = document.createElement('tr');
            tr.className = 'own-owner-row';
            tr.innerHTML = `
                <td>
                    <span class="own-owner-name">${owner.account_name} (${owner.name})</span>
                    <span class="own-owner-role">${owner.role}</span>
                </td>
                <td class="own-owner-percentage">${owner.percentage}%</td>
                <td style="text-align: right;">
                    <button class="own-btn-delete" title="Remove Ownership" onclick="removeOwner(${owner.ownership_id}, '${owner.account_name}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                        </svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Update Progress Bar
    const pBar = document.getElementById('modalProgressBar');
    const pStats = document.getElementById('modalProgressStats');
    
    pBar.style.width = Math.min(totalPercent, 100) + '%';
    
    if (totalPercent >= 100) {
        pBar.className = 'own-company-progress-bar own-full';
        pStats.textContent = `100% Allocated (Full)`;
        pStats.style.color = 'var(--own-success)';
    } else {
        pBar.className = 'own-company-progress-bar';
        pStats.textContent = `${totalPercent.toFixed(2)}% Allocated`;
        pStats.style.color = 'var(--own-secondary-text)';
    }
}

function saveAllocation(e) {
    e.preventDefault();
    
    const companyId = document.getElementById('allocCompanyId').value;
    const accountId = document.getElementById('allocAccountId').value;
    const percentage = document.getElementById('allocPercentage').value;

    if (!accountId || !percentage) {
        showToast('Please fill all fields', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('company_id', companyId);
    formData.append('account_id', accountId);
    formData.append('percentage', percentage);

    document.getElementById('saveAllocBtn').disabled = true;

    fetch('api/ownership/save_owner_api.php', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(res => {
        document.getElementById('saveAllocBtn').disabled = false;
        if (res.status === 'success') {
            showToast(res.message, 'success');
            document.getElementById('allocationForm').reset();
            fetchOwners(companyId); // update local table
        } else {
            showToast(res.message, 'error');
        }
    })
    .catch(err => {
        document.getElementById('saveAllocBtn').disabled = false;
        console.error(err);
        showToast('Server error', 'error');
    });
}

function removeOwner(ownershipId, accName) {
    if (!confirm(`Are you sure you want to remove ${accName}'s ownership?`)) {
        return;
    }

    const formData = new FormData();
    formData.append('ownership_id', ownershipId);

    fetch('api/ownership/remove_owner_api.php', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(res => {
        if (res.status === 'success') {
            showToast('Owner removed', 'success');
            if (currentAllocCompanyId) {
                fetchOwners(currentAllocCompanyId);
            }
        } else {
            showToast(res.message, 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Server error', 'error');
    });
}

// ----------------------------------------------------
// Toast Notification
// ----------------------------------------------------
let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('ownToast');
    const msgEl = document.getElementById('ownToastMessage');
    const iconEl = document.getElementById('ownToastIcon');
    
    toast.className = 'own-toast own-show ' + (type === 'success' ? 'own-success' : 'own-error');
    msgEl.textContent = message;
    
    if (type === 'success') {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--own-success)" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>';
    } else {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--own-danger)" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.className = 'own-toast';
    }, 3000);
}
