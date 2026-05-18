const memberConfig = {
    /** Win/Loss 当前查看的账本（与 session member_winloss_view 一致） */
    accountId: (typeof window.MEMBER_ACCOUNT_ID !== 'undefined' ? window.MEMBER_ACCOUNT_ID : 0),
    accountCode: (typeof window.MEMBER_ACCOUNT_CODE !== 'undefined' ? window.MEMBER_ACCOUNT_CODE : ''),
    accountName: (typeof window.MEMBER_ACCOUNT_NAME !== 'undefined' ? window.MEMBER_ACCOUNT_NAME : ''),
    companyId: (typeof window.MEMBER_COMPANY_ID !== 'undefined' ? window.MEMBER_COMPANY_ID : 0),
    /**
     * Account 横条与迷你网格的「关联列表」始终以登录账号为根拉取，避免切到 C1 后只剩 C1+A2（与图一排序一致）
     */
    linkedListRootAccountId: (typeof window.MEMBER_LINKED_ROOT_ACCOUNT_ID !== 'undefined' && Number(window.MEMBER_LINKED_ROOT_ACCOUNT_ID) > 0
        ? Number(window.MEMBER_LINKED_ROOT_ACCOUNT_ID)
        : (typeof window.MEMBER_ACCOUNT_ID !== 'undefined' ? Number(window.MEMBER_ACCOUNT_ID) : 0))
};

let memberCurrencySummary = [];
const memberCurrencySortOrder = new Map();
let memberCurrencyDisplayOrder = null;
const memberSelectedCurrencies = new Set();
let memberIsAllSelected = true;
let memberSearchSeq = 0;
let memberSummaryAbortController = null;
let memberHistoryAbortController = null;
/** 关联账号列表 [{id, account_id, name}]（与同公司 Link 可达），用于迷你网格 */
let memberLinkedAccountsList = [];
/** 用户在网格中要显示的账号 id（默认可登录闭包内全选）；按公司+会话账号记在 sessionStorage */
const memberWLGridSelectedIds = new Set();
let memberGridFetchAbortController = null;
/** Accounts 迷你网格用到的：各 account.id → 配置的币别（大写）；未加载时不做严格过滤 */
let memberLinkedAccountCurrenciesMap = new Map();
let memberLinkedCurrenciesLoaded = false;

/** Account  pills / grid 列表 API 的根 id（登录账号）；与 Win/Loss 当前查看账号 accountId 可不同 */
function memberLinkedListRootId() {
    return memberConfig.linkedListRootAccountId > 0
        ? memberConfig.linkedListRootAccountId
        : memberConfig.accountId;
}

function getWlGridIncludedAccountIds() {
    const allow = new Set(memberLinkedAccountsList.map(a => Number(a.id)).filter(Boolean));
    let sel = [...memberWLGridSelectedIds].map(Number).filter(id => allow.has(id));
    if (sel.length === 0) {
        sel = [...allow];
    }
    return sel;
}

function collectLinkedUnionCurrencyCodesRaw() {
    const codes = new Set();
    getWlGridIncludedAccountIds().forEach((id) => {
        const s = memberLinkedAccountCurrenciesMap.get(id);
        if (s && s.size) {
            s.forEach((c) => {
                if (c) codes.add(String(c).trim().toUpperCase());
            });
        }
    });
    return [...codes];
}

function sanitizeMemberCurrencySelectionAfterUnionChange() {
    if (!memberLinkedCurrenciesLoaded) return;
    const avail = collectLinkedUnionCurrencyCodesRaw();
    const availSet = new Set(avail);
    [...memberSelectedCurrencies].forEach((c) => {
        const u = String(c || '').trim().toUpperCase();
        if (!availSet.has(u)) memberSelectedCurrencies.delete(c);
    });
    if (avail.length === 0 || memberSelectedCurrencies.size === 0) {
        memberIsAllSelected = true;
        memberSelectedCurrencies.clear();
    }
}

/** 批量拉 Linked grid 中各账户配置的币别；完成后刷新 Currency Tabs（并入集） */
function loadLinkedAccountsCurrencyMap() {
    memberLinkedAccountCurrenciesMap = new Map();
    memberLinkedCurrenciesLoaded = false;
    const companyId = memberConfig.companyId;
    const ids = memberLinkedAccountsList.map(a => Number(a.id)).filter(Boolean);
    if (!ids.length || !companyId) {
        memberLinkedCurrenciesLoaded = true;
        return Promise.resolve();
    }
    const qs = new URLSearchParams({
        action: 'get_batch_account_currencies',
        account_ids: ids.join(','),
        company_id: String(companyId),
        _t: String(Date.now()),
    });
    return fetch(`api/accounts/account_currency_api.php?${qs}`, { cache: 'no-cache' })
        .then(res => res.text())
        .then(text => parseJsonResponse(text))
        .then(data => {
            if (!data.success || !Array.isArray(data.data)) {
                return;
            }
            data.data.forEach((row) => {
                const id = Number(row.account_id);
                if (!id) return;
                const set = new Set();
                (row.currencies || []).forEach((c) => {
                    const code = String(c.currency_code || c.code || '').trim().toUpperCase();
                    if (code) {
                        set.add(code);
                        const cid = c.currency_id != null ? Number(c.currency_id) : null;
                        if (cid && !memberCurrencySortOrder.has(code)) {
                            memberCurrencySortOrder.set(code, cid);
                        }
                    }
                });
                memberLinkedAccountCurrenciesMap.set(id, set);
            });
        })
        .catch((err) => {
            console.error('Batch account currencies failed:', err);
            memberLinkedAccountCurrenciesMap = new Map();
        })
        .finally(() => {
            memberLinkedCurrenciesLoaded = true;
            sanitizeMemberCurrencySelectionAfterUnionChange();
        });
}

function accountHoldsMiniGridCurrency(accountId, currencyUpper) {
    const cu = (currencyUpper || '').trim().toUpperCase();
    if (!cu) return true;
    if (!memberLinkedCurrenciesLoaded) return true;
    const set = memberLinkedAccountCurrenciesMap.get(Number(accountId));
    // 服务端未解析到币种行时不要用空集误伤（仍沿用原展示逻辑）
    if (!set || set.size === 0) return true;
    return set.has(cu);
}

function accountHoldsAnyMiniGridCurrency(accountId, currenciesUpper) {
    const list = Array.isArray(currenciesUpper) ? currenciesUpper : [];
    if (list.length === 0) return true;
    return list.some((cu) => accountHoldsMiniGridCurrency(accountId, cu));
}

/** Currency 迷你网格中要展示的关联账户列表（顺序与 pills 同源）。 */
function getOrderedMiniGridAccountsForCurrencies(currenciesUpperList) {
    const allowIds = new Set(memberLinkedAccountsList.map(a => Number(a.id)));
    const sel = new Set([...memberWLGridSelectedIds].map(Number).filter((id) => allowIds.has(id)));
    if (sel.size === 0) {
        allowIds.forEach((id) => sel.add(id));
    }
    const uppers = (currenciesUpperList || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);
    return memberLinkedAccountsList.filter(a =>
        sel.has(Number(a.id)) && accountHoldsAnyMiniGridCurrency(a.id, uppers)
    );
}

/**
 * 与下方 Win/Loss 明细表同源：对已返回 history 行，按币别各自取区间内最后一笔有效 Balance。
 * （单币筛选时等价于 {@link memberHistoryClosingBalanceFromRows}。）
 */
function memberHistoryClosingBalancesForAllCurrencies(rows, wantedUpperSet) {
    const map = new Map();
    wantedUpperSet.forEach((cu) => map.set(cu, normalizeNumber('0')));
    (rows || []).forEach((row) => {
        const rc = (row.currency || '').trim().toUpperCase();
        if (!wantedUpperSet.has(rc)) return;
        if (row.balance !== '-' && row.balance !== null && row.balance !== undefined && String(row.balance).trim() !== '') {
            map.set(rc, normalizeNumber(row.balance));
        }
    });
    return map;
}

/**
 * 与下方 Win/Loss 明细表 TOTAL 行的 Balance 同源：区间内最后一行的 running balance（含 Win/Loss + Cr/Dr）。
 * search_api summary 与该跑表在部分场景口径不一致，故迷你网格不按 summary 取值。
 */
