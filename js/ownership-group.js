(function () {
    let geGroupsData = [];
    let geGroupStates = {};
    let geCurrentlyExpandedId = null;
    let geDraggedRowIdx = null;
    let geDraggedGroupId = null;

    const tpl = {
        card: () => document.getElementById('tpl-group-card'),
        row: () => document.getElementById('tpl-account-row')
    };

    function $(el, bind) {
        return el.querySelector(`[data-bind="${bind}"]`);
    }

    window.initGroupEarnings = function () {
        if (window._geInitialized) return;
        window._geInitialized = true;
        fetchGroups();
    };

    function fetchGroups() {
        const container = document.getElementById('groupCardsContainer');
        container.textContent = '';
        const loaderWrap = document.createElement('div');
        loaderWrap.className = 'own-loader-container';
        loaderWrap.appendChild(document.createElement('div')).className = 'own-loader';
        container.appendChild(loaderWrap);

        fetch('api/ownership/get_group_ownership_api.php')
            .then(r => r.json())
            .then(res => {
                if (res.status !== 'success') {
                    showToast(res.message || 'Failed to load groups', 'error');
                    return;
                }
                geGroupsData = res.data.groups || [];
                // Attach equities into states so they're ready
                const equities = res.data.equities || {};
                geGroupsData.forEach(g => {
                    geGroupStates[g.id] = {
                        accounts: [], // loads when expanded
                        rows: (equities[g.id] || []).map(o => ({
                            account_id: o.account_id,
                            percentage: parseFloat(o.percentage),
                            role: o.role || '',
                            user_raw_id: o.user_raw_id || null,
                            read_only: 0
                        }))
                    };
                });
                renderGroupCards();
            })
            .catch(err => {
                console.error(err);
                showToast('Failed to fetch groups', 'error');
            });
    }

    function renderGroupCards() {
        const container = document.getElementById('groupCardsContainer');
        container.innerHTML = '';

        if (geGroupsData.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'own-empty-state';
            empty.textContent = 'No groups found. Assign groups in Account Ownership first.';
            container.appendChild(empty);
            return;
        }

        geGroupsData.forEach(group => {
            const alloc = parseFloat(group.allocated_percentage) || 0;
            const remaining = Math.max(0, 100 - alloc);
            const id = group.id;

            const frag = tpl.card().content.cloneNode(true);
            const card = frag.querySelector('.own-card');
            card.id = `ge-card-${id}`;

            $(card, 'name').textContent = group.name;

            const pctEl = $(card, 'percent');
            pctEl.textContent = `${alloc}%`;
            pctEl.id = `ge-header-percent-${id}`;

            const remEl = $(card, 'remaining');
            remEl.textContent = `${remaining}% Remaining`;
            remEl.id = `ge-header-remain-${id}`;

            const barEl = $(card, 'bar');
            barEl.style.width = `${Math.min(alloc, 100)}%`;
            barEl.id = `ge-header-bar-${id}`;

            $(card, 'body').id = `ge-card-body-${id}`;
            $(card, 'loader').id = `ge-loader-${id}`;
            $(card, 'editor').id = `ge-editor-${id}`;
            $(card, 'rows-container').id = `ge-rows-container-${id}`;
            $(card, 'warning').id = `ge-warning-${id}`;
            $(card, 'warning-msg').id = `ge-warning-msg-${id}`;
            $(card, 'footer-remain').id = `ge-footer-remain-${id}`;
            $(card, 'confirm-btn').id = `ge-confirm-btn-${id}`;

            card.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (!action) return;
                e.stopPropagation();
                switch (action) {
                    case 'toggle': toggleGroupCard(id); break;
                    case 'add-row': geAddAccountRow(id); break;
                    case 'cancel': geCancelEdit(id); break;
                    case 'confirm': geConfirmEdit(id); break;
                }
            });

            container.appendChild(frag);
        });
    }

    function toggleGroupCard(groupId) {
        const card = document.getElementById(`ge-card-${groupId}`);
        const isExpanded = card.classList.contains('expanded');

        if (!isExpanded && geCurrentlyExpandedId && geCurrentlyExpandedId !== groupId) {
            geCancelEdit(geCurrentlyExpandedId, true);
        }

        if (isExpanded) {
            geCancelEdit(groupId, true);
        } else {
            card.classList.add('expanded');
            geCurrentlyExpandedId = groupId;
            geLoadGroupData(groupId);
        }
    }

    function geLoadGroupData(groupId) {
        const loader = document.getElementById(`ge-loader-${groupId}`);
        const editor = document.getElementById(`ge-editor-${groupId}`);
        
        // Only fetch accounts list if we haven't already
        if (geGroupStates[groupId] && geGroupStates[groupId].accounts.length > 0) {
            geRenderCardBodyRows(groupId);
            return;
        }

        loader.style.display = 'flex';
        editor.classList.add('own-editor-hidden');

        fetch('api/ownership/get_available_accounts_api.php')
            .then(r => r.json())
            .then(res => {
                loader.style.display = 'none';
                editor.classList.remove('own-editor-hidden');
                
                if (res.status === 'success') {
                    geGroupStates[groupId].accounts = res.data;
                }
                geRenderCardBodyRows(groupId);
            });
    }

    function geCancelEdit(groupId, forceCollapse = false) {
        document.getElementById(`ge-card-${groupId}`).classList.remove('expanded');
        if (geCurrentlyExpandedId === groupId) geCurrentlyExpandedId = null;
        const groupIdx = geGroupsData.findIndex(g => g.id === groupId);
        if (groupIdx >= 0) {
            geUpdateCardHeaderDisplay(groupId, parseFloat(geGroupsData[groupIdx].allocated_percentage) || 0);
        }
    }

    function geRenderCardBodyRows(groupId) {
        const container = document.getElementById(`ge-rows-container-${groupId}`);
        container.innerHTML = '';
        geGroupStates[groupId].rows.forEach((row, idx) => {
            container.appendChild(geCreateRowElement(groupId, idx, row));
        });
        geUpdateCalculations(groupId);
    }

    function geCreateRowElement(groupId, idx, rowData) {
        const frag = tpl.row().content.cloneNode(true);
        const div = frag.querySelector('.own-account-row');
        div.dataset.index = idx;

        const select = $(div, 'account-select');
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- SELECT ACCOUNT --';
        select.appendChild(defaultOpt);

        geGroupStates[groupId].accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            const mainStr = parseInt(acc.is_main_owner) === 1 ? ' - Main' : '';
            opt.textContent = `${acc.account_name} (${acc.name})${mainStr}`;
            if (acc.id == rowData.account_id) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', () => geUpdateRowData(groupId, idx, 'account_id', select.value));

        const badgeAcc = $(div, 'badge');
        if (badgeAcc) {
            badgeAcc.style.display = 'flex';
            badgeAcc.textContent = 'Account';
            badgeAcc.className = 'own-badge-account';
        }

        const input = $(div, 'percent-input');
        input.value = `${rowData.percentage}%`;
        input.id = `ge-input-${groupId}-${idx}`;
        input.addEventListener('change', () => geUpdateSliderFromInput(groupId, idx, input.value));

        const slider = $(div, 'slider');
        slider.value = rowData.percentage;
        slider.id = `ge-slider-${groupId}-${idx}`;
        slider.addEventListener('input', () => geUpdateInputFromSlider(groupId, idx, slider.value));

        div.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'delete') geRemoveRow(groupId, idx);
        });

        const badge = $(div, 'read-only-badge');
        if (badge) badge.style.display = 'none'; // Groups internal rows strictly don't need read_only logic usually

        requestAnimationFrame(() => applySliderBackground(slider));
        return frag;
    }

    function geAddAccountRow(groupId) {
        geGroupStates[groupId].rows.push({ account_id: '', percentage: 0, role: '', user_raw_id: null, read_only: 0 });
        geRenderCardBodyRows(groupId);
    }

    function geRemoveRow(groupId, idx) {
        geGroupStates[groupId].rows.splice(idx, 1);
        geRenderCardBodyRows(groupId);
    }

    function geUpdateRowData(groupId, idx, field, value) {
        geGroupStates[groupId].rows[idx][field] = value;
        if (field === 'percentage') geUpdateCalculations(groupId);
        if (field === 'account_id') {
            geRenderCardBodyRows(groupId);
        }
    }

    function geUpdateInputFromSlider(groupId, idx, value) {
        const pct = parseFloat(value) || 0;
        document.getElementById(`ge-input-${groupId}-${idx}`).value = `${pct}%`;
        applySliderBackground(document.getElementById(`ge-slider-${groupId}-${idx}`));
        geGroupStates[groupId].rows[idx].percentage = pct;
        geUpdateCalculations(groupId);
    }

    function geUpdateSliderFromInput(groupId, idx, value) {
        let pct = parseFloat(value.replace('%', ''));
        if (isNaN(pct)) pct = 0;
        pct = Math.max(0, Math.min(100, pct));
        document.getElementById(`ge-slider-${groupId}-${idx}`).value = pct;
        document.getElementById(`ge-input-${groupId}-${idx}`).value = `${pct}%`;
        applySliderBackground(document.getElementById(`ge-slider-${groupId}-${idx}`));
        geGroupStates[groupId].rows[idx].percentage = pct;
        geUpdateCalculations(groupId);
    }

    function applySliderBackground(slider) {
        if (!slider) return;
        const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.background = `linear-gradient(to right, var(--own-primary-blue) ${pct}%, var(--own-gray-border) ${pct}%)`;
    }

    function geUpdateCalculations(groupId) {
        const total = geGroupStates[groupId].rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
        geUpdateCardHeaderDisplay(groupId, total);

        const remaining = 100 - total;
        const footerRm = document.getElementById(`ge-footer-remain-${groupId}`);
        const warningBadge = document.getElementById(`ge-warning-${groupId}`);
        const confirmBtn = document.getElementById(`ge-confirm-btn-${groupId}`);

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

    function geUpdateCardHeaderDisplay(groupId, total) {
        const remainEl = document.getElementById(`ge-header-remain-${groupId}`);
        const pctEl = document.getElementById(`ge-header-percent-${groupId}`);
        const barEl = document.getElementById(`ge-header-bar-${groupId}`);

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

    function geConfirmEdit(groupId) {
        const rows = geGroupStates[groupId].rows;
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
            group_id: groupId,
            owners: rows.map(r => ({
                account_id: r.account_id,
                percentage: parseFloat(r.percentage)
            }))
        };

        const confirmBtn = document.getElementById(`ge-confirm-btn-${groupId}`);
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
                showToast(res.message, 'success');
                const groupIdx = geGroupsData.findIndex(g => g.id === groupId);
                if (groupIdx >= 0) geGroupsData[groupIdx].allocated_percentage = total;
                geCancelEdit(groupId, true);
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
})();