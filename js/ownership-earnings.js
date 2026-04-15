// =============================================
// Group Earnings Tab — ownership-earnings.js
// =============================================

(function () {
    'use strict';

    // State
    let geGroupIds = [];
    let geActiveGroup = null;
    let geData = null;       // current group data from API
    let geDirty = false;     // unsaved changes flag

    // DOM refs (set on init)
    let geContainer;

    // ── Initialization ─────────────────────────────────────
    function initGroupEarnings() {
        geContainer = document.getElementById('ge-content');
        if (!geContainer) return;

        // Extract group IDs from the ownership page's allCompaniesData (populated by ownership.js)
        // We poll briefly because ownership.js may load async
        _waitForGroups();
    }

    function _waitForGroups() {
        const check = () => {
            if (typeof allCompaniesData !== 'undefined' && allCompaniesData.length > 0) {
                geGroupIds = [...new Set(
                    allCompaniesData
                        .map(c => c.group_id)
                        .filter(g => g && g.trim() !== '')
                )].sort();
                _renderGroupPills();
            } else {
                setTimeout(check, 200);
            }
        };
        check();
    }

    // ── Group Pill Buttons ─────────────────────────────────
    function _renderGroupPills() {
        const pillsContainer = document.getElementById('ge-group-pills');
        if (!pillsContainer) return;

        pillsContainer.innerHTML = '';

        if (geGroupIds.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'ge-empty-state';
            emptyMsg.textContent = 'No groups found. Please create groups in the Account Ownership tab first.';
            geContainer.appendChild(emptyMsg);
            return;
        }

        geGroupIds.forEach(gid => {
            const btn = document.createElement('button');
            btn.className = 'ge-group-pill' + (geActiveGroup === gid ? ' active' : '');
            btn.textContent = gid;
            btn.addEventListener('click', () => _selectGroup(gid));
            pillsContainer.appendChild(btn);
        });

        // Auto-select first group if none selected
        if (!geActiveGroup && geGroupIds.length > 0) {
            _selectGroup(geGroupIds[0]);
        }
    }

    function _selectGroup(gid) {
        if (geDirty) {
            if (!confirm('You have unsaved changes. Switch group anyway?')) return;
        }
        geActiveGroup = gid;
        geDirty = false;

        // Update pill active states
        document.querySelectorAll('.ge-group-pill').forEach(btn => {
            btn.classList.toggle('active', btn.textContent === gid);
        });

        _loadGroupData(gid);
    }

    // ── Data Loading ───────────────────────────────────────
    function _loadGroupData(groupId) {
        const bodyArea = document.getElementById('ge-body');
        if (!bodyArea) return;

        bodyArea.innerHTML = '<div class="own-loader-container"><div class="own-loader"></div></div>';

        fetch(`api/ownership/get_group_earnings_api.php?group_id=${encodeURIComponent(groupId)}`)
            .then(r => r.json())
            .then(res => {
                if (res.status !== 'success') {
                    _showGeToast(res.message || 'Failed to load', 'error');
                    return;
                }
                geData = res.data;
                _renderGroupBody();
            })
            .catch(err => {
                console.error(err);
                _showGeToast('Failed to load group data', 'error');
            });
    }

    // ── Render Group Body ──────────────────────────────────
    function _renderGroupBody() {
        const bodyArea = document.getElementById('ge-body');
        if (!bodyArea || !geData) return;
        bodyArea.innerHTML = '';

        // ── Equity Input Section ──
        const equitySection = document.createElement('div');
        equitySection.className = 'ge-equity-section';
        equitySection.innerHTML = `
            <div class="ge-equity-row">
                <span class="ge-equity-label">Group Equity %</span>
                <div class="ge-equity-input-wrap">
                    <input type="number" id="ge-equity-input" class="ge-equity-input" 
                           min="0" max="100" step="0.01"
                           value="${geData.equity_percentage}" 
                           placeholder="0">
                    <span class="ge-equity-suffix">%</span>
                </div>
                <div class="ge-equity-slider-wrap">
                    <input type="range" id="ge-equity-slider" class="ge-equity-slider"
                           min="0" max="100" step="0.01"
                           value="${geData.equity_percentage}">
                </div>
            </div>
        `;
        bodyArea.appendChild(equitySection);

        // Wire equity input/slider
        const eqInput = document.getElementById('ge-equity-input');
        const eqSlider = document.getElementById('ge-equity-slider');
        eqInput.addEventListener('input', () => {
            let v = parseFloat(eqInput.value) || 0;
            v = Math.min(100, Math.max(0, v));
            eqSlider.value = v;
            _applyGeSliderBg(eqSlider);
            geData.equity_percentage = v;
            geDirty = true;
            _recalcAllEarnings();
        });
        eqSlider.addEventListener('input', () => {
            eqInput.value = parseFloat(eqSlider.value).toFixed(2);
            geData.equity_percentage = parseFloat(eqSlider.value);
            geDirty = true;
            _recalcAllEarnings();
        });
        requestAnimationFrame(() => _applyGeSliderBg(eqSlider));

        // ── Company Cards ──
        if (geData.companies.length === 0) {
            const emptyComp = document.createElement('div');
            emptyComp.className = 'ge-empty-state';
            emptyComp.textContent = 'No companies in this group.';
            bodyArea.appendChild(emptyComp);
        } else {
            geData.companies.forEach((comp, compIdx) => {
                bodyArea.appendChild(_createCompanyCard(comp, compIdx));
            });
        }

        // ── Footer Actions ──
        const footer = document.createElement('div');
        footer.className = 'ge-footer';
        footer.innerHTML = `
            <button class="ge-btn ge-btn-cancel" id="ge-btn-cancel">Cancel</button>
            <button class="ge-btn ge-btn-save" id="ge-btn-save">Save Configuration</button>
        `;
        bodyArea.appendChild(footer);

        document.getElementById('ge-btn-cancel').addEventListener('click', () => {
            geDirty = false;
            _loadGroupData(geActiveGroup);
        });
        document.getElementById('ge-btn-save').addEventListener('click', _saveGroupEarnings);
    }

    // ── Company Card ───────────────────────────────────────
    function _createCompanyCard(comp, compIdx) {
        const card = document.createElement('div');
        card.className = 'ge-company-card';
        card.id = `ge-company-${comp.id}`;

        // Header
        const header = document.createElement('div');
        header.className = 'ge-company-header';
        header.innerHTML = `
            <div class="ge-company-name">${_escHtml(comp.name)}</div>
            <div class="ge-company-total" id="ge-total-${comp.id}">0 accounts</div>
        `;
        card.appendChild(header);

        // Table Header
        const tableHead = document.createElement('div');
        tableHead.className = 'ge-table-head';
        tableHead.innerHTML = `
            <div class="ge-th ge-th-acc">Account Name</div>
            <div class="ge-th ge-th-pct">Share %</div>
            <div class="ge-th ge-th-earn">Earnings Formula</div>
            <div class="ge-th ge-th-act"></div>
        `;
        card.appendChild(tableHead);

        // Rows container
        const rowsContainer = document.createElement('div');
        rowsContainer.className = 'ge-rows';
        rowsContainer.id = `ge-rows-${comp.id}`;

        if (comp.accounts && comp.accounts.length > 0) {
            comp.accounts.forEach((acc, accIdx) => {
                rowsContainer.appendChild(_createAccountRow(comp.id, compIdx, accIdx, acc));
            });
        }
        card.appendChild(rowsContainer);

        // Add Account button
        const addBtn = document.createElement('button');
        addBtn.className = 'ge-btn-add-account';
        addBtn.textContent = '+ Add Account';
        addBtn.addEventListener('click', () => {
            _addAccountRow(comp.id, compIdx);
        });
        card.appendChild(addBtn);

        _updateCompanyTotal(comp.id, compIdx);

        return card;
    }

    // ── Account Row ────────────────────────────────────────
    function _createAccountRow(companyId, compIdx, accIdx, accData) {
        const row = document.createElement('div');
        row.className = 'ge-account-row';
        row.dataset.accIdx = accIdx;

        // Account name input
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'ge-acc-name-input';
        nameInput.value = accData.account_name || '';
        nameInput.placeholder = 'Account name';
        nameInput.addEventListener('input', () => {
            geData.companies[compIdx].accounts[accIdx].account_name = nameInput.value;
            geDirty = true;
        });

        // Percentage input
        const pctWrap = document.createElement('div');
        pctWrap.className = 'ge-pct-wrap';
        const pctInput = document.createElement('input');
        pctInput.type = 'number';
        pctInput.className = 'ge-pct-input';
        pctInput.min = '0';
        pctInput.max = '100';
        pctInput.step = '0.01';
        pctInput.value = accData.account_percentage || 0;
        pctInput.addEventListener('input', () => {
            let v = parseFloat(pctInput.value) || 0;
            v = Math.min(100, Math.max(0, v));
            geData.companies[compIdx].accounts[accIdx].account_percentage = v;
            geDirty = true;
            _updateCompanyTotal(companyId, compIdx);
            _recalcRowEarnings(row, companyId, compIdx, accIdx);
        });
        const pctSuffix = document.createElement('span');
        pctSuffix.className = 'ge-pct-suffix';
        pctSuffix.textContent = '%';
        pctWrap.appendChild(pctInput);
        pctWrap.appendChild(pctSuffix);

        // Earnings formula display
        const earningsFormula = document.createElement('div');
        earningsFormula.className = 'ge-earnings-formula';
        earningsFormula.id = `ge-formula-${companyId}-${accIdx}`;
        _updateFormulaText(earningsFormula, accData.account_percentage);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'ge-btn-delete-row';
        delBtn.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
        delBtn.title = 'Remove';
        delBtn.addEventListener('click', () => {
            geData.companies[compIdx].accounts.splice(accIdx, 1);
            geDirty = true;
            _rerenderCompanyRows(companyId, compIdx);
        });

        row.appendChild(nameInput);
        row.appendChild(pctWrap);
        row.appendChild(earningsFormula);
        row.appendChild(delBtn);

        return row;
    }

    function _addAccountRow(companyId, compIdx) {
        if (!geData.companies[compIdx].accounts) {
            geData.companies[compIdx].accounts = [];
        }
        geData.companies[compIdx].accounts.push({
            account_name: '',
            account_percentage: 0
        });
        geDirty = true;
        _rerenderCompanyRows(companyId, compIdx);
    }

    function _rerenderCompanyRows(companyId, compIdx) {
        const rowsContainer = document.getElementById(`ge-rows-${companyId}`);
        if (!rowsContainer) return;
        rowsContainer.innerHTML = '';

        const accounts = geData.companies[compIdx].accounts || [];
        accounts.forEach((acc, accIdx) => {
            rowsContainer.appendChild(_createAccountRow(companyId, compIdx, accIdx, acc));
        });
        _updateCompanyTotal(companyId, compIdx);
    }

    function _updateCompanyTotal(companyId, compIdx) {
        const totalEl = document.getElementById(`ge-total-${companyId}`);
        if (!totalEl) return;
        const accounts = geData.companies[compIdx].accounts || [];
        const totalPct = accounts.reduce((sum, a) => sum + (parseFloat(a.account_percentage) || 0), 0);
        totalEl.textContent = `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · ${totalPct.toFixed(2)}% allocated`;
        totalEl.classList.toggle('ge-over', totalPct > 100);
    }

    function _updateFormulaText(el, accPct) {
        const eqPct = geData ? geData.equity_percentage : 0;
        const accP = parseFloat(accPct) || 0;
        el.textContent = `NP × ${eqPct}% × ${accP}%`;
    }

    function _recalcRowEarnings(row, companyId, compIdx, accIdx) {
        const formulaEl = document.getElementById(`ge-formula-${companyId}-${accIdx}`);
        if (!formulaEl) return;
        const accPct = geData.companies[compIdx].accounts[accIdx].account_percentage;
        _updateFormulaText(formulaEl, accPct);
    }

    function _recalcAllEarnings() {
        if (!geData) return;
        geData.companies.forEach((comp, compIdx) => {
            (comp.accounts || []).forEach((acc, accIdx) => {
                const formulaEl = document.getElementById(`ge-formula-${comp.id}-${accIdx}`);
                if (formulaEl) _updateFormulaText(formulaEl, acc.account_percentage);
            });
        });
    }

    // ── Slider Background ──────────────────────────────────
    function _applyGeSliderBg(slider) {
        if (!slider) return;
        const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.background = `linear-gradient(to right, #0D60FF ${pct}%, #e2e8f0 ${pct}%)`;
    }

    // ── Save ───────────────────────────────────────────────
    function _saveGroupEarnings() {
        if (!geData) return;

        // Validate
        for (const comp of geData.companies) {
            let totalPct = 0;
            for (const acc of (comp.accounts || [])) {
                if (!acc.account_name || acc.account_name.trim() === '') {
                    _showGeToast('Please fill in all account names', 'error');
                    return;
                }
                totalPct += parseFloat(acc.account_percentage) || 0;
            }
            if (totalPct > 100) {
                _showGeToast(`Total account % exceeds 100% for company "${comp.name}"`, 'error');
                return;
            }
        }

        const payload = {
            group_id: geData.group_id,
            equity_percentage: geData.equity_percentage,
            companies: geData.companies.map(c => ({
                company_id: c.id,
                accounts: (c.accounts || []).map(a => ({
                    account_name: a.account_name,
                    account_percentage: parseFloat(a.account_percentage) || 0
                }))
            }))
        };

        const saveBtn = document.getElementById('ge-btn-save');
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
                saveBtn.textContent = 'Save Configuration';
            }
            if (res.status === 'success') {
                geDirty = false;
                _showGeToast(res.message, 'success');
            } else {
                _showGeToast(res.message, 'error');
            }
        })
        .catch(err => {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Configuration';
            }
            console.error(err);
            _showGeToast('Server error', 'error');
        });
    }

    // ── Toast (reuse ownership page toast) ──────────────────
    function _showGeToast(msg, type) {
        if (typeof showToast === 'function') {
            showToast(msg, type);
        } else {
            alert(msg);
        }
    }

    // ── Escape HTML ────────────────────────────────────────
    function _escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ── Tab Switch Integration ─────────────────────────────
    // Called from ownership.php tab click handler
    window.initGroupEarnings = initGroupEarnings;

})();