function memberHistoryClosingBalanceFromRows(rows, currencyUpper) {
    const cuFilter = String(currencyUpper || '').trim().toUpperCase();
    if (!cuFilter) return normalizeNumber('0');
    return memberHistoryClosingBalancesForAllCurrencies(rows, new Set([cuFilter])).get(cuFilter) || normalizeNumber('0');
}

function loadMemberOwnedCurrencies() {
    const accountId = memberConfig.accountId;
    const companyId = memberConfig.companyId;
    if (!accountId || !companyId) {
        memberOwnedCurrencies = [];
        return Promise.resolve();
    }
    const qs = new URLSearchParams({
        action: 'get_account_currencies',
        account_id: String(accountId),
        company_id: String(companyId),
        _t: String(Date.now())
    });
    return fetch(`api/accounts/account_currency_api.php?${qs}`, { cache: 'no-cache' })
        .then(res => res.text())
        .then(text => parseJsonResponse(text))
        .then(data => {
            if (!data.success || !Array.isArray(data.data)) {
                memberOwnedCurrencies = [];
                return;
            }
            memberOwnedCurrencies = data.data.map(row => ({
                code: String(row.currency_code || row.code || '').trim().toUpperCase(),
                currency_id: row.currency_id != null ? Number(row.currency_id) : null
            })).filter(o => o.code);
            memberOwnedCurrencies.forEach(o => {
                if (o.currency_id && !memberCurrencySortOrder.has(o.code)) {
                    memberCurrencySortOrder.set(o.code, o.currency_id);
                }
            });
        })
        .catch(err => {
            console.error('Failed to load account currencies:', err);
            memberOwnedCurrencies = [];
        });
}

/** Currency 筛选条与表格区域始终占用布局，避免换日期 / Period 时出现空白或被 display:none 收起 */
function ensureMemberCurrencyChromeVisible() {
    const filterEl = document.getElementById('member_currency_filter');
    const sectionEl = document.getElementById('member_currency_tables_section');
    if (filterEl) {
        filterEl.style.setProperty('display', 'flex', 'important');
        filterEl.style.setProperty('visibility', 'visible', 'important');
    }
    if (sectionEl) {
        sectionEl.style.setProperty('display', 'flex', 'important');
        sectionEl.style.setProperty('visibility', 'visible', 'important');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const filterEl = document.getElementById('member_currency_filter');
    const sectionEl = document.getElementById('member_currency_tables_section');
    console.log('Member page: currency_filter exists=', !!filterEl, 'tables_section exists=', !!sectionEl);
    ensureMemberCurrencyChromeVisible();
    initDatePickers();
    setupCompanyButtons();
    setupMemberLinkedFilterModalHandlers();
    Promise.all([
        loadMemberLinkedAccounts(),
        loadMemberOwnedCurrencies()
    ]).finally(() => performMemberSearch());
});

function performMemberSearch() {
    ensureMemberCurrencyChromeVisible();
    const seq = ++memberSearchSeq;
    fetchMemberSummary(seq)
        .then(() => fetchMemberHistory(undefined, seq))
        .catch((err) => {
            if (err && err.name === 'AbortError') return;
            if (seq !== memberSearchSeq) return;
            memberIsAllSelected = true;
            memberSelectedCurrencies.clear();
            fetchMemberHistory(undefined, seq);
        });
}

function initDatePickers() {
    if (typeof flatpickr === 'undefined') {
        console.error('Flatpickr not loaded');
        return;
    }
    const fromVal = document.getElementById('date_from') && document.getElementById('date_from').value;
    const toVal = document.getElementById('date_to') && document.getElementById('date_to').value;
    const parseDmy = (s) => {
        if (!s || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s).trim())) return null;
        const parts = String(s).trim().split('/').map(Number);
        if (parts.length !== 3) return null;
        const [d, m, y] = parts;
        return new Date(y, m - 1, d);
    };
    const formatDmy = (date) => {
        const d = date.getDate();
        const m = date.getMonth() + 1;
        const y = date.getFullYear();
        return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    };
    const defaultFrom = parseDmy(fromVal) || new Date();
    const defaultTo = parseDmy(toVal) || new Date();
    flatpickr('#capture_date_range', {
        mode: 'range',
        dateFormat: 'd/m/Y',
        allowInput: false,
        defaultDate: [defaultFrom, defaultTo],
        // range：須先選起始再選結束；若在 onChange 裡對 length===1 就 setDate([d,d]) 會打斷第二下選取（無法選 1 號～4 號）
        onChange: function (selectedDates) {
            if (selectedDates.length === 2) {
                document.getElementById('date_from').value = formatDmy(selectedDates[0]);
                document.getElementById('date_to').value = formatDmy(selectedDates[1]);
                const captureInput = document.getElementById('capture_date_range');
                if (captureInput) {
                    captureInput.value = `${formatDmy(selectedDates[0])} - ${formatDmy(selectedDates[1])}`;
                }
                performMemberSearch();
            }
        },
        onClose: function (selectedDates) {
            // 只選了第一天就關閉日曆：視為單日（與連點同一天的兩段選取不同，那種會走 onChange length===2）
            if (selectedDates.length === 1) {
                const d = selectedDates[0];
                const s = formatDmy(d);
                document.getElementById('date_from').value = s;
                document.getElementById('date_to').value = s;
                const captureInput = document.getElementById('capture_date_range');
                if (captureInput) {
                    captureInput.value = `${s} - ${s}`;
                }
                const fp = captureInput && captureInput._flatpickr;
                if (fp) fp.setDate([d, d], false);
                performMemberSearch();
            }
        }
    });

    // Quick Select（Period）：与 Transaction List 一致，刷新 Win/Loss 用 performMemberSearch
    window.toggleQuickSelectDropdown = function () {
        const dropdown = document.getElementById('quick-select-dropdown');
        if (!dropdown) return;
        dropdown.classList.toggle('show');
    };
    window.selectQuickRange = function (range) {
        const today = new Date();
        let startDate, endDate;
        switch (range) {
            case 'today':
                startDate = new Date(today);
                endDate = new Date(today);
                break;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = endDate = yesterday;
                break;
            case 'thisWeek':
                const thisWeekStart = new Date(today);
                const dayOfWeek = thisWeekStart.getDay();
                const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                thisWeekStart.setDate(thisWeekStart.getDate() - daysToMonday);
                startDate = thisWeekStart;
                endDate = new Date(today);
                break;
            case 'lastWeek':
                const lastWeekEnd = new Date(today);
                const lastWeekDayOfWeek = lastWeekEnd.getDay();
                const daysToLastSunday = lastWeekDayOfWeek === 0 ? 0 : lastWeekDayOfWeek;
                lastWeekEnd.setDate(lastWeekEnd.getDate() - daysToLastSunday - 1);
                const lastWeekStart = new Date(lastWeekEnd);
                lastWeekStart.setDate(lastWeekStart.getDate() - 6);
                startDate = lastWeekStart;
                endDate = lastWeekEnd;
                break;
            case 'thisMonth':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today);
                break;
            case 'lastMonth':
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                startDate = lastMonth;
                endDate = lastMonthEnd;
                break;
            case 'thisYear':
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date(today);
                break;
            case 'lastYear':
                startDate = new Date(today.getFullYear() - 1, 0, 1);
                endDate = new Date(today.getFullYear() - 1, 11, 31);
                break;
            default:
                return;
        }
        document.getElementById('date_from').value = formatDmy(startDate);
        document.getElementById('date_to').value = formatDmy(endDate);
        const captureInput = document.getElementById('capture_date_range');
        if (captureInput) captureInput.value = formatDmy(startDate) + ' - ' + formatDmy(endDate);
        const fp = captureInput && captureInput._flatpickr;
        if (fp) fp.setDate([startDate, endDate]);
        const quickSelectText = document.getElementById('quick-select-text');
        const rangeTexts = { today: 'Today', yesterday: 'Yesterday', thisWeek: 'This Week', lastWeek: 'Last Week', thisMonth: 'This Month', lastMonth: 'Last Month', thisYear: 'This Year', lastYear: 'Last Year' };
        if (quickSelectText) quickSelectText.textContent = rangeTexts[range] || 'Period';
        const dropdown = document.getElementById('quick-select-dropdown');
        if (dropdown) dropdown.classList.remove('show');
        performMemberSearch();
    };
    if (!document._memberQuickSelectClickBound) {
        document._memberQuickSelectClickBound = true;
        document.addEventListener('click', function (e) {
            if (e.target.closest('.transaction-quick-select-dropdown')) return;
            const quickDropdown = document.getElementById('quick-select-dropdown');
            if (quickDropdown) quickDropdown.classList.remove('show');
        });
    }
}

function setupCompanyButtons() {
    const container = document.getElementById('member_company_buttons');
    if (!container) return;

    container.addEventListener('click', (event) => {
        const btn = event.target.closest('.transaction-company-btn');
        if (!btn) return;

        const companyId = parseInt(btn.dataset.companyId || '0', 10);
        const label = btn.dataset.companyLabel || '';
        if (!companyId || companyId === memberConfig.companyId) {
            return;
        }

        const url = `api/session/update_company_session_api.php?company_id=${companyId}&_t=${Date.now()}`;
        fetch(url, { cache: 'no-cache' })
            .then(res => res.text())
            .then(text => parseJsonResponse(text))
            .then(data => {
                if (!data.success) {
                    throw new Error(data.error || 'Failed to switch company');
                }
                if (typeof window.updateSidebarDataCaptureVisibility === 'function' && data.data) {
                    window.updateSidebarDataCaptureVisibility(data.data.has_gambling, data.data.has_bank);
                }
                memberConfig.companyId = companyId;

                // 更新按钮选中状态
                container.querySelectorAll('.transaction-company-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });

                showNotification(`Switched to company ${label || companyId}`, 'success');
                loadMemberLinkedAccounts().finally(() => {
                    loadMemberOwnedCurrencies().finally(() => performMemberSearch());
                });
            })
            .catch(err => {
                console.error('Failed to switch company:', err);
                showNotification(err.message || 'Failed to switch company', 'error');
            });
    });
}

function memberWLGridStorageKey() {
    return `member_wl_grid:${memberConfig.companyId}:${memberLinkedListRootId()}`;
}

function applyDefaultWLGridSelectionFromLinkedList() {
    const ids = memberLinkedAccountsList.map(a => Number(a.id)).filter(x => x > 0);
    memberWLGridSelectedIds.clear();
    if (ids.length === 0) {
        saveWLGridSelectionToStorage();
        return;
    }
    let restored = false;
    try {
        const raw = sessionStorage.getItem(memberWLGridStorageKey());
        if (raw) {
            const arr = JSON.parse(raw);
            arr.forEach((id) => {
                const n = Number(id);
                if (ids.includes(n)) memberWLGridSelectedIds.add(n);
            });
            if (memberWLGridSelectedIds.size > 0) restored = true;
        }
    } catch (e) { /* ignore */ }
    if (!restored) {
        ids.forEach((id) => memberWLGridSelectedIds.add(id));
    }
    const allow = new Set(ids);
    [...memberWLGridSelectedIds].forEach((id) => {
        if (!allow.has(Number(id))) memberWLGridSelectedIds.delete(id);
    });
    if (memberWLGridSelectedIds.size === 0) {
        ids.forEach((id) => memberWLGridSelectedIds.add(id));
    }
    saveWLGridSelectionToStorage();
}

function saveWLGridSelectionToStorage() {
    try {
        sessionStorage.setItem(memberWLGridStorageKey(), JSON.stringify([...memberWLGridSelectedIds]));
    } catch (e) { /* ignore */ }
}

function syncMemberLinkedFilterTrigger() {
    const btn = document.getElementById('member_linked_filter_btn');
    if (!btn) return;
    const show = memberLinkedAccountsList.length > 0;
    btn.style.display = show ? 'inline-flex' : 'none';
    btn.toggleAttribute('disabled', !show);
}

/**
 * 迷你网格展示的币别列表（顺序与 Currency 胶囊 / 明细表顺序一致）。
 * All：全部可用币别；单选 / 多选：仅在选中的可用币别中展示。
 */
function getMemberMiniGridCurrencies() {
    const available = getAvailableCurrencies();
    if (!available.length) return [];
    if (memberIsAllSelected) {
        return available.slice();
    }
    const picked = available.filter(code => memberSelectedCurrencies.has(code));
    return picked.length ? picked : available.slice();
}

function clearMemberMiniGridDisplay() {
    const gridEl = document.getElementById('member_balance_grid');
    const hintEl = document.getElementById('member_balance_grid_hint');
    const currLine = document.getElementById('member_balance_grid_currency_line');
    const liveEl = document.getElementById('member_balance_totals_live');
    if (gridEl) {
        gridEl.innerHTML = '';
        gridEl.classList.remove('member-balance-mini-matrix');
        gridEl.style.gridTemplateColumns = '';
        gridEl.removeAttribute('role');
        gridEl.removeAttribute('aria-label');
    }
    if (hintEl) hintEl.textContent = '';
    if (currLine) currLine.textContent = '';
    if (liveEl) liveEl.textContent = '';
}

function refreshMemberMiniGrid(seq) {
    return fetchMemberMiniGridBalances(seq != null ? seq : memberSearchSeq);
}

function fetchMiniGridHistoryClosingsForAccount(accountDbId, gridCurrencies, dateFrom, dateTo, signal) {
    const uppers = gridCurrencies.map(c => String(c || '').trim().toUpperCase()).filter(Boolean);
    const wanted = new Set(uppers);
    const params = new URLSearchParams({
        account_id: String(accountDbId),
        date_from: dateFrom,
        date_to: dateTo,
        company_id: String(memberConfig.companyId)
    });
    if (uppers.length === 1) {
        params.append('currency', uppers[0]);
    }
    return fetch(`api/transactions/history_api.php?${params.toString()}&_t=${Date.now()}`, {
        cache: 'no-store',
        signal
    })
        .then(res => res.text())
        .then(text => parseJsonResponse(text))
        .then(data => {
            if (!data.success) {
                throw new Error(data.error || data.message || 'Could not load history');
            }
            const historyRows = data.data?.history ?? [];
            return memberHistoryClosingBalancesForAllCurrencies(historyRows, wanted);
        })
        .catch(() => {
            const fallback = new Map();
            wanted.forEach((cu) => fallback.set(cu, normalizeNumber('0')));
            return fallback;
        });
}

/** 屏幕朗读：矩阵底部 TOTAL 行更新后顺带播报汇总。 */
function announceMemberMiniGridTotalsAria(totalsByCu, currencyOrderUpper, seq) {
    const liveEl = document.getElementById('member_balance_totals_live');
    if (!liveEl || seq !== memberSearchSeq) return;
    const order = currencyOrderUpper.map(c => String(c || '').trim().toUpperCase()).filter(Boolean);
    if (!order.length) {
        liveEl.textContent = '';
        return;
    }
    const parts = order.map((cu) => {
        const dec = totalsByCu.get(cu) || normalizeNumber('0');
        return `${cu} ${formatNumber(dec.toString())}`;
    });
    liveEl.textContent = `Totals: ${parts.join(', ')}.`;
}

function fetchMemberMiniGridBalances(seq = memberSearchSeq) {
    return new Promise((resolve) => {
        const hintEl = document.getElementById('member_balance_grid_hint');
        const currLine = document.getElementById('member_balance_grid_currency_line');

        clearMemberMiniGridDisplay();

        if (!memberLinkedAccountsList.length) {
            if (hintEl) hintEl.textContent = '';
            resolve();
            return;
        }

        const gridCurrencies = getMemberMiniGridCurrencies();
        const dateFrom = document.getElementById('date_from') && document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to') && document.getElementById('date_to').value;

        if (!dateFrom || !dateTo) {
            resolve();
            return;
        }

        const orderUpper = gridCurrencies.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);

        if (!orderUpper.length) {
            if (hintEl && getAvailableCurrencies().length === 0) {
                hintEl.textContent = 'No currencies in range for balances.';
            }
            resolve();
            return;
        }

        const orderedAccounts = getOrderedMiniGridAccountsForCurrencies(orderUpper);

        if (hintEl) hintEl.textContent = '';

        if (currLine) {
            currLine.textContent = orderUpper.length > 1 ? '' : (orderUpper[0] || '');
        }

        if (memberLinkedCurrenciesLoaded && orderedAccounts.length === 0) {
            if (hintEl) {
                hintEl.textContent = orderUpper.length > 1
                    ? 'No accounts in the grid hold any of these currencies.'
                    : `No accounts in the grid hold ${orderUpper[0]}.`;
            }
            resolve();
            return;
        }

        if (memberGridFetchAbortController) {
            memberGridFetchAbortController.abort();
        }
        memberGridFetchAbortController = new AbortController();
        const signal = memberGridFetchAbortController.signal;

        Promise.all(
            orderedAccounts.map((acc) => {
                const id = Number(acc.id);
                return fetchMiniGridHistoryClosingsForAccount(id, orderUpper, dateFrom, dateTo, signal)
                    .then((byCurMap) => ({ id, byCurMap }));
            })
        )
            .then((pairs) => {
                if (seq !== memberSearchSeq) {
                    resolve();
                    return;
                }
                const balanceMap = new Map();
                (pairs || []).forEach(({ id, byCurMap }) => {
                    if (id <= 0 || !(byCurMap instanceof Map)) return;
                    orderUpper.forEach((cu) => {
                        const dec = byCurMap.get(cu);
                        if (dec != null && typeof dec.plus === 'function') {
                            balanceMap.set(`${id}|${cu}`, dec);
                        }
                    });
                });
                renderMemberMiniGrid(balanceMap, orderUpper, seq);
                resolve();
            })
            .catch((err) => {
                if (err && err.name === 'AbortError') {
                    resolve();
                    return;
                }
                if (seq !== memberSearchSeq) {
                    resolve();
                    return;
                }
                clearMemberMiniGridDisplay();
                if (hintEl) hintEl.textContent = err.message || 'Could not load grid.';
                resolve();
            });
    });
}

