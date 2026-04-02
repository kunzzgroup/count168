// Bank-specific functions extracted from processlist.js

if (!window.__bankStatusDropdownBound) {
    window.__bankStatusDropdownBound = true;
    document.addEventListener('click', function () {
        closeAllBankStatusDropdowns();
    });
    window.addEventListener('resize', function () {
        closeAllBankStatusDropdowns();
    });
    window.addEventListener('scroll', function () {
        closeAllBankStatusDropdowns();
    }, true);
}

// Country field: user may enter country name (Malaysia -> MYR) or currency code directly (MYR, SGD)
const COUNTRY_TO_CURRENCY = { 'Malaysia': 'MYR', 'Singapore': 'SGD' };

// Selected Profit Sharing list (array of { accountId, accountText, amount })
window.selectedProfitSharingEntries = [];

function sortBankProcessesBySupplier() {
    if (!Array.isArray(processes) || processes.length === 0) return;
    processes.sort(function (a, b) {
        const aKey = String(a.card_lower || a.supplier || '').toLowerCase();
        const bKey = String(b.card_lower || b.supplier || '').toLowerCase();
        let result = 0;
        if (aKey < bKey) result = -1;
        else if (aKey > bKey) result = 1;
        if (bankSupplierSortDirection === 'desc') result = -result;
        return result;
    });
}

function updateBankSupplierSortIndicator() {
    const indicator = document.getElementById('bankSupplierSortIndicator');
    if (!indicator) return;
    indicator.textContent = bankSupplierSortDirection === 'asc' ? '▲' : '▼';
}

function toggleBankSupplierSort() {
    if (selectedPermission !== 'Bank') return;
    bankSupplierSortDirection = bankSupplierSortDirection === 'asc' ? 'desc' : 'asc';
    sortBankProcessesBySupplier();
    currentPage = 1;
    renderBankTable();
    renderPagination();
    updateBankSupplierSortIndicator();
}

function buildBankRemarkActionButton(processId) {
    return '<button class="edit-btn remark-action-btn" onclick="openQuickRemarkModal(' + processId + ')" aria-label="Remark" title="Remark">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '</button>';
}

function isBankInactiveLike(status, issueFlag) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedIssueFlag = normalizeBankIssueFlag(issueFlag);
    return normalizedStatus === 'inactive' || normalizedIssueFlag === 'official' || normalizedIssueFlag === 'e_invoice';
}

function isBankProcessInactiveLike(process) {
    if (!process) return false;
    return isBankInactiveLike(process.status, process.issue_flag);
}

function isBankRowInactiveLike(row) {
    if (!row) return false;
    return isBankInactiveLike(row.getAttribute('data-status'), row.getAttribute('data-issue-flag'));
}

function isRealBankInactive(status) {
    return String(status || '').trim().toLowerCase() === 'inactive';
}

function buildBankActionCellHtml(processId, status, hasTransactions, issueFlag) {
    const actionButtons = '<button class="edit-btn" onclick="editProcess(' + processId + ')" aria-label="Edit" title="Edit"><img src="images/edit.svg" alt="Edit" /></button>' +
        buildBankRemarkActionButton(processId);
    const showDeleteCheckbox = isRealBankInactive(status);
    if (!showDeleteCheckbox) {
        return actionButtons;
    }
    const disabledAttr = hasTransactions ? ' disabled' : '';
    const titleText = hasTransactions ? 'Cannot delete: process has transactions' : 'Select for deletion';
    return actionButtons + '<input type="checkbox" class="row-checkbox bank-checkbox" data-id="' + processId + '" title="' + titleText + '"' + disabledAttr + ' onchange="updateDeleteButton(); updatePostToTransactionButton();" style="margin-left: 10px;">';
}

function syncBankFilterCheckboxes() {
    const showInactiveCheckbox = document.getElementById('showInactive');
    const showOfficialCheckbox = document.getElementById('showOfficial');
    const showEInvoiceCheckbox = document.getElementById('showEInvoice');
    const showAllCheckbox = document.getElementById('showAll');
    if (showInactiveCheckbox) showInactiveCheckbox.checked = !!showInactive;
    if (showOfficialCheckbox) showOfficialCheckbox.checked = !!showOfficial;
    if (showEInvoiceCheckbox) showEInvoiceCheckbox.checked = !!showEInvoice;
    if (showAllCheckbox) showAllCheckbox.checked = !!showAll;
}

function normalizeBankFilterState() {
    if (showAll) {
        showInactive = false;
        showOfficial = false;
        showEInvoice = false;
    }
    syncBankFilterCheckboxes();
}

function normalizeBankIssueFlag(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (normalized === 'official' || normalized === 'e_invoice') {
        return normalized;
    }
    return '';
}

function getBankStatusSelectValue(process) {
    if (!process) return 'active';
    const issueFlag = normalizeBankIssueFlag(process.issue_flag);
    if (issueFlag) return issueFlag;
    return String(process.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function renderBankStatusSelect(processId, process) {
    const currentValue = getBankStatusSelectValue(process);
    const currentOption = BANK_STATUS_SELECT_OPTIONS.find(function (option) {
        return option.value === currentValue;
    }) || BANK_STATUS_SELECT_OPTIONS[0];
    const optionsHtml = BANK_STATUS_SELECT_OPTIONS.map(function (option) {
        const isSelected = option.value === currentValue;
        return '<button type="button" class="bank-status-option' + (isSelected ? ' selected' : '') + '" data-value="' + option.value + '" onclick="selectBankStatusOption(this, ' + processId + '); event.stopPropagation();">' + option.label + '</button>';
    }).join('');

    return '<div class="bank-status-dropdown" data-current-value="' + currentValue + '" data-open="0">' +
        '<button type="button" class="bank-status-button" data-value="' + currentValue + '" onclick="toggleBankStatusDropdown(this, ' + processId + '); event.stopPropagation();">' + currentOption.label + '</button>' +
        '<div class="bank-status-menu" onclick="event.stopPropagation();">' + optionsHtml + '</div>' +
        '</div>';
}

function applyBankStatusSelectAppearance(dropdownEl, rawValue) {
    if (!dropdownEl) return;
    const normalizedFlag = normalizeBankIssueFlag(rawValue);
    const normalized = normalizedFlag || (String(rawValue || '').toLowerCase() === 'inactive' ? 'inactive' : 'active');
    const buttonEl = dropdownEl.querySelector('.bank-status-button');
    const optionEls = dropdownEl.querySelectorAll('.bank-status-option');
    const currentOption = BANK_STATUS_SELECT_OPTIONS.find(function (option) {
        return option.value === normalized;
    }) || BANK_STATUS_SELECT_OPTIONS[0];

    dropdownEl.setAttribute('data-current-value', normalized);
    if (buttonEl) {
        buttonEl.textContent = currentOption.label;
        buttonEl.setAttribute('data-value', normalized);
        buttonEl.classList.remove('is-active', 'is-inactive', 'is-official', 'is-e-invoice');
    }
    if (normalized === 'inactive') {
        if (buttonEl) buttonEl.classList.add('is-inactive');
    } else if (normalized === 'official') {
        if (buttonEl) buttonEl.classList.add('is-official');
    } else if (normalized === 'e_invoice') {
        if (buttonEl) buttonEl.classList.add('is-e-invoice');
    } else {
        if (buttonEl) buttonEl.classList.add('is-active');
    }

    optionEls.forEach(function (optionEl) {
        optionEl.classList.toggle('selected', String(optionEl.getAttribute('data-value') || '').toLowerCase() === normalized);
    });
}

function refreshBankStatusCell(processId) {
    const process = processes.find(function (item) { return item.id === processId; });
    const row = document.querySelector('#bankTableBody tr[data-id="' + processId + '"]');
    if (!process || !row) return;
    const dropdownEl = row.querySelector('.bank-status-dropdown');
    applyBankStatusSelectAppearance(dropdownEl, getBankStatusSelectValue(process));
}

function closeAllBankStatusDropdowns() {
    document.querySelectorAll('.bank-status-dropdown').forEach(function (dropdownEl) {
        dropdownEl.classList.remove('open');
        dropdownEl.setAttribute('data-open', '0');
        const buttonEl = dropdownEl.querySelector('.bank-status-button');
        if (buttonEl) buttonEl.classList.remove('open');
        restoreBankStatusMenu(dropdownEl);
    });
}

function moveBankStatusMenuToBody(dropdownEl) {
    if (!dropdownEl) return;
    const menuEl = dropdownEl.querySelector('.bank-status-menu');
    const buttonEl = dropdownEl.querySelector('.bank-status-button');
    if (!menuEl || !buttonEl) return;

    if (!menuEl.__originalParent) {
        menuEl.__originalParent = menuEl.parentNode;
        menuEl.__originalNextSibling = menuEl.nextSibling;
    }
    if (menuEl.parentNode !== document.body) {
        document.body.appendChild(menuEl);
    }

    menuEl.__ownerDropdown = dropdownEl;
    menuEl.classList.add('bank-status-menu-floating');
    menuEl.style.display = 'block';
    menuEl.style.visibility = 'hidden';

    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 112);
    menuEl.style.width = menuWidth + 'px';
    menuEl.style.minWidth = menuWidth + 'px';
    menuEl.style.maxWidth = menuWidth + 'px';

    const menuHeight = menuEl.offsetHeight || 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + menuWidth > viewportWidth - 12) {
        left = Math.max(12, viewportWidth - menuWidth - 12);
    }
    if (top + menuHeight > viewportHeight - 12 && rect.top - menuHeight - 6 > 12) {
        top = rect.top - menuHeight - 6;
    }

    menuEl.style.left = Math.round(left) + 'px';
    menuEl.style.top = Math.round(top) + 'px';
    menuEl.style.visibility = 'visible';
}

function restoreBankStatusMenu(dropdownEl) {
    if (!dropdownEl) return;
    let menuEl = dropdownEl.querySelector('.bank-status-menu');
    if (!menuEl) {
        menuEl = Array.from(document.body.querySelectorAll('.bank-status-menu-floating')).find(function (el) {
            return el.__ownerDropdown === dropdownEl;
        }) || null;
    }
    if (!menuEl) return;

    if (menuEl.__originalParent && menuEl.parentNode === document.body) {
        if (menuEl.__originalNextSibling && menuEl.__originalNextSibling.parentNode === menuEl.__originalParent) {
            menuEl.__originalParent.insertBefore(menuEl, menuEl.__originalNextSibling);
        } else {
            menuEl.__originalParent.appendChild(menuEl);
        }
    }

    menuEl.classList.remove('bank-status-menu-floating');
    menuEl.style.display = '';
    menuEl.style.visibility = '';
    menuEl.style.left = '';
    menuEl.style.top = '';
    menuEl.style.width = '';
    menuEl.style.minWidth = '';
    menuEl.style.maxWidth = '';
}

function toggleBankStatusDropdown(buttonEl) {
    const dropdownEl = buttonEl ? buttonEl.closest('.bank-status-dropdown') : null;
    if (!dropdownEl) return;

    const isOpen = dropdownEl.classList.contains('open');
    closeAllBankStatusDropdowns();
    if (!isOpen) {
        dropdownEl.classList.add('open');
        dropdownEl.setAttribute('data-open', '1');
        buttonEl.classList.add('open');
        moveBankStatusMenuToBody(dropdownEl);
    }
}

async function selectBankStatusOption(optionEl, processId) {
    const menuEl = optionEl ? optionEl.closest('.bank-status-menu') : null;
    const dropdownEl = menuEl && menuEl.__ownerDropdown
        ? menuEl.__ownerDropdown
        : (optionEl ? optionEl.closest('.bank-status-dropdown') : null);
    if (!dropdownEl) return;

    const newValue = String(optionEl.getAttribute('data-value') || '').toLowerCase();
    await handleBankStatusSelectChange(dropdownEl, processId, newValue);
}

function matchesCurrentBankFilters(process) {
    if (!process) return false;
    if (!processMatchesSelectedDate(process)) return false;
    if (showAll) return true;
    const status = String(process.status || '').toLowerCase();
    const issueFlag = normalizeBankIssueFlag(process.issue_flag);
    const matches = [];
    if (showInactive) matches.push(status === 'inactive');
    if (showOfficial) matches.push(issueFlag === 'official');
    if (showEInvoice) matches.push(issueFlag === 'e_invoice');
    if (matches.length === 0) {
        return status === 'active' && issueFlag !== 'official' && issueFlag !== 'e_invoice';
    }
    return matches.some(Boolean);
}

async function updateBankIssueFlag(processId, newValue, options) {
    const settings = options || {};
    const process = processes.find(function (item) { return item.id === processId; });
    const dropdownEl = settings.dropdownEl || document.querySelector('#bankTableBody tr[data-id="' + processId + '"] .bank-status-dropdown');
    const buttonEl = dropdownEl ? dropdownEl.querySelector('.bank-status-button') : null;
    const previousValue = normalizeBankIssueFlag(process ? process.issue_flag : '');
    const normalizedNewValue = normalizeBankIssueFlag(newValue);

    if (dropdownEl) {
        applyBankStatusSelectAppearance(dropdownEl, normalizedNewValue || (process ? process.status : 'active'));
        closeAllBankStatusDropdowns();
    }
    if (buttonEl) {
        buttonEl.disabled = true;
    }

    try {
        const formData = new FormData();
        formData.append('id', processId);
        formData.append('issue_flag', normalizedNewValue);

        const response = await fetch(buildApiUrl('api/processes/update_bank_issue_flag_api.php'), {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || result.message || 'Status flag update failed');
        }

        if (process) {
            process.issue_flag = normalizedNewValue || null;
        }

        const row = document.querySelector('#bankTableBody tr[data-id="' + processId + '"]');
        if (row) {
            row.setAttribute('data-issue-flag', normalizedNewValue);
            const actionCell = row.querySelector('.bank-td-action');
            if (actionCell) {
                actionCell.innerHTML = buildBankActionCellHtml(processId, process ? process.status : '', row.getAttribute('data-has-transactions') === '1', normalizedNewValue);
            }
        }

        if (process && !matchesCurrentBankFilters(process)) {
            renderTable();
        }

        refreshBankStatusCell(processId);
        updateDeleteButton();
        updateSelectAllProcessesVisibility();
        updatePostToTransactionButton();
        if (selectedPermission === 'Bank' && typeof loadAccountingInbox === 'function') {
            await loadAccountingInbox();
        }
        if (!settings.silent) {
            showNotification('Status option updated', 'success');
        }
    } catch (error) {
        console.error('Status flag update failed:', error);
        if (process) {
            process.issue_flag = previousValue || null;
        }
        refreshBankStatusCell(processId);
        showNotification(error.message || 'Status flag update failed', 'danger');
        throw error;
    } finally {
        const latestButtonEl = document.querySelector('#bankTableBody tr[data-id="' + processId + '"] .bank-status-button');
        if (latestButtonEl) latestButtonEl.disabled = false;
    }
}

async function handleBankStatusSelectChange(dropdownEl, processId, forcedValue) {
    const process = processes.find(function (item) { return item.id === processId; });
    if (!dropdownEl || !process) return;

    const selectedValue = String(forcedValue || dropdownEl.getAttribute('data-current-value') || '').toLowerCase();
    const previousDisplayValue = getBankStatusSelectValue(process);

    if (selectedValue === previousDisplayValue) {
        applyBankStatusSelectAppearance(dropdownEl, previousDisplayValue);
        closeAllBankStatusDropdowns();
        return;
    }

    if (selectedValue === 'official' || selectedValue === 'e_invoice') {
        await updateBankIssueFlag(processId, selectedValue, { dropdownEl: dropdownEl });
        return;
    }

    if (selectedValue !== 'active' && selectedValue !== 'inactive') {
        applyBankStatusSelectAppearance(dropdownEl, previousDisplayValue);
        closeAllBankStatusDropdowns();
        return;
    }

    if (String(process.status || '').toLowerCase() === selectedValue) {
        await updateBankIssueFlag(processId, '', { dropdownEl: dropdownEl });
        return;
    }

    pendingBankStatusSelection = {
        processId: processId,
        desiredStatus: selectedValue
    };
    applyBankStatusSelectAppearance(dropdownEl, previousDisplayValue);
    closeAllBankStatusDropdowns();
    showConfirmInactiveModal(processId, selectedValue);
}

function renderBankTable() {
    const headRow = document.getElementById('bankTableHeadRow');
    const tbody = document.getElementById('bankTableBody');
    if (!headRow || !tbody) return;

    const thLabels = ['No', 'Supplier', 'Country', 'Bank', 'Types', 'Card Owner', 'Contract', 'Insurance', 'Customer', 'Cost', 'Price', 'Profit', 'Status', 'Date', 'Action'];
    headRow.innerHTML = thLabels.map((label, i) => {
        if (label === 'No') return '<th class="bank-th-no">' + escapeHtml(label) + '</th>';
        if (label === 'Supplier') {
            return '<th class="bank-th-supplier bank-th-sortable" onclick="toggleBankSupplierSort()">' +
                '<span class="bank-th-supplier-text">' + escapeHtml(label) + '</span>' +
                ' <span class="bank-sort-indicator" id="bankSupplierSortIndicator">' +
                (bankSupplierSortDirection === 'asc' ? '▲' : '▼') +
                '</span>' +
                '</th>';
        }
        if (label === 'Country') return '<th class="bank-th-country">' + escapeHtml(label) + '</th>';
        if (label === 'Types') return '<th class="bank-th-types">' + escapeHtml(label) + '</th>';
        if (label === 'Card Owner') return '<th class="bank-th-card-owner">' + escapeHtml(label) + '</th>';
        if (label === 'Status') return '<th class="bank-th-status">' + escapeHtml(label) + '</th>';
        if (label === 'Action') {
            const showActionCheckbox = showInactive || showOfficial || showEInvoice || showAll;
            return '<th class="bank-th-action">Action' + (showActionCheckbox ? ' <input type="checkbox" id="selectAllBankProcesses" class="header-action-checkbox" title="Select all" style="margin-left: 10px; cursor: pointer;" onchange="toggleSelectAllBankProcesses()">' : '') + '</th>';
        }
        return '<th>' + escapeHtml(label) + '</th>';
    }).join('');

    tbody.innerHTML = '';
    const contractMap = { '1': '1 MONTH', '1 month': '1 MONTH', '2': '2 MONTHS', '2 months': '2 MONTHS', '3': '3 MONTHS', '3 months': '3 MONTHS', '6': '6 MONTHS', '6 months': '6 MONTHS', '1+1': '1+1 MONTH', '1+2': '1+2 MONTHS', '1+3': '1+3 MONTHS' };
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    function getContractStateClass(dayStart, dayEnd) {
        // No day_start set → same as waiting for start date (yellow)
        const hasDayStart = dayStart != null && String(dayStart).trim() !== '';
        if (!hasDayStart) return 'contract-pending';
        if (todayStr < dayStart) return 'contract-pending';
        if (dayEnd && todayStr > dayEnd) return 'contract-expired';
        if (dayStart && dayEnd && todayStr >= dayStart && todayStr <= dayEnd) return 'contract-active';
        if (dayStart && todayStr >= dayStart) return 'contract-active';
        return 'contract-expired';
    }
    let listToShow = Array.isArray(processes)
        ? processes.filter(function (p) { return matchesCurrentBankFilters(p); })
        : [];

    // When Waiting is checked, only show rows where contract is pending (yellow)
    if (waiting) {
        listToShow = listToShow.filter(function (p) { return getContractStateClass(p.day_start || null, p.day_end || null) === 'contract-pending'; });
    }
    window.__bankFilteredLength = waiting ? listToShow.length : null;

    if (listToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="bank-empty-cell">No process data found</td></tr>';
        renderPagination();
        updateSelectAllProcessesVisibility();
        return;
    }

    let pageItems, startIndex;
    if (showAll) {
        pageItems = listToShow;
        startIndex = 0;
    } else {
        const totalPages = Math.max(1, Math.ceil(listToShow.length / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        startIndex = (currentPage - 1) * pageSize;
        pageItems = listToShow.slice(startIndex, Math.min(startIndex + pageSize, listToShow.length));
    }

    function dashIfEmpty(val) {
        if (val == null) return '-';
        const s = String(val).trim();
        return s === '' ? '-' : val;
    }
    pageItems.forEach((process, idx) => {
        const contract = process.contract ? (contractMap[process.contract] || process.contract) : '';
        const baseContractClass = getContractStateClass(process.day_start || null, process.day_end || null);
        // Special rule: 1 MONTH / 1+1 / 1+2 / 1+3 during active period use gray style
        const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
        const contractClass = (grayContracts.indexOf(contract) !== -1 && baseContractClass === 'contract-active')
            ? 'contract-1month-active'
            : baseContractClass;
        const contractCell = (contract && contractClass)
            ? '<span class="contract-badge ' + contractClass + '">' + escapeHtml(contract) + '</span>'
            : (contract ? escapeHtml(contract) : escapeHtml('-'));
        const cost = dashIfEmpty(process.cost);
        const price = dashIfEmpty(process.price);
        const profit = dashIfEmpty(process.profit);
        const statusSelect = renderBankStatusSelect(process.id, process);
        const actionCell = buildBankActionCellHtml(process.id, process.status, process.has_transactions, process.issue_flag);
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', process.id);
        tr.setAttribute('data-status', process.status || '');
        tr.setAttribute('data-issue-flag', normalizeBankIssueFlag(process.issue_flag));
        tr.setAttribute('data-has-transactions', process.has_transactions ? '1' : '0');
        tr.innerHTML = '<td class="bank-td-no">' + (startIndex + idx + 1) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.card_lower)) + '</td>' +
            '<td class="bank-td-country">' + escapeHtml(dashIfEmpty(process.country)) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.bank)) + '</td>' +
            '<td class="bank-td-types">' + escapeHtml(dashIfEmpty(process.types)) + '</td>' +
            '<td class="bank-td-card-owner">' + escapeHtml(dashIfEmpty(process.supplier)) + '</td>' +
            '<td>' + contractCell + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.insurance)) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.customer)) + '</td>' +
            '<td>' + escapeHtml(String(cost)) + '</td>' +
            '<td>' + escapeHtml(String(price)) + '</td>' +
            '<td>' + escapeHtml(String(profit)) + '</td>' +
            '<td class="bank-td-status">' + statusSelect + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty((process.date === '0000-00-00' || !process.date) ? '' : process.date)) + '</td>' +
            '<td class="bank-td-action">' + actionCell + '</td>';
        tbody.appendChild(tr);
        applyBankStatusSelectAppearance(tr.querySelector('.bank-status-dropdown'), getBankStatusSelectValue(process));
    });

    renderPagination();
    updateSelectAllProcessesVisibility();
    updateDeleteButton();
}

function syncBankTableColumnWidth() {
    if (selectedPermission !== 'Bank') return;
    const tableHeader = document.getElementById('tableHeader');
    const processTableBody = document.getElementById('processTableBody');
    if (!tableHeader || !processTableBody) return;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            const rect = tableHeader.getBoundingClientRect();
            processTableBody.style.setProperty('--table-header-width', rect.width + 'px');
        });
    });
}

function setBankModalLoadingState(isLoading, titleText) {
    const titleEl = document.getElementById('bankModalTitle');
    const submitBtn = document.getElementById('bankSubmitBtn');
    if (titleEl && titleText) titleEl.textContent = titleText;
    if (submitBtn) {
        submitBtn.disabled = !!isLoading;
        submitBtn.textContent = isLoading ? 'Loading...' : (titleText === 'Edit Process' ? 'Update Process' : 'Add Process');
    }
}

function ensureAddBankProcessDataLoaded(forceReload) {
    if (bankAddProcessDataLoaded && !forceReload) {
        return Promise.resolve();
    }
    if (bankAddProcessDataPromise && !forceReload) {
        return bankAddProcessDataPromise;
    }
    bankAddProcessDataPromise = loadAddBankProcessData()
        .then(function () {
            bankAddProcessDataLoaded = true;
        })
        .catch(function (error) {
            bankAddProcessDataLoaded = false;
            throw error;
        })
        .finally(function () {
            bankAddProcessDataPromise = null;
        });
    return bankAddProcessDataPromise;
}

