// =============================================
// Group Earnings Tab — ownership-earnings.js
// =============================================

(function () {
    'use strict';

    // State
    let geGroupIds = [];
    let geServerData = null; // { equities: {groupID: %}, accounts: {groupID: [{account_name, account_percentage}]} }

    let geContainer;

    function initGroupEarnings() {
        geContainer = document.getElementById('groupCardsContainer');
        if (!geContainer) return;
        _waitForGroups();
    }

    function _waitForGroups() {
        const check = () => {
            if (typeof allGroupIds !== 'undefined' && allGroupIds.length > 0) {
                geGroupIds = [...allGroupIds].sort();
                _loadGroupData();
            } else if (typeof allCompaniesData !== 'undefined' && allCompaniesData.length > 0) {
                 // Fallback if allGroupIds isn't populated for some reason
                 geGroupIds = [...new Set(allCompaniesData.map(c => c.group_id).filter(g => g))].sort();
                 if (geGroupIds.length > 0) {
                     _loadGroupData();
                 }
            } else {
                setTimeout(check, 200);
            }
        };
        check();
    }

    function _loadGroupData() {
        geContainer.innerHTML = '<div class="own-loader-container"><div class="own-loader"></div></div>';

        fetch('api/ownership/get_group_earnings_api.php')
            .then(r => r.json())
            .then(res => {
                if (res.status !== 'success') {
                    _showGeToast(res.message || 'Failed to load', 'error');
                    return;
                }
                geServerData = res.data;
                _renderGroupCards();
            })
            .catch(err => {
                console.error(err);
                _showGeToast('Failed to load group data', 'error');
            });
    }

    // Helper: query inside element by data-bind
    function $(el, bind) {
        return el.querySelector(`[data-bind="${bind}"]`);
    }

    function _renderGroupCards() {
        geContainer.innerHTML = '';

        if (geGroupIds.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'own-empty-state';
            emptyMsg.textContent = 'No groups found. Please create groups in the Account Ownership tab first.';
            geContainer.appendChild(emptyMsg);
            return;
        }

        const tplCard = document.getElementById('tpl-group-card');
        
        geGroupIds.forEach(gid => {
            const frag = tplCard.content.cloneNode(true);
            const card = frag.querySelector('.own-card');
            card.id = `ge-card-${gid}`;
            
            $(card, 'group-name').textContent = gid;

            // Load data for this group
            let equityPct = geServerData.equities[gid] !== undefined ? parseFloat(geServerData.equities[gid]) : 0;
            let accounts = geServerData.accounts[gid] || [];

            // Card Header setup
            const headerActions = card.querySelectorAll('[data-action="toggle"]');
            headerActions.forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON' && !el.classList.contains('own-icon-btn') && !el.classList.contains('own-btn-outline')) return;
                    card.classList.toggle('expanded');
                });
            });

            // Card Body setup
            const eqInput = $(card, 'equity-input');
            const eqSlider = $(card, 'equity-slider');
            
            eqInput.value = equityPct;
            eqSlider.value = equityPct;
            _applyGeSliderBg(eqSlider);

            eqInput.addEventListener('input', () => {
                let v = parseFloat(eqInput.value) || 0;
                v = Math.min(100, Math.max(0, v));
                eqSlider.value = v;
                _applyGeSliderBg(eqSlider);
                _recalcFormulas(card);
            });
            
            eqSlider.addEventListener('input', () => {
                eqInput.value = parseFloat(eqSlider.value).toFixed(2);
                _applyGeSliderBg(eqSlider);
                _recalcFormulas(card);
            });

            // Rows Container
            const rowsContainer = $(card, 'rows-container');
            
            // Render existing rows
            accounts.forEach(acc => {
                _addGroupRow(card, rowsContainer, acc.account_name, acc.account_percentage);
            });

            // Add Account Button
            const addRowBtn = card.querySelector('[data-action="add-row"]');
            if (addRowBtn) {
                addRowBtn.addEventListener('click', () => {
                    _addGroupRow(card, rowsContainer, '', 0);
                });
            }

            // Footer Buttons
            const cancelBtn = card.querySelector('[data-action="cancel"]');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    card.classList.remove('expanded');
                    setTimeout(() => _loadGroupData(), 300);
                });
            }

            const confirmBtn = card.querySelector('[data-action="confirm"]');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    _saveGroup(gid, card);
                });
            }

            // Initial calculation
            _updateCardHeaderAndFooter(card);
            
            geContainer.appendChild(card);
            _recalcFormulas(card);
        });
    }

    function _addGroupRow(card, container, nameStr, pctVal) {
        const tplRow = document.getElementById('tpl-group-account-row');
        const frag = tplRow.content.cloneNode(true);
        const row = frag.querySelector('.own-account-row');

        const nameInput = $(row, 'acc-name');
        nameInput.value = nameStr;

        const pctInput = $(row, 'acc-pct');
        pctInput.value = pctVal;
        
        pctInput.addEventListener('input', () => {
            let v = parseFloat(pctInput.value) || 0;
            v = Math.min(100, Math.max(0, v));
            // Don't auto-reset it here, let them type. Just calculate from it.
            _updateCardHeaderAndFooter(card);
            _recalcFormulas(card);
        });

        row.querySelector('[data-action="delete"]').addEventListener('click', () => {
            row.remove();
            _updateCardHeaderAndFooter(card);
        });

        container.appendChild(row);
        _updateCardHeaderAndFooter(card);
        _recalcFormulas(card);
    }

    function _updateCardHeaderAndFooter(card) {
        let total = 0;
        card.querySelectorAll('.ge-pct-input').forEach(input => {
            total += parseFloat(input.value) || 0;
        });

        total = parseFloat(total.toFixed(2));
        const remaining = Math.max(0, 100 - total).toFixed(2);

        $(card, 'percent').textContent = `${total}%`;
        $(card, 'remaining').textContent = `${remaining}% Remaining`;
        $(card, 'bar').style.width = `${Math.min(total, 100)}%`;

        const warningEl = $(card, 'warning');
        const warningMsg = $(card, 'warning-msg');
        const footerRemain = $(card, 'footer-remain');

        if (total > 100) {
            if(warningEl) {
                warningEl.style.display = 'flex';
                warningEl.style.color = 'var(--own-danger-red)';
                warningEl.style.backgroundColor = 'rgba(239,68,68,0.1)';
            }
            if($(card, 'warning-icon')) $(card, 'warning-icon').textContent = '⚠️';
            if(warningMsg) warningMsg.textContent = 'Total exceeds 100%';
            if(footerRemain) {
                footerRemain.textContent = '0% Unallocated';
                footerRemain.style.color = 'var(--own-danger-red)';
            }
            $(card, 'bar').style.backgroundColor = 'var(--own-danger-red)';
        } else if (total < 100) {
            if(warningEl) {
                warningEl.style.display = 'flex';
                warningEl.style.color = 'var(--own-gray-text)';
                warningEl.style.backgroundColor = 'var(--own-gray-light)';
            }
            if($(card, 'warning-icon')) $(card, 'warning-icon').textContent = 'ℹ️';
            if(warningMsg) warningMsg.textContent = 'Total is less than 100%';
            if(footerRemain) {
                footerRemain.textContent = `${remaining}% Unallocated`;
                footerRemain.style.color = 'var(--own-gray-text)';
            }
            $(card, 'bar').style.backgroundColor = '';
        } else {
            if(warningEl) warningEl.style.display = 'none';
            if(footerRemain) {
                footerRemain.textContent = 'Allocated';
                footerRemain.style.color = 'var(--own-gray-text)';
            }
            $(card, 'bar').style.backgroundColor = '';
        }
    }

    function _recalcFormulas(card) {
        const eqInput = $(card, 'equity-input');
        const eqPct = parseFloat(eqInput.value) || 0;

        card.querySelectorAll('.own-account-row').forEach(row => {
            const accPctInput = $(row, 'acc-pct');
            const accP = parseFloat(accPctInput.value) || 0;
            const formulaEl = $(row, 'formula');
            formulaEl.textContent = `= NP × ${eqPct}% × ${accP}%`;
        });
    }

    function _applyGeSliderBg(slider) {
        if (!slider) return;
        const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.background = `linear-gradient(to right, #0D60FF ${pct}%, #e2e8f0 ${pct}%)`;
    }

    function _saveGroup(gid, card) {
        const equityRoot = parseFloat($(card, 'equity-input').value) || 0;
        if (equityRoot < 0 || equityRoot > 100) {
            _showGeToast('Group Equity % must be between 0 and 100', 'error');
            return;
        }

        let accounts = [];
        let totalPct = 0;
        let hasError = false;

        card.querySelectorAll('.own-account-row').forEach(row => {
            const name = $(row, 'acc-name').value.trim();
            const pct = parseFloat($(row, 'acc-pct').value) || 0;

            if (name === '') {
                _showGeToast('Please fill in all account names', 'error');
                hasError = true;
                return;
            }

            if (pct < 0 || pct > 100) {
                _showGeToast('Account Share % must be between 0 and 100', 'error');
                hasError = true;
                return;
            }

            totalPct += pct;
            accounts.push({ account_name: name, account_percentage: pct });
        });

        if (hasError) return;

        if (totalPct > 100) {
            _showGeToast('Total account % exceeds 100%', 'error');
            return;
        }

        const payload = {
            group_id: gid,
            equity_percentage: equityRoot,
            accounts: accounts
        };

        const saveBtn = card.querySelector('[data-action="confirm"]');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        fetch('api/ownership/save_group_earnings_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(res => {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
            if (res.status === 'success') {
                _showGeToast(res.message, 'success');
                card.classList.remove('expanded');
                geServerData.equities[gid] = equityRoot;
                geServerData.accounts[gid] = accounts;
            } else {
                _showGeToast(res.message, 'error');
            }
        })
        .catch(err => {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
            console.error(err);
            _showGeToast('Server error', 'error');
        });
    }

    function _showGeToast(msg, type) {
        if (typeof showToast === 'function') {
            showToast(msg, type);
        } else {
            alert(msg);
        }
    }

    window.initGroupEarnings = initGroupEarnings;

})();