function renderMemberMiniGrid(balanceMap, orderUpper, seq) {
    const gridEl = document.getElementById('member_balance_grid');
    const hintEl = document.getElementById('member_balance_grid_hint');

    if (seq !== memberSearchSeq || !gridEl) return;

    gridEl.innerHTML = '';
    gridEl.classList.remove('member-balance-mini-matrix');
    gridEl.style.gridTemplateColumns = '';
    gridEl.removeAttribute('role');
    gridEl.removeAttribute('aria-label');
    if (hintEl) hintEl.textContent = '';

    const currenciesUpper = Array.isArray(orderUpper)
        ? orderUpper.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
        : [];

    const listOrdered = getOrderedMiniGridAccountsForCurrencies(currenciesUpper);

    if (!listOrdered.length && memberLinkedCurrenciesLoaded && currenciesUpper.length) {
        if (hintEl) {
            hintEl.textContent = currenciesUpper.length > 1
                ? 'No accounts in the grid hold any of these currencies.'
                : `No accounts in the grid hold ${currenciesUpper[0]}.`;
        }
        announceMemberMiniGridTotalsAria(new Map(), [], seq);
        return;
    }

    const totalsByCu = new Map();
    currenciesUpper.forEach((cu) => totalsByCu.set(cu, normalizeNumber('0')));

    const ncu = currenciesUpper.length;
    if (ncu === 0) {
        announceMemberMiniGridTotalsAria(totalsByCu, [], seq);
        return;
    }

    gridEl.classList.add('member-balance-mini-matrix');
    gridEl.setAttribute('role', 'grid');
    gridEl.setAttribute('aria-label', 'Balances by account and currency');
    gridEl.style.gridTemplateColumns =
        `minmax(3.25rem, 5.25rem) repeat(${ncu}, minmax(${ncu <= 3 ? '4rem' : '3.25rem'}, 1fr))`;

    const corner = document.createElement('div');
    corner.className = 'member-balance-matrix-corner';
    corner.setAttribute('aria-hidden', 'true');
    gridEl.appendChild(corner);

    const lastCi = ncu - 1;

    currenciesUpper.forEach((cu, ci) => {
        const th = document.createElement('div');
        th.className = 'member-balance-matrix-th';
        if (ci === lastCi) th.classList.add('member-balance-matrix-th--edge');
        th.setAttribute('role', 'columnheader');
        th.textContent = cu;
        gridEl.appendChild(th);
    });

    listOrdered.forEach((acc, accIdx) => {
        const idNum = Number(acc.id);
        const code = (acc.account_id || acc.name || String(idNum)).trim() || String(idNum);

        const rowHead = document.createElement('div');
        rowHead.className = 'member-balance-matrix-rowhead';
        rowHead.setAttribute('role', 'rowheader');
        rowHead.textContent = code;
        rowHead.title = code;
        gridEl.appendChild(rowHead);

        currenciesUpper.forEach((cu, ci) => {
            const holds = accountHoldsMiniGridCurrency(idNum, cu);
            const key = `${idNum}|${cu}`;
            const balDec = holds && balanceMap && balanceMap.has(key)
                ? balanceMap.get(key)
                : normalizeNumber('0');

            if (holds) {
                totalsByCu.set(cu, totalsByCu.get(cu).plus(balDec));
            }

            const cell = document.createElement('div');
            cell.className = 'member-balance-matrix-cell';
            cell.setAttribute('role', 'gridcell');
            if (accIdx % 2 === 1) cell.classList.add('member-balance-matrix-cell--alt');
            if (ci === lastCi) cell.classList.add('member-balance-matrix-cell--edge');

            if (!holds) {
                cell.classList.add('member-balance-matrix-cell--na');
                cell.textContent = '–';
            } else {
                const amt = document.createElement('span');
                amt.className = 'member-balance-matrix-amt';
                amt.textContent = formatNumber(balDec.toString());
                if (typeof balDec.lt === 'function' && balDec.lt('0')) {
                    amt.classList.add('member-balance-matrix-amt--neg');
                }
                cell.appendChild(amt);
            }
            gridEl.appendChild(cell);
        });
    });

    const totalRh = document.createElement('div');
    totalRh.className = 'member-balance-matrix-rowhead member-balance-matrix-rowhead--total member-balance-matrix-rowhead--edge';
    totalRh.setAttribute('role', 'rowheader');
    totalRh.textContent = 'Total';
    gridEl.appendChild(totalRh);

    currenciesUpper.forEach((cu, ci) => {
        const dec = totalsByCu.get(cu) || normalizeNumber('0');
        const cell = document.createElement('div');
        cell.className = 'member-balance-matrix-cell member-balance-matrix-cell--total';
        cell.setAttribute('role', 'gridcell');
        if (ci === lastCi) cell.classList.add('member-balance-matrix-cell--edge');
        cell.classList.add('member-balance-matrix-cell--edge-row');
        const amt = document.createElement('span');
        amt.className = 'member-balance-matrix-amt member-balance-matrix-amt--total-row';
        amt.textContent = formatNumber(dec.toString());
        if (typeof dec.lt === 'function' && dec.lt('0')) {
            amt.classList.add('member-balance-matrix-amt--neg');
        }
        cell.appendChild(amt);
        gridEl.appendChild(cell);
    });

    announceMemberMiniGridTotalsAria(totalsByCu, currenciesUpper, seq);
}

function buildMemberLinkedFilterModalList() {
    const box = document.getElementById('member_linked_filter_checkbox_area');
    if (!box) return;
    box.innerHTML = '';
    memberLinkedAccountsList.forEach((acc) => {
        const id = Number(acc.id);
        const label = ((acc.account_id || acc.name || String(id))).trim();
        const row = document.createElement('label');
        row.className = 'member-linked-cb-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = String(id);
        cb.checked = memberWLGridSelectedIds.has(id);
        const span = document.createElement('span');
        const curTags = [];
        const cset = memberLinkedAccountCurrenciesMap.get(id);
        if (cset && cset.size) {
            [...cset].sort().forEach((c) => { if (c) curTags.push(c); });
        }
        span.textContent = curTags.length ? `${label || id} · ${curTags.join('/')}` : String(label || id);
        row.appendChild(cb);
        row.appendChild(span);
        box.appendChild(row);
    });
}

function filterMemberLinkedModalRows(query) {
    const q = (query || '').trim().toLowerCase();
    document.querySelectorAll('#member_linked_filter_checkbox_area .member-linked-cb-row').forEach((row) => {
        const t = row.textContent.toLowerCase();
        row.style.display = (!q || t.includes(q)) ? '' : 'none';
    });
}

function memberOpenLinkedFilterModal() {
    const modal = document.getElementById('member_linked_filter_modal');
    const searchEl = document.getElementById('member_linked_filter_search');
    if (!modal || memberLinkedAccountsList.length === 0) return;
    if (searchEl) searchEl.value = '';
    buildMemberLinkedFilterModalList();
    filterMemberLinkedModalRows('');
    modal.style.display = 'block';
}

function memberCloseLinkedFilterModal() {
    const modal = document.getElementById('member_linked_filter_modal');
    if (modal) modal.style.display = 'none';
}

function setupMemberLinkedFilterModalHandlers() {
    const modal = document.getElementById('member_linked_filter_modal');
    document.getElementById('member_linked_filter_btn') && document.getElementById('member_linked_filter_btn').addEventListener('click', () => {
        memberOpenLinkedFilterModal();
    });
    modal && modal.addEventListener('click', (e) => {
        if (e.target === modal) memberCloseLinkedFilterModal();
    });
    document.querySelectorAll('[data-member-close-modal]').forEach((el) => {
        el.addEventListener('click', () => memberCloseLinkedFilterModal());
    });

    document.getElementById('member_linked_select_all') && document.getElementById('member_linked_select_all').addEventListener('click', () => {
        document.querySelectorAll('#member_linked_filter_checkbox_area input[type=checkbox]').forEach((cb) => { cb.checked = true; });
    });
    document.getElementById('member_linked_clear_all') && document.getElementById('member_linked_clear_all').addEventListener('click', () => {
        document.querySelectorAll('#member_linked_filter_checkbox_area input[type=checkbox]').forEach((cb) => { cb.checked = false; });
    });

    const searchEl = document.getElementById('member_linked_filter_search');
    if (searchEl) {
        searchEl.addEventListener('input', () => filterMemberLinkedModalRows(searchEl.value));
    }

    document.getElementById('member_linked_filter_apply') && document.getElementById('member_linked_filter_apply').addEventListener('click', () => {
        const checked = [...document.querySelectorAll('#member_linked_filter_checkbox_area input[type=checkbox]:checked')]
            .map((cb) => Number(cb.value)).filter(Boolean);
        if (!checked.length) {
            showNotification('Select at least one account.', 'warning');
            return;
        }
        memberWLGridSelectedIds.clear();
        checked.forEach((id) => memberWLGridSelectedIds.add(id));
        saveWLGridSelectionToStorage();
        memberCloseLinkedFilterModal();
        sanitizeMemberCurrencySelectionAfterUnionChange();
        performMemberSearch();
    });

    window.memberCloseLinkedFilterModal = memberCloseLinkedFilterModal;
}

function loadMemberLinkedAccounts() {
    const container = document.getElementById('member_account_buttons');
    const loadingEl = document.getElementById('member_account_loading');

    memberLinkedAccountsList = [];
    syncMemberLinkedFilterTrigger();

    if (!container) {
        return Promise.resolve();
    }
    const rootAccountId = memberLinkedListRootId();
    const companyId = memberConfig.companyId;

    const failEmptyUi = () => {
        memberLinkedAccountsList = [];
        memberWLGridSelectedIds.clear();
        memberLinkedAccountCurrenciesMap.clear();
        memberLinkedCurrenciesLoaded = true;
        if (loadingEl) loadingEl.style.display = 'none';
        container.innerHTML = '<span class="member-account-loading">-</span>';
        const filterEl = document.getElementById('member_account_filter');
        if (filterEl) filterEl.style.display = 'none';
        syncMemberLinkedFilterTrigger();
        clearMemberMiniGridDisplay();
    };

    if (!rootAccountId || !companyId) {
        failEmptyUi();
        return Promise.resolve();
    }

    if (loadingEl) loadingEl.style.display = 'inline';

    return fetch(`api/accounts/account_link_api.php?action=get_all_linked_accounts&account_id=${rootAccountId}&company_id=${companyId}&_t=${Date.now()}`, { cache: 'no-cache' })
        .then(res => res.text())
        .then(text => {
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('Linked accounts response not JSON:', text.substring(0, 200));
                throw new Error('Invalid response');
            }
            if (!data.success || !Array.isArray(data.data)) {
                failEmptyUi();
                return;
            }
            const list = data.data.map((acc) => ({
                id: acc.id,
                account_id: acc.account_id || '',
                name: acc.name || ''
            }));
            memberLinkedAccountsList = list;
            applyDefaultWLGridSelectionFromLinkedList();

            const filterEl = document.getElementById('member_account_filter');
            if (list.length <= 1) {
                if (filterEl) filterEl.style.display = 'none';
                container.innerHTML = '';
                if (loadingEl) loadingEl.style.display = 'none';
            } else {
                container.innerHTML = '';
                if (loadingEl) loadingEl.style.display = 'none';
                if (filterEl) filterEl.style.display = 'flex';
                list.forEach(acc => {
                    const id = acc.id;
                    const code = (acc.account_id || acc.name || String(id)).trim();
                    const name = (acc.name || code).trim();
                    const isActive = Number(id) === Number(memberConfig.accountId);
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'transaction-company-btn' + (isActive ? ' active' : '');
                    btn.dataset.accountId = id;
                    btn.dataset.accountCode = code;
                    btn.dataset.accountName = name;
                    btn.textContent = code || name || id;
                    container.appendChild(btn);
                });
                setupAccountButtons();
            }
            syncMemberLinkedFilterTrigger();
        })
        .catch(err => {
            console.error('Failed to load linked accounts:', err);
            failEmptyUi();
        })
        .then(() => loadLinkedAccountsCurrencyMap());
}