function closeAddBankModal() {
    document.getElementById('addBankModal').style.display = 'none';
    document.getElementById('bank_edit_id').value = '';
    window.selectedProfitSharingEntries = [];
    bankProcessSubmitInFlight = false;
    const titleEl = document.getElementById('bankModalTitle');
    const submitBtn = document.getElementById('bankSubmitBtn');
    if (titleEl) titleEl.textContent = 'Add Process';
    if (submitBtn) {
        submitBtn.textContent = 'Add Process';
        submitBtn.disabled = false;
    }
    document.getElementById('addBankProcessForm').reset();
    document.getElementById('bank_edit_id').value = '';
    const profitInput = document.getElementById('bank_profit');
    if (profitInput) profitInput.value = '';
    const cardMerchantBtn = document.getElementById('bank_card_merchant');
    const customerBtn = document.getElementById('bank_customer');
    if (cardMerchantBtn) {
        cardMerchantBtn.textContent = cardMerchantBtn.getAttribute('data-placeholder') || 'Select Account';
        cardMerchantBtn.removeAttribute('data-value');
    }
    if (customerBtn) {
        customerBtn.textContent = customerBtn.getAttribute('data-placeholder') || 'Select Account';
        customerBtn.removeAttribute('data-value');
    }
    const profitAccountBtn = document.getElementById('bank_profit_account');
    if (profitAccountBtn) {
        profitAccountBtn.textContent = profitAccountBtn.getAttribute('data-placeholder') || 'Select Account';
        profitAccountBtn.removeAttribute('data-value');
    }
    const bankSopEl = document.getElementById('bank_sop');
    const bankRemarkEl = document.getElementById('bank_remark');
    if (bankSopEl) bankSopEl.value = '';
    if (bankRemarkEl) bankRemarkEl.value = '';
}

function openProcessNoteModal(target) {
    const modal = document.getElementById('sopModal');
    const modalTitle = document.getElementById('processNoteModalTitle');
    const sopContent = document.getElementById('sop_content');
    const normalizedTarget = target === 'remark' ? 'remark' : 'sop';
    const sourceField = document.getElementById(normalizedTarget === 'remark' ? 'bank_remark' : 'bank_sop');
    currentBankNoteTarget = normalizedTarget;
    currentQuickRemarkProcessId = null;
    if (modal && sourceField && sopContent) {
        if (modalTitle) {
            modalTitle.textContent = normalizedTarget === 'remark' ? 'Process Remark' : 'Process SOP';
        }
        sopContent.placeholder = normalizedTarget === 'remark'
            ? 'Enter remark for this process...'
            : 'Enter SOP notes for this process...';
        sopContent.value = (sourceField.value || '').trim();
        modal.style.display = 'block';
    }
}

function closeSopModal() {
    const modal = document.getElementById('sopModal');
    if (modal) modal.style.display = 'none';
    currentQuickRemarkProcessId = null;
}

async function saveProcessNoteAndClose() {
    const sopContent = document.getElementById('sop_content');
    if (currentBankNoteTarget === 'quick_remark') {
        const remark = (sopContent && sopContent.value ? sopContent.value : '').trim().toUpperCase();
        if (!currentQuickRemarkProcessId) {
            closeSopModal();
            return;
        }
        try {
            const formData = new FormData();
            formData.append('id', String(currentQuickRemarkProcessId));
            formData.append('remark', remark);
            const response = await fetch(buildApiUrl('api/processes/update_bank_remark_api.php'), {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || result.message || 'Remark update failed');
            }
            const process = processes.find(function (p) { return p.id === currentQuickRemarkProcessId; });
            if (process) {
                process.remark = remark;
            }
            closeSopModal();
            showNotification('Remark updated', 'success');
        } catch (error) {
            console.error('Remark update failed:', error);
            showNotification(error.message || 'Remark update failed', 'danger');
        }
        return;
    }
    const targetField = document.getElementById(currentBankNoteTarget === 'remark' ? 'bank_remark' : 'bank_sop');
    if (targetField && sopContent) {
        targetField.value = (sopContent.value || '').trim().toUpperCase();
    }
    closeSopModal();
}

function openQuickRemarkModal(processId) {
    const modal = document.getElementById('sopModal');
    const modalTitle = document.getElementById('processNoteModalTitle');
    const sopContent = document.getElementById('sop_content');
    const process = processes.find(function (p) { return p.id === processId; });
    if (!modal || !sopContent || !process) return;
    currentBankNoteTarget = 'quick_remark';
    currentQuickRemarkProcessId = processId;
    if (modalTitle) {
        modalTitle.textContent = 'Process Remark';
    }
    sopContent.placeholder = 'Enter remark for this process...';
    sopContent.value = (process.remark || '').trim();
    modal.style.display = 'block';
}

async function openBankEditModal(id) {
    document.getElementById('addBankModal').style.display = 'block';
    setBankModalLoadingState(true, 'Edit Process');
    try {
        const processRequest = fetch(buildApiUrl(`api/processes/processlist_api.php?action=get_process&id=${id}&permission=Bank`));
        const bankDataRequest = ensureAddBankProcessDataLoaded();
        const response = await processRequest;
        const result = await response.json();
        if (!result.success || !result.data) {
            showNotification(result.error || 'Failed to load process data', 'danger');
            closeAddBankModal();
            return;
        }
        const process = result.data;
        document.getElementById('bank_edit_id').value = process.id;
        document.getElementById('bankModalTitle').textContent = 'Edit Process';
        document.getElementById('bankSubmitBtn').textContent = 'Update Process';
        document.getElementById('bankSubmitBtn').disabled = true;
        document.getElementById('bank_type').value = process.type || '';
        document.getElementById('bank_name').value = process.name || '';
        document.getElementById('bank_contract').value = process.contract || '';
        document.getElementById('bank_insurance').value = process.insurance != null && process.insurance !== '' ? process.insurance : '';
        const bankSopEl = document.getElementById('bank_sop');
        const bankRemarkEl = document.getElementById('bank_remark');
        if (bankSopEl) bankSopEl.value = (process.sop != null && process.sop !== undefined) ? String(process.sop).toUpperCase() : '';
        if (bankRemarkEl) bankRemarkEl.value = (process.remark != null && process.remark !== undefined) ? String(process.remark).toUpperCase() : '';
        document.getElementById('bank_cost').value = process.cost != null && process.cost !== '' ? process.cost : '';
        document.getElementById('bank_price').value = process.price != null && process.price !== '' ? process.price : '';
        document.getElementById('bank_profit').value = process.profit != null && process.profit !== '' ? process.profit : '';
        const dayStart = process.day_start || '';
        document.getElementById('bank_day_start').value = dayStart ? (dayStart.length === 10 ? dayStart : dayStart.split(' ')[0]) : '';
        const dayEnd = process.day_end || '';
        const dayEndEl = document.getElementById('bank_day_end');
        if (dayEndEl) {
            dayEndEl.value = dayEnd ? (dayEnd.length === 10 ? dayEnd : dayEnd.split(' ')[0]) : '';
        }
        const freqEl = document.getElementById('bank_day_start_frequency');
        if (freqEl) freqEl.value = process.day_start_frequency === 'monthly' ? 'monthly' : '1st_of_every_month';
        if (typeof updateBankFrequencyOptions === 'function') updateBankFrequencyOptions();
        document.getElementById('bank_profit_sharing').value = process.profit_sharing || '';
        window.selectedProfitSharingEntries = [];
        const psStr = (process.profit_sharing || '').trim();
        if (psStr) {
            psStr.split(',').forEach(function (part) {
                const t = part.trim();
                const dash = t.lastIndexOf(' - ');
                if (dash > -1) {
                    window.selectedProfitSharingEntries.push({
                        accountId: '',
                        accountText: t.substring(0, dash).trim(),
                        amount: t.substring(dash + 3).trim()
                    });
                }
            });
        }
        renderSelectedProfitSharing();
        if (typeof updateBankProfitDisplay === 'function') updateBankProfitDisplay();
        if (typeof clearBankFieldErrors === 'function') clearBankFieldErrors();

        const countrySelect = document.getElementById('bank_country');
        const bankSelect = document.getElementById('bank_bank');
        if (process.country && countrySelect && !Array.from(countrySelect.options).some(o => o.value === process.country)) {
            const opt = document.createElement('option');
            opt.value = process.country;
            opt.textContent = process.country;
            countrySelect.appendChild(opt);
        }
        if (countrySelect) {
            countrySelect.value = process.country || '';
        }
        if (process.bank && bankSelect && !Array.from(bankSelect.options).some(o => o.value === process.bank)) {
            const opt = document.createElement('option');
            opt.value = process.bank;
            opt.textContent = process.bank;
            bankSelect.appendChild(opt);
        }
        if (bankSelect) {
            bankSelect.value = process.bank || '';
        }
        const cardMerchantBtnEarly = document.getElementById('bank_card_merchant');
        const customerBtnEarly = document.getElementById('bank_customer');
        const profitAccountBtnEarly = document.getElementById('bank_profit_account');
        if (cardMerchantBtnEarly) {
            cardMerchantBtnEarly.setAttribute('data-value', process.card_merchant_id || '');
            const cmCode = (process.card_merchant_account_id != null && String(process.card_merchant_account_id).trim() !== '') ? String(process.card_merchant_account_id).trim() : '';
            const cmName = (process.card_merchant_name != null && String(process.card_merchant_name).trim() !== '') ? String(process.card_merchant_name).trim() : '';
            cardMerchantBtnEarly.textContent = process.card_merchant_id ? (cmCode !== '' ? cmCode : (cmName || process.card_merchant_account_id || process.card_merchant_id || 'Select Account')) : (cardMerchantBtnEarly.getAttribute('data-placeholder') || 'Select Account');
        }
        if (customerBtnEarly) {
            customerBtnEarly.setAttribute('data-value', process.customer_id || '');
            customerBtnEarly.textContent = process.customer_id ? ((process.customer_account || process.customer_name || process.customer_id) || 'Select Account') : (customerBtnEarly.getAttribute('data-placeholder') || 'Select Account');
        }
        if (profitAccountBtnEarly) {
            profitAccountBtnEarly.setAttribute('data-value', process.profit_account_id || '');
            profitAccountBtnEarly.textContent = process.profit_account_id ? ((process.profit_account_name || process.profit_account_id) || 'Select Account') : (profitAccountBtnEarly.getAttribute('data-placeholder') || 'Select Account');
        }

        await bankDataRequest;
        if (process.country) {
            if (!Array.from(countrySelect.options).some(o => o.value === process.country)) {
                const opt = document.createElement('option');
                opt.value = process.country;
                opt.textContent = process.country;
                countrySelect.appendChild(opt);
            }
            countrySelect.value = process.country;
            // 编辑时：若当前 process.bank 不在该 Country 的 Selected Banks 中则临时加入，再刷新下拉
            if (process.bank && (process.bank || '').trim()) {
                if (!window.selectedBanksByCountry) window.selectedBanksByCountry = {};
                const arr = window.selectedBanksByCountry[process.country] || [];
                if (arr.indexOf(process.bank) < 0) {
                    window.selectedBanksByCountry[process.country] = arr.concat([process.bank]);
                    persistSelectedBanksByCountryToStorage();
                }
            }
            applySelectedBanksToDropdown(process.country);
        } else {
            countrySelect.value = '';
            applySelectedBanksToDropdown('');
        }
        if (process.bank) {
            bankSelect.value = process.bank;
        } else {
            bankSelect.value = '';
        }
        const cardMerchantBtn = document.getElementById('bank_card_merchant');
        const customerBtn = document.getElementById('bank_customer');
        if (cardMerchantBtn && process.card_merchant_id) {
            cardMerchantBtn.setAttribute('data-value', process.card_merchant_id);
            const cmCode = (process.card_merchant_account_id != null && String(process.card_merchant_account_id).trim() !== '') ? String(process.card_merchant_account_id).trim() : '';
            const cmName = (process.card_merchant_name != null && String(process.card_merchant_name).trim() !== '') ? String(process.card_merchant_name).trim() : '';
            cardMerchantBtn.textContent = cmCode !== '' ? cmCode : (cmName || process.card_merchant_account_id || process.card_merchant_id || 'Select Account');
        } else if (cardMerchantBtn) {
            cardMerchantBtn.removeAttribute('data-value');
            cardMerchantBtn.textContent = cardMerchantBtn.getAttribute('data-placeholder') || 'Select Account';
        }
        if (customerBtn && process.customer_id) {
            customerBtn.setAttribute('data-value', process.customer_id);
            customerBtn.textContent = (process.customer_account || process.customer_name || process.customer_id) || 'Select Account';
        } else if (customerBtn) {
            customerBtn.removeAttribute('data-value');
            customerBtn.textContent = customerBtn.getAttribute('data-placeholder') || 'Select Account';
        }
        const profitAccountBtn = document.getElementById('bank_profit_account');
        if (profitAccountBtn && process.profit_account_id) {
            profitAccountBtn.setAttribute('data-value', process.profit_account_id);
            profitAccountBtn.textContent = (process.profit_account_name || process.profit_account_id) || 'Select Account';
        } else if (profitAccountBtn) {
            profitAccountBtn.removeAttribute('data-value');
            profitAccountBtn.textContent = profitAccountBtn.getAttribute('data-placeholder') || 'Select Account';
        }
        updateBankSubmitButtonState();
        document.getElementById('bankSubmitBtn').disabled = false;
    } catch (error) {
        console.error('Error opening bank edit modal:', error);
        closeAddBankModal();
        showNotification('Failed to load process data', 'danger');
    }
}

function toggleSelectAllBankProcesses() {
    const selectAllCheckbox = document.getElementById('selectAllBankProcesses');
    if (!selectAllCheckbox) {
        console.error('selectAllBankProcesses checkbox not found');
        return;
    }

    const allCheckboxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(cb => !cb.disabled);
    console.log('Found bank checkboxes:', allCheckboxes.length, 'Select all checked:', selectAllCheckbox.checked);

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateDeleteButton();
}

function loadAccountingInbox() {
    const urlStr = buildApiUrl('api/processes/process_accounting_inbox_api.php');
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    const u = new URL(urlStr);
    if (currentCompanyId) u.searchParams.set('company_id', currentCompanyId);
    return fetch(u.toString(), { method: 'GET', cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            const list = (data && data.success && data.data) ? data.data : [];
            window.__accountingInboxList = list;
            renderAccountingInbox(list);
        })
        .catch(err => { console.error('Accounting inbox load failed:', err); renderAccountingInbox([]); });
}

function openAccountingDueModal() {
    const modal = document.getElementById('processAccountingDueModal');
    if (modal) { modal.style.display = 'block'; loadAccountingInbox(); }
}

function closeAccountingDueModal() {
    const modal = document.getElementById('processAccountingDueModal');
    if (modal) modal.style.display = 'none';
}

async function postAccountingInboxToTransaction() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    if (!tbody) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled]):checked');
    const pairs = Array.from(checked).map(cb => {
        const tr = cb.closest('tr');
        const id = parseInt(cb.dataset.id, 10);
        const periodType = (tr && tr.getAttribute('data-period-type')) || 'monthly';
        return { id, periodType };
    }).filter(p => p.id);
    if (pairs.length === 0) {
        showNotification('Please select at least one process to post.', 'warning');
        return;
    }
    try {
        const formData = new FormData();
        pairs.forEach(p => { formData.append('ids[]', p.id); formData.append('period_types[]', p.periodType); });
        const response = await fetch(buildApiUrl('api/processes/process_post_to_transaction_api.php'), { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            showNotification(result.message || 'Posted successfully.', 'success');
            closeAccountingInbox();
            loadAccountingInbox();
            fetchProcesses();
        } else {
            showNotification(result.error || 'Post failed.', 'danger');
        }
    } catch (err) {
        console.error('transaction error:', err);
        showNotification('Request failed: ' + err.message, 'danger');
    }
}

function deleteAccountingInboxSelected() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    if (!tbody) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-delete-cb:checked');
    const pairs = Array.from(checked).map(cb => {
        const tr = cb.closest('tr');
        const id = parseInt(cb.dataset.id, 10);
        const periodType = (tr && tr.getAttribute('data-period-type')) || 'monthly';
        return { id, periodType };
    }).filter(p => !isNaN(p.id));
    if (pairs.length === 0) {
        showNotification('Please select at least one row to remove from Accounting Due', 'warning');
        return;
    }
    showConfirmAccountingDueDeleteModal(pairs);
}

async function confirmAccountingDueDelete() {
    if (pendingDismissPairs.length === 0) {
        closeConfirmAccountingDueDeleteModal();
        return;
    }
    const pairs = pendingDismissPairs.slice();
    closeConfirmAccountingDueDeleteModal();
    const deleteBtn = document.getElementById('processAccountingInboxDeleteBtn');
    const confirmBtn = document.getElementById('confirmAccountingDueDeleteBtn');
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Removing...'; }
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Removing...'; }
    try {
        const formData = new FormData();
        pairs.forEach(p => { formData.append('ids[]', p.id); formData.append('period_types[]', p.periodType); });
        const response = await fetch(buildApiUrl('api/processes/dismiss_accounting_due_api.php'), { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            showNotification(result.message || 'Removed from Accounting Due', 'success');
            loadAccountingInbox();
        } else {
            showNotification(result.message || result.error || 'Remove failed', 'danger');
        }
    } catch (err) {
        console.error('Dismiss error:', err);
        showNotification('Request failed: ' + (err.message || 'Network error'), 'danger');
    } finally {
        if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete'; updateAccountingInboxDeleteButton(); }
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete'; }
    }
}

function closeConfirmInactiveModal() {
    const modal = document.getElementById('confirmInactiveModal');
    if (modal) modal.style.display = 'none';
    pendingToggleProcessId = null;
    pendingToggleNewStatus = null;
    pendingBankStatusSelection = null;
}

async function confirmInactive() {
    if (!pendingToggleProcessId) {
        closeConfirmInactiveModal();
        return;
    }
    const processId = pendingToggleProcessId;
    const pendingStatusSelection = pendingBankStatusSelection ? {
        processId: pendingBankStatusSelection.processId,
        desiredStatus: pendingBankStatusSelection.desiredStatus
    } : null;
    closeConfirmInactiveModal();
    try {
        // 无论目标是 Active 还是 Inactive，都交给同一个切换函数处理
        await performToggleStatus(processId);
        if (pendingStatusSelection && pendingStatusSelection.processId === processId) {
            await updateBankIssueFlag(processId, '', { silent: true });
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Status toggle failed', 'danger');
    }
}

function clearBankFieldErrors() {
    bankRequiredFieldIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('bank-field-error');
    });
}

function markBankRequiredErrors() {
    clearBankFieldErrors();
    var country = (document.getElementById('bank_country') && document.getElementById('bank_country').value || '').trim();
    var bank = (document.getElementById('bank_bank') && document.getElementById('bank_bank').value || '').trim();
    var type = (document.getElementById('bank_type') && document.getElementById('bank_type').value || '').trim();
    var name = (document.getElementById('bank_name') && document.getElementById('bank_name').value || '').trim();
    var cost = (document.getElementById('bank_cost') && document.getElementById('bank_cost').value || '').trim();
    var price = (document.getElementById('bank_price') && document.getElementById('bank_price').value || '').trim();
    var contract = (document.getElementById('bank_contract') && document.getElementById('bank_contract').value || '').trim();
    var cardMerchantBtn = document.getElementById('bank_card_merchant');
    var customerBtn = document.getElementById('bank_customer');
    var profitAccountBtn = document.getElementById('bank_profit_account');
    var cardMerchant = cardMerchantBtn && cardMerchantBtn.getAttribute('data-value');
    var customer = customerBtn && customerBtn.getAttribute('data-value');
    var profitAccount = profitAccountBtn && profitAccountBtn.getAttribute('data-value');
    var hasError = false;
    if (!country) { var el = document.getElementById('bank_country'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!bank) { var el = document.getElementById('bank_bank'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!type) { var el = document.getElementById('bank_type'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!name) { var el = document.getElementById('bank_name'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!cost) { var el = document.getElementById('bank_cost'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!price) { var el = document.getElementById('bank_price'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!contract) { var el = document.getElementById('bank_contract'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!cardMerchant && cardMerchantBtn) { cardMerchantBtn.classList.add('bank-field-error'); hasError = true; }
    if (!customer && customerBtn) { customerBtn.classList.add('bank-field-error'); hasError = true; }
    if (!profitAccount && profitAccountBtn) { profitAccountBtn.classList.add('bank-field-error'); hasError = true; }
    return hasError;
}

function bindBankFieldErrorClear() {
    bankRequiredFieldIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el._bankErrorBound) return;
        el._bankErrorBound = true;
        el.addEventListener('input', function () { this.classList.remove('bank-field-error'); });
        el.addEventListener('change', function () { this.classList.remove('bank-field-error'); });
    });

    // Add frequency sync and auto-calc listeners
    const dayStartEl = document.getElementById('bank_day_start');
    const contractEl = document.getElementById('bank_contract');
    const dayEndEl = document.getElementById('bank_day_end');

    if (dayStartEl && !dayStartEl._freqBound) {
        dayStartEl._freqBound = true;
        dayStartEl.addEventListener('change', autoCalculateBankDayEnd);
    }
    if (contractEl && !contractEl._freqBound) {
        contractEl._freqBound = true;
        contractEl.addEventListener('change', autoCalculateBankDayEnd);
    }
    if (dayEndEl && !dayEndEl._freqBound) {
        dayEndEl._freqBound = true;
        dayEndEl.addEventListener('input', updateBankFrequencyOptions);
        dayEndEl.addEventListener('change', updateBankFrequencyOptions);
    }
}

function updateBankFrequencyOptions() {
    const dayEndEl = document.getElementById('bank_day_end');
    const freqEl = document.getElementById('bank_day_start_frequency');
    if (!dayEndEl || !freqEl) return;

    const hasDayEnd = !!dayEndEl.value;
    const monthlyOption = freqEl.querySelector('option[value="monthly"]');

    if (hasDayEnd) {
        // If day end is set, force to 1st of every month
        freqEl.value = '1st_of_every_month';
        if (monthlyOption) {
            monthlyOption.disabled = true;
        }
    } else {
        // If no day end, allow monthly selection
        if (monthlyOption) {
            monthlyOption.disabled = false;
        }
    }
}

function autoCalculateBankDayEnd() {
    // We no longer auto-calculate Day End. It must be entered manually.
    
    // After any change to Day Start or Contract, we still sync the frequency options 
    // in case the user has manually entered a Day End.
    updateBankFrequencyOptions();
}

function updateBankSubmitButtonState() {
    const modal = document.getElementById('addBankModal');
    const btn = document.getElementById('bankSubmitBtn');
    if (!modal || modal.style.display !== 'block' || !btn) return;
    btn.disabled = false;
}

function getOrderedRolesBank(roles, includeStaff = true) {
    const normalizedMap = new Map();
    (roles || []).forEach(role => {
        const trimmed = (role || '').trim();
        if (!trimmed) return;
        const upper = trimmed.toUpperCase();
        if (!normalizedMap.has(upper)) {
            normalizedMap.set(upper, trimmed);
        }
    });
    if (includeStaff) {
        normalizedMap.set('STAFF', 'STAFF');
    }
    const orderedRoles = [];
    BANK_ROLE_PRIORITY.forEach(role => {
        if (normalizedMap.has(role)) {
            orderedRoles.push(normalizedMap.get(role));
            normalizedMap.delete(role);
        }
    });
    const remaining = Array.from(normalizedMap.values()).sort((a, b) => a.localeCompare(b));
    return orderedRoles.concat(remaining);
}

function populateRoleSelectBank(selectElement, roles, selectedRole = '', includeStaff = true) {
    if (!selectElement) return;
    const orderedRoles = getOrderedRolesBank(roles, includeStaff);
    const selectedUpper = (selectedRole || '').toUpperCase();
    selectElement.innerHTML = '<option value="">Select Role</option>';
    orderedRoles.forEach(role => {
        const opt = document.createElement('option');
        opt.value = role;
        opt.textContent = role;
        if (selectedUpper && role.toUpperCase() === selectedUpper) opt.selected = true;
        selectElement.appendChild(opt);
    });
    if (selectedUpper && !orderedRoles.some(r => r.toUpperCase() === selectedUpper)) {
        const fallback = document.createElement('option');
        fallback.value = selectedRole;
        fallback.textContent = selectedRole;
        fallback.selected = true;
        selectElement.appendChild(fallback);
    }
}

async function loadEditDataBank() {
    try {
        const res = await fetch(buildApiUrl('api/editdata/editdata_api.php'));
        const result = await res.json();
        if (!result.success) return;
        const data = result.data || result;
        bankAccountCurrencies = data.currencies || [];
        bankAccountRoles = data.roles || [];
        const addRoleSelect = document.getElementById('add_role');
        if (addRoleSelect) {
            populateRoleSelectBank(addRoleSelect, bankAccountRoles);
        }
    } catch (e) {
        console.error('loadEditDataBank', e);
        const addRoleSelect = document.getElementById('add_role');
        if (addRoleSelect) {
            addRoleSelect.innerHTML = '<option value="">Select Role</option>';
            (bankAccountRoles.length > 0 ? getOrderedRolesBank(bankAccountRoles) : BANK_ROLE_PRIORITY).forEach(code => {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = code;
                addRoleSelect.appendChild(opt);
            });
        }
    }
}

function toggleAlertFieldsBank(type) {
    const isAdd = type === 'add';
    const paymentAlert = document.querySelector(isAdd ? 'input[name="add_payment_alert"]:checked' : 'input[name="payment_alert"]:checked');
    const alertFields = document.getElementById(isAdd ? 'add_alert_fields' : 'edit_alert_fields');
    const alertAmountRow = document.getElementById(isAdd ? 'add_alert_amount_row' : 'edit_alert_amount_row');
    if (paymentAlert && paymentAlert.value === '1') {
        if (alertFields) alertFields.style.display = 'flex';
        if (alertAmountRow) alertAmountRow.style.display = 'block';
    } else {
        if (alertFields) alertFields.style.display = 'none';
        if (alertAmountRow) alertAmountRow.style.display = 'none';
    }
}

function validatePaymentAlertForAddBank() {
    const paymentAlert = document.querySelector('input[name="add_payment_alert"]:checked');
    const alertType = document.getElementById('add_alert_type');
    const alertStartDate = document.getElementById('add_alert_start_date');
    const alertAmount = document.getElementById('add_alert_amount');
    if (paymentAlert && paymentAlert.value === '1') {
        if (!alertType || !alertType.value || !alertStartDate || !alertStartDate.value) {
            showNotification('When Payment Alert is Yes, both Alert Type and Start Date must be filled.', 'danger');
            return false;
        }
        if (alertAmount && alertAmount.value && (isNaN(parseFloat(alertAmount.value)) || parseFloat(alertAmount.value) >= 0)) {
            showNotification('Alert Amount must be a negative number.', 'danger');
            return false;
        }
    }
    return true;
}

function validatePaymentAlertForEditBank() {
    const paymentAlert = document.querySelector('input[name="payment_alert"]:checked');
    const alertType = document.getElementById('edit_alert_type');
    const alertStartDate = document.getElementById('edit_alert_start_date');
    const alertAmount = document.getElementById('edit_alert_amount');
    if (paymentAlert && paymentAlert.value === '1') {
        if (!alertType || !alertType.value || !alertStartDate || !alertStartDate.value) {
            showNotification('When Payment Alert is Yes, both Alert Type and Start Date must be filled.', 'danger');
            return false;
        }
        if (alertAmount && alertAmount.value && (isNaN(parseFloat(alertAmount.value)) || parseFloat(alertAmount.value) >= 0)) {
            showNotification('Alert Amount must be a negative number.', 'danger');
            return false;
        }
    }
    return true;
}

async function loadAccountCurrenciesBank(accountId, type) {
    const listId = type === 'add' ? 'addCurrencyList' : 'editCurrencyList';
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    listElement.innerHTML = '';
    if (type === 'add' && !accountId) deletedCurrencyIds = [];
    try {
        const url = accountId
            ? buildApiUrl('api/accounts/account_currency_api.php?action=get_available_currencies&account_id=' + accountId)
            : buildApiUrl('api/accounts/account_currency_api.php?action=get_available_currencies');
        const response = await fetch(url);
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">No currencies available.</div>';
            return;
        }
        const isAddMode = type === 'add' && !accountId;
        let currencyToAutoSelect = null;
        if (isAddMode && selectedCurrencyIdsForAdd.length === 0) {
            const myr = result.data.find(c => String(c.code || '').toUpperCase() === 'MYR');
            currencyToAutoSelect = myr || (result.data.length ? result.data.sort((a, b) => a.id - b.id)[0] : null);
        }
        result.data.forEach(currency => {
            if (deletedCurrencyIds.includes(currency.id)) return;
            const code = String(currency.code || '').toUpperCase();
            const item = document.createElement('div');
            item.className = 'account-currency-item currency-toggle-item';
            item.setAttribute('data-currency-id', currency.id);
            const codeSpan = document.createElement('span');
            codeSpan.className = 'currency-code-text';
            codeSpan.textContent = code;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'currency-delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.setAttribute('type', 'button');
            deleteBtn.setAttribute('title', 'Delete currency permanently');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteCurrencyPermanentlyBank(currency.id, code, item);
            });
            item.appendChild(codeSpan);
            item.appendChild(deleteBtn);
            if (currency.is_linked) item.classList.add('selected');
            else if (isAddMode && selectedCurrencyIdsForAdd.includes(currency.id)) item.classList.add('selected');
            else if (isAddMode && currencyToAutoSelect && currency.id === currencyToAutoSelect.id) {
                item.classList.add('selected');
                if (!selectedCurrencyIdsForAdd.includes(currency.id)) selectedCurrencyIdsForAdd.push(currency.id);
            }
            if (isAddMode) {
                codeSpan.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    if (shouldSelect) {
                        item.classList.add('selected');
                        if (!selectedCurrencyIdsForAdd.includes(currency.id)) selectedCurrencyIdsForAdd.push(currency.id);
                    } else {
                        item.classList.remove('selected');
                        selectedCurrencyIdsForAdd = selectedCurrencyIdsForAdd.filter(id => id !== currency.id);
                    }
                });
            } else if (type === 'edit' && accountId) {
                codeSpan.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    toggleAccountCurrencyBank(accountId, currency.id, code, shouldSelect, item);
                });
            }
            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account currencies:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">Failed to load currencies.</div>';
    }
}

async function toggleAccountCurrencyBank(accountId, currencyId, code, shouldSelect, itemElement) {
    const previousState = itemElement.classList.contains('selected');
    if (shouldSelect) itemElement.classList.add('selected');
    else itemElement.classList.remove('selected');
    try {
        const action = shouldSelect ? 'add_currency' : 'remove_currency';
        const res = await fetch(buildApiUrl('api/accounts/account_currency_api.php?action=' + action), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, currency_id: currencyId })
        });
        const result = await res.json();
        if (result.success) {
            showNotification(shouldSelect ? 'Currency ' + code + ' added to account' : 'Currency ' + code + ' removed from account', 'success');
        } else {
            if (previousState) itemElement.classList.add('selected');
            else itemElement.classList.remove('selected');
            showNotification(result.error || 'Currency update failed', 'danger');
        }
    } catch (e) {
        if (previousState) itemElement.classList.add('selected');
        else itemElement.classList.remove('selected');
        showNotification('Currency update failed', 'danger');
    }
}

async function deleteCurrencyPermanentlyBank(currencyId, currencyCode, itemElement) {
    if (!confirm('Are you sure you want to permanently delete currency ' + currencyCode + '? This action cannot be undone.')) return;
    try {
        const res = await fetch(buildApiUrl('api/accounts/delete_currency_api.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currencyId })
        });
        const data = await res.json();
        if (data.success) {
            if (itemElement && itemElement.parentNode) itemElement.remove();
            if (!deletedCurrencyIds.includes(currencyId)) deletedCurrencyIds.push(currencyId);
            showNotification('Currency ' + currencyCode + ' deleted successfully!', 'success');
        } else {
            showNotification(data.error || 'Failed to delete currency', 'danger');
        }
    } catch (e) {
        showNotification('Failed to delete currency', 'danger');
    }
}

async function loadAccountCompaniesBank(accountId, type) {
    const listId = type === 'add' ? 'addCompanyList' : 'editCompanyList';
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    listElement.innerHTML = '';
    if (type === 'add' && !accountId) {
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (currentCompanyId && !selectedCompanyIdsForAdd.includes(currentCompanyId))
            selectedCompanyIdsForAdd.push(currentCompanyId);
    }
    try {
        const url = accountId
            ? buildApiUrl('api/accounts/account_company_api.php?action=get_available_companies&account_id=' + accountId)
            : buildApiUrl('api/accounts/account_company_api.php?action=get_available_companies');
        const response = await fetch(url);
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">No companies available.</div>';
            return;
        }
        const isAddMode = type === 'add' && !accountId;
        const isEditMode = type === 'edit' && accountId;
        if (isEditMode) selectedCompanyIdsForEdit = [];
        result.data.forEach(company => {
            const code = String(company.company_code || '').toUpperCase();
            const item = document.createElement('div');
            item.className = 'account-currency-item currency-toggle-item';
            item.setAttribute('data-company-id', company.id);
            item.textContent = code;
            if (company.is_linked) {
                item.classList.add('selected');
                if (isEditMode) selectedCompanyIdsForEdit.push(company.id);
            } else if (isAddMode && selectedCompanyIdsForAdd.includes(company.id)) item.classList.add('selected');
            if (isAddMode) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    if (shouldSelect) {
                        item.classList.add('selected');
                        if (!selectedCompanyIdsForAdd.includes(company.id)) selectedCompanyIdsForAdd.push(company.id);
                    } else {
                        item.classList.remove('selected');
                        selectedCompanyIdsForAdd = selectedCompanyIdsForAdd.filter(id => id !== company.id);
                    }
                });
            } else if (isEditMode) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    if (shouldSelect) {
                        item.classList.add('selected');
                        if (!selectedCompanyIdsForEdit.includes(company.id)) selectedCompanyIdsForEdit.push(company.id);
                    } else {
                        item.classList.remove('selected');
                        selectedCompanyIdsForEdit = selectedCompanyIdsForEdit.filter(id => id !== company.id);
                    }
                });
            }
            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account companies:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">Failed to load companies.</div>';
    }
}

async function addCurrencyFromInputBank(type) {
    const isEdit = type === 'edit';
    const input = document.getElementById(isEdit ? 'editCurrencyInput' : 'addCurrencyInput');
    const currencyCode = (input && input.value.trim() || '').toUpperCase();
    if (!currencyCode) {
        showNotification('Please enter currency code', 'danger');
        if (input) input.focus();
        return false;
    }
    const existing = bankAccountCurrencies.find(c => (c.code || '').toUpperCase() === currencyCode);
    if (existing) {
        showNotification('Currency ' + currencyCode + ' already exists', 'info');
        if (input) input.value = '';
        return;
    }
    try {
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        const res = await fetch(buildApiUrl('api/accounts/addcurrencyapi.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: currencyCode, company_id: currentCompanyId })
        });
        const result = await res.json();
        if (result.success && result.data) {
            const newCurrencyId = result.data.id;
            bankAccountCurrencies.push({ id: newCurrencyId, code: result.data.code });
            if (isEdit && currentEditAccountIdForBank) {
                await loadAccountCurrenciesBank(currentEditAccountIdForBank, 'edit');
                const linkRes = await fetch(buildApiUrl('api/accounts/account_currency_api.php?action=add_currency'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_id: currentEditAccountIdForBank, currency_id: newCurrencyId })
                });
                const linkResult = await linkRes.json();
                if (linkResult.success) {
                    await loadAccountCurrenciesBank(currentEditAccountIdForBank, 'edit');
                    showNotification('Currency ' + currencyCode + ' created and linked to account', 'success');
                } else {
                    showNotification('Currency ' + currencyCode + ' created, link failed', 'warning');
                }
            } else {
                await loadAccountCurrenciesBank(null, 'add');
                showNotification('Currency ' + currencyCode + ' created successfully', 'success');
            }
            if (input) input.value = '';
        } else {
            showNotification(result.error || 'Failed to create currency', 'danger');
        }
    } catch (e) {
        showNotification('Failed to create currency', 'danger');
    }
    return false;
}