function setupAccountButtons() {
    const container = document.getElementById('member_account_buttons');
    if (!container) return;
    container.querySelectorAll('.transaction-company-btn[data-account-id]').forEach(btn => {
        btn.onclick = function () {
            const accountId = parseInt(btn.dataset.accountId || '0', 10);
            const code = btn.dataset.accountCode || '';
            const name = btn.dataset.accountName || '';
            if (!accountId || accountId === memberConfig.accountId) return;
            fetch(`api/session/update_account_session_api.php?account_id=${accountId}&_t=${Date.now()}`, { cache: 'no-cache' })
                .then(res => res.text())
                .then(text => parseJsonResponse(text))
                .then(data => {
                    if (!data.success) throw new Error(data.message || 'Switch failed');
                    const payload = data.data || data;
                    memberConfig.accountId = Number(payload.account_id) ?? payload.account_id;
                    memberConfig.accountCode = payload.account_code || code;
                    memberConfig.accountName = payload.account_name || name;
                    container.querySelectorAll('.transaction-company-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    showNotification(`Switched to account ${code || name || accountId}`, 'success');
                    loadMemberLinkedAccounts().finally(() => {
                        loadMemberOwnedCurrencies().finally(() => performMemberSearch());
                    });
                })
                .catch(err => {
                    console.error('Failed to switch account:', err);
                    showNotification(err.message || 'Failed to switch account', 'error');
                });
        };
    });
}

function formatNumber(value) {
    try {
        return MoneyDecimal.formatThousands(value || '0', 2);
    } catch (e) {
        return '0.00';
    }
}

function normalizeNumber(value) {
    try {
        return MoneyDecimal.toDecimal(value || '0', 0);
    } catch (e) {
        return MoneyDecimal.toDecimal('0', 0);
    }
}

/** Payment History：避免浏览器浮点格式化与 transaction.js 的 trunc 导致 -40.79 */
function formatPaymentHistoryMoney(value) {
    if (value === '-' || value === null || value === undefined) return '-';
    const cleaned = String(value).replace(/,/g, '').trim();
    if (cleaned === '' || cleaned === '-') return '0.00';
    const exact2 = cleaned.match(/^(-?)(\d+)\.(\d{2})$/);
    if (exact2) {
        const neg = exact2[1] === '-';
        const intPart = exact2[2];
        const dec = exact2[3];
        const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (neg ? '-' : '') + intWithSep + '.' + dec;
    }
    return formatNumber(cleaned);
}

function toUpperDisplay(value) {
    if (value === null || value === undefined) {
        return '-';
    }
    const text = String(value).trim();
    return text ? text.toUpperCase() : '-';
}

function parseJsonResponse(text) {
    const t = (text || '').trim();
    try {
        return JSON.parse(t);
    } catch (e) {
        // 提取第一个完整的 JSON 对象（按大括号匹配，避免多对象或夹杂 HTML 时取错范围）
        const start = t.indexOf('{');
        if (start === -1) {
            console.error('JSON parse failed, response start:', t.substring(0, 120));
            throw new Error('服务器返回格式错误，请重试');
        }
        let depth = 0;
        let inString = false;
        let escape = false;
        let quote = '';
        let end = -1;
        for (let i = start; i < t.length; i++) {
            const c = t[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (inString) {
                if (c === '\\') escape = true;
                else if (c === quote) inString = false;
                continue;
            }
            if (c === '"' || c === "'") {
                inString = true;
                quote = c;
                continue;
            }
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        if (end !== -1 && end > start) {
            try {
                return JSON.parse(t.substring(start, end + 1));
            } catch (e2) {
                console.error('JSON parse failed, response start:', t.substring(0, 120));
                throw new Error('服务器返回格式错误，请重试');
            }
        }
        console.error('JSON parse failed, response start:', t.substring(0, 120));
        throw new Error('服务器返回格式错误，请重试');
    }
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const typeClass = {
        success: 'transaction-notification-success',
        error: 'transaction-notification-error',
        warning: 'transaction-notification-warning',
        info: 'transaction-notification-success'
    }[type] || 'transaction-notification-success';

    // Limit to 2 notifications
    const existing = container.querySelectorAll('.transaction-notification');
    if (existing.length >= 2) {
        const first = existing[0];
        first.classList.remove('show');
        setTimeout(() => first.remove(), 300);
    }

    const notification = document.createElement('div');
    notification.className = `transaction-notification ${typeClass}`;
    notification.textContent = message;
    container.appendChild(notification);

    requestAnimationFrame(() => notification.classList.add('show'));

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

function fetchMemberSummary(seq = memberSearchSeq) {
    return new Promise((resolve, reject) => {
        if (memberSummaryAbortController) {
            memberSummaryAbortController.abort();
        }
        memberSummaryAbortController = new AbortController();
        const dateFrom = document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to').value;
        const filterWrapper = document.getElementById('member_currency_filter');

        if (!dateFrom || !dateTo) {
            showNotification('Please select date range', 'error');
            ensureMemberCurrencyChromeVisible();
            return reject(new Error('Missing date'));
        }

        const params = new URLSearchParams({
            date_from: dateFrom,
            date_to: dateTo,
            target_account_id: memberConfig.accountId,
            company_id: memberConfig.companyId,
            show_inactive: '1',
            hide_zero_balance: '0'
        });

        const url = `api/transactions/search_api.php?${params.toString()}&_t=${Date.now()}`;
        fetch(url, { cache: 'no-cache', signal: memberSummaryAbortController.signal })
            .then(res => res.text())
            .then(text => parseJsonResponse(text))
            .then(data => {
                if (seq !== memberSearchSeq) {
                    return resolve();
                }
                if (!data.success) {
                    throw new Error(data.error || 'Query failed');
                }
                const combined = [
                    ...(data.data?.left_table ?? []),
                    ...(data.data?.right_table ?? [])
                ];
                memberCurrencySummary = combined.filter(row => Number(row.account_db_id) === Number(memberConfig.accountId));
                memberCurrencySortOrder.clear();
                memberCurrencySummary.forEach(row => {
                    const code = (row.currency || '').trim();
                    if (!code) return;
                    const sortValue = typeof row.currency_id === 'number'
                        ? row.currency_id
                        : parseInt(row.currency_id || '0', 10) || Number.MAX_SAFE_INTEGER;
                    if (!memberCurrencySortOrder.has(code) || memberCurrencySortOrder.get(code) > sortValue) {
                        memberCurrencySortOrder.set(code, sortValue);
                    }
                });
                updateCurrencySelection();
                loadMemberCurrencyOrder().then(() => {
                    if (seq !== memberSearchSeq) {
                        resolve();
                        return;
                    }
                    const currencies = getAvailableCurrencies();
                    if (currencies.length > 0) {
                        // 默认「全部货币」拉 history（一次请求、前端按币别分表），避免 Profit Sharing 等在非首列币别时被漏掉
                        memberIsAllSelected = true;
                        memberSelectedCurrencies.clear();
                    }
                    renderCurrencyFilters();
                    fetchMemberMiniGridBalances(seq).finally(() => resolve());
                });
            })
            .catch(err => {
                if (err && err.name === 'AbortError') {
                    reject(err);
                    return;
                }
                if (seq !== memberSearchSeq) {
                    reject(err);
                    return;
                }
                console.error('Summary fetch failed:', err);
                memberCurrencySummary = [];
                memberCurrencySortOrder.clear();
                ensureMemberCurrencyChromeVisible();
                renderCurrencyFilters();
                clearMemberMiniGridDisplay();
                setMemberTablesPlaceholder(err.message || 'Failed to load currency data.');
                showNotification(err.message || 'Failed to load currency data', 'error');
                reject(err);
            });
    });
}

function updateCurrencySelection() {
    const currencies = getAvailableCurrencies();
    if (!currencies.length) {
        memberIsAllSelected = true;
        memberSelectedCurrencies.clear();
        return;
    }

    const retained = [];
    memberSelectedCurrencies.forEach(code => {
        if (currencies.includes(code)) {
            retained.push(code);
        }
    });
    memberSelectedCurrencies.clear();
    retained.forEach(code => memberSelectedCurrencies.add(code));

    if (memberSelectedCurrencies.size === 0) {
        memberIsAllSelected = true;
    }
}

/** 仅根据区间内 search summary 推断币别（API 失败或无 account_currency 时的兜底） */
function getAvailableCurrenciesFromSummaryOnly() {
    const codes = [];
    memberCurrencySummary.forEach(row => {
        const code = (row.currency || '').trim();
        if (!code) return;
        if (!memberCurrencySortOrder.has(code)) {
            const sortValue = typeof row.currency_id === 'number'
                ? row.currency_id
                : parseInt(row.currency_id || '0', 10) || Number.MAX_SAFE_INTEGER;
            memberCurrencySortOrder.set(code, sortValue);
        }
        codes.push(code);
    });
    const unique = [...new Set(codes)];
    if (memberCurrencyDisplayOrder && memberCurrencyDisplayOrder.length > 0) {
        const orderSet = new Set(memberCurrencyDisplayOrder);
        const inOrder = unique.filter(c => orderSet.has(c));
        const notInOrder = unique.filter(c => !orderSet.has(c));
        const ordered = [];
        memberCurrencyDisplayOrder.forEach(c => {
            if (inOrder.includes(c)) ordered.push(c);
        });
        notInOrder.sort((a, b) => {
            const orderA = memberCurrencySortOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
            const orderB = memberCurrencySortOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });
        return [...ordered, ...notInOrder];
    }
    return unique.sort((a, b) => {
        const orderA = memberCurrencySortOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
        const orderB = memberCurrencySortOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        return a.localeCompare(b);
    });
}

/** Win/Loss Currency Tab：Accounts 迷你网格中出现的账户配置的币别之并集；与「只看哪套账(Account pill)」解耦 */
function getAvailableCurrencies() {
    let baseOrder = [];
    let fromLinkedUnion = false;
    if (memberLinkedCurrenciesLoaded) {
        const u = [...new Set(collectLinkedUnionCurrencyCodesRaw()
            .map(x => String(x || '').trim().toUpperCase())
            .filter(Boolean))];
        if (u.length) {
            baseOrder = u;
            fromLinkedUnion = true;
        }
    }
    if (!fromLinkedUnion) {
        const seen = new Set();
        memberOwnedCurrencies.forEach(o => {
            const c = (o.code || '').trim().toUpperCase();
            if (!c || seen.has(c)) return;
            seen.add(c);
            baseOrder.push(c);
        });
    }
    if (baseOrder.length === 0) {
        return getAvailableCurrenciesFromSummaryOnly();
    }
    if (memberCurrencyDisplayOrder && memberCurrencyDisplayOrder.length > 0) {
        const orderSet = new Set(memberCurrencyDisplayOrder);
        const inOrder = [];
        memberCurrencyDisplayOrder.forEach(c => {
            if (baseOrder.includes(c)) inOrder.push(c);
        });
        const notInOrder = baseOrder.filter(c => !orderSet.has(c));
        notInOrder.sort((a, b) => {
            const orderA = memberCurrencySortOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
            const orderB = memberCurrencySortOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b);
        });
        return [...inOrder, ...notInOrder];
    }
    return baseOrder.sort((a, b) => {
        const orderA = memberCurrencySortOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
        const orderB = memberCurrencySortOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const ia = fromLinkedUnion ? -1 : memberOwnedCurrencies.findIndex(o => (o.code || '').trim().toUpperCase() === a);
        const ib = fromLinkedUnion ? -1 : memberOwnedCurrencies.findIndex(o => (o.code || '').trim().toUpperCase() === b);
        if (!fromLinkedUnion && ia !== ib) return ia - ib;
        return a.localeCompare(b);
    });
}

function loadMemberCurrencyOrder() {
    return fetch('api/transactions/user_currency_order_api.php?_t=' + Date.now(), { cache: 'no-cache' })
        .then(res => res.text())
        .then(text => {
            try {
                const data = typeof text === 'string' ? JSON.parse(text) : text;
                if (data && data.success && Array.isArray(data.data?.order) && data.data.order.length > 0) {
                    memberCurrencyDisplayOrder = data.data.order;
                } else {
                    memberCurrencyDisplayOrder = null;
                }
            } catch (e) {
                memberCurrencyDisplayOrder = null;
            }
        })
        .catch(() => { memberCurrencyDisplayOrder = null; });
}

function saveMemberCurrencyOrder(order) {
    return fetch('api/transactions/user_currency_order_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: order })
    })
        .then(res => res.text())
        .then(text => {
            const data = typeof text === 'string' ? JSON.parse(text) : text;
            if (data && data.success) {
                memberCurrencyDisplayOrder = data.data?.order ?? order;
                showNotification('货币顺序已保存', 'success');
                if (memberCurrencyDisplayOrder && memberCurrencyDisplayOrder.length > 0) {
                    memberIsAllSelected = true;
                    memberSelectedCurrencies.clear();
                    renderCurrencyFilters();
                    fetchMemberHistory();
                    refreshMemberMiniGrid(memberSearchSeq);
                }
            }
        })
        .catch(err => {
            console.error('Save currency order failed:', err);
            showNotification('保存顺序失败', 'error');
        });
}

function initCurrencyDragDrop() {
    const container = document.getElementById('member_currency_buttons');
    if (!container) return;
    let draggedCode = null;
    container.querySelectorAll('.transaction-company-btn[data-currency]').forEach(btn => {
        btn.setAttribute('draggable', 'true');
        btn.addEventListener('dragstart', (e) => {
            draggedCode = btn.getAttribute('data-currency');
            e.dataTransfer.setData('text/plain', draggedCode);
            e.dataTransfer.effectAllowed = 'move';
            btn.classList.add('member-currency-dragging');
        });
        btn.addEventListener('dragend', () => {
            btn.classList.remove('member-currency-dragging');
            draggedCode = null;
        });
    });
    container.addEventListener('dragover', (e) => {
        if (!draggedCode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.transaction-company-btn[data-currency]');
        if (target && target !== document.querySelector('.member-currency-dragging')) {
            target.classList.add('member-currency-drag-over');
        }
    });
    container.addEventListener('dragleave', (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            container.querySelectorAll('.member-currency-drag-over').forEach(el => el.classList.remove('member-currency-drag-over'));
        }
    });
    container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.querySelectorAll('.member-currency-drag-over').forEach(el => el.classList.remove('member-currency-drag-over'));
        if (!draggedCode) return;
        const target = e.target.closest('.transaction-company-btn[data-currency]');
        if (!target) return;
        const allButtons = [...container.querySelectorAll('.transaction-company-btn[data-currency]')];
        const fromIndex = allButtons.findIndex(b => b.getAttribute('data-currency') === draggedCode);
        const toIndex = allButtons.indexOf(target);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
        const moved = allButtons[fromIndex];
        if (toIndex < fromIndex) {
            container.insertBefore(moved, allButtons[toIndex]);
        } else {
            container.insertBefore(moved, allButtons[toIndex].nextSibling);
        }
        const newOrder = [...container.querySelectorAll('.transaction-company-btn[data-currency]')].map(b => b.getAttribute('data-currency'));
        saveMemberCurrencyOrder(newOrder);
    });
}