async function loadAddBankProcessData() {
    try {
        await loadCountriesFromServer();
        await restoreSelectedBanksByCountryFromStorage();
        if (!window.selectedBanksByCountry || typeof window.selectedBanksByCountry !== 'object') window.selectedBanksByCountry = {};
        const countrySelect = document.getElementById('bank_country');
        const firstCountry = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
        if (firstCountry) await loadBanksByCountry(firstCountry);
        await loadBankAccounts();
        initBankAccountSelect('bank_card_merchant', 'bank_card_merchant_dropdown');  // Supplier: show account_id like Customer/Company
        initBankAccountSelect('bank_customer', 'bank_customer_dropdown');
        initBankAccountSelect('bank_profit_account', 'bank_profit_account_dropdown');
        updateBankAddButtonTitles();

        // 设置 Profit 自动计算（只初始化一次）；有 Profit Sharing 时显示扣除后的数额
        if (!bankProfitCalculatorsInitialized) {
            const costInput = document.getElementById('bank_cost');
            const priceInput = document.getElementById('bank_price');
            const profitInput = document.getElementById('bank_profit');
            if (costInput && priceInput && profitInput) {
                costInput.addEventListener('input', updateBankProfitDisplay);
                priceInput.addEventListener('input', updateBankProfitDisplay);
                bankProfitCalculatorsInitialized = true;
            }
        }
    } catch (error) {
        console.error('Error loading bank process data:', error);
    }
}

async function loadBanksByCountry(country) {
    const select = document.getElementById('bank_bank');
    if (!select) return;
    const currentBank = (select.value || '').trim();
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Select Bank';
    select.appendChild(opt0);
    if (!country || (country = String(country).trim()) === '') {
        if (currentBank) select.value = '';
        return;
    }
    try {
        const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        let url = buildApiUrl('api/processes/processlist_api.php?action=get_banks_by_country&country=' + encodeURIComponent(country));
        if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
        const res = await fetch(url);
        const result = await res.json();
        const banks = (result.success && result.data) ? result.data : [];
        banks.forEach(function (b) {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            select.appendChild(opt);
        });
        if (currentBank && banks.indexOf(currentBank) >= 0) select.value = currentBank;
        else select.value = '';
    } catch (e) {
        console.warn('loadBanksByCountry', e);
        if (currentBank) select.value = '';
    }
}

async function ensureAccountHasCountryCurrency(accountId) {
    if (!accountId) return;
    const countrySelect = document.getElementById('bank_country');
    const countryOrCurrency = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
    const currencyCode = resolveCurrencyCodeFromCountryField(countryOrCurrency);
    if (!currencyCode) return;
    try {
        const apiUrl = buildApiUrl('api/processes/addprocess_api.php');
        const res = await fetch(apiUrl);
        const result = await res.json();
        if (!result.success) return;
        const currencies = result.currencies || [];
        let currency = currencies.find(c => (c.code || '').toUpperCase() === currencyCode);
        if (!currency || !currency.id) {
            const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            const createRes = await fetch(buildApiUrl('api/accounts/addcurrencyapi.php'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: currencyCode, company_id: currentCompanyId || undefined })
            });
            const createResult = await createRes.json();
            if (createResult.success && createResult.data) {
                currency = { id: createResult.data.id, code: createResult.data.code || currencyCode };
            } else if (createResult.error && (createResult.error + '').toLowerCase().includes('already exists')) {
                const refetch = await fetch(apiUrl);
                const refetchResult = await refetch.json();
                if (refetchResult.success && Array.isArray(refetchResult.currencies)) {
                    currency = refetchResult.currencies.find(c => (c.code || '').toUpperCase() === currencyCode);
                }
            }
            if (!currency || !currency.id) {
                console.warn('ensureAccountHasCountryCurrency: could not get or create currency', currencyCode);
                return;
            }
        }
        const getCurrUrl = buildApiUrl('api/accounts/account_currency_api.php?action=get_account_currencies&account_id=' + accountId);
        const getCurrRes = await fetch(getCurrUrl);
        const getCurrResult = await getCurrRes.json();
        if (getCurrResult.success && Array.isArray(getCurrResult.data)) {
            const alreadyHas = getCurrResult.data.some(c => (c.currency_id || c.id) === currency.id || (c.currency_code || '').toUpperCase() === currencyCode);
            if (alreadyHas) return;
        }
        const addUrl = buildApiUrl('api/accounts/account_currency_api.php?action=add_currency');
        const addRes = await fetch(addUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, currency_id: currency.id })
        });
        const addResult = await addRes.json();
        if (addResult.success) {
            showNotification(currencyCode + ' added to account', 'success');
        }
    } catch (e) {
        console.warn('ensureAccountHasCountryCurrency', e);
    }
}

async function loadBankAccounts() {
    try {
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        const url = new URL(buildApiUrl('api/accounts/accountlistapi.php'));
        if (currentCompanyId) {
            url.searchParams.set('company_id', currentCompanyId);
        }
        // 不传 roles 参数，API 返回该公司下全部账户（含所有 role）

        const response = await fetch(url.toString());
        const result = await response.json();

        if (result.success && result.data != null) {
            // API 返回格式为 data: { accounts: [...], count, ... }，与 Account List 一致
            window.bankAccounts = (result.data.accounts && Array.isArray(result.data.accounts)) ? result.data.accounts : [];
        } else {
            window.bankAccounts = [];
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        window.bankAccounts = [];
    }
}

function initBankAccountSelect(buttonId, dropdownId, showNameInParentheses) {
    const accountButton = document.getElementById(buttonId);
    const accountDropdown = document.getElementById(dropdownId);
    const searchInput = accountDropdown?.querySelector('.custom-select-search input');
    const optionsContainer = accountDropdown?.querySelector('.custom-select-options');

    if (!accountButton || !accountDropdown || !searchInput || !optionsContainer) return;

    let isOpen = false;
    let dropdownOriginalParent = null;
    let dropdownOriginalNextSibling = null;
    const isInBankModal = accountDropdown.closest('#addBankModal');

    function moveDropdownToBody() {
        if (!isInBankModal) return;
        const rect = accountButton.getBoundingClientRect();
        dropdownOriginalParent = accountDropdown.parentNode;
        dropdownOriginalNextSibling = accountDropdown.nextSibling;
        document.body.appendChild(accountDropdown);
        accountDropdown.style.position = 'fixed';
        accountDropdown.style.left = rect.left + 'px';
        accountDropdown.style.top = (rect.bottom + 2) + 'px';
        accountDropdown.style.width = Math.max(rect.width, 220) + 'px';
        accountDropdown.style.minWidth = Math.max(rect.width, 220) + 'px';
        accountDropdown.style.zIndex = '10001';
    }
    function restoreDropdownToModal() {
        if (!isInBankModal || !dropdownOriginalParent) return;
        if (dropdownOriginalNextSibling) {
            dropdownOriginalParent.insertBefore(accountDropdown, dropdownOriginalNextSibling);
        } else {
            dropdownOriginalParent.appendChild(accountDropdown);
        }
        accountDropdown.style.position = '';
        accountDropdown.style.left = '';
        accountDropdown.style.top = '';
        accountDropdown.style.width = '';
        accountDropdown.style.minWidth = '';
        accountDropdown.style.zIndex = '';
        dropdownOriginalParent = null;
        dropdownOriginalNextSibling = null;
    }
    function closeThisDropdown() {
        restoreDropdownToModal();
        accountDropdown.style.display = 'none';
        accountDropdown.classList.remove('custom-select-dropdown-above');
        isOpen = false;
    }
    accountDropdown._bankAccountClose = closeThisDropdown;

    // Load accounts into dropdown（API 返回该公司下全部账户，四类下拉共用同一列表）
    const placeholderText = accountButton.getAttribute('data-placeholder') || 'Select Account';
    function loadAccounts() {
        optionsContainer.innerHTML = '';
        // Always read filter from this dropdown's search input so search matches what user sees
        const filterLower = (searchInput.value || '').toLowerCase().trim();
        let accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];

        // Always add "Select Account" as first option so user can clear selection
        {
            const selectOpt = document.createElement('div');
            selectOpt.className = 'custom-select-option';
            selectOpt.setAttribute('data-value', '');
            selectOpt.textContent = 'Select Account';
            selectOpt.addEventListener('click', () => {
                accountButton.textContent = placeholderText;
                accountButton.setAttribute('data-value', '');
                closeThisDropdown();
                updateBankAddButtonTitles();
                if (typeof updateBankSubmitButtonState === 'function') updateBankSubmitButtonState();
            });
            optionsContainer.appendChild(selectOpt);
        }

        // Filter by the same text we display so search matches what user sees (exact match on displayed string)
        // Supplier only: show name only (no id); others: show account_id only
        function getDisplayText(account) {
            const code = String(account.account_id ?? account.name ?? '').trim();
            const nameStr = (account.name != null && String(account.name).trim() !== '') ? String(account.name).trim() : '';
            if (showNameInParentheses) {
                return nameStr !== '' ? nameStr : code;
            }
            return code;
        }
        let filteredAccounts = accounts.filter(account => {
            const displayText = getDisplayText(account).toLowerCase();
            return !filterLower || displayText.includes(filterLower);
        });
        // Sort alphabetically by display text
        filteredAccounts = filteredAccounts.slice().sort((a, b) => {
            const ta = getDisplayText(a).toLowerCase();
            const tb = getDisplayText(b).toLowerCase();
            return ta.localeCompare(tb);
        });

        if (filteredAccounts.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'custom-select-no-results';
            noResults.textContent = 'No accounts found';
            optionsContainer.appendChild(noResults);
        } else {
            filteredAccounts.forEach(account => {
                const option = document.createElement('div');
                option.className = 'custom-select-option';
                option.setAttribute('data-value', account.id);
                option.textContent = getDisplayText(account);
                option.addEventListener('click', () => {
                    accountButton.textContent = getDisplayText(account);
                    accountButton.setAttribute('data-value', account.id);
                    accountButton.classList.remove('bank-field-error');
                    closeThisDropdown();
                    updateBankAddButtonTitles();
                    if (typeof updateBankSubmitButtonState === 'function') updateBankSubmitButtonState();
                });
                optionsContainer.appendChild(option);
            });
        }
    }

    // Initial load
    loadAccounts();

    // Search input handler: loadAccounts() reads filter from searchInput.value
    searchInput.addEventListener('input', () => {
        loadAccounts();
    });

    // Toggle dropdown: clear search so filter is fresh, then load
    accountButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeThisDropdown();
        } else {
            // 打开当前前先收起其他两个账户下拉（Supplier/Customer/Company 互斥）
            const allBankDropdownIds = ['bank_card_merchant_dropdown', 'bank_customer_dropdown', 'bank_profit_account_dropdown'];
            allBankDropdownIds.forEach(function (id) {
                if (id === dropdownId) return;
                const other = document.getElementById(id);
                if (other && other._bankAccountClose) other._bankAccountClose();
            });
            accountDropdown.style.display = 'block';
            isOpen = true;
            searchInput.value = '';
            loadAccounts();
            searchInput.focus();
            // 在 Bank 弹窗内时挂到 body 用 fixed 定位，完整溢出弹窗显示
            moveDropdownToBody();
            const rect = accountButton.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 24;
            const spaceAbove = rect.top - 24;
            const searchHeight = 50;
            const useAbove = !isInBankModal && spaceBelow < 280 && spaceAbove > spaceBelow;
            if (useAbove) {
                accountDropdown.classList.add('custom-select-dropdown-above');
                const maxOpt = Math.max(200, Math.min(320, spaceAbove - searchHeight));
                if (optionsContainer) optionsContainer.style.maxHeight = maxOpt + 'px';
                accountDropdown.style.maxHeight = (maxOpt + searchHeight + 16) + 'px';
            } else {
                accountDropdown.classList.remove('custom-select-dropdown-above');
                const maxOpt = Math.max(200, Math.min(320, spaceBelow - searchHeight));
                if (optionsContainer) optionsContainer.style.maxHeight = maxOpt + 'px';
                accountDropdown.style.maxHeight = (maxOpt + searchHeight + 16) + 'px';
            }
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!accountButton.contains(e.target) && !accountDropdown.contains(e.target)) {
            closeThisDropdown();
        }
    });
}