function setMemberTablesPlaceholder(text) {
    const section = document.getElementById('member_currency_tables_section');
    const container = document.getElementById('member_currency_tables');
    if (!section || !container) return;
    section.style.display = 'flex';
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'member-currency-empty';
    p.style.margin = '0';
    p.textContent = text || 'No data.';
    container.appendChild(p);
}

function renderCurrencyFilters() {
    const filterWrapper = document.getElementById('member_currency_filter');
    const buttonsContainer = document.getElementById('member_currency_buttons');
    if (!filterWrapper || !buttonsContainer) {
        return;
    }

    ensureMemberCurrencyChromeVisible();
    buttonsContainer.innerHTML = '';
    const currencies = getAvailableCurrencies();
    // Summary 在该区间无余额行时币别列表为空，但 history 仍可能按币别有明细：至少保留「All」避免 Currency 一行空白
    if (currencies.length === 0) {
        buttonsContainer.appendChild(createCurrencyButton('ALL', 'All', true));
        initCurrencyDragDrop();
        return;
    }
    const shouldShowAll = currencies.length > 1;
    if (shouldShowAll) {
        buttonsContainer.appendChild(createCurrencyButton('ALL', 'All', true));
    }
    currencies.forEach(code => {
        buttonsContainer.appendChild(createCurrencyButton(code, code));
    });
    initCurrencyDragDrop();
}

function createCurrencyButton(code, label, isAll = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'transaction-company-btn' + (isAll ? ' member-currency-all' : '');
    if (!isAll) btn.setAttribute('data-currency', code);
    const isActive = isAll ? memberIsAllSelected : memberSelectedCurrencies.has(code);
    if (isActive) {
        btn.classList.add('active');
    }
    btn.textContent = label;
    btn.addEventListener('click', () => {
        if (isAll) {
            if (!memberIsAllSelected) {
                memberIsAllSelected = true;
                memberSelectedCurrencies.clear();
                renderCurrencyFilters();
                fetchMemberHistory();
                refreshMemberMiniGrid(memberSearchSeq);
            }
            return;
        }

        if (memberSelectedCurrencies.has(code)) {
            memberSelectedCurrencies.delete(code);
        } else {
            memberSelectedCurrencies.add(code);
        }

        memberIsAllSelected = false;

        renderCurrencyFilters();
        fetchMemberHistory();
        refreshMemberMiniGrid(memberSearchSeq);
    });
    return btn;
}