async function showAddCountryModal() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId) {
        try {
            const selUrl = buildApiUrl('api/processes/processlist_api.php?action=get_selected_countries&company_id=' + encodeURIComponent(companyId));
            const selRes = await fetch(selUrl);
            const selResult = await selRes.json();
            const serverList = (selResult.success && selResult.data && Array.isArray(selResult.data)) ? selResult.data : [];
            if (serverList.length > 0) {
                window.selectedCountries = serverList.slice();
            }
        } catch (e) { console.warn('get_selected_countries', e); }
    }
    if (!window.selectedCountries || !Array.isArray(window.selectedCountries)) window.selectedCountries = [];
    if (window.selectedCountries.length === 0) {
        restoreSelectedCountriesFromStorage();
        if (window.selectedCountries.length === 0) {
            const select = document.getElementById('bank_country');
            if (select && select.options) {
                for (let i = 0; i < select.options.length; i++) {
                    const v = (select.options[i].value || '').trim();
                    if (v && !window.selectedCountries.includes(v)) window.selectedCountries.push(v);
                }
            }
        }
    }
    let allCountries = [];
    try {
        allCountries = await fetchCompanyCurrencyCodes();
        if (allCountries.length === 0) {
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            let url = buildApiUrl('api/processes/processlist_api.php?action=get_countries');
            if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
            const res = await fetch(url);
            const result = await res.json();
            allCountries = (result.success && result.data) ? result.data : [];
        }
    } catch (e) { console.warn('country list', e); }
    loadExistingCountries(allCountries);
    updateSelectedCountriesInModal();
    const modal = document.getElementById('countrySelectionModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
}

function filterCountries() {
    const term = (document.getElementById('countrySearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#existingCountries .country-item');
    items.forEach(item => {
        const text = item.querySelector('label')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

async function confirmCountries() {
    const select = document.getElementById('bank_country');
    if (!select) { closeCountrySelectionModal(); return; }
    const list = (window.selectedCountries || []).filter(function (name) { return (name || '').trim(); }).map(function (name) { return (name || '').trim(); });
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Select Country';
    select.appendChild(opt0);
    list.forEach(function (name) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (list.length > 0) select.value = list[0];
    persistSelectedCountriesToStorage();
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId && list.length >= 0) {
        try {
            const fd = new FormData();
            fd.append('company_id', companyId);
            list.forEach(function (c) { fd.append('countries[]', c); });
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=save_selected_countries'), { method: 'POST', body: fd });
            const result = await res.json();
            if (!result.success) console.warn('save_selected_countries', result.error);
        } catch (e) { console.warn('save_selected_countries', e); }
    }
    closeCountrySelectionModal();
}

function getSelectedBanksByCountryStorageKey() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    return 'processlist_selected_banks_by_country' + (companyId ? '_' + companyId : '');
}

async function restoreSelectedBanksByCountryFromStorage() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId) {
        try {
            const url = buildApiUrl('api/processes/processlist_api.php?action=get_selected_banks&company_id=' + encodeURIComponent(companyId));
            const res = await fetch(url);
            const result = await res.json();
            if (result.success && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                window.selectedBanksByCountry = result.data;
                return;
            }
        } catch (e) { /* ignore */ }
    }
    try {
        const raw = localStorage.getItem(getSelectedBanksByCountryStorageKey());
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            window.selectedBanksByCountry = obj;
        }
    } catch (e) { /* ignore */ }
}

function persistSelectedBanksByCountryToStorage() {
    try {
        const key = getSelectedBanksByCountryStorageKey();
        if (window.selectedBanksByCountry && typeof window.selectedBanksByCountry === 'object') {
            localStorage.setItem(key, JSON.stringify(window.selectedBanksByCountry));
        } else {
            localStorage.removeItem(key);
        }
    } catch (e) { /* ignore */ }
}

function applySelectedBanksToDropdown(country) {
    const select = document.getElementById('bank_bank');
    if (!select) return;
    const currentBank = (select.value || '').trim();
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Select Bank';
    select.appendChild(opt0);
    const c = (country || '').trim();
    const list = (window.selectedBanksByCountry && window.selectedBanksByCountry[c]) ? window.selectedBanksByCountry[c] : [];
    if (Array.isArray(list) && list.length > 0) {
        list.forEach(function (b) {
            const n = (b || '').trim();
            if (!n) return;
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            select.appendChild(opt);
        });
        if (currentBank && list.indexOf(currentBank) >= 0) select.value = currentBank;
        else select.value = '';
    } else {
        select.value = '';
    }
}

async function showAddBankModal() {
    const countrySelect = document.getElementById('bank_country');
    const country = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
    if (!country) {
        showNotification('Please select Country first', 'danger');
        return;
    }
    // Selected Banks 从当前 Country 的已选列表恢复；Available 由 loadExistingBanks 按接口拉取
    window.selectedBanks = (window.selectedBanksByCountry && window.selectedBanksByCountry[country]) ? window.selectedBanksByCountry[country].slice() : [];
    await loadExistingBanks(country);
    updateSelectedBanksInModal();
    const modal = document.getElementById('bankSelectionModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
}

async function loadExistingBanks(countryForApi) {
    let all = [];
    if (countryForApi) {
        try {
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            let url = buildApiUrl('api/processes/processlist_api.php?action=get_banks_by_country&country=' + encodeURIComponent(countryForApi));
            if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
            const res = await fetch(url);
            const result = await res.json();
            all = (result.success && result.data) ? result.data : [];
            all = [...new Set([...all, ...(availableBanksList || [])])].sort((a, b) => a.localeCompare(b));
        } catch (e) {
            all = [...(availableBanksList || [])].sort((a, b) => a.localeCompare(b));
        }
    } else {
        const select = document.getElementById('bank_bank');
        const existingOptions = [];
        if (select && select.options) {
            for (let i = 0; i < select.options.length; i++) {
                const v = (select.options[i].value || '').trim();
                if (v) existingOptions.push(v);
            }
        }
        all = [...new Set([...DEFAULT_BANKS, ...existingOptions, ...(availableBanksList || [])])].sort((a, b) => a.localeCompare(b));
    }
    const selectedSet = new Set(window.selectedBanks || []);
    const combined = all.filter(name => !selectedSet.has(name));
    availableBanksList = combined;

    const listEl = document.getElementById('existingBanks');
    if (!listEl) return;
    listEl.innerHTML = '';
    combined.forEach((name, index) => {
        const id = 'bank_' + (Date.now() + index);
        const item = document.createElement('div');
        item.className = 'bank-item';
        const left = document.createElement('div');
        left.className = 'bank-item-left';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'available_banks';
        checkbox.value = name;
        checkbox.id = id;
        checkbox.dataset.bankId = id;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = name;
        left.appendChild(checkbox);
        left.appendChild(label);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'bank-delete-btn';
        deleteBtn.title = 'Remove from list';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            removeBankFromAvailable(name, item);
        });
        item.appendChild(left);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
        checkbox.addEventListener('change', function () {
            if (this.checked) moveBankToSelected(this);
            else moveBankToAvailable(this);
        });
    });
}

function updateSelectedBanksInModal() {
    const selectedList = document.getElementById('selectedBanksInModal');
    if (!selectedList) return;
    selectedList.innerHTML = '';
    const current = (document.getElementById('bank_bank')?.value || '').trim();
    if (!window.selectedBanks) window.selectedBanks = [];
    if (current && !window.selectedBanks.includes(current)) {
        window.selectedBanks = [current];
    }
    if (window.selectedBanks.length > 0) {
        window.selectedBanks.forEach((name, idx) => {
            const div = document.createElement('div');
            div.className = 'selected-bank-modal-item';
            const safeName = (name || '').replace(/'/g, "\\'");
            div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-bank-modal" onclick="moveBankBackToAvailable(\'' + safeName + '\', \'bid' + idx + '\')">&times;</button>';
            selectedList.appendChild(div);
        });
    } else {
        selectedList.innerHTML = '<div class="no-banks">No banks selected</div>';
    }
}

function filterBanks() {
    const term = (document.getElementById('bankSearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#existingBanks .bank-item');
    items.forEach(item => {
        const text = item.querySelector('label')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

function moveBankToSelected(checkbox) {
    const name = checkbox.value;
    const id = checkbox.dataset.bankId;
    const item = checkbox.closest('.bank-item');
    if (!window.selectedBanks) window.selectedBanks = [];
    if (!window.selectedBanks.includes(name)) window.selectedBanks.push(name);
    const selectedList = document.getElementById('selectedBanksInModal');
    const placeholder = selectedList.querySelector('.no-banks');
    if (placeholder) placeholder.remove();
    const div = document.createElement('div');
    div.className = 'selected-bank-modal-item';
    const safeName = (name || '').replace(/'/g, "\\'");
    div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-bank-modal" onclick="moveBankBackToAvailable(\'' + safeName + '\', \'' + id + '\')">&times;</button>';
    selectedList.appendChild(div);
    if (item) item.remove();
}

function moveBankBackToAvailable(bankName, bankId) {
    if (window.selectedBanks) {
        const idx = window.selectedBanks.indexOf(bankName);
        if (idx > -1) window.selectedBanks.splice(idx, 1);
    }
    const selectedList = document.getElementById('selectedBanksInModal');
    selectedList.querySelectorAll('.selected-bank-modal-item').forEach(item => {
        if (item.querySelector('span')?.textContent === bankName) item.remove();
    });
    if (!selectedList.querySelector('.selected-bank-modal-item')) {
        selectedList.innerHTML = '<div class="no-banks">No banks selected</div>';
    }
    const listEl = document.getElementById('existingBanks');
    if (!listEl) return;
    const id = 'bank_' + (bankId || Date.now());
    const newItem = document.createElement('div');
    newItem.className = 'bank-item';
    const left = document.createElement('div');
    left.className = 'bank-item-left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'available_banks';
    cb.value = bankName;
    cb.id = id;
    cb.dataset.bankId = id;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = bankName;
    left.appendChild(cb);
    left.appendChild(label);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'bank-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeBankFromAvailable(bankName, newItem);
    });
    newItem.appendChild(left);
    newItem.appendChild(delBtn);
    listEl.appendChild(newItem);
    cb.addEventListener('change', function () {
        if (this.checked) moveBankToSelected(this);
        else moveBankToAvailable(this);
    });
}

function moveBankToAvailable(checkbox) {
    const name = checkbox.value;
    const item = checkbox.closest('.bank-item');
    if (window.selectedBanks) {
        const idx = window.selectedBanks.indexOf(name);
        if (idx > -1) window.selectedBanks.splice(idx, 1);
    }
    document.getElementById('selectedBanksInModal').querySelectorAll('.selected-bank-modal-item').forEach(el => {
        if (el.querySelector('span')?.textContent === name) el.remove();
    });
    const selectedList = document.getElementById('selectedBanksInModal');
    if (!selectedList.querySelector('.selected-bank-modal-item')) {
        selectedList.innerHTML = '<div class="no-banks">No banks selected</div>';
    }
}

function removeBankFromAvailable(bankName, itemEl) {
    if (itemEl && itemEl.parentNode) itemEl.remove();
}

function closeBankSelectionModal() {
    const modal = document.getElementById('bankSelectionModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    const form = document.getElementById('addBankForm');
    if (form) form.reset();
    const search = document.getElementById('bankSearch');
    if (search) search.value = '';
    document.querySelectorAll('input[name="available_banks"]').forEach(cb => cb.checked = false);
}

async function confirmBanks() {
    const countrySelect = document.getElementById('bank_country');
    const country = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
    const selectedList = (window.selectedBanks || []).map(function (n) { return (n || '').trim(); }).filter(Boolean);
    const banksToSave = [].concat(selectedList, availableBanksList || []);
    const uniqueBanks = [...new Set(banksToSave.map(function (n) { return (n || '').trim(); }).filter(Boolean))];
    if (country && uniqueBanks.length > 0) {
        try {
            const fd = new FormData();
            fd.append('country', country);
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            if (companyId) fd.append('company_id', companyId);
            uniqueBanks.forEach(function (b) { fd.append('banks[]', b); });
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=save_country_banks'), { method: 'POST', body: fd });
            const result = await res.json();
            if (!result.success) console.warn('save_country_banks', result.error);
        } catch (e) { console.warn('save_country_banks', e); }
    }
    // 按 Country 保存 Selected Banks 到内存、localStorage 和服务端（登出/隔几小时后仍保持）
    if (country) {
        if (!window.selectedBanksByCountry) window.selectedBanksByCountry = {};
        window.selectedBanksByCountry[country] = selectedList.slice();
        persistSelectedBanksByCountryToStorage();
        const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (companyId) {
            try {
                const fd = new FormData();
                fd.append('company_id', companyId);
                fd.append('selected', JSON.stringify(window.selectedBanksByCountry));
                const saveRes = await fetch(buildApiUrl('api/processes/processlist_api.php?action=save_selected_banks'), { method: 'POST', body: fd });
                const saveResult = await saveRes.json();
                if (!saveResult.success) console.warn('save_selected_banks', saveResult.error);
            } catch (e) { console.warn('save_selected_banks', e); }
        }
    }
    const select = document.getElementById('bank_bank');
    if (!select) { closeBankSelectionModal(); return; }
    applySelectedBanksToDropdown(country);
    if (window.selectedBanks && window.selectedBanks.length > 0) {
        select.value = window.selectedBanks[0] || '';
    }
    closeBankSelectionModal();
}

async function showAddAccountModal() {
    const modal = document.getElementById('addAccountModal');
    if (!modal) return;
    modal.style.display = 'block';
    modal.classList.add('show');
    await loadEditDataBank();
    await loadAccountCurrenciesBank(null, 'add');
    await loadAccountCompaniesBank(null, 'add');
}

function closeAddAccountModal() {
    bankAddAccountTriggerFieldId = null;
    bankAddAccountTriggerHiddenInputId = null;
    const modal = document.getElementById('addAccountModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    const form = document.getElementById('addAccountForm');
    if (form) form.reset();
    selectedCurrencyIdsForAdd = [];
    deletedCurrencyIds = [];
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    selectedCompanyIdsForAdd = currentCompanyId ? [currentCompanyId] : [];
}

function updateBankAddButtonTitles() {
    ['bank_card_merchant', 'bank_customer', 'bank_profit_account'].forEach(fieldId => {
        const btn = document.getElementById(fieldId);
        const addBtn = btn && btn.closest('.account-select-with-buttons') && btn.closest('.account-select-with-buttons').querySelector('.bank-add-btn');
        if (addBtn) addBtn.title = (btn.getAttribute('data-value') ? 'Edit Account' : 'Add New Account');
    });
}

function bankAccountPlusClick(fieldId) {
    const btn = document.getElementById(fieldId);
    const accountId = btn && btn.getAttribute('data-value');
    if (accountId) {
        bankAddAccountTriggerFieldId = null;
        bankAddAccountTriggerHiddenInputId = null;
        openEditAccountModalFromBank(parseInt(accountId, 10));
    } else {
        // Supplier, Customer, Company: remember which select bar should auto-select the new account
        bankAddAccountTriggerFieldId = fieldId;
        bankAddAccountTriggerHiddenInputId = null;
        showAddAccountModal();
    }
}

async function openEditAccountModalFromBank(accountId) {
    currentEditAccountIdForBank = accountId;
    selectedCompanyIdsForEdit = [];
    deletedCurrencyIds = [];
    try {
        const res = await fetch(buildApiUrl('getaccountapi.php?id=' + accountId));
        const result = await res.json();
        if (!result.success || !result.data) {
            showNotification(result.error || 'Failed to load account', 'danger');
            return;
        }
        const account = result.data;
        document.getElementById('edit_account_id').value = account.id;
        document.getElementById('edit_account_id_field').value = (account.account_id || '').toUpperCase();
        document.getElementById('edit_name').value = (account.name || '').toUpperCase();
        document.getElementById('edit_password').value = account.password || '';
        let alertType = account.alert_type || (account.alert_day ? String(account.alert_day).toLowerCase() : '');
        if (account.alert_day && parseInt(account.alert_day) >= 1 && parseInt(account.alert_day) <= 31) alertType = account.alert_day;
        document.getElementById('edit_alert_type').value = alertType;
        document.getElementById('edit_alert_start_date').value = account.alert_start_date || account.alert_specific_date || '';
        document.getElementById('edit_alert_amount').value = account.alert_amount || '';
        document.getElementById('edit_remark').value = (account.remark || '').toUpperCase();
        const paymentAlert = account.payment_alert == 1 ? '1' : '0';
        const radio = document.querySelector('input[name="payment_alert"][value="' + paymentAlert + '"]');
        if (radio) radio.checked = true;
        toggleAlertFieldsBank('edit');
        await loadEditDataBank();
        const roleSelect = document.getElementById('edit_role');
        if (roleSelect) {
            populateRoleSelectBank(roleSelect, bankAccountRoles, account.role || '');
        }
        await loadAccountCurrenciesBank(accountId, 'edit');
        await loadAccountCompaniesBank(accountId, 'edit');
        document.getElementById('editAccountModal').style.display = 'block';
        document.getElementById('editAccountModal').classList.add('show');
    } catch (e) {
        console.error('openEditAccountModalFromBank', e);
        showNotification('Failed to load account', 'danger');
    }
}

function closeEditAccountModalFromBank() {
    const modal = document.getElementById('editAccountModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    const form = document.getElementById('editAccountForm');
    if (form) form.reset();
    selectedCompanyIdsForEdit = [];
    deletedCurrencyIds = [];
    currentEditAccountIdForBank = null;
}

function refreshBankAccountDropdowns() {
    const accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];
    ['bank_card_merchant', 'bank_customer'].forEach(buttonId => {
        const btn = document.getElementById(buttonId);
        const dropdown = document.getElementById(buttonId + '_dropdown');
        const optionsContainer = dropdown?.querySelector('.custom-select-options');
        if (!optionsContainer) return;
        optionsContainer.innerHTML = '';
        accounts.forEach(account => {
            const option = document.createElement('div');
            option.className = 'custom-select-option';
            option.setAttribute('data-value', account.id);
            option.textContent = account.account_id || account.name || '';
            option.addEventListener('click', () => {
                if (btn) {
                    btn.textContent = account.account_id || account.name || '';
                    btn.setAttribute('data-value', account.id);
                }
                if (dropdown) dropdown.style.display = 'none';
            });
            optionsContainer.appendChild(option);
        });
    });
}

function addProfitSharingRow() {
    const container = document.getElementById('profitSharingRowsContainer');
    if (!container) return;
    const ts = Date.now();
    const btnId = 'profit_sharing_account_btn_' + ts;
    const dropdownId = 'profit_sharing_account_dropdown_' + ts;
    const hiddenId = 'profit_sharing_account_id_' + ts;
    const amountId = 'profit_sharing_amount_' + ts;
    const row = document.createElement('div');
    row.className = 'form-row bank-row-two-cols profit-sharing-row';
    row.innerHTML = '<div class="form-group"><label for="' + btnId + '">Account</label><input type="hidden" id="' + hiddenId + '" class="profit-sharing-account-id" name="account_id" value=""><div class="account-select-with-buttons"><div class="custom-select-wrapper"><button type="button" class="custom-select-button profit-sharing-account-btn" id="' + btnId + '" data-placeholder="Select Account">Select Account</button><div class="custom-select-dropdown" id="' + dropdownId + '"><div class="custom-select-search"><input type="text" placeholder="Search account..." autocomplete="off"></div><div class="custom-select-options"></div></div></div><button type="button" class="bank-add-btn" onclick="profitSharingAccountPlusClick(\'' + btnId + '\', \'' + hiddenId + '\')" title="Add New Account">+</button></div></div><div class="form-group"><label for="' + amountId + '">Amount</label><input type="number" id="' + amountId + '" name="amount" class="bank-input profit-sharing-amount" placeholder="Enter amount" step="0.01" min="0"></div><div class="form-group profit-sharing-delete-cell"><label class="profit-sharing-delete-label">&nbsp;</label><button type="button" class="profit-sharing-delete-row-btn" onclick="removeProfitSharingModalRow(this)" title="Delete row">−</button></div>';
    container.appendChild(row);
    if (typeof initProfitSharingAccountSelect === 'function') {
        initProfitSharingAccountSelect(btnId, dropdownId, hiddenId);
    }
}

function removeProfitSharingModalRow(buttonEl) {
    const row = buttonEl && buttonEl.closest('.profit-sharing-row');
    const container = document.getElementById('profitSharingRowsContainer');
    if (!row || !container) return;
    const rows = container.querySelectorAll('.profit-sharing-row');
    if (rows.length <= 1) return;
    row.remove();
    if (container.querySelectorAll('.profit-sharing-row').length === 0 && typeof addProfitSharingRow === 'function') {
        addProfitSharingRow();
    }
}

function profitSharingAccountPlusClick(buttonId, hiddenInputId) {
    const btn = document.getElementById(buttonId);
    const accountId = btn && btn.getAttribute('data-value');
    if (accountId) {
        bankAddAccountTriggerFieldId = null;
        bankAddAccountTriggerHiddenInputId = null;
        openEditAccountModalFromBank(parseInt(accountId, 10));
    } else {
        bankAddAccountTriggerFieldId = buttonId;
        bankAddAccountTriggerHiddenInputId = hiddenInputId;
        showAddAccountModal();
    }
}

async function showAddProfitSharingModal() {
    if (!Array.isArray(window.bankAccounts) || window.bankAccounts.length === 0) {
        await loadBankAccounts();
    }
    const container = document.getElementById('profitSharingRowsContainer');
    if (container) {
        const rows = container.querySelectorAll('.profit-sharing-row');
        for (let i = 1; i < rows.length; i++) rows[i].remove();
    }
    const accountBtn = document.getElementById('profit_sharing_account_btn');
    const accountHidden = document.getElementById('profit_sharing_account_id');
    if (accountBtn) {
        accountBtn.textContent = accountBtn.getAttribute('data-placeholder') || 'Select Account';
        accountBtn.setAttribute('data-value', '');
    }
    if (accountHidden) accountHidden.value = '';
    if (!profitSharingFirstRowInited && typeof initProfitSharingAccountSelect === 'function') {
        profitSharingFirstRowInited = true;
        initProfitSharingAccountSelect('profit_sharing_account_btn', 'profit_sharing_account_dropdown', 'profit_sharing_account_id');
    }
    const amountEl = document.getElementById('profit_sharing_amount');
    if (amountEl) amountEl.value = '';
    const modal = document.getElementById('profitSharingModal');
    if (modal) {
        modal.style.display = 'block';
        modal.classList.add('show');
    }
}

function closeProfitSharingModal() {
    const modal = document.getElementById('profitSharingModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    const container = document.getElementById('profitSharingRowsContainer');
    if (container) {
        const rows = container.querySelectorAll('.profit-sharing-row');
        for (let i = 1; i < rows.length; i++) rows[i].remove();
    }
    const form = document.getElementById('profitSharingForm');
    if (form) form.reset();
}

function updateBankProfitDisplay() {
    const costInput = document.getElementById('bank_cost');
    const priceInput = document.getElementById('bank_price');
    const profitInput = document.getElementById('bank_profit');
    if (!costInput || !priceInput || !profitInput) return;
    const cost = parseFloat(costInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const gross = price - cost;
    const entries = window.selectedProfitSharingEntries || [];
    let sumPs = 0;
    entries.forEach(function (e) {
        const amt = parseFloat(e.amount);
        if (!isNaN(amt)) sumPs += amt;
    });
    const net = Math.max(0, gross - sumPs);
    profitInput.value = net.toFixed(2);
}

function renderSelectedProfitSharing() {
    const container = document.getElementById('selectedProfitSharingList');
    const mainInput = document.getElementById('bank_profit_sharing');
    if (!container) return;
    const entries = window.selectedProfitSharingEntries || [];
    if (entries.length === 0) {
        container.innerHTML = '<div class="no-countries">No profit sharing selected</div>';
        if (mainInput) mainInput.value = '';
        return;
    }
    const parts = [];
    container.innerHTML = '';
    entries.forEach(function (entry, index) {
        const amt = entry.amount;
        const displayAmount = (amt !== '' && amt != null && !isNaN(parseFloat(amt))) ? parseFloat(amt).toFixed(2) : (amt || '');
        const text = (entry.accountText || '') + ' - ' + displayAmount;
        parts.push(text);
        const div = document.createElement('div');
        div.className = 'selected-country-modal-item';
        div.dataset.index = String(index);
        div.innerHTML = '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '</span><button type="button" class="remove-country-modal" onclick="removeProfitSharingEntry(' + index + ')">&times;</button>';
        container.appendChild(div);
    });
    if (mainInput) mainInput.value = parts.join(', ');
    if (typeof updateBankSubmitButtonState === 'function') updateBankSubmitButtonState();
    if (typeof updateBankProfitDisplay === 'function') updateBankProfitDisplay();
}

function removeProfitSharingEntry(index) {
    if (!window.selectedProfitSharingEntries || index < 0 || index >= window.selectedProfitSharingEntries.length) return;
    window.selectedProfitSharingEntries.splice(index, 1);
    renderSelectedProfitSharing();
}