function fetchMemberHistory(forcedFilter, seq = memberSearchSeq) {
    if (memberHistoryAbortController) {
        memberHistoryAbortController.abort();
    }
    memberHistoryAbortController = new AbortController();
    const dateFrom = document.getElementById('date_from').value;
    const dateTo = document.getElementById('date_to').value;

    if (!dateFrom || !dateTo) {
        showNotification('Please select date range', 'error');
        return;
    }

    const availableCurrencies = getAvailableCurrencies();
    let targetCurrencies;

    if (forcedFilter && forcedFilter !== 'ALL') {
        targetCurrencies = [forcedFilter];
    } else if (forcedFilter === 'ALL') {
        memberIsAllSelected = true;
        memberSelectedCurrencies.clear();
        targetCurrencies = availableCurrencies;
    } else {
        targetCurrencies = memberIsAllSelected
            ? availableCurrencies
            : Array.from(memberSelectedCurrencies);
    }

    if (!targetCurrencies.length) {
        if (availableCurrencies.length > 0) {
            // 没有选择任何货币时，不显示任何表格，只显示提示
            setMemberTablesPlaceholder('请选择货币');
            return;
        }
        // summary 未返回币别，尝试拉取一次 history（不传 currency）以兜底显示数据
        const paramsFallback = new URLSearchParams({
            account_id: Number(memberConfig.accountId),
            date_from: dateFrom,
            date_to: dateTo,
            company_id: memberConfig.companyId
        });
        const urlFallback = `api/transactions/history_api.php?${paramsFallback.toString()}&_t=${Date.now()}`;
        fetch(urlFallback, { cache: 'no-store', signal: memberHistoryAbortController.signal })
            .then(res => res.text())
            .then(text => parseJsonResponse(text))
            .then(data => {
                if (seq !== memberSearchSeq) return;
                if (!data.success) {
                    renderCurrencyTables({ '-': [] }, ['-']);
                    showNotification(data.error || 'No data in the selected date range.', 'info');
                    return;
                }
                const history = data.data?.history || [];
                const order = [];
                const grouped = {};
                history.forEach(row => {
                    const c = (row.currency || '-').trim();
                    if (!grouped[c]) {
                        grouped[c] = [];
                        order.push(c);
                    }
                    grouped[c].push(row);
                });
                if (order.length > 0) {
                    renderHistoryTable({ grouped, order });
                } else {
                    renderCurrencyTables({ '-': [] }, ['-']);
                    showNotification('No data in the selected date range.', 'info');
                }
            })
            .catch(err => {
                if (err && err.name === 'AbortError') return;
                if (seq !== memberSearchSeq) return;
                console.error('History fallback fetch failed:', err);
                renderCurrencyTables({ '-': [] }, ['-']);
                showNotification(err.message || 'No data in the selected date range.', 'info');
            });
        return;
    }

    // 多币别时只请求一次 history（不传 currency），在前端按 currency 分组，减少请求数
    const singleRequest = targetCurrencies.length > 1;
    const params = new URLSearchParams({
        account_id: Number(memberConfig.accountId),
        date_from: dateFrom,
        date_to: dateTo,
        company_id: memberConfig.companyId
    });
    if (singleRequest) {
        // 一次请求取全部，不传 currency
    } else if (targetCurrencies[0]) {
        params.append('currency', targetCurrencies[0]);
    }
    const url = `api/transactions/history_api.php?${params.toString()}&_t=${Date.now()}`;

    fetch(url, { cache: 'no-store', signal: memberHistoryAbortController.signal })
        .then(res => res.text())
        .then(text => parseJsonResponse(text))
        .then(data => {
            if (seq !== memberSearchSeq) return;
            if (!data.success) {
                throw new Error(data.error || 'Query failed');
            }
            const history = data.data?.history || [];
            if (singleRequest) {
                const grouped = {};
                history.forEach(row => {
                    const c = (row.currency || '-').trim();
                    if (!grouped[c]) grouped[c] = [];
                    grouped[c].push(row);
                });
                // All 时显示全部货币的 table，按 targetCurrencies 顺序；无数据的币别也显示空表
                renderHistoryTable({ grouped, order: targetCurrencies });
            } else {
                const grouped = {};
                targetCurrencies.forEach(code => {
                    grouped[code || '-'] = history;
                });
                renderHistoryTable({ grouped, order: targetCurrencies });
            }
        })
        .catch(err => {
            if (err && err.name === 'AbortError') return;
            if (seq !== memberSearchSeq) return;
            console.error('History fetch failed:', err);
            renderCurrencyTables({}, []);
            showNotification(err.message, 'error');
        });
}

function getHistoryRemark(row) {
    // 优先使用 data_capture 的 remark，如果没有则使用 sms
    if (row.remark && row.remark.trim() !== '') {
        return toUpperDisplay(row.remark);
    }
    return toUpperDisplay(row.sms || '-');
}

function renderCurrencyTables(groupedMap, orderedKeys) {
    const section = document.getElementById('member_currency_tables_section');
    const container = document.getElementById('member_currency_tables');
    if (!section || !container) {
        return;
    }

    container.innerHTML = '';
    if (!orderedKeys || !orderedKeys.length) {
        section.style.display = 'flex';
        const p = document.createElement('p');
        p.className = 'member-currency-empty';
        p.style.margin = '0';
        p.textContent = 'No data in the selected date range.';
        container.appendChild(p);
        return;
    }

    section.style.display = 'flex';
    orderedKeys.forEach(currencyKey => {
        const rows = groupedMap[currencyKey] || [];
        container.appendChild(createCurrencyTable(currencyKey, rows));
    });
}

function createCurrencyTable(currencyKey, rows) {
    const wrapper = document.createElement('div');
    wrapper.className = 'member-currency-table-wrapper';

    const title = document.createElement('h3');
    title.className = 'member-currency-table-title';
    title.textContent = `Currency: ${currencyKey}`;
    wrapper.appendChild(title);

    const table = document.createElement('table');
    table.className = 'transaction-table member-winloss-table';

    const rowsHtml = [];
    let totalWinLoss = MoneyDecimal.toDecimal('0', 0);
    let totalCrDr = MoneyDecimal.toDecimal('0', 0);
    let closingBalance = MoneyDecimal.toDecimal('0', 0);

    (rows || []).forEach(row => {
        const winLoss = row.win_loss === '-' ? '-' : formatPaymentHistoryMoney(row.win_loss);
        const crdr = row.cr_dr === '-' ? '-' : formatPaymentHistoryMoney(row.cr_dr);
        const balance = row.balance === '-' ? '-' : formatPaymentHistoryMoney(row.balance);

        totalWinLoss = totalWinLoss.plus(normalizeNumber(row.win_loss));
        totalCrDr = totalCrDr.plus(normalizeNumber(row.cr_dr));
        if (row.balance !== '-' && row.balance !== null && row.balance !== undefined && String(row.balance).trim() !== '') {
            closingBalance = normalizeNumber(row.balance);
        }

        // Id Product：与 Transaction Payment 一致，bank process 显示 card_owner（如 Process #125），否则显示 product
        const idProductDisplay = row.is_bank_process_transaction ? (row.card_owner || '-') : (row.product || '-');
        const idProductEscaped = String(idProductDisplay).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        rowsHtml.push(`
            <tr class="transaction-table-row ${row.row_type === 'bf' ? 'member-bf-row' : ''}">
                <td class="transaction-history-col-date">${row.date || '-'}</td>
                <td class="transaction-history-col-product">${idProductEscaped}</td>
                <td class="transaction-history-col-currency">${row.currency || '-'}</td>
                <td class="transaction-history-col-rate">${row.rate || '-'}</td>
                <td class="transaction-history-col-winloss">${winLoss}</td>
                <td class="transaction-history-col-crdr">${crdr}</td>
                <td class="transaction-history-col-balance">${balance}</td>
                <td class="transaction-history-col-description">${row.description != null && row.description !== '' ? row.description : '-'}</td>
                <td class="transaction-history-col-remark text-uppercase">${getHistoryRemark(row)}</td>
            </tr>
        `);
    });

    table.innerHTML = `
        <thead>
            <tr class="transaction-table-header">
                <th class="transaction-history-col-date">Date</th>
                <th class="transaction-history-col-product">Id Product</th>
                <th class="transaction-history-col-currency">Currency</th>
                <th class="transaction-history-col-rate">Rate</th>
                <th class="transaction-history-col-winloss">Win/Loss</th>
                <th class="transaction-history-col-crdr">Cr/Dr</th>
                <th class="transaction-history-col-balance">Balance</th>
                <th class="transaction-history-col-description">Description</th>
                <th class="transaction-history-col-remark">Remark</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml.join('') || `<tr class="transaction-table-row"><td colspan="9" style="text-align:center;">No data</td></tr>`}
        </tbody>
        <tfoot>
            <tr class="transaction-table-row transaction-summary-total">
                <td class="transaction-summary-total-label">Total (${currencyKey})</td>
                <td class="transaction-history-col-product">-</td>
                <td class="transaction-history-col-currency">-</td>
                <td class="transaction-history-col-rate">-</td>
                <td class="transaction-history-col-winloss">${formatPaymentHistoryMoney(totalWinLoss)}</td>
                <td class="transaction-history-col-crdr">${formatPaymentHistoryMoney(totalCrDr)}</td>
                <td class="transaction-history-col-balance">${formatPaymentHistoryMoney(closingBalance)}</td>
                <td class="transaction-history-col-description">-</td>
                <td class="transaction-history-col-remark">-</td>
            </tr>
        </tfoot>
    `;

    wrapper.appendChild(table);
    return wrapper;
}

function renderHistoryTable(payload) {
    if (!payload) {
        renderCurrencyTables({}, []);
        return;
    }

    if (payload.grouped && payload.order) {
        renderCurrencyTables(payload.grouped, payload.order);
        showNotification('Query completed', 'success');
        return;
    }

    const rows = payload.history || [];
    if (!rows.length) {
        renderCurrencyTables({}, []);
        return;
    }

    const grouped = {};
    const order = [];
    rows.forEach(row => {
        const currencyKey = (row.currency && row.currency.trim()) ? row.currency.trim() : '-';
        if (!grouped[currencyKey]) {
            grouped[currencyKey] = [];
            order.push(currencyKey);
        }
        grouped[currencyKey].push(row);
    });

    renderCurrencyTables(grouped, order);
    showNotification('Query completed', 'success');
}
