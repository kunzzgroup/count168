// 全局变量
let processes = [];
let showInactive = (typeof window.PROCESSLIST_SHOW_INACTIVE !== 'undefined' ? window.PROCESSLIST_SHOW_INACTIVE : false);
let showOfficial = (typeof window.PROCESSLIST_SHOW_OFFICIAL !== 'undefined' ? window.PROCESSLIST_SHOW_OFFICIAL : false);
let showEInvoice = (typeof window.PROCESSLIST_SHOW_E_INVOICE !== 'undefined' ? window.PROCESSLIST_SHOW_E_INVOICE : false);
let showAll = (typeof window.PROCESSLIST_SHOW_ALL !== 'undefined' ? window.PROCESSLIST_SHOW_ALL : false);
let waiting = false;
let currentPage = 1;
const pageSize = 20;
let selectedPermission = null;
const currentProcessListPage = (typeof window.PROCESSLIST_PAGE_FILE === 'string' ? window.PROCESSLIST_PAGE_FILE.trim() : '');
const forcedPermission = (typeof window.PROCESSLIST_FORCED_PERMISSION === 'string' ? window.PROCESSLIST_FORCED_PERMISSION.trim() : '');
const hidePermissionFilter = !!window.PROCESSLIST_HIDE_PERMISSION_FILTER;
/** Bank 表头与数据行共用同一 grid-template-columns，保证列对齐 */
const BANK_GRID_TEMPLATE_COLUMNS = '0.2fr 0.8fr 0.6fr 0.7fr 0.5fr 0.6fr 0.6fr 0.6fr 0.7fr 0.4fr 0.4fr 0.4fr 0.45fr 0.5fr 0.3fr';
const BANK_STATUS_SELECT_OPTIONS = [
    { value: 'active', label: 'ACTIVE' },
    { value: 'inactive', label: 'INACTIVE' },
    { value: 'official', label: 'OFFICIAL' },
    { value: 'e_invoice', label: 'E-INVOICE' }
];

// Bank Supplier 列的排序状态（A→Z / Z→A）
let bankSupplierSortDirection = 'asc'; // 'asc' | 'desc'
let bankAddProcessDataPromise = null;
let bankAddProcessDataLoaded = false;
let currentQuickRemarkProcessId = null;
let pendingBankStatusSelection = null;
let bankProcessSubmitInFlight = false;

function getProcessListPageByPermission(permission) {
    const normalizedPermission = String(permission || '').trim().toLowerCase();
    if (normalizedPermission === 'bank') return 'bank_process_list.php';
    if (normalizedPermission === 'games' || normalizedPermission === 'gambling') return 'processlist.php';
    return '';
}

function redirectToProcessListPage(targetPage, permission) {
    if (!targetPage || targetPage === currentProcessListPage) return false;
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]*$/, targetPage);
    const normalizedPermission = String(permission || '').trim();
    if (normalizedPermission) {
        const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');
        if (currentCompanyCode) {
            localStorage.setItem(`selectedPermission_${currentCompanyCode}`, normalizedPermission);
        }
    }
    window.location.href = url.toString();
    return true;
}

function parseDmyDate(value) {
    const text = String(value || '').trim();
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return null;
    const parts = text.split('/').map(Number);
    const date = new Date(parts[2], parts[1] - 1, parts[0]);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function parseIsoDate(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text === '0000-00-00') return null;
    const parts = text.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function getProcessListDateRange() {
    const fromInput = document.getElementById('date_from');
    const toInput = document.getElementById('date_to');
    return {
        from: parseDmyDate(fromInput ? fromInput.value : ''),
        to: parseDmyDate(toInput ? toInput.value : '')
    };
}

function updateProcessListDateClearButton() {
    const clearBtn = document.getElementById('processListDateClearBtn');
    if (!clearBtn) return;
    const range = getProcessListDateRange();
    clearBtn.style.display = range.from || range.to ? 'inline-flex' : 'none';
}

function processMatchesSelectedDate(process) {
    if (selectedPermission !== 'Bank') return true;
    const range = getProcessListDateRange();
    if (!range.from || !range.to) return true;
    const processDate = parseIsoDate(process && (process.date || process.day_start));
    if (!processDate) return false;
    const time = processDate.getTime();
    return time >= range.from.getTime() && time <= range.to.getTime();
}

function updateProcessListDateFilterVisibility() {
    const filterEl = document.getElementById('processListDateFilter');
    if (!filterEl) return;
    filterEl.style.display = selectedPermission === 'Bank' ? 'inline-flex' : 'none';
    updateProcessListDateClearButton();
}

function initProcessListDateFilter() {
    if (!window.MaintenanceDateRangePicker) return;
    window.MaintenanceDateRangePicker.init({
        dateFromId: 'date_from',
        dateToId: 'date_to',
        allowEmpty: true,
        placeholder: 'Select date range',
        onChange: function () {
            updateProcessListDateClearButton();
            currentPage = 1;
            renderTable();
            renderPagination();
        }
    });
    updateProcessListDateClearButton();

    const clearBtn = document.getElementById('processListDateClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.MaintenanceDateRangePicker && typeof window.MaintenanceDateRangePicker.clear === 'function') {
                window.MaintenanceDateRangePicker.clear();
            }
        });
    }
}

// 构造 API 绝对 URL（始终基于站点根目录，避免相对路径解析错误）
function buildApiUrl(fileName) {
    const pathname = window.location.pathname || '/';
    const basePath = pathname.replace(/[^/]*$/, '') || '/';
    const base = window.location.origin + basePath;
    const url = new URL(fileName, base);
    return url.href;
}

// 从API获取数据
async function fetchProcesses() {
    console.log('fetchProcesses called');
    try {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) {
            console.error('searchInput element not found');
            return;
        }
        const searchTerm = searchInput.value;
        const url = new URL(buildApiUrl('api/processes/processlist_api.php'));

        // 添加当前选择的 company_id
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (currentCompanyId) {
            url.searchParams.set('company_id', currentCompanyId);
        }

        // 添加权限过滤
        if (selectedPermission) {
            url.searchParams.set('permission', selectedPermission);
        }

        if (searchTerm.trim()) {
            url.searchParams.set('search', searchTerm);
        }
        if (selectedPermission === 'Bank') {
            // Bank 列表统一先取完整数据，再由前端做 Status / Official / E-Invoice 过滤，
            // 避免旧数据分散在 flag / issue_flag 时出现筛选不一致。
            url.searchParams.set('showAll', '1');
        } else {
            if (showInactive) {
                url.searchParams.set('showInactive', '1');
            }
            if (showAll) {
                url.searchParams.set('showAll', '1');
            }
        }
        if (waiting) {
            url.searchParams.set('waiting', '1');
        }

        console.log('fetchProcesses ->', url.toString());
        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('API Response:', result);

        if (result.success) {
            processes = result.data;
            // 根据类别进行不同的排序
            if (selectedPermission === 'Bank') {
                // Bank 类别：按 Supplier（显示在表中第二列的 card_lower / supplier）排序
                sortBankProcessesBySupplier();
            } else {
                // Games 类别的排序逻辑（原有逻辑）
                processes.sort((a, b) => {
                    const aKey = String(a.process_name || '').toLowerCase();
                    const bKey = String(b.process_name || '').toLowerCase();
                    if (aKey < bKey) return -1;
                    if (aKey > bKey) return 1;
                    const aDesc = String(a.description || a.description_name || '').toLowerCase();
                    const bDesc = String(b.description || b.description_name || '').toLowerCase();
                    if (aDesc < bDesc) return -1;
                    if (aDesc > bDesc) return 1;
                    return 0;
                });
            }
            const totalPages = Math.max(1, Math.ceil(processes.length / pageSize));
            if (currentPage > totalPages) currentPage = totalPages;
            renderTable();
            renderPagination();
            // Bank 类别下刷新列表后同步更新 Accounting Due 徽章
            if (selectedPermission === 'Bank') loadAccountingInbox();
        } else {
            console.error('API error:', result.error);
            showNotification('Failed to get data: ' + result.error, 'danger');
            showError('API error: ' + result.error);
        }
    } catch (error) {
        console.error('Network error:', error);
        showNotification('Network connection failed: ' + error.message, 'danger');
        showError('Network connection failed: ' + error.message);
    }
}

function renderTable() {
    if (selectedPermission === 'Bank') {
        renderBankTable();
        return;
    }
    const container = document.getElementById('processTableBody');
    container.innerHTML = '';

    if (processes.length === 0) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'process-card';
        emptyCard.innerHTML = `<div class="card-item" style="text-align: left; padding: 20px; grid-column: 1 / -1;">No process data found</div>`;
        container.appendChild(emptyCard);
        return;
    }

    let pageItems, startIndex;
    if (showAll) {
        pageItems = processes;
        startIndex = 0;
    } else {
        const totalPages = Math.max(1, Math.ceil(processes.length / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, processes.length);
        pageItems = processes.slice(startIndex, endIndex);
    }

    // Games 类别的表格
    {
        // Games 类别的表格（原有逻辑）
        pageItems.forEach((process, idx) => {
            const card = document.createElement('div');
            card.className = 'process-card';
            card.setAttribute('data-id', process.id);
            // 恢复 Games 表格的列数（7列）
            card.style.gridTemplateColumns = '0.3fr 0.8fr 1.1fr 0.2fr 0.3fr 1.1fr 0.19fr';

            const statusClass = process.status === 'active' ? 'status-active' : 'status-inactive';

            card.innerHTML = `
                        <div class="card-item">${startIndex + idx + 1}</div>
                        <div class="card-item">${escapeHtml((process.process_name || '').toUpperCase())}</div>
                        <div class="card-item">${escapeHtml((process.description || '').toUpperCase())}</div>
                        <div class="card-item">
                            <span class="role-badge ${statusClass} status-clickable" onclick="toggleProcessStatus(${process.id}, '${process.status}')" title="Click to toggle status" style="cursor: pointer;">
                                ${escapeHtml((process.status || '').toUpperCase())}
                            </span>
                        </div>
                        <div class="card-item">${escapeHtml(process.currency || '')}</div>
                        <div class="card-item">${escapeHtml(process.day_use || process.day_name || '')}</div>
                        <div class="card-item">
                            <button class="edit-btn" onclick="editProcess(${process.id})" aria-label="Edit" title="Edit">
                                <img src="images/edit.svg" alt="Edit" />
                            </button>
                            ${process.status === 'active' ? '' : (process.has_transactions ? '' : `<input type="checkbox" class="row-checkbox" data-id="${process.id}" title="Select for deletion" onchange="updateDeleteButton()" style="margin-left: 10px;">`)}
                        </div>
                    `;
            container.appendChild(card);
        });
    }
    renderPagination();
    updateSelectAllProcessesVisibility();
}

/** Bank 用真实 table 渲染，th/td 列由浏览器对齐 */

/** 仅调整数据列宽度与 th 一致，th 不改；双 rAF 确保布局完成后再取宽 */

function renderPagination() {
    // 如果 showAll 为 true，隐藏分页控件
    if (showAll) {
        const paginationContainer = document.getElementById('paginationContainer');
        paginationContainer.style.display = 'none';
        return;
    }
    const totalCount = (selectedPermission === 'Bank' && window.__bankFilteredLength != null) ? window.__bankFilteredLength : processes.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // 更新分页控件信息
    document.getElementById('paginationInfo').textContent = `${currentPage} of ${totalPages}`;

    // 更新按钮状态
    const isPrevDisabled = currentPage <= 1;
    const isNextDisabled = currentPage >= totalPages;

    document.getElementById('prevBtn').disabled = isPrevDisabled;
    document.getElementById('nextBtn').disabled = isNextDisabled;

    // 始终显示分页控件
    const paginationContainer = document.getElementById('paginationContainer');
    paginationContainer.style.display = 'flex';
}

function goToPage(page) {
    const totalCount = (selectedPermission === 'Bank' && window.__bankFilteredLength != null) ? window.__bankFilteredLength : processes.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const newPage = Math.min(Math.max(1, page), totalPages);
    if (newPage !== currentPage) {
        currentPage = newPage;
        renderTable();
        renderPagination();
    }
}

function prevPage() { goToPage(currentPage - 1); }
function nextPage() { goToPage(currentPage + 1); }

function showError(message) {
    const container = document.getElementById('processTableBody');
    container.innerHTML = `
                <div class="process-card">
                    <div class="card-item" style="text-align: center; padding: 20px; color: red; grid-column: 1 / -1;">
                        ${escapeHtml(message)}
                    </div>
                </div>
            `;
    showNotification(message, 'danger');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

// Notification functions
function showNotification(message, type = 'success') {
    const container = document.getElementById('processNotificationContainer');

    // 检查现有通知数量，最多保留2个
    const existingNotifications = container.querySelectorAll('.process-notification');
    if (existingNotifications.length >= 2) {
        // 移除最旧的通知
        const oldestNotification = existingNotifications[0];
        oldestNotification.classList.remove('show');
        setTimeout(() => {
            if (oldestNotification.parentNode) {
                oldestNotification.remove();
            }
        }, 300);
    }

    // 创建新通知
    const notification = document.createElement('div');
    notification.className = `process-notification process-notification-${type}`;
    notification.textContent = message;

    // 添加到容器
    container.appendChild(notification);

    // 触发显示动画
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // 1.5秒后开始消失动画
    setTimeout(() => {
        notification.classList.remove('show');
        // 0.3秒后完全移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 1500);
}

// 其他必要的函数
function addProcess() {
    // 如果权限还没加载出来，先加载权限，再根据结果打开对应的 Add 弹窗
    if (!selectedPermission && typeof loadPermissionButtons === 'function') {
        loadPermissionButtons().then(() => {
            if (selectedPermission) {
                openAddProcessForSelectedPermission();
            }
        });
        return;
    }
    openAddProcessForSelectedPermission();
}

function openAddProcessForSelectedPermission() {
    if (selectedPermission === 'Bank') {
        window.selectedProfitSharingEntries = [];
        document.getElementById('addBankModal').style.display = 'block';
        setBankModalLoadingState(true, 'Add Process');
        ensureAddBankProcessDataLoaded().then(async () => {
            const countryEl = document.getElementById('bank_country');
            if (countryEl) countryEl.value = '';
            applySelectedBanksToDropdown('');
            renderSelectedProfitSharing();
            if (typeof clearBankFieldErrors === 'function') clearBankFieldErrors();
            // Initial frequency sync for Add Process
            if (typeof updateBankFrequencyOptions === 'function') {
                const dayEndEl = document.getElementById('bank_day_end');
                if (dayEndEl) dayEndEl.value = '';
                updateBankFrequencyOptions();
            }
            setBankModalLoadingState(false, 'Add Process');
            updateBankSubmitButtonState();
        }).catch(() => {
            setBankModalLoadingState(false, 'Add Process');
            closeAddBankModal();
        });
    } else {
        loadAddProcessData();
        document.getElementById('addModal').style.display = 'block';
    }
}

let currentBankNoteTarget = 'sop';

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('addProcessForm').reset();
    const copyFromBtn = document.getElementById('add_copy_from_btn');
    if (copyFromBtn) copyFromBtn.textContent = copyFromBtn.getAttribute('data-placeholder') || 'Select Process to Copy From';

    // 重置 multi-use 状态
    const multiUseCheckbox = document.getElementById('add_multi_use');
    const multiUsePanel = document.getElementById('multi_use_processes');
    const selectedProcessesDisplay = document.getElementById('selected_processes_display');
    const processInput = document.getElementById('add_process_id');

    if (multiUseCheckbox) {
        multiUseCheckbox.checked = false;
    }
    if (multiUsePanel) {
        multiUsePanel.style.display = 'none';
    }
    if (selectedProcessesDisplay) {
        selectedProcessesDisplay.style.display = 'none';
    }
    if (processInput) {
        processInput.disabled = false;
        processInput.style.backgroundColor = 'white';
        processInput.style.cursor = 'default';
        processInput.setAttribute('required', 'required');
    }

    // 清除所有 process 复选框
    const processCheckboxes = document.querySelectorAll('#process_checkboxes input[type="checkbox"]');
    processCheckboxes.forEach(cb => cb.checked = false);

    // 清除选中的 processes
    if (window.selectedProcesses) {
        window.selectedProcesses = [];
    }
    const selectedProcessesList = document.getElementById('selected_processes_list');
    if (selectedProcessesList) {
        selectedProcessesList.innerHTML = '';
    }

    // 清除选中的描述
    if (window.selectedDescriptions) {
        window.selectedDescriptions = [];
    }
    document.getElementById('selected_descriptions_display').style.display = 'none';
    document.getElementById('add_description').value = '';

    // 清除 All Day 复选框
    const allDayCheckbox = document.getElementById('add_all_day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editProcessForm').reset();

    // 清除 All Day 复选框
    const allDayCheckbox = document.getElementById('edit_all_day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
    }

    // 清除选中的描述
    if (window.selectedDescriptions) {
        window.selectedDescriptions = [];
    }
    document.getElementById('edit_selected_descriptions_display').style.display = 'none';
    document.getElementById('edit_description').value = '';
}

/** Bank 编辑：打开与 Add 同格式的弹窗，预填数据，提交时走 update_process */

async function editProcess(id) {
    try {
        if (selectedPermission === 'Bank') {
            await openBankEditModal(id);
            return;
        }
        await loadEditProcessData();
        let getProcessUrl = `api/processes/processlist_api.php?action=get_process&id=${id}`;
        const response = await fetch(buildApiUrl(getProcessUrl));
        const result = await response.json();
        if (result.success && result.data) {
            const process = result.data;
            document.getElementById('edit_process_id').value = process.id;
            document.getElementById('edit_description_id').value = process.description_id || '';
            document.getElementById('edit_process_name').value = process.process_name || '';
            document.getElementById('edit_status').value = process.status || 'active';

            // Set currency - ensure type matching like account-list.php
            const currencySelect = document.getElementById('edit_currency');
            if (process.currency_id) {
                const currencyIdStr = String(process.currency_id);
                // Check if the option exists in the dropdown
                const optionExists = Array.from(currencySelect.options).some(opt => opt.value === currencyIdStr);
                if (optionExists) {
                    currencySelect.value = currencyIdStr;
                } else {
                    console.warn('Currency ID not found in dropdown:', currencyIdStr, 'Available options:', Array.from(currencySelect.options).map(opt => opt.value));
                    if (process.currency_warning) {
                        showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
                    }
                }
            } else if (process.currency_warning) {
                // 如果 currency_id 为空但有警告，说明原货币不属于当前公司
                // 尝试根据货币代码自动匹配当前公司的相同货币
                if (process.currency_code) {
                    const currencyCode = process.currency_code.toUpperCase();
                    const matchingOption = Array.from(currencySelect.options).find(opt =>
                        opt.textContent.toUpperCase() === currencyCode
                    );
                    if (matchingOption) {
                        currencySelect.value = matchingOption.value;
                        console.log('Auto-matched currency by code:', currencyCode, '-> ID:', matchingOption.value);
                    } else {
                        showNotification('Warning: The original currency (' + currencyCode + ') does not belong to your company. Please select a currency manually.', 'danger');
                    }
                } else {
                    showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
                }
            }

            document.getElementById('edit_remove_words').value = process.remove_word || '';

            // Handle replace word fields
            if (process.replace_word) {
                const parts = process.replace_word.split(' == ');
                document.getElementById('edit_replace_word_from').value = parts[0] || '';
                document.getElementById('edit_replace_word_to').value = parts[1] || '';
            } else {
                document.getElementById('edit_replace_word_from').value = '';
                document.getElementById('edit_replace_word_to').value = '';
            }

            // Handle remarks
            const editRemarksEl = document.getElementById('edit_remarks');
            if (editRemarksEl) {
                if (process.remarks) {
                    try {
                        const meta = JSON.parse(process.remarks);
                        editRemarksEl.value = (meta.user_remarks != null && meta.user_remarks !== '') ? meta.user_remarks : (process.remarks || '');
                    } catch (e) {
                        editRemarksEl.value = process.remarks;
                    }
                } else {
                    editRemarksEl.value = '';
                }
            }

            // Handle day use checkboxes
            if (process.day_use) {
                const dayIdsArray = process.day_use.split(',');
                dayIdsArray.forEach(dayId => {
                    const checkbox = document.querySelector(`#edit_day_checkboxes input[name="edit_day_use[]"][value="${dayId.trim()}"]`);
                    if (checkbox) checkbox.checked = true;
                });
                // 更新 All Day 复选框状态
                updateAllDayCheckbox('edit');
            }

            // Handle description - initialize selected descriptions
            const descInput = document.getElementById('edit_description');
            let descriptionNames = [];

            if (process.description_names && Array.isArray(process.description_names) && process.description_names.length > 0) {
                descriptionNames = process.description_names;
            } else if (process.description_names && typeof process.description_names === 'string') {
                // 如果是逗号分隔的字符串，分割它
                descriptionNames = process.description_names.split(',').map(d => d.trim()).filter(d => d);
            } else if (process.description_name) {
                descriptionNames = [process.description_name];
            }

            // 初始化选中的描述
            window.selectedDescriptions = descriptionNames;

            if (descInput) {
                if (descriptionNames.length > 0) {
                    descInput.value = `${descriptionNames.length} description(s) selected`;
                    // 显示选中的描述列表
                    displayEditSelectedDescriptions(descriptionNames);
                } else {
                    descInput.value = '';
                }
            }

            // Populate read-only information fields (date on left, user on right)
            const dtsModified = process.dts_modified || '';
            const modifiedBy = process.modified_by || '';
            const dtsCreated = process.dts_created || '';
            const createdBy = process.created_by || '';

            // DTS Modified 只有在真正修改过时才显示（不为空且不等于创建时间）
            // 如果为空或等于创建时间，表示从未修改过，显示为空
            let displayModifiedDate = '';
            let displayModifiedBy = '';
            if (dtsModified && dtsModified !== dtsCreated) {
                displayModifiedDate = dtsModified;
                displayModifiedBy = modifiedBy || '';
            }

            document.getElementById('edit_dts_modified_date').textContent = displayModifiedDate;
            document.getElementById('edit_dts_modified_user').textContent = displayModifiedBy;
            document.getElementById('edit_dts_created_date').textContent = dtsCreated || '';
            document.getElementById('edit_dts_created_user').textContent = createdBy || '';

            // Show modal
            document.getElementById('editModal').style.display = 'block';
        } else {
            showNotification('Failed to load process data: ' + (result.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error loading process data:', error);
        showNotification('Failed to load process data', 'danger');
    }
}

// 存储待删除的 ID 列表
let pendingDeleteIds = [];
// Bank 状态切换确认弹窗相关
let pendingToggleProcessId = null;
let pendingToggleNewStatus = null;
let pendingDismissPairs = [];

function deleteSelected() {
    const selectedCheckboxes = document.querySelectorAll('.row-checkbox:checked:not([disabled])');

    if (selectedCheckboxes.length === 0) {
        showNotification('Please select processes to delete', 'danger');
        return;
    }

    // 收集选中的 ID
    pendingDeleteIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

    // 显示确认对话框
    const message = `Are you sure you want to delete ${pendingDeleteIds.length} process(es)? This action cannot be undone.`;
    document.getElementById('confirmDeleteMessage').textContent = message;
    document.getElementById('confirmDeleteModal').style.display = 'block';
}

// 全选/取消全选所有流程

function toggleSelectAllProcesses() {
    const selectAllCheckbox = document.getElementById('selectAllProcesses');
    if (!selectAllCheckbox) {
        console.error('selectAllProcesses checkbox not found');
        return;
    }

    // 根据类别选择不同的复选框
    let allCheckboxes;
    if (selectedPermission === 'Bank') {
        allCheckboxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(cb => !cb.disabled);
    } else {
        allCheckboxes = Array.from(document.querySelectorAll('.row-checkbox:not(.bank-checkbox)')).filter(cb => !cb.disabled);
    }

    console.log('Found checkboxes:', allCheckboxes.length, 'Select all checked:', selectAllCheckbox.checked);

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateDeleteButton();
}

// 根据当前页面是否有可删除项，显示/隐藏全选框（Bank 用 visibility 保留表头空间，避免错位）
function updateSelectAllProcessesVisibility() {
    if (selectedPermission === 'Bank') {
        const selectAllBankCheckbox = document.getElementById('selectAllBankProcesses');
        if (!selectAllBankCheckbox) return;

        const anyBankCheckbox = document.querySelectorAll('.bank-checkbox').length > 0;
        selectAllBankCheckbox.style.visibility = anyBankCheckbox ? 'visible' : 'hidden';
        selectAllBankCheckbox.style.display = 'inline-block';
        selectAllBankCheckbox.disabled = !anyBankCheckbox;
        if (!anyBankCheckbox) {
            selectAllBankCheckbox.checked = false;
        }
    } else {
        const selectAllCheckbox = document.getElementById('selectAllProcesses');
        if (!selectAllCheckbox) return;

        const anyRowCheckbox = document.querySelectorAll('.row-checkbox:not(.bank-checkbox)').length > 0;
        selectAllCheckbox.style.display = anyRowCheckbox ? 'inline-block' : 'none';
        if (!anyRowCheckbox) {
            selectAllCheckbox.checked = false;
        }
    }
}

function updateDeleteButton() {
    // 根据类别选择不同的复选框
    let selectedCheckboxes;
    let allCheckboxes;
    let selectAllCheckbox;

    if (selectedPermission === 'Bank') {
        selectedCheckboxes = document.querySelectorAll('.bank-checkbox:checked');
        allCheckboxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(cb => !cb.disabled);
        selectAllCheckbox = document.getElementById('selectAllBankProcesses');
    } else {
        selectedCheckboxes = document.querySelectorAll('.row-checkbox:not(.bank-checkbox):checked');
        allCheckboxes = Array.from(document.querySelectorAll('.row-checkbox:not(.bank-checkbox)')).filter(cb => !cb.disabled);
        selectAllCheckbox = document.getElementById('selectAllProcesses');
    }

    const deleteBtn = document.getElementById('processDeleteSelectedBtn');

    // 更新全选 checkbox 状态
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        const allSelected = allCheckboxes.length > 0 &&
            allCheckboxes.every(cb => cb.checked);
        selectAllCheckbox.checked = allSelected;
    }

    let deleteEnabled = false;
    if (selectedPermission === 'Bank' && selectedCheckboxes.length > 0) {
        const hasInactive = Array.from(selectedCheckboxes).some(cb => {
            const row = cb.closest('tr');
            return row && isRealBankInactive(row.getAttribute('data-status'));
        });
        deleteEnabled = hasInactive;
    } else if (selectedCheckboxes.length > 0) {
        deleteEnabled = true;
    }

    if (selectedCheckboxes.length > 0) {
        deleteBtn.textContent = `Delete (${selectedCheckboxes.length})`;
        deleteBtn.disabled = !deleteEnabled;
    } else {
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = true;
    }

    updatePostToTransactionButton();
}

function updatePostToTransactionButton() {
    const postBtn = document.getElementById('processPostToTransactionBtn');
    if (!postBtn) return;
    postBtn.style.display = selectedPermission === 'Bank' ? 'inline-block' : 'none';
    if (selectedPermission !== 'Bank') {
        postBtn.disabled = true;
        return;
    }
    const selectedCheckboxes = document.querySelectorAll('.bank-checkbox:checked');
    const activeSelectedIds = Array.from(selectedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        return row && !isBankRowInactiveLike(row) && String(row.getAttribute('data-status') || '').toLowerCase() === 'active';
    }).map(cb => cb.dataset.id);
    postBtn.disabled = activeSelectedIds.length === 0;
    postBtn.textContent = activeSelectedIds.length > 0 ? `Transaction (${activeSelectedIds.length})` : 'Transaction';
}

window.__accountingInboxList = [];

function renderAccountingInbox(items) {
    const tbody = document.getElementById('processAccountingInboxTbody');
    const countEl = document.getElementById('processAccountingInboxCount');
    const countEl2 = document.getElementById('processAccountingInboxCount2');
    const postBtn = document.getElementById('processAccountingInboxPostBtn');
    const selectAllCb = document.getElementById('processAccountingInboxSelectAll');
    if (!tbody || !countEl) return;
    const count = Array.isArray(items) ? items.length : 0;
    const postableCount = Array.isArray(items) ? items.filter(p => !p.already_posted_today).length : 0;
    countEl.textContent = String(postableCount);
    if (countEl2) countEl2.textContent = String(postableCount);
    const countModal = document.getElementById('processAccountingInboxCountModal');
    if (countModal) countModal.textContent = String(postableCount);
    if (selectAllCb) { selectAllCb.checked = postableCount > 0; selectAllCb.disabled = postableCount === 0; }
    if (count === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:10px 8px; color:#6b7280;">No processes due for accounting today.</td></tr>';
        if (postBtn) postBtn.disabled = true;
        const deleteBtn = document.getElementById('processAccountingInboxDeleteBtn');
        if (deleteBtn) deleteBtn.disabled = true;
        const deleteSelectAll = document.getElementById('processAccountingInboxDeleteSelectAll');
        if (deleteSelectAll) { deleteSelectAll.checked = false; deleteSelectAll.disabled = true; }
        return;
    }
    tbody.innerHTML = items.map((row, idx) => {
        const name = (row.name || row.bank || '-');
        const rowClass = row.already_posted_today ? ' class="process-accounting-inbox-row-posted"' : '';
        const cbDisabled = row.already_posted_today ? ' disabled' : '';
        const cbChecked = row.already_posted_today ? '' : ' checked';
        const cbClass = 'process-accounting-inbox-row-cb';
        const periodType = row.is_manual_inactive ? 'manual_inactive' : (row.is_partial_first_month ? 'partial_first_month' : 'monthly');
        const cbHtml = '<input type="checkbox" class="' + cbClass + '" data-id="' + row.id + '"' + cbDisabled + cbChecked + ' onchange="updateAccountingInboxPostButton()">';
        const startDate = (row.day_start || row.start_date || '').toString().trim() || '-';
        const contractRaw = (row.contract || '').toString().trim() || '-';
        const contractDisplay = ({ '1+1': '1+1 MONTH', '1+2': '1+2 MONTHS', '1+3': '1+3 MONTHS' })[contractRaw] || contractRaw;
        const deleteCbClass = 'process-accounting-inbox-delete-cb';
        const deleteCbHtml = '<input type="checkbox" class="' + deleteCbClass + '" data-id="' + row.id + '" onchange="updateAccountingInboxDeleteButton()">';
        return '<tr' + rowClass + ' data-id="' + row.id + '" data-period-type="' + periodType + '"><td>' + cbHtml + '</td><td>' + (idx + 1) + '</td><td>' + escapeHtml(startDate) + '</td><td>' + escapeHtml(name) + '</td><td>' + escapeHtml(row.bank || '-') + '</td><td>' + escapeHtml(contractDisplay) + '</td><td>' + deleteCbHtml + '</td></tr>';
    }).join('');
    const deleteSelectAllEl = document.getElementById('processAccountingInboxDeleteSelectAll');
    if (deleteSelectAllEl) { deleteSelectAllEl.checked = false; deleteSelectAllEl.disabled = false; }
    updateAccountingInboxPostButton();
    updateAccountingInboxDeleteButton();
    (function bindSelectAll() {
        const selectAll = document.getElementById('processAccountingInboxSelectAll');
        if (!selectAll || selectAll.onAccountingInboxBound) return;
        selectAll.onAccountingInboxBound = true;
        selectAll.addEventListener('change', function () {
            const checked = this.checked;
            const box = document.getElementById('processAccountingInboxTbody');
            if (box) box.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled])').forEach(cb => { cb.checked = checked; });
            updateAccountingInboxPostButton();
        });
    })();
    (function bindDeleteSelectAll() {
        const deleteSelectAll = document.getElementById('processAccountingInboxDeleteSelectAll');
        if (!deleteSelectAll || deleteSelectAll.onAccountingInboxDeleteBound) return;
        deleteSelectAll.onAccountingInboxDeleteBound = true;
        deleteSelectAll.addEventListener('change', function () {
            const checked = this.checked;
            const box = document.getElementById('processAccountingInboxTbody');
            if (box) box.querySelectorAll('.process-accounting-inbox-delete-cb').forEach(cb => { cb.checked = checked; });
            updateAccountingInboxDeleteButton();
        });
    })();
}
function updateAccountingInboxDeleteButton() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    const deleteBtn = document.getElementById('processAccountingInboxDeleteBtn');
    const deleteSelectAllCb = document.getElementById('processAccountingInboxDeleteSelectAll');
    if (!tbody || !deleteBtn) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-delete-cb:checked');
    const allDelete = tbody.querySelectorAll('.process-accounting-inbox-delete-cb');
    deleteBtn.disabled = checked.length === 0;
    if (deleteSelectAllCb && !deleteSelectAllCb.disabled) {
        deleteSelectAllCb.checked = allDelete.length > 0 && allDelete.length === checked.length;
    }
}
function updateAccountingInboxPostButton() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    const postBtn = document.getElementById('processAccountingInboxPostBtn');
    const selectAllCb = document.getElementById('processAccountingInboxSelectAll');
    if (!tbody || !postBtn) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled]):checked');
    const count = checked.length;
    postBtn.disabled = count === 0;
    if (selectAllCb && !selectAllCb.disabled) {
        const postable = tbody.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled])');
        selectAllCb.checked = postable.length > 0 && postable.length === checked.length;
    }
}

function openAccountingInbox() {
    openAccountingDueModal();
}
function closeAccountingInbox() {
    closeAccountingDueModal();
}
function updateAccountingInboxVisibility() {
    const wrap = document.getElementById('processAccountingInboxWrap');
    if (!wrap) return;
    if (selectedPermission === 'Bank') {
        wrap.style.display = 'block';
        loadAccountingInbox();
    } else {
        wrap.style.display = 'none';
        closeAccountingInbox();
    }
}

// 从待入账列表移除选中的行（不进行入账、不删 Process，仅让该行从 Accounting Due 消失）

function showConfirmAccountingDueDeleteModal(pairs) {
    pendingDismissPairs = pairs.slice();
    const msgEl = document.getElementById('confirmAccountingDueDeleteMessage');
    if (msgEl) {
        msgEl.textContent = pairs.length === 1
            ? 'This row will be removed from Accounting Due. Process data will not change.'
            : 'These ' + pairs.length + ' rows will be removed from Accounting Due. Process data will not change.';
    }
    document.getElementById('confirmAccountingDueDeleteModal').style.display = 'block';
}

function closeConfirmAccountingDueDeleteModal() {
    document.getElementById('confirmAccountingDueDeleteModal').style.display = 'none';
    pendingDismissPairs = [];
}

async function postToTransactionSelected() {
    const selectedCheckboxes = document.querySelectorAll('.bank-checkbox:checked');
    const activeSelectedIds = Array.from(selectedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        return row && !isBankRowInactiveLike(row) && String(row.getAttribute('data-status') || '').toLowerCase() === 'active';
    }).map(cb => cb.dataset.id);
    if (activeSelectedIds.length === 0) {
        showNotification('Please select Process(es) to post (only active processes can be posted)', 'warning');
        return;
    }
    if (!confirm('Confirm posting ' + activeSelectedIds.length + ' selected Process(es)?\n\nBuy Price → Supplier account\nSell Price → Customer account\nProfit → Company account\n\nCorresponding transaction records will be created on the Transaction page.')) {
        return;
    }
    try {
        const formData = new FormData();
        activeSelectedIds.forEach(id => formData.append('ids[]', id));
        const response = await fetch(buildApiUrl('api/processes/process_post_to_transaction_api.php'), {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            showNotification(result.message || 'Posted successfully', 'success');
            updateDeleteButton();
            fetchProcesses();
        } else {
            showNotification(result.error || 'Post failed', 'danger');
        }
    } catch (err) {
        console.error('transaction error:', err);
        showNotification('Post request failed: ' + err.message, 'danger');
    }
}

// 执行状态切换（API + 本地更新）
async function performToggleStatus(processId) {
    const formData = new FormData();
    formData.append('id', processId);
    if (selectedPermission === 'Bank') {
        formData.append('permission', 'Bank');
    }
    const response = await fetch(buildApiUrl('api/processes/toggle_process_status_api.php'), {
        method: 'POST',
        body: formData
    });
    const result = await response.json();

    if (result.success) {
        const newStatus = (result.data && result.data.newStatus !== undefined) ? result.data.newStatus : result.newStatus;
        const newDayEnd = (result.data && result.data.newDayEnd !== undefined) ? result.data.newDayEnd : result.newDayEnd;
        const process = processes.find(p => p.id === processId);
        if (process) {
            process.status = newStatus;
            if (newDayEnd) process.day_end = newDayEnd;
        }

        const shouldShow = selectedPermission === 'Bank'
            ? matchesCurrentBankFilters(process)
            : (showAll ? true : (showInactive ? newStatus === 'inactive' : newStatus === 'active'));

        if (!shouldShow) {
            const processIndex = processes.findIndex(p => p.id === processId);
            if (processIndex > -1) processes.splice(processIndex, 1);
            renderTable();
        } else if (newDayEnd) {
            renderTable();
        } else {
            const process = processes.find(p => p.id === processId);
            const statusSelect = renderBankStatusSelect(processId, process);

            if (selectedPermission === 'Bank') {
                const row = document.querySelector('#bankTableBody tr[data-id="' + processId + '"]');
                const hasTx = row ? row.getAttribute('data-has-transactions') === '1' : false;
                const bankActionCellHtml = buildBankActionCellHtml(processId, newStatus, hasTx, process ? process.issue_flag : '');
                if (row) {
                    row.setAttribute('data-status', newStatus || '');
                    row.setAttribute('data-issue-flag', normalizeBankIssueFlag(process ? process.issue_flag : ''));
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 15) {
                        // Contract cell (index 6): apply gray rule for 1 MONTH / 1+1 / 1+2 / 1+3 during active period
                        const contractRaw = process && process.contract ? (contractMap[process.contract] || process.contract) : '';
                        const baseContractClass = getContractStateClass(process.day_start || null, process.day_end || null);
                        const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
                        const contractClass = (grayContracts.indexOf(contractRaw) !== -1 && baseContractClass === 'contract-active')
                            ? 'contract-1month-active'
                            : baseContractClass;
                        const contractCellHtml = (contractRaw && contractClass)
                            ? '<span class="contract-badge ' + contractClass + '">' + escapeHtml(contractRaw) + '</span>'
                            : (contractRaw ? escapeHtml(contractRaw) : escapeHtml('-'));
                        cells[6].innerHTML = contractCellHtml;

                        // Status & action cells
                        cells[12].innerHTML = statusSelect;
                        cells[14].innerHTML = bankActionCellHtml;
                        applyBankStatusSelectAppearance(cells[12].querySelector('.bank-status-dropdown'), getBankStatusSelectValue(process));
                    }
                }
            } else {
                const statusClass = newStatus === 'active' ? 'status-active' : (newStatus === 'waiting' ? 'status-waiting' : 'status-inactive');
                const statusBadge = `<span class="role-badge ${statusClass} status-clickable" onclick="toggleProcessStatus(${processId}, '${newStatus}')" title="Click to toggle status" style="cursor: pointer;">${escapeHtml((newStatus || '').toUpperCase())}</span>`;
                const card = document.querySelector(`.process-card[data-id="${processId}"]`);
                if (card) {
                    const items = card.querySelectorAll('.card-item');
                    if (items.length > 3) {
                        items[3].innerHTML = statusBadge;
                        const actionCell = items[6];
                        if (actionCell) {
                            const existingCheckbox = actionCell.querySelector('.row-checkbox');
                            const existingMuted = actionCell.querySelector('.text-muted');
                            if (newStatus === 'active') {
                                if (existingCheckbox) existingCheckbox.remove();
                                if (existingMuted) existingMuted.remove();
                            } else {
                                const proc = processes.find(function (p) { return p.id === processId; });
                                if (!existingCheckbox && !existingMuted && (!proc || !proc.has_transactions)) {
                                    const checkbox = document.createElement('input');
                                    checkbox.type = 'checkbox';
                                    checkbox.className = 'row-checkbox';
                                    checkbox.dataset.id = String(processId);
                                    checkbox.title = 'Select for deletion';
                                    checkbox.style.marginLeft = '10px';
                                    checkbox.onchange = updateDeleteButton;
                                    actionCell.appendChild(checkbox);
                                }
                            }
                        }
                    }
                }
            }
        }

        updateDeleteButton();
        updateSelectAllProcessesVisibility();

        if (selectedPermission === 'Bank' && newStatus === 'inactive' && typeof loadAccountingInbox === 'function') {
            await loadAccountingInbox();
        }

        const statusText = newStatus === 'active' ? 'activated' : 'deactivated';
        showNotification(`Process status changed to ${statusText}`, 'success');
    } else {
        showNotification(result.error || 'Status toggle failed', 'danger');
    }
}

// 切换流程状态
async function toggleProcessStatus(processId, currentStatus) {
    try {
        if (selectedPermission === 'Bank') {
            const statusLower = (currentStatus || '').toLowerCase();
            const targetStatus = statusLower === 'active' ? 'inactive' : 'active';
            // Bank：无论 active→inactive 还是 inactive→active，都使用同一个自定义确认弹窗
            showConfirmInactiveModal(processId, targetStatus);
            return;
        }
        await performToggleStatus(processId);
    } catch (error) {
        console.error('Error:', error);
        showNotification('Status toggle failed', 'danger');
    }
}

function showConfirmInactiveModal(processId, targetStatus) {
    pendingToggleProcessId = processId;
    pendingToggleNewStatus = (targetStatus || '').toLowerCase();

    const modal = document.getElementById('confirmInactiveModal');
    const titleEl = modal ? modal.querySelector('.process-confirm-title') : null;
    const messageEl = document.getElementById('confirmInactiveMessage');
    const confirmBtn = document.getElementById('confirmInactiveBtn');

    if (pendingToggleNewStatus === 'inactive') {
        if (titleEl) titleEl.textContent = 'Switch to Inactive';
        if (messageEl) messageEl.textContent = 'Confirm switching this Bank Process to Inactive?';
        if (confirmBtn) confirmBtn.textContent = 'Inactive';
    } else {
        if (titleEl) titleEl.textContent = 'Switch to Active';
        if (messageEl) messageEl.textContent = 'Confirm switching this Bank Process to Active?';
        if (confirmBtn) confirmBtn.textContent = 'Active';
    }

    if (modal) modal.style.display = 'block';
}

// 全局变量：当前描述选择模式（'add' 或 'edit'）
let descriptionSelectionMode = 'add';

function expandDescription() {
    descriptionSelectionMode = 'add';
    loadExistingDescriptions();
    updateSelectedDescriptionsInModal();
    const modal = document.getElementById('descriptionSelectionModal');
    if (modal) modal.style.display = 'block';
}

function expandEditDescription() {
    descriptionSelectionMode = 'edit';
    loadExistingDescriptions();
    updateSelectedDescriptionsInModal();
    const modal = document.getElementById('descriptionSelectionModal');
    if (modal) modal.style.display = 'block';
}

async function loadExistingDescriptions() {
    try {
        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'));
        const result = await response.json();
        if (result.success) {
            const descriptionsList = document.getElementById('existingDescriptions');
            if (!descriptionsList) return;
            descriptionsList.innerHTML = '';
            if (Array.isArray(result.descriptions) && result.descriptions.length > 0) {
                result.descriptions.forEach(description => {
                    const item = document.createElement('div');
                    item.className = 'description-item';

                    const left = document.createElement('div');
                    left.className = 'description-item-left';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.name = 'available_descriptions';
                    checkbox.value = description.name;
                    checkbox.id = `desc_${description.id}`;
                    checkbox.dataset.descriptionId = description.id;

                    const label = document.createElement('label');
                    label.htmlFor = `desc_${description.id}`;
                    label.textContent = description.name.toUpperCase();

                    left.appendChild(checkbox);
                    left.appendChild(label);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'description-delete-btn';
                    deleteBtn.title = 'Delete description';
                    deleteBtn.setAttribute('aria-label', 'Delete description');
                    deleteBtn.innerHTML = '&times;';
                    deleteBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteDescription(description.id, description.name, item);
                    });

                    item.appendChild(left);
                    item.appendChild(deleteBtn);
                    descriptionsList.appendChild(item);

                    checkbox.addEventListener('change', function () {
                        if (this.checked) {
                            moveDescriptionToSelected(this);
                        } else {
                            moveDescriptionToAvailable(this);
                        }
                    });

                    // 如果是编辑模式且该描述已被选中，自动选中并移动到已选择列表
                    if (descriptionSelectionMode === 'edit' && window.selectedDescriptions && window.selectedDescriptions.includes(description.name)) {
                        checkbox.checked = true;
                        moveDescriptionToSelected(checkbox);
                    }
                });
            } else {
                descriptionsList.innerHTML = '<div class="no-descriptions">No descriptions found</div>';
            }
        } else {
            showNotification('Failed to load descriptions: ' + (result.error || 'Unknown error'), 'danger');
        }
    } catch (e) {
        console.error('Error loading descriptions:', e);
        showNotification('Failed to load descriptions', 'danger');
    }
}

function updateSelectedDescriptionsInModal() {
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    if (!selectedList) return;
    selectedList.innerHTML = '';
    const selections = Array.isArray(window.selectedDescriptions) ? window.selectedDescriptions : [];
    if (selections.length > 0) {
        selections.forEach((desc, idx) => {
            const div = document.createElement('div');
            div.className = 'selected-description-modal-item';
            div.innerHTML = `
                        <span>${desc.toUpperCase()}</span>
                        <button type="button" class="remove-description-modal" onclick="moveDescriptionBackToAvailable('${desc}', '${Date.now() + idx}')">&times;</button>
                    `;
            selectedList.appendChild(div);
        });
    } else {
        selectedList.innerHTML = '<div class="no-descriptions">No descriptions selected</div>';
    }
}

function moveDescriptionToSelected(checkbox) {
    const descriptionName = checkbox.value;
    const descriptionId = checkbox.dataset.descriptionId;
    const descriptionItem = checkbox.closest('.description-item');
    if (!Array.isArray(window.selectedDescriptions)) window.selectedDescriptions = [];
    if (!window.selectedDescriptions.includes(descriptionName)) {
        window.selectedDescriptions.push(descriptionName);
    }
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    // remove placeholder
    const placeholder = selectedList.querySelector('.no-descriptions');
    if (placeholder) placeholder.remove();
    const newItem = document.createElement('div');
    newItem.className = 'selected-description-modal-item';
    newItem.innerHTML = `
                <span>${descriptionName.toUpperCase()}</span>
                <button type="button" class="remove-description-modal" onclick="moveDescriptionBackToAvailable('${descriptionName}', '${descriptionId}')">&times;</button>
            `;
    selectedList.appendChild(newItem);
    // remove from available list
    if (descriptionItem) descriptionItem.remove();
}

function moveDescriptionToAvailable(checkbox) {
    const descriptionName = checkbox.value;
    const descriptionId = checkbox.dataset.descriptionId;
    const descriptionItem = checkbox.closest('.description-item');

    // Remove from selected descriptions array
    if (window.selectedDescriptions) {
        const index = window.selectedDescriptions.indexOf(descriptionName);
        if (index > -1) {
            window.selectedDescriptions.splice(index, 1);
        }
    }

    // Remove from selected list
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    const selectedItems = selectedList.querySelectorAll('.selected-description-modal-item');
    selectedItems.forEach(item => {
        if (item.querySelector('span').textContent === descriptionName) {
            item.remove();
        }
    });
    if (!selectedList.querySelector('.selected-description-modal-item')) {
        const empty = document.createElement('div');
        empty.className = 'no-descriptions';
        empty.textContent = 'No descriptions selected';
        selectedList.appendChild(empty);
    }
}

function moveDescriptionBackToAvailable(descriptionName, descriptionId) {
    // remove from selected list
    if (Array.isArray(window.selectedDescriptions)) {
        const idx = window.selectedDescriptions.indexOf(descriptionName);
        if (idx > -1) window.selectedDescriptions.splice(idx, 1);
    }
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    selectedList.querySelectorAll('.selected-description-modal-item').forEach(item => {
        if (item.querySelector('span')?.textContent === descriptionName) item.remove();
    });
    if (!selectedList.querySelector('.selected-description-modal-item')) {
        const empty = document.createElement('div');
        empty.className = 'no-descriptions';
        empty.textContent = 'No descriptions selected';
        selectedList.appendChild(empty);
    }
    // add back to available list
    const list = document.getElementById('existingDescriptions');
    if (list) {
        const item = document.createElement('div');
        item.className = 'description-item';

        const left = document.createElement('div');
        left.className = 'description-item-left';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'available_descriptions';
        cb.value = descriptionName;
        cb.id = `desc_${descriptionId}`;
        cb.dataset.descriptionId = descriptionId;

        const label = document.createElement('label');
        label.htmlFor = `desc_${descriptionId}`;
        label.textContent = descriptionName.toUpperCase();

        left.appendChild(cb);
        left.appendChild(label);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'description-delete-btn';
        deleteBtn.title = 'Delete description';
        deleteBtn.setAttribute('aria-label', 'Delete description');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteDescription(descriptionId, descriptionName, item);
        });

        item.appendChild(left);
        item.appendChild(deleteBtn);
        list.appendChild(item);

        cb.addEventListener('change', function () {
            if (this.checked) moveDescriptionToSelected(this);
            else moveDescriptionToAvailable(this);
        });
    }
}

async function deleteDescription(descriptionId, descriptionName, itemElement) {
    if (!descriptionId) return;
    const confirmed = confirm(`Are you sure you want to delete description ${descriptionName}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
        const formData = new FormData();
        formData.append('action', 'delete_description');
        formData.append('description_id', descriptionId);

        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            if (itemElement && itemElement.parentNode) {
                itemElement.remove();
            }

            if (Array.isArray(window.selectedDescriptions)) {
                window.selectedDescriptions = window.selectedDescriptions.filter(desc => desc !== descriptionName);
            }

            updateSelectedDescriptionsInModal();

            // 根据当前模式更新相应的显示
            if (descriptionSelectionMode === 'edit') {
                displayEditSelectedDescriptions(window.selectedDescriptions || []);
                const editDescInput = document.getElementById('edit_description');
                if (editDescInput) {
                    editDescInput.value = (window.selectedDescriptions && window.selectedDescriptions.length > 0)
                        ? `${window.selectedDescriptions.length} description(s) selected`
                        : '';
                }
            } else {
                displaySelectedDescriptions(window.selectedDescriptions || []);
                const addDescInput = document.getElementById('add_description');
                if (addDescInput) {
                    addDescInput.value = (window.selectedDescriptions && window.selectedDescriptions.length > 0)
                        ? `${window.selectedDescriptions.length} description(s) selected`
                        : '';
                }
            }

            const descriptionsList = document.getElementById('existingDescriptions');
            if (descriptionsList && !descriptionsList.querySelector('.description-item')) {
                descriptionsList.innerHTML = '<div class="no-descriptions">No descriptions found</div>';
            }

            showNotification('Description deleted successfully', 'success');
        } else {
            showNotification(result.error || 'Failed to delete description', 'danger');
        }
    } catch (error) {
        console.error('Error deleting description:', error);
        showNotification('Failed to delete description', 'danger');
    }
}

function closeDescriptionSelectionModal() {
    document.getElementById('descriptionSelectionModal').style.display = 'none';
}

// 加载添加表单所需的数据
async function loadAddProcessData() {
    try {
        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'));
        const result = await response.json();

        if (result.success) {
            // 填充 currency 下拉列表
            const currencySelect = document.getElementById('add_currency');
            currencySelect.innerHTML = '<option value="">Select Currency</option>';
            result.currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.id;
                option.textContent = currency.code;
                currencySelect.appendChild(option);
            });

            // 填充 copy from 下拉列表（可搜索 custom select）
            const copyFromBtn = document.getElementById('add_copy_from_btn');
            const copyFromHidden = document.getElementById('add_copy_from');
            const copyFromDropdown = document.getElementById('add_copy_from_dropdown');
            const copyFromOptionsContainer = copyFromDropdown?.querySelector('.custom-select-options');
            const placeholder = (copyFromBtn && copyFromBtn.getAttribute('data-placeholder')) || 'Select Process to Copy From';
            if (copyFromBtn) copyFromBtn.textContent = placeholder;
            if (copyFromHidden) copyFromHidden.value = '';
            if (copyFromOptionsContainer) {
                copyFromOptionsContainer.innerHTML = '';
                if (result.existingProcesses && result.existingProcesses.length > 0) {
                    const sortedProcesses = [...result.existingProcesses].sort((a, b) => {
                        const aName = (a.process_name || 'Unknown').toUpperCase();
                        const bName = (b.process_name || 'Unknown').toUpperCase();
                        if (aName !== bName) return aName.localeCompare(bName);
                        const aDesc = (a.description_name || 'No Description').toUpperCase();
                        const bDesc = (b.description_name || 'No Description').toUpperCase();
                        return aDesc.localeCompare(bDesc);
                    });
                    sortedProcesses.forEach(process => {
                        const option = document.createElement('div');
                        option.className = 'custom-select-option';
                        option.textContent = `${process.process_name || 'Unknown'} - ${process.description_name || 'No Description'}`;
                        option.setAttribute('data-value', process.process_id);
                        copyFromOptionsContainer.appendChild(option);
                    });
                }
            }

            // 填充 process 复选框（用于 multi-use）
            const processCheckboxes = document.getElementById('process_checkboxes');
            if (processCheckboxes) {
                processCheckboxes.innerHTML = '';
                if (result.processes && result.processes.length > 0) {
                    // 获取唯一的process_id列表
                    const uniqueProcessIds = [...new Set(result.processes.map(p => p.process_name))];
                    uniqueProcessIds.forEach(processId => {
                        const checkboxItem = document.createElement('div');
                        checkboxItem.className = 'checkbox-item';
                        checkboxItem.innerHTML = `
                                    <input type="checkbox" id="process_${processId}" name="selected_processes[]" value="${processId}">
                                    <label for="process_${processId}">${processId}</label>
                                `;
                        processCheckboxes.appendChild(checkboxItem);
                    });

                    // 添加process复选框变化监听器
                    const processCheckboxesInputs = processCheckboxes.querySelectorAll('input[type="checkbox"]');
                    processCheckboxesInputs.forEach(checkbox => {
                        checkbox.addEventListener('change', function () {
                            updateSelectedProcessesDisplay();
                        });
                    });
                }
            }

            // 填充 day 复选框
            const dayCheckboxes = document.getElementById('day_checkboxes');
            dayCheckboxes.innerHTML = '';
            if (result.days && result.days.length > 0) {
                result.days.forEach(day => {
                    const checkboxItem = document.createElement('div');
                    checkboxItem.className = 'checkbox-item';
                    checkboxItem.innerHTML = `
                                <input type="checkbox" id="add_day_${day.id}" name="day_use[]" value="${day.id}">
                                <label for="add_day_${day.id}">${day.day_name}</label>
                            `;
                    dayCheckboxes.appendChild(checkboxItem);
                });

                // 为每个 day 复选框添加事件监听器
                dayCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', function () {
                        updateAllDayCheckbox('add');
                    });
                });
            }

            // 为 All Day 复选框添加事件监听器
            const allDayCheckbox = document.getElementById('add_all_day');
            if (allDayCheckbox) {
                allDayCheckbox.addEventListener('change', function () {
                    const dayCheckboxes = document.querySelectorAll('#day_checkboxes input[type="checkbox"]');
                    dayCheckboxes.forEach(checkbox => {
                        checkbox.checked = this.checked;
                    });
                });
            }
        } else {
            showNotification('Failed to load form data: ' + result.error, 'danger');
        }
    } catch (error) {
        console.error('Error loading form data:', error);
        showNotification('Failed to load form data', 'danger');
    }
}

// Load edit form data (currencies, days, etc.)
async function loadEditProcessData() {
    try {
        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'));
        const result = await response.json();

        if (result.success) {
            // Populate currency dropdown
            const currencySelect = document.getElementById('edit_currency');
            currencySelect.innerHTML = '<option value="">Select Currency</option>';
            result.currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.id;
                option.textContent = currency.code;
                currencySelect.appendChild(option);
            });

            // Populate day checkboxes
            const dayCheckboxes = document.getElementById('edit_day_checkboxes');
            dayCheckboxes.innerHTML = '';
            if (result.days && result.days.length > 0) {
                result.days.forEach(day => {
                    const checkboxItem = document.createElement('div');
                    checkboxItem.className = 'checkbox-item';
                    checkboxItem.innerHTML = `
                                <input type="checkbox" id="edit_day_${day.id}" name="edit_day_use[]" value="${day.id}">
                                <label for="edit_day_${day.id}">${day.day_name}</label>
                            `;
                    dayCheckboxes.appendChild(checkboxItem);
                });

                // 为每个 day 复选框添加事件监听器
                dayCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', function () {
                        updateAllDayCheckbox('edit');
                    });
                });
            }

            // 为 All Day 复选框添加事件监听器
            const allDayCheckbox = document.getElementById('edit_all_day');
            if (allDayCheckbox) {
                allDayCheckbox.addEventListener('change', function () {
                    const dayCheckboxes = document.querySelectorAll('#edit_day_checkboxes input[type="checkbox"]');
                    dayCheckboxes.forEach(checkbox => {
                        checkbox.checked = this.checked;
                    });
                });
            }
        } else {
            showNotification('Failed to load form data: ' + result.error, 'danger');
        }
    } catch (error) {
        console.error('Error loading edit form data:', error);
        showNotification('Failed to load form data', 'danger');
    }
}

function confirmDescriptions() {
    if (window.selectedDescriptions && window.selectedDescriptions.length > 0) {
        if (descriptionSelectionMode === 'edit') {
            // 编辑模式：更新编辑表单的字段
            const editDescInput = document.getElementById('edit_description');
            if (editDescInput) {
                editDescInput.value = `${window.selectedDescriptions.length} description(s) selected`;
            }
            // 显示选中的描述列表
            displayEditSelectedDescriptions(window.selectedDescriptions);
        } else {
            // 添加模式：更新添加表单的字段
            document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
            // Display selected descriptions
            displaySelectedDescriptions(window.selectedDescriptions);
        }

        closeDescriptionSelectionModal();
    } else {
        showNotification('Please select at least one description', 'danger');
    }
}

function filterDescriptions() {
    const term = (document.getElementById('descriptionSearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#existingDescriptions .description-item');
    items.forEach(item => {
        const text = item.querySelector('label')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

// Display selected descriptions
function displaySelectedDescriptions(descriptions) {
    const displayDiv = document.getElementById('selected_descriptions_display');
    const listDiv = document.getElementById('selected_descriptions_list');

    if (descriptions.length > 0) {
        displayDiv.style.display = 'block';
        listDiv.innerHTML = '';

        descriptions.forEach((desc, index) => {
            const descItem = document.createElement('div');
            descItem.className = 'selected-description-item';
            descItem.innerHTML = `
                        <span>${desc.toUpperCase()}</span>
                        <button type="button" class="remove-description" onclick="removeDescription(${index})">&times;</button>
                    `;
            listDiv.appendChild(descItem);
        });

        // Store selected descriptions for form submission
        window.selectedDescriptions = descriptions;
    } else {
        displayDiv.style.display = 'none';
        window.selectedDescriptions = [];
    }
}

// Display selected descriptions for edit mode
function displayEditSelectedDescriptions(descriptions) {
    const displayDiv = document.getElementById('edit_selected_descriptions_display');
    const listDiv = document.getElementById('edit_selected_descriptions_list');

    if (descriptions.length > 0) {
        displayDiv.style.display = 'block';
        listDiv.innerHTML = '';

        descriptions.forEach((desc, index) => {
            const descItem = document.createElement('div');
            descItem.className = 'selected-description-item';
            descItem.innerHTML = `
                        <span>${desc.toUpperCase()}</span>
                        <button type="button" class="remove-description" onclick="removeEditDescription(${index})">&times;</button>
                    `;
            listDiv.appendChild(descItem);
        });

        // Store selected descriptions for form submission
        window.selectedDescriptions = descriptions;
    } else {
        displayDiv.style.display = 'none';
        window.selectedDescriptions = [];
    }
}

// Remove a description from selection
function removeDescription(index) {
    if (window.selectedDescriptions) {
        window.selectedDescriptions.splice(index, 1);
        displaySelectedDescriptions(window.selectedDescriptions);

        // Update input field
        if (window.selectedDescriptions.length > 0) {
            document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
        } else {
            document.getElementById('add_description').value = '';
            document.getElementById('selected_descriptions_display').style.display = 'none';
        }
    }
}

// Remove a description from edit selection
function removeEditDescription(index) {
    if (window.selectedDescriptions) {
        window.selectedDescriptions.splice(index, 1);
        displayEditSelectedDescriptions(window.selectedDescriptions);

        // Update input field
        const editDescInput = document.getElementById('edit_description');
        if (editDescInput) {
            if (window.selectedDescriptions.length > 0) {
                editDescInput.value = `${window.selectedDescriptions.length} description(s) selected`;
            } else {
                editDescInput.value = '';
                document.getElementById('edit_selected_descriptions_display').style.display = 'none';
            }
        }
    }
}

// ===== Multi-use (process_id) helpers =====
function updateSelectedProcessesDisplay() {
    const selectedCheckboxes = document.querySelectorAll('#process_checkboxes input[type="checkbox"]:checked');
    const displayDiv = document.getElementById('selected_processes_display');
    const listDiv = document.getElementById('selected_processes_list');
    if (!displayDiv || !listDiv) return;
    if (selectedCheckboxes.length > 0) {
        displayDiv.style.display = 'block';
        listDiv.innerHTML = '';
        const selected = [];
        selectedCheckboxes.forEach(cb => {
            const pid = cb.value;
            selected.push(pid);
            const item = document.createElement('div');
            item.className = 'selected-process-item';
            item.innerHTML = `
                        <span>${pid}</span>
                        <button type="button" class="remove-process" onclick="removeProcess('${pid}')">&times;</button>
                    `;
            listDiv.appendChild(item);
        });
        window.selectedProcesses = selected;
    } else {
        displayDiv.style.display = 'none';
        listDiv.innerHTML = '';
        if (window.selectedProcesses) window.selectedProcesses = [];
    }
}

function confirmMultiUseProcessSelection() {
    updateSelectedProcessesDisplay();
    const panel = document.getElementById('multi_use_processes');
    if (panel) panel.style.display = 'none';
    const displayDiv = document.getElementById('selected_processes_display');
    if (displayDiv) displayDiv.style.display = (window.selectedProcesses && window.selectedProcesses.length > 0) ? 'block' : 'none';
}

function removeProcess(processId) {
    const cb = document.querySelector(`#process_checkboxes input[type="checkbox"][value="${CSS.escape(processId)}"]`);
    if (cb) {
        cb.checked = false;
        updateSelectedProcessesDisplay();
    }
}

function closeConfirmDeleteModal() {
    document.getElementById('confirmDeleteModal').style.display = 'none';
}

async function confirmDelete() {
    if (pendingDeleteIds.length === 0) {
        closeConfirmDeleteModal();
        return;
    }

    closeConfirmDeleteModal();
    const deleteBtn = document.getElementById('processDeleteSelectedBtn');
    const confirmBtn = document.querySelector('#confirmDeleteModal .confirm-delete');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
    }
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';
    }

    try {
        const body = { ids: pendingDeleteIds };
        if (selectedPermission === 'Bank') {
            body.permission = 'Bank';
        }
        const response = await fetch(buildApiUrl('api/processes/delete_processes_api.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();

        if (result.success && result.data && typeof result.data.deleted === 'number') {
            const deletedCount = result.data.deleted;
            const idSet = new Set(pendingDeleteIds.map(String));
            processes = processes.filter(p => !idSet.has(String(p.id)));
            renderTable();
            renderPagination();
            updateDeleteButton();
            updateSelectAllProcessesVisibility();
            showNotification(deletedCount === 1 ? '1 process deleted successfully' : deletedCount + ' processes deleted successfully', 'success');
        } else {
            const msg = result.message || result.error || (result.data && result.data.error) || 'Delete failed';
            showNotification(msg, 'danger');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Delete failed: ' + (error.message || 'Network error'), 'danger');
    } finally {
        pendingDeleteIds = [];
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Delete';
        }
    }
}

// 更新 All Day 复选框状态
function updateAllDayCheckbox(mode) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    const allDayCheckbox = document.getElementById(`${prefix}_all_day`);
    const dayCheckboxes = document.querySelectorAll(`#${prefix === 'add' ? 'day_checkboxes' : 'edit_day_checkboxes'} input[type="checkbox"]`);

    if (allDayCheckbox && dayCheckboxes.length > 0) {
        const allChecked = Array.from(dayCheckboxes).every(checkbox => checkbox.checked);
        allDayCheckbox.checked = allChecked;
    }
}

// 强制输入大写字母
function forceUppercase(input) {
    const cursorPosition = input.selectionStart;
    const upperValue = input.value.toUpperCase();
    input.value = upperValue;
    input.setSelectionRange(cursorPosition, cursorPosition);
}

// 事件监听器
let searchTimeout;
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    // 搜索框：允许字母、数字和空格；保持大写，避免影响现有搜索行为
    searchInput.addEventListener('input', function () {
        const cursorPosition = this.selectionStart;
        const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
        this.value = filteredValue;
        this.setSelectionRange(cursorPosition, cursorPosition);

        // 搜索功能
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            fetchProcesses();
        }, 300);
    });

    // 粘贴事件处理
    searchInput.addEventListener('paste', function () {
        setTimeout(() => {
            const cursorPosition = this.selectionStart;
            const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
            this.value = filteredValue;
            this.setSelectionRange(cursorPosition, cursorPosition);
        }, 0);
    });
}

const showInactiveCheckbox = document.getElementById('showInactive');
if (showInactiveCheckbox) {
    showInactiveCheckbox.addEventListener('change', function () {
        showInactive = this.checked;
        if (showInactive) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

const showOfficialCheckbox = document.getElementById('showOfficial');
if (showOfficialCheckbox) {
    showOfficialCheckbox.addEventListener('change', function () {
        showOfficial = this.checked;
        if (showOfficial) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

const showEInvoiceCheckbox = document.getElementById('showEInvoice');
if (showEInvoiceCheckbox) {
    showEInvoiceCheckbox.addEventListener('change', function () {
        showEInvoice = this.checked;
        if (showEInvoice) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

// Real-time filter when Show All checkbox changes
const showAllCheckbox = document.getElementById('showAll');
if (showAllCheckbox) {
    showAllCheckbox.addEventListener('change', function () {
        showAll = this.checked;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

// 处理添加表单提交
const addProcessForm = document.getElementById('addProcessForm');
if (addProcessForm) {
    addProcessForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        // 获取 multi-use 相关元素
        const multiUseCheckbox = document.getElementById('add_multi_use');
        const processInput = document.getElementById('add_process_id');

        // 验证用户是否选择了 process 或 multi-use processes
        if (!multiUseCheckbox.checked && (!processInput.value || !processInput.value.trim())) {
            showNotification('Please enter Process ID or enable Multi-use Purpose', 'danger');
            return;
        }

        if (multiUseCheckbox.checked && (!window.selectedProcesses || window.selectedProcesses.length === 0)) {
            showNotification('Please select at least one process for Multi-use Purpose', 'danger');
            return;
        }

        // 验证是否选择了描述
        if (!window.selectedDescriptions || window.selectedDescriptions.length === 0) {
            showNotification('Please select at least one description', 'danger');
            return;
        }

        const formData = new FormData(this);

        // 显式带上 Copy From（保证同步源会写入 sync_source_process_id）
        const copyFromHidden = document.getElementById('add_copy_from');
        if (copyFromHidden && copyFromHidden.value && copyFromHidden.value.trim() !== '') {
            formData.set('copy_from', copyFromHidden.value.trim());
        }

        // 添加选中的 descriptions
        formData.append('selected_descriptions', JSON.stringify(window.selectedDescriptions));

        // 添加选中的 processes (如果是 multi-use)
        if (multiUseCheckbox.checked && window.selectedProcesses && window.selectedProcesses.length > 0) {
            formData.append('selected_processes', JSON.stringify(window.selectedProcesses));
        }

        // 添加选中的 day use
        const selectedDays = [];
        document.querySelectorAll('#day_checkboxes input[name="day_use[]"]:checked').forEach(checkbox => {
            selectedDays.push(checkbox.value);
        });
        formData.append('day_use', selectedDays.join(','));

        try {
            const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                let message = result.message || 'Process added successfully!';
                // 如果有 copy_from 相关的调试信息，添加到消息中
                if (result.copy_from_used !== undefined) {
                    console.log('Copy from used:', result.copy_from_used, 'Sync source set:', result.sync_source_set);
                    console.log('Source templates found:', result.source_templates_found);
                    console.log('Templates copied:', result.copied_templates_count);
                    if (result.copy_from_used && result.source_templates_found === 0) {
                        message += ' (No templates found to copy)';
                    }
                    if (result.copy_from_used && result.sync_source_set) {
                        message += ' [Sync enabled: changes will sync to these processes]';
                    } else if (result.copy_from_used && !result.sync_source_set) {
                        message += ' (Sync not set: source process not found for this company)';
                    }
                }
                showNotification(message, 'success');
                closeAddModal();
                fetchProcesses(); // 刷新列表
            } else {
                let errorMessage = result.error || 'Unknown error occurred';
                showNotification(errorMessage, 'danger');
            }
        } catch (error) {
            console.error('Error adding process:', error);
            showNotification('Failed to add process', 'danger');
        }
    });
}

// Bank Add Process 必填项未填时显示红框
var bankRequiredFieldIds = ['bank_country', 'bank_bank', 'bank_type', 'bank_name', 'bank_cost', 'bank_price', 'bank_contract', 'bank_card_merchant', 'bank_customer', 'bank_profit_account'];

// 处理 Bank Add/Edit Process 表单提交（Edit 时走 update_process）
const addBankProcessForm = document.getElementById('addBankProcessForm');
if (addBankProcessForm) {
    bindBankFieldErrorClear();
    addBankProcessForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (bankProcessSubmitInFlight) {
            return;
        }
        if (markBankRequiredErrors()) {
            showNotification('Please fill in all required fields. Only Insurance and Profit Sharing are optional.', 'danger');
            return;
        }
        clearBankFieldErrors();
        const country = (document.getElementById('bank_country') && document.getElementById('bank_country').value || '').trim();
        const bank = (document.getElementById('bank_bank') && document.getElementById('bank_bank').value || '').trim();
        const type = (document.getElementById('bank_type') && document.getElementById('bank_type').value || '').trim();
        const name = (document.getElementById('bank_name') && document.getElementById('bank_name').value || '').trim();
        const cost = (document.getElementById('bank_cost') && document.getElementById('bank_cost').value || '').trim();
        const price = (document.getElementById('bank_price') && document.getElementById('bank_price').value || '').trim();
        const contract = (document.getElementById('bank_contract') && document.getElementById('bank_contract').value || '').trim();
        const cardMerchantBtn = document.getElementById('bank_card_merchant');
        const customerBtn = document.getElementById('bank_customer');
        const profitAccountBtn = document.getElementById('bank_profit_account');
        const cardMerchant = cardMerchantBtn && cardMerchantBtn.getAttribute('data-value');
        const customer = customerBtn && customerBtn.getAttribute('data-value');
        const profitAccount = profitAccountBtn && profitAccountBtn.getAttribute('data-value');
        if (!country || !bank || !type || !name || !cost || !price || !contract || !cardMerchant || !customer || !profitAccount) {
            return;
        }
        const editId = document.getElementById('bank_edit_id').value;
        bankProcessSubmitInFlight = true;
        const submitBtn = document.getElementById('bankSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = editId ? 'Updating...' : 'Saving...';
        }
        const formData = new FormData(this);
        // Profit 栏显示的是扣除 Profit Sharing 后的数额；提交时传 gross（Sell Price - Buy Price）供后端存储
        const grossProfit = (parseFloat(document.getElementById('bank_price').value) || 0) - (parseFloat(document.getElementById('bank_cost').value) || 0);
        formData.set('profit', grossProfit.toFixed(2));
        formData.append('permission', 'Bank');
        if (cardMerchantBtn && cardMerchantBtn.getAttribute('data-value')) {
            formData.append('card_merchant_id', cardMerchantBtn.getAttribute('data-value'));
        }
        if (customerBtn && customerBtn.getAttribute('data-value')) {
            formData.append('customer_id', customerBtn.getAttribute('data-value'));
        }
        if (profitAccountBtn && profitAccountBtn.getAttribute('data-value')) {
            formData.append('profit_account_id', profitAccountBtn.getAttribute('data-value'));
        }
        const freqEl = document.getElementById('bank_day_start_frequency');
        formData.append('day_start_frequency', (freqEl && freqEl.value) ? freqEl.value : '1st_of_every_month');
        try {
            if (editId) {
                formData.append('id', editId);
                const response = await fetch(buildApiUrl('api/processes/processlist_api.php?action=update_process'), {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    showNotification(result.message || 'Process updated successfully!', 'success');
                    closeAddBankModal();
                    fetchProcesses();
                    if (selectedPermission === 'Bank') loadAccountingInbox();
                } else {
                    showNotification(result.error || 'Update failed', 'danger');
                }
                return;
            }
            const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.success) {
                const cardMerchantId = cardMerchantBtn && cardMerchantBtn.getAttribute('data-value') ? cardMerchantBtn.getAttribute('data-value') : null;
                const customerId = customerBtn && customerBtn.getAttribute('data-value') ? customerBtn.getAttribute('data-value') : null;
                if (cardMerchantId) await ensureAccountHasCountryCurrency(cardMerchantId);
                if (customerId) await ensureAccountHasCountryCurrency(customerId);
                showNotification('Bank process added successfully!', 'success');
                closeAddBankModal();
                fetchProcesses();
                if (selectedPermission === 'Bank') loadAccountingInbox();
            } else {
                showNotification(result.error || 'Unknown error occurred', 'danger');
            }
        } catch (error) {
            console.error('Error saving bank process:', error);
            showNotification('Failed to save bank process', 'danger');
        } finally {
            bankProcessSubmitInFlight = false;
            const modal = document.getElementById('addBankModal');
            const activeSubmitBtn = document.getElementById('bankSubmitBtn');
            if (modal && modal.style.display === 'block' && activeSubmitBtn) {
                activeSubmitBtn.disabled = false;
                activeSubmitBtn.textContent = editId ? 'Update Process' : 'Add Process';
            }
        }
    });
}

// Insurance、Buy Price、Sell Price 只允许数字、逗号、句号
function allowOnlyNumberCommaPeriod(el) {
    if (!el) return;
    el.addEventListener('input', function () {
        this.value = this.value.replace(/[^\d.,]/g, '');
    });
}
allowOnlyNumberCommaPeriod(document.getElementById('bank_insurance'));
allowOnlyNumberCommaPeriod(document.getElementById('bank_cost'));
allowOnlyNumberCommaPeriod(document.getElementById('bank_price'));

// Sync Frequency based on Day End

// Auto calculate Day End based on Day Start and Contract

/** Bank Add/Edit 表单：按钮始终可点，提交时校验必填并显示红框（不再因未填而禁用） */

// 处理编辑表单提交
const editProcessForm = document.getElementById('editProcessForm');
if (editProcessForm) {
    editProcessForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const formData = new FormData(this);

        if (selectedPermission === 'Bank') {
            formData.append('permission', 'Bank');
        }

        // Add selected descriptions
        if (window.selectedDescriptions && window.selectedDescriptions.length > 0) {
            formData.append('selected_descriptions', JSON.stringify(window.selectedDescriptions));
        }

        // Add selected day use checkboxes
        const selectedDays = [];
        document.querySelectorAll('#edit_day_checkboxes input[name="edit_day_use[]"]:checked').forEach(checkbox => {
            selectedDays.push(checkbox.value);
        });
        formData.append('day_use', selectedDays.join(','));

        try {
            const response = await fetch(buildApiUrl('api/processes/processlist_api.php?action=update_process'), {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                const message = result.message || 'Process updated successfully!';
                showNotification(message, 'success');
                document.getElementById('editModal').style.display = 'none';
                document.getElementById('edit_all_day').checked = false;
                if (window.selectedDescriptions) window.selectedDescriptions = [];
                document.getElementById('edit_selected_descriptions_display').style.display = 'none';
                document.getElementById('edit_description').value = '';
                fetchProcesses(); // Refresh the list
            } else {
                let errorMessage = result.error || 'Unknown error occurred';
                showNotification(errorMessage, 'danger');
            }
        } catch (error) {
            console.error('Error updating process:', error);
            showNotification('Failed to update process', 'danger');
        }
    });
}

// 处理添加新描述表单提交
const addDescriptionForm = document.getElementById('addDescriptionForm');
if (addDescriptionForm) {
    addDescriptionForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const descriptionName = document.getElementById('new_description_name').value.trim();
        if (!descriptionName) {
            showNotification('Please enter description name', 'danger');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('action', 'add_description');
            formData.append('description_name', descriptionName);

            const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Description added successfully!', 'success');
                document.getElementById('new_description_name').value = ''; // Clear input field

                // 重新加载描述列表
                await loadExistingDescriptions();

                // 如果有新添加的描述ID，自动选中它
                if (result.description_id) {
                    const newCheckbox = document.getElementById(`desc_${result.description_id}`);
                    if (newCheckbox) {
                        newCheckbox.checked = true;
                        moveDescriptionToSelected(newCheckbox);
                    }
                }
            } else {
                // 如果是重复的 description，显示英文提示
                if (result.duplicate || (result.error && result.error.includes('already exists'))) {
                    showNotification('Description name already exists', 'danger');
                } else {
                    showNotification('Failed to add description: ' + (result.error || 'Unknown error'), 'danger');
                }
            }
        } catch (error) {
            console.error('Error adding description:', error);
            showNotification('Failed to add description', 'danger');
        }
    });
}

// Add Country form submit (in modal: save to DB via API, then add to Available; user selects to move to Selected)
const addCountryForm = document.getElementById('addCountryForm');
if (addCountryForm) {
    addCountryForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const nameInput = document.getElementById('new_country_name');
        const countryName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        if (!countryName) {
            showNotification('Please enter a country name', 'danger');
            return;
        }
        try {
            const formData = new FormData();
            formData.append('country', countryName);
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            if (companyId) formData.append('company_id', companyId);
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=add_country'), { method: 'POST', body: formData });
            const result = await res.json();
            if (!result.success) {
                showNotification(result.error || 'Failed to save country', 'danger');
                return;
            }
        } catch (err) {
            console.error(err);
            showNotification('Failed to save country', 'danger');
            return;
        }
        if (!availableCountriesList.includes(countryName)) {
            availableCountriesList.push(countryName);
            availableCountriesList.sort((a, b) => a.localeCompare(b));
        }
        loadExistingCountries();
        if (nameInput) nameInput.value = '';
        showNotification('Country added to available list', 'success');
    });
}

// Add Bank form submit (in modal: add new bank to Available only; user selects it to move to Selected)
const addBankFormEl = document.getElementById('addBankForm');
if (addBankFormEl) {
    addBankFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        const nameInput = document.getElementById('new_bank_name');
        const bankName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        if (!bankName) {
            showNotification('Please enter a bank name', 'danger');
            return;
        }
        if (!availableBanksList.includes(bankName)) {
            availableBanksList.push(bankName);
            availableBanksList.sort((a, b) => a.localeCompare(b));
        }
        loadExistingBanks();
        if (nameInput) nameInput.value = '';
        showNotification('Bank added to available list', 'success');
    });
}

// Add Account modal state (same as datacapturesummary)
let selectedCurrencyIdsForAdd = [];
let selectedCompanyIdsForAdd = (typeof window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD !== 'undefined' ? window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD : []);
let deletedCurrencyIds = [];
let bankAccountCurrencies = [];
// Edit Account modal state (for + button when account selected)
let selectedCompanyIdsForEdit = [];
let currentEditAccountIdForBank = null;
/** 从 Supplier 或 Customer 的 + 打开 Add Account 时记录，添加成功后自动选中新账户；Company 不自动选 */
let bankAddAccountTriggerFieldId = null;
// For Profit Sharing rows: remember which hidden input should receive the new account id
let bankAddAccountTriggerHiddenInputId = null;

let bankAccountRoles = [];
/** Role 排序优先级（与 account-list 一致，Add Account 弹窗开放完整 Role 列表） */
const BANK_ROLE_PRIORITY = ['CAPITAL', 'BANK', 'CASH', 'PROFIT', 'EXPENSES', 'COMPANY', 'STAFF', 'UPLINE', 'AGENT', 'MEMBER'];

// Add Account form submit (same as datacapturesummary - addaccountapi.php + link currencies/companies)
const addAccountFormEl = document.getElementById('addAccountForm');
if (addAccountFormEl) {
    addAccountFormEl.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!validatePaymentAlertForAddBank()) return;
        const formData = new FormData(this);
        const paymentAlert = document.querySelector('input[name="add_payment_alert"]:checked');
        if (paymentAlert) {
            formData.set('payment_alert', paymentAlert.value);
            if (paymentAlert.value === '0' || paymentAlert.value === 0) {
                formData.set('alert_type', '');
                formData.set('alert_start_date', '');
                formData.set('alert_amount', '');
            }
        }
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (currentCompanyId) formData.set('company_id', currentCompanyId);
        if (selectedCurrencyIdsForAdd.length > 0) formData.set('currency_ids', JSON.stringify(selectedCurrencyIdsForAdd));
        if (selectedCompanyIdsForAdd.length > 0) formData.set('company_ids', JSON.stringify(selectedCompanyIdsForAdd));
        
        // 调试：打印表单数据
        console.log('Form data being submitted:');
        for (let [key, value] of formData.entries()) {
            console.log(key, ':', value);
        }
        
        try {
            const response = await fetch(buildApiUrl('api/accounts/addaccountapi.php'), { method: 'POST', body: formData });
            const result = await response.json();
            console.log('Add account response:', result);
            if (result.success) {
                const newAccountId = result.data && result.data.id;
                let hasErrors = false;
                if (selectedCurrencyIdsForAdd.length > 0 && newAccountId) {
                    try {
                        const currencyPromises = selectedCurrencyIdsForAdd.map(currencyId =>
                            fetch(buildApiUrl('api/accounts/account_currency_api.php?action=add_currency'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ account_id: newAccountId, currency_id: currencyId })
                            }).then(r => r.json())
                        );
                        const currencyResults = await Promise.all(currencyPromises);
                        if (currencyResults.some(r => !r.success)) hasErrors = true;
                    } catch (err) { hasErrors = true; }
                }
                if (selectedCompanyIdsForAdd.length > 0 && newAccountId) {
                    try {
                        const companyPromises = selectedCompanyIdsForAdd.map(companyId =>
                            fetch(buildApiUrl('api/accounts/account_company_api.php?action=add_company'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ account_id: newAccountId, company_id: companyId })
                            }).then(r => r.json())
                        );
                        const companyResults = await Promise.all(companyPromises);
                        if (companyResults.some(r => !r.success)) hasErrors = true;
                    } catch (err) { hasErrors = true; }
                }
                if (hasErrors) showNotification('Account created successfully, but some associations failed.', 'warning');
                else if (selectedCurrencyIdsForAdd.length > 0 || selectedCompanyIdsForAdd.length > 0) showNotification('Account added successfully with currencies and companies!', 'success');
                else showNotification('Account added successfully!', 'success');
                selectedCurrencyIdsForAdd = [];
                selectedCompanyIdsForAdd = currentCompanyId ? [currentCompanyId] : [];
                var triggerFieldId = bankAddAccountTriggerFieldId;
                var triggerHiddenId = bankAddAccountTriggerHiddenInputId;
                closeAddAccountModal();
                await loadBankAccounts();
                refreshBankAccountDropdowns();
                if (newAccountId && triggerFieldId) {
                    const targetBtn = document.getElementById(triggerFieldId);
                    if (targetBtn) {
                        const displayText = result.data.account_id || result.data.name || String(newAccountId);
                        targetBtn.textContent = displayText;
                        targetBtn.setAttribute('data-value', newAccountId);
                        targetBtn.classList.remove('bank-field-error');
                    }
                    if (triggerHiddenId) {
                        const hiddenInput = document.getElementById(triggerHiddenId);
                        if (hiddenInput) {
                            hiddenInput.value = newAccountId;
                        }
                    }
                }
            } else {
                showNotification(result.error || 'Failed to add account', 'danger');
            }
        } catch (err) {
            console.error('Add account error', err);
            showNotification('Failed to add account', 'danger');
        }
    });
}

const editAccountFormEl = document.getElementById('editAccountForm');
if (editAccountFormEl) {
    editAccountFormEl.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!validatePaymentAlertForEditBank()) return;
        const formData = new FormData(this);
        const paymentAlert = formData.get('payment_alert');
        if (paymentAlert === '0' || paymentAlert === 0) {
            formData.set('alert_type', '');
            formData.set('alert_start_date', '');
            formData.set('alert_amount', '');
        }
        if (Array.isArray(selectedCompanyIdsForEdit) && selectedCompanyIdsForEdit.length > 0) {
            formData.set('company_ids', JSON.stringify(selectedCompanyIdsForEdit));
        }
        try {
            const response = await fetch(buildApiUrl('api/accounts/update_api.php'), { method: 'POST', body: formData });
            const result = await response.json();
            if (result.success) {
                showNotification('Account updated successfully!', 'success');
                closeEditAccountModalFromBank();
                await loadBankAccounts();
                refreshBankAccountDropdowns();
            } else {
                showNotification(result.error || 'Account update failed', 'danger');
            }
        } catch (err) {
            console.error('Edit account error', err);
            showNotification('Update failed', 'danger');
        }
    });
}

const profitSharingFormEl = document.getElementById('profitSharingForm');
if (profitSharingFormEl) {
    profitSharingFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        const rows = document.querySelectorAll('#profitSharingRowsContainer .profit-sharing-row');
        if (!window.selectedProfitSharingEntries) window.selectedProfitSharingEntries = [];
        let added = 0;
        rows.forEach(function (row) {
            const accountHidden = row.querySelector('.profit-sharing-account-id');
            const accountBtn = row.querySelector('.profit-sharing-account-btn');
            const amountInput = row.querySelector('.profit-sharing-amount');
            if (!amountInput) return;
            const accountId = (accountHidden && accountHidden.value) ? (accountHidden.value || '').trim() : '';
            const rawAmount = (amountInput.value || '').trim();
            if (!accountId || rawAmount === '') return;
            const accountText = (accountBtn && accountBtn.textContent) ? accountBtn.textContent.trim() : '';
            const num = parseFloat(rawAmount);
            const amount = (isNaN(num) ? rawAmount : num.toFixed(2));
            window.selectedProfitSharingEntries.push({ accountId: accountId, accountText: accountText, amount: amount });
            added++;
        });
        if (added === 0) {
            showNotification('Please select at least one Account and enter Amount.', 'warning');
            return;
        }
        renderSelectedProfitSharing();
        closeProfitSharingModal();
    });
}

const profitSharingAddRowBtn = document.getElementById('profitSharingAddRowBtn');
if (profitSharingAddRowBtn) {
    profitSharingAddRowBtn.addEventListener('click', function () {
        addProfitSharingRow();
    });
}

// 页面加载完成后执行
// Profit calculation flag to prevent duplicate listeners
let bankProfitCalculatorsInitialized = false;

// 获取公司货币代码列表（与 Account 的 currency 同步，account 有什么 currency，Country 就有什么）
async function fetchCompanyCurrencyCodes() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    let url = buildApiUrl('api/accounts/account_currency_api.php?action=get_available_currencies');
    if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
    const res = await fetch(url);
    const result = await res.json();
    const data = (result.success && result.data && Array.isArray(result.data)) ? result.data : [];
    return data.map(function (c) { return (c.code || '').toString().trim(); }).filter(Boolean);
}

// Load countries from server：下拉只显示已选 Country（get_selected_countries），与 account 同步的是「可选来源」在弹窗里用公司货币
async function loadCountriesFromServer() {
    const select = document.getElementById('bank_country');
    if (!select) return;
    const currentVal = (select.value || '').trim();
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    try {
        let list = [];
        if (companyId) {
            const selUrl = buildApiUrl('api/processes/processlist_api.php?action=get_selected_countries&company_id=' + encodeURIComponent(companyId));
            const selRes = await fetch(selUrl);
            const selResult = await selRes.json();
            list = (selResult.success && selResult.data && Array.isArray(selResult.data)) ? selResult.data : [];
        }
        if (list.length === 0) {
            let url = buildApiUrl('api/processes/processlist_api.php?action=get_countries');
            if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
            const res = await fetch(url);
            const result = await res.json();
            list = (result.success && result.data) ? result.data : [];
        }
        select.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = 'Select Country';
        select.appendChild(opt0);
        list.forEach(function (c) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });
        if (currentVal && list.indexOf(currentVal) >= 0) select.value = currentVal;
        else select.value = '';
    } catch (e) {
        console.warn('loadCountriesFromServer', e);
    }
}

// Load Bank Add Process Data（Country 从服务端已选列表加载，Bank 从 country_bank 加载，登出/隔几小时后仍保持）

// 按 Country 加载 Bank 下拉选项（Country-Bank 联动）

// Country 变更时：Bank 下拉只显示当前 Country 的 Selected Banks（不调用接口）
(function () {
    const countrySelect = document.getElementById('bank_country');
    if (countrySelect) {
        countrySelect.addEventListener('change', function () {
            applySelectedBanksToDropdown(this.value);
        });
    }
})();

function resolveCurrencyCodeFromCountryField(value) {
    if (!value || (value = String(value).trim()) === '') return null;
    if (COUNTRY_TO_CURRENCY[value]) return COUNTRY_TO_CURRENCY[value];
    if (value.length >= 2 && value.length <= 5) return value.toUpperCase();
    return null;
}

// Load accounts for Bank form（不按 role 过滤，显示该公司下全部账户）

// Initialize Bank Account Select (custom dropdown with search, like datacapturesummary Account)
// showNameInParentheses: only for Supplier – display "account_id (name)" in dropdown

// Profit Sharing Account select: custom dropdown with search (same as Supplier)
let profitSharingFirstRowInited = false;
function initProfitSharingAccountSelect(buttonId, dropdownId, hiddenInputId) {
    const accountButton = document.getElementById(buttonId);
    const accountDropdown = document.getElementById(dropdownId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const searchInput = accountDropdown?.querySelector('.custom-select-search input');
    const optionsContainer = accountDropdown?.querySelector('.custom-select-options');
    if (!accountButton || !accountDropdown || !hiddenInput || !searchInput || !optionsContainer) return;
    let isOpen = false;
    const placeholderText = accountButton.getAttribute('data-placeholder') || 'Select Account';
    const isInProfitSharingModal = accountDropdown.closest('#profitSharingModal');
    let dropdownOriginalParent = null;
    let dropdownOriginalNextSibling = null;

    function positionDropdownToBody() {
        if (!isInProfitSharingModal) return;
        const rect = accountButton.getBoundingClientRect();
        dropdownOriginalParent = accountDropdown.parentNode;
        dropdownOriginalNextSibling = accountDropdown.nextSibling;
        document.body.appendChild(accountDropdown);
        accountDropdown.style.position = 'fixed';
        accountDropdown.style.left = rect.left + 'px';
        accountDropdown.style.top = (rect.bottom + 2) + 'px';
        accountDropdown.style.width = Math.max(rect.width, 200) + 'px';
        accountDropdown.style.minWidth = Math.max(rect.width, 200) + 'px';
        accountDropdown.style.zIndex = '10001';
    }
    function restoreDropdownToModal() {
        if (!isInProfitSharingModal || !dropdownOriginalParent) return;
        dropdownOriginalParent.insertBefore(accountDropdown, dropdownOriginalNextSibling);
        accountDropdown.style.position = '';
        accountDropdown.style.left = '';
        accountDropdown.style.top = '';
        accountDropdown.style.width = '';
        accountDropdown.style.minWidth = '';
        accountDropdown.style.zIndex = '';
        dropdownOriginalParent = null;
        dropdownOriginalNextSibling = null;
    }

    function loadAccounts() {
        optionsContainer.innerHTML = '';
        const filterLower = (searchInput.value || '').toLowerCase().trim();
        let accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];
        const selectOpt = document.createElement('div');
        selectOpt.className = 'custom-select-option';
        selectOpt.setAttribute('data-value', '');
        selectOpt.textContent = 'Select Account';
        selectOpt.addEventListener('click', () => {
            accountButton.textContent = placeholderText;
            accountButton.setAttribute('data-value', '');
            hiddenInput.value = '';
            restoreDropdownToModal();
            accountDropdown.style.display = 'none';
            isOpen = false;
        });
        optionsContainer.appendChild(selectOpt);
        function getDisplayText(account) {
            return String(account.account_id ?? account.name ?? '').trim();
        }
        let filtered = accounts.filter(acc => {
            const t = getDisplayText(acc).toLowerCase();
            return !filterLower || t.includes(filterLower);
        });
        filtered = filtered.slice().sort((a, b) => getDisplayText(a).toLowerCase().localeCompare(getDisplayText(b).toLowerCase()));
        if (filtered.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'custom-select-no-results';
            noResults.textContent = 'No accounts found';
            optionsContainer.appendChild(noResults);
        } else {
            filtered.forEach(account => {
                const opt = document.createElement('div');
                opt.className = 'custom-select-option';
                opt.setAttribute('data-value', account.id);
                opt.textContent = getDisplayText(account);
                opt.addEventListener('click', () => {
                    accountButton.textContent = getDisplayText(account);
                    accountButton.setAttribute('data-value', account.id);
                    hiddenInput.value = String(account.id);
                    restoreDropdownToModal();
                    accountDropdown.style.display = 'none';
                    isOpen = false;
                });
                optionsContainer.appendChild(opt);
            });
        }
    }
    loadAccounts();
    searchInput.addEventListener('input', loadAccounts);
    accountButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            restoreDropdownToModal();
            accountDropdown.style.display = 'none';
            isOpen = false;
        } else {
            if (isInProfitSharingModal) positionDropdownToBody();
            accountDropdown.style.display = 'block';
            isOpen = true;
            searchInput.value = '';
            loadAccounts();
            searchInput.focus();
        }
    });
    document.addEventListener('click', (e) => {
        if (!accountButton.contains(e.target) && !accountDropdown.contains(e.target)) {
            restoreDropdownToModal();
            accountDropdown.style.display = 'none';
            isOpen = false;
        }
    });
}

// Country Selection Modal（按 company 区分存储，与 account-list 的 currency 一致）
const DEFAULT_COUNTRIES = [];
let availableCountriesList = [];

function getSelectedCountriesStorageKey() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    return 'processlist_selected_countries' + (companyId ? '_' + companyId : '');
}

function restoreSelectedCountriesFromStorage() {
    try {
        const raw = localStorage.getItem(getSelectedCountriesStorageKey());
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) return;
        const list = arr.filter(function (x) { return typeof x === 'string' && (x || '').trim(); }).map(function (x) { return (x || '').trim(); });
        if (list.length === 0) return;
        window.selectedCountries = list;
        const select = document.getElementById('bank_country');
        if (select && list.length > 0) {
            select.innerHTML = '';
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = 'Select Country';
            select.appendChild(opt0);
            list.forEach(function (name) {
                const n = (name || '').trim();
                if (!n) return;
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                select.appendChild(opt);
            });
        }
    } catch (e) { /* ignore */ }
}

function persistSelectedCountriesToStorage() {
    try {
        const key = getSelectedCountriesStorageKey();
        if (window.selectedCountries && Array.isArray(window.selectedCountries) && window.selectedCountries.length > 0) {
            localStorage.setItem(key, JSON.stringify(window.selectedCountries));
        } else {
            localStorage.removeItem(key);
        }
    } catch (e) { /* ignore */ }
}

function loadExistingCountries(allFromServer) {
    const select = document.getElementById('bank_country');
    const existingOptions = [];
    if (select && select.options) {
        for (let i = 0; i < select.options.length; i++) {
            const v = (select.options[i].value || '').trim();
            if (v) existingOptions.push(v);
        }
    }
    const all = allFromServer && allFromServer.length > 0
        ? [...new Set([...DEFAULT_COUNTRIES, ...allFromServer, ...(availableCountriesList || [])])].sort((a, b) => a.localeCompare(b))
        : [...new Set([...DEFAULT_COUNTRIES, ...existingOptions, ...(availableCountriesList || [])])].sort((a, b) => a.localeCompare(b));
    const selectedSet = new Set(window.selectedCountries || []);
    const combined = all.filter(name => !selectedSet.has(name));
    availableCountriesList = combined;

    const listEl = document.getElementById('existingCountries');
    if (!listEl) return;
    listEl.innerHTML = '';
    combined.forEach((name, index) => {
        const id = 'country_' + (Date.now() + index);
        const item = document.createElement('div');
        item.className = 'country-item';
        const left = document.createElement('div');
        left.className = 'country-item-left';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'available_countries';
        checkbox.value = name;
        checkbox.id = id;
        checkbox.dataset.countryId = id;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = name;
        left.appendChild(checkbox);
        left.appendChild(label);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'country-delete-btn';
        deleteBtn.title = 'Remove from list';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            removeCountryFromAvailable(name, item);
        });
        item.appendChild(left);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
        checkbox.addEventListener('change', function () {
            if (this.checked) moveCountryToSelected(this);
            else moveCountryToAvailable(this);
        });
    });
}

function updateSelectedCountriesInModal() {
    const selectedList = document.getElementById('selectedCountriesInModal');
    if (!selectedList) return;
    selectedList.innerHTML = '';
    if (!window.selectedCountries) window.selectedCountries = [];
    const current = (document.getElementById('bank_country')?.value || '').trim();
    if (current && !window.selectedCountries.includes(current)) {
        window.selectedCountries.push(current);
    }
    if (window.selectedCountries.length > 0) {
        window.selectedCountries.forEach((name, idx) => {
            const div = document.createElement('div');
            div.className = 'selected-country-modal-item';
            const safeName = (name || '').replace(/'/g, "\\'");
            div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-country-modal" onclick="moveCountryBackToAvailable(\'' + safeName + '\', \'cid' + idx + '\')">&times;</button>';
            selectedList.appendChild(div);
        });
    } else {
        selectedList.innerHTML = '<div class="no-countries">No countries selected</div>';
    }
}

function moveCountryToSelected(checkbox) {
    const name = checkbox.value;
    const id = checkbox.dataset.countryId;
    const item = checkbox.closest('.country-item');
    if (!window.selectedCountries) window.selectedCountries = [];
    if (!window.selectedCountries.includes(name)) window.selectedCountries.push(name);
    persistSelectedCountriesToStorage();
    const selectedList = document.getElementById('selectedCountriesInModal');
    const placeholder = selectedList.querySelector('.no-countries');
    if (placeholder) placeholder.remove();
    const div = document.createElement('div');
    div.className = 'selected-country-modal-item';
    const safeName = (name || '').replace(/'/g, "\\'");
    div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-country-modal" onclick="moveCountryBackToAvailable(\'' + safeName + '\', \'' + id + '\')">&times;</button>';
    selectedList.appendChild(div);
    if (item) item.remove();
}

function moveCountryBackToAvailable(countryName, countryId) {
    if (window.selectedCountries) {
        const idx = window.selectedCountries.indexOf(countryName);
        if (idx > -1) window.selectedCountries.splice(idx, 1);
    }
    persistSelectedCountriesToStorage();
    const selectedList = document.getElementById('selectedCountriesInModal');
    selectedList.querySelectorAll('.selected-country-modal-item').forEach(item => {
        if (item.querySelector('span')?.textContent === countryName) item.remove();
    });
    if (!selectedList.querySelector('.selected-country-modal-item')) {
        selectedList.innerHTML = '<div class="no-countries">No countries selected</div>';
    }
    const listEl = document.getElementById('existingCountries');
    if (!listEl) return;
    const id = 'country_' + (countryId || Date.now());
    const newItem = document.createElement('div');
    newItem.className = 'country-item';
    const left = document.createElement('div');
    left.className = 'country-item-left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'available_countries';
    cb.value = countryName;
    cb.id = id;
    cb.dataset.countryId = id;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = countryName;
    left.appendChild(cb);
    left.appendChild(label);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'country-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeCountryFromAvailable(countryName, newItem);
    });
    newItem.appendChild(left);
    newItem.appendChild(delBtn);
    listEl.appendChild(newItem);
    cb.addEventListener('change', function () {
        if (this.checked) moveCountryToSelected(this);
        else moveCountryToAvailable(this);
    });
}

function moveCountryToAvailable(checkbox) {
    const name = checkbox.value;
    const item = checkbox.closest('.country-item');
    if (window.selectedCountries) {
        const idx = window.selectedCountries.indexOf(name);
        if (idx > -1) window.selectedCountries.splice(idx, 1);
    }
    persistSelectedCountriesToStorage();
    document.getElementById('selectedCountriesInModal').querySelectorAll('.selected-country-modal-item').forEach(el => {
        if (el.querySelector('span')?.textContent === name) el.remove();
    });
    const selectedList = document.getElementById('selectedCountriesInModal');
    if (!selectedList.querySelector('.selected-country-modal-item')) {
        selectedList.innerHTML = '<div class="no-countries">No countries selected</div>';
    }
}

function removeCountryFromAvailable(countryName, itemEl) {
    if (itemEl && itemEl.parentNode) itemEl.remove();
}

function closeCountrySelectionModal() {
    const modal = document.getElementById('countrySelectionModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    const form = document.getElementById('addCountryForm');
    if (form) form.reset();
    const search = document.getElementById('countrySearch');
    if (search) search.value = '';
    document.querySelectorAll('input[name="available_countries"]').forEach(cb => cb.checked = false);
}

// Bank Selection Modal（Bank 下拉只显示当前 Country 的 Selected Banks，按 company + Country 分别存储）
const DEFAULT_BANKS = [];
let availableBanksList = [];

/** 仅用当前 Country 的 Selected Banks 填充 Bank 下拉，不调用接口 */

// Placeholder functions for add modals

/** Profit 显示为扣除 Profit Sharing 后的数额（Sell Price - Buy Price - sum(PS)） */

document.addEventListener('DOMContentLoaded', function () {
    restoreSelectedCountriesFromStorage();
    // Add Account modal: payment alert toggle
    document.querySelectorAll('input[name="add_payment_alert"]').forEach(radio => {
        radio.addEventListener('change', function () { toggleAlertFieldsBank('add'); });
    });
    // Edit Account modal: payment alert toggle
    document.querySelectorAll('input[name="payment_alert"]').forEach(radio => {
        radio.addEventListener('change', function () { toggleAlertFieldsBank('edit'); });
    });
    // Edit Account modal: uppercase for edit_name, edit_remark, editCurrencyInput
    ['edit_name', 'edit_remark', 'editCurrencyInput'].forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', function () { forceUppercase(this); });
            input.addEventListener('paste', function () { setTimeout(() => forceUppercase(this), 0); });
        }
    });
    const editCurrencyInput = document.getElementById('editCurrencyInput');
    if (editCurrencyInput) {
        editCurrencyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); addCurrencyFromInputBank('edit'); }
        });
    }
    // Add Account modal: uppercase for account fields and currency input
    ['add_account_id', 'add_name', 'add_remark', 'addCurrencyInput'].forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', function () { forceUppercase(this); });
            input.addEventListener('paste', function () { setTimeout(() => forceUppercase(this), 0); });
        }
    });
    const addCurrencyInput = document.getElementById('addCurrencyInput');
    if (addCurrencyInput) {
        addCurrencyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); addCurrencyFromInputBank('add'); }
        });
    }

    // Bank Add/Edit 表单：必填项变化时更新 Add Process 按钮可用状态
    ['bank_country', 'bank_bank', 'bank_type', 'bank_name', 'bank_day_start', 'bank_cost', 'bank_price', 'bank_contract'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateBankSubmitButtonState);
            el.addEventListener('change', updateBankSubmitButtonState);
        }
    });

    // 统一管理需要大写的输入框（Remarks/Remark 默认大写英语字母）；bank_remark 已改为 SOP 弹窗内编辑，保存时大写
    const uppercaseInputs = [
        'add_process_id',
        'new_description_name',
        'add_remove_words',
        'add_replace_word_from',
        'add_replace_word_to',
        'add_remarks',
        'edit_remove_words',
        'edit_replace_word_from',
        'edit_replace_word_to',
        'edit_remarks'
    ];

    // 为所有需要大写的输入框添加事件监听
    uppercaseInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // 输入时转换为大写
            input.addEventListener('input', function () {
                forceUppercase(this);
            });

            // 粘贴时也转换为大写
            input.addEventListener('paste', function () {
                setTimeout(() => forceUppercase(this), 0);
            });
        }
    });

    // 描述搜索框：允许字母、数字和空格（恢复可输入空格搜索）
    const descSearchInput = document.getElementById('descriptionSearch');
    if (descSearchInput) {
        descSearchInput.addEventListener('input', function () {
            const cursorPosition = this.selectionStart;
            const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
            this.value = filteredValue;
            this.setSelectionRange(cursorPosition, cursorPosition);
        });

        descSearchInput.addEventListener('paste', function () {
            setTimeout(() => {
                const cursorPosition = this.selectionStart;
                const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
                this.value = filteredValue;
                this.setSelectionRange(cursorPosition, cursorPosition);
            }, 0);
        });
    }

    // 处理 multi-use 复选框变化
    const multiUseToggle = document.getElementById('add_multi_use');
    const multiUsePanel = document.getElementById('multi_use_processes');
    const processInput = document.getElementById('add_process_id');
    if (multiUseToggle && multiUsePanel && processInput) {
        multiUseToggle.addEventListener('change', async function () {
            if (this.checked) {
                multiUsePanel.style.display = 'block';
                processInput.disabled = true;
                processInput.value = '';
                processInput.style.backgroundColor = '#f8f9fa';
                processInput.style.cursor = 'not-allowed';
                processInput.removeAttribute('required');
                // 勾选 Multi-Process 后：若已选 Copy From，自动将 Description 与 Copy From 的账号同步（含 Data Capture Formula 在提交时由后端复制）
                const copyFromHidden = document.getElementById('add_copy_from');
                if (copyFromHidden && copyFromHidden.value) {
                    try {
                        await syncFormFromCopyFrom(copyFromHidden.value);
                    } catch (e) {
                        console.error('Multi-Process: sync from Copy From failed', e);
                    }
                }
            } else {
                multiUsePanel.style.display = 'none';
                const selectedDisplay = document.getElementById('selected_processes_display');
                if (selectedDisplay) selectedDisplay.style.display = 'none';
                processInput.disabled = false;
                processInput.style.backgroundColor = 'white';
                processInput.style.cursor = 'default';
                processInput.setAttribute('required', 'required');
                const listDiv = document.getElementById('selected_processes_list');
                if (listDiv) listDiv.innerHTML = '';
                if (window.selectedProcesses) window.selectedProcesses = [];
                // uncheck all
                document.querySelectorAll('#process_checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
            }
        });
    }

    // 从 Copy From 同步到表单（含 Description/账号；Data Capture Formula 在提交时由后端复制）
    async function syncFormFromCopyFrom(processId) {
        if (!processId) return;
        const currencySelect = document.getElementById('add_currency');
        if (!currencySelect || currencySelect.options.length <= 1) {
            await loadAddProcessData();
        }
        const response = await fetch(buildApiUrl(`api/processes/addprocess_api.php?action=copy_from&process_id=${processId}`));
        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error(result.error || 'Unknown error');
        }
        const data = result.data;
        // 填充货币
        if (data.currency_id) {
            const currencyIdStr = String(data.currency_id);

            // 函数：尝试设置 currency 值
            const setCurrencyValue = () => {
                // 检查选项是否存在
                const optionExists = Array.from(currencySelect.options).some(opt => opt.value === currencyIdStr);
                if (optionExists) {
                    currencySelect.value = currencyIdStr;
                    console.log('Currency set successfully:', currencyIdStr);
                    return true;
                }
                return false;
            };

            // 立即尝试设置
            if (!setCurrencyValue()) {
                // 如果失败，等待下拉列表加载完成
                console.log('Currency dropdown not ready, waiting...');
                let attempts = 0;
                const maxAttempts = 10; // 减少到10次（1秒）
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (setCurrencyValue() || attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        if (attempts >= maxAttempts && currencySelect.value !== currencyIdStr) {
                            // 检查是否有警告信息
                            if (data.currency_warning) {
                                console.warn('Currency ID', currencyIdStr, 'does not belong to current company. Available options:', Array.from(currencySelect.options).map(opt => ({ value: opt.value, text: opt.text })));
                                showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
                            } else {
                                console.error('Failed to set currency after', maxAttempts, 'attempts. Currency ID:', currencyIdStr, 'Available options:', Array.from(currencySelect.options).map(opt => ({ value: opt.value, text: opt.text })));
                                showNotification('Warning: Currency could not be set automatically. Please select manually.', 'danger');
                            }
                        }
                    }
                }, 100);
            }
        } else if (data.currency_warning) {
            // 如果 currency_id 为空但有警告，说明原货币不属于当前公司
            // 尝试根据货币代码自动匹配当前公司的相同货币
            if (data.currency_code) {
                const currencyCode = data.currency_code.toUpperCase();
                const matchingOption = Array.from(currencySelect.options).find(opt =>
                    opt.textContent.toUpperCase() === currencyCode
                );
                if (matchingOption) {
                    currencySelect.value = matchingOption.value;
                    console.log('Auto-matched currency by code:', currencyCode, '-> ID:', matchingOption.value);
                } else {
                    showNotification('Warning: The original currency (' + currencyCode + ') does not belong to your company. Please select a currency manually.', 'danger');
                }
            } else {
                showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
            }
        }

        // 填充移除词汇
        if (data.remove_word) {
            document.getElementById('add_remove_words').value = data.remove_word;
        }

        // 填充替换词汇
        if (data.replace_word_from) {
            document.getElementById('add_replace_word_from').value = data.replace_word_from;
        }
        if (data.replace_word_to) {
            document.getElementById('add_replace_word_to').value = data.replace_word_to;
        }

        // 填充备注
        if (data.remark) {
            // 如果 remark 是 JSON 格式，尝试解析
            try {
                const meta = JSON.parse(data.remark);
                if (meta.user_remarks) {
                    document.getElementById('add_remarks').value = meta.user_remarks;
                } else {
                    document.getElementById('add_remarks').value = data.remark;
                }
            } catch (e) {
                document.getElementById('add_remarks').value = data.remark;
            }
        }

        // 填充 day use checkboxes
        if (data.day_use) {
            const dayIdsArray = data.day_use.split(',');
            dayIdsArray.forEach(dayId => {
                const checkbox = document.querySelector(`#day_checkboxes input[name="day_use[]"][value="${dayId.trim()}"]`);
                if (checkbox) checkbox.checked = true;
            });
            // 更新 All Day 复选框状态
            updateAllDayCheckbox('add');
        }

        // 自动选择 description
        if (data.description_name) {
            // 先清空之前选择的 description
            if (window.selectedDescriptions) {
                // 将之前选择的 description 移回可用列表
                window.selectedDescriptions.forEach(descName => {
                    const existingCheckbox = document.querySelector(`#existingDescriptions input[type="checkbox"][value="${CSS.escape(descName)}"]`);
                    if (existingCheckbox) {
                        existingCheckbox.checked = false;
                    }
                });
                window.selectedDescriptions = [];
            }

            // 确保 descriptions 列表已加载
            await loadExistingDescriptions();

            // 查找对应的 description 复选框
            const descriptionName = data.description_name.trim();
            const descriptionCheckbox = document.querySelector(`#existingDescriptions input[type="checkbox"][value="${CSS.escape(descriptionName)}"]`);

            if (descriptionCheckbox) {
                // 选中该复选框
                descriptionCheckbox.checked = true;
                // 移动到已选择列表
                moveDescriptionToSelected(descriptionCheckbox);
                // 更新显示
                document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
                displaySelectedDescriptions(window.selectedDescriptions);
            } else {
                console.warn('Description not found in available list:', descriptionName);
                // 如果找不到，仍然设置到 selectedDescriptions 中
                if (!window.selectedDescriptions) {
                    window.selectedDescriptions = [];
                }
                if (!window.selectedDescriptions.includes(descriptionName)) {
                    window.selectedDescriptions.push(descriptionName);
                    document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
                    displaySelectedDescriptions(window.selectedDescriptions);
                }
            }
        }
    }

    // 处理 copy-from 下拉选择变化（现为 hidden input，选择时由 initCopyFromSelect 设值并 dispatch change）
    const copyFromHidden = document.getElementById('add_copy_from');
    if (copyFromHidden) {
        copyFromHidden.addEventListener('change', async function () {
            const processId = this.value;
            if (!processId) {
                document.getElementById('add_currency').value = '';
                document.getElementById('add_remove_words').value = '';
                document.getElementById('add_replace_word_from').value = '';
                document.getElementById('add_replace_word_to').value = '';
                document.getElementById('add_remarks').value = '';
                document.querySelectorAll('#day_checkboxes input[name="day_use[]"]').forEach(cb => cb.checked = false);
                if (window.selectedDescriptions) window.selectedDescriptions = [];
                document.getElementById('add_description').value = '';
                document.getElementById('selected_descriptions_display').style.display = 'none';
                document.getElementById('selected_descriptions_list').innerHTML = '';
                document.querySelectorAll('#existingDescriptions input[type="checkbox"]').forEach(cb => cb.checked = false);
                return;
            }
            try {
                await syncFormFromCopyFrom(processId);
            } catch (error) {
                console.error('Error loading copy-from data:', error);
                showNotification('Failed to load process data: ' + (error.message || 'Unknown error'), 'danger');
            }
        });
    }

    // Copy From：与 Select Process 一致的可搜索下拉（展开/搜索/选择）
    function initCopyFromSelect() {
        const btn = document.getElementById('add_copy_from_btn');
        const dropdown = document.getElementById('add_copy_from_dropdown');
        const searchInput = dropdown?.querySelector('.custom-select-search input');
        const optionsContainer = dropdown?.querySelector('.custom-select-options');
        const hiddenInput = document.getElementById('add_copy_from');
        if (!btn || !dropdown || !searchInput || !optionsContainer || !hiddenInput) return;
        let isOpen = false;

        function updateCopyFromFilter(filterText) {
            const filterLower = (filterText || '').toLowerCase().trim();
            const allOptions = Array.from(optionsContainer.querySelectorAll('.custom-select-option'));
            allOptions.forEach(opt => {
                const text = (opt.textContent || '').toLowerCase();
                opt.style.display = !filterLower || text.includes(filterLower) ? '' : 'none';
            });
            let noResults = dropdown.querySelector('.custom-select-no-results');
            const visibleCount = allOptions.filter(o => o.style.display !== 'none').length;
            if (visibleCount === 0 && filterLower) {
                if (!noResults) {
                    noResults = document.createElement('div');
                    noResults.className = 'custom-select-no-results';
                    noResults.textContent = 'No results found';
                    optionsContainer.appendChild(noResults);
                }
                noResults.style.display = 'block';
            } else if (noResults) noResults.style.display = 'none';
        }

        function closeDropdown() {
            isOpen = false;
            dropdown.classList.remove('show');
            btn.classList.remove('open');
        }

        function selectCopyFromOption(option) {
            const value = option.getAttribute('data-value');
            const text = option.textContent || '';
            hiddenInput.value = value || '';
            btn.textContent = value ? text : (btn.getAttribute('data-placeholder') || 'Select Process to Copy From');
            optionsContainer.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
            closeDropdown();
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            isOpen = !isOpen;
            if (isOpen) {
                dropdown.classList.add('show');
                btn.classList.add('open');
                searchInput.value = '';
                updateCopyFromFilter('');
                setTimeout(function () { searchInput.focus(); }, 10);
            } else closeDropdown();
        });
        searchInput.addEventListener('input', function () { updateCopyFromFilter(this.value); });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDropdown();
        });
        optionsContainer.addEventListener('click', function (e) {
            const option = e.target.closest('.custom-select-option');
            if (option && option.style.display !== 'none') selectCopyFromOption(option);
        });
        document.addEventListener('click', function (e) {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
        });
    }
    initCopyFromSelect();

    // 检查 URL 参数并显示相应的消息
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const successParam = urlParams.get('success');

    if (errorParam === 'process_linked_to_formula') {
        showNotification('Cannot delete: This process is linked to a formula. Please remove the related formula records first.', 'danger');
        // 清除 URL 参数
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'bank_has_day_start') {
        showNotification('Delete failed: Processes with Day Start set cannot be deleted.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'no_inactive_processes') {
        showNotification('Cannot delete: Only inactive processes can be deleted.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'process_has_transactions') {
        showNotification('Cannot delete: This process has transaction records. Remove related transactions first.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'delete_failed') {
        showNotification('Delete failed. Please try again.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (successParam === 'deleted') {
        showNotification('Deleted successfully!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    initProcessListDateFilter();
    console.log('DOM loaded, calling fetchProcesses...');
    try {
        loadPermissionButtons().then(() => {
            fetchProcesses();
        });
    } catch (error) {
        console.error('Error in fetchProcesses:', error);
        showError('Error loading data: ' + error.message);
    }

    const accountingInboxBtn = document.getElementById('processAccountingInboxBtn');
    if (accountingInboxBtn) {
        accountingInboxBtn.addEventListener('click', () => {
            const modal = document.getElementById('processAccountingDueModal');
            if (modal && modal.style.display === 'block') {
                closeAccountingDueModal();
            } else {
                openAccountingDueModal();
            }
        });
    }
    const accountingInboxRefresh = document.getElementById('processAccountingInboxRefreshBtn');
    if (accountingInboxRefresh) {
        accountingInboxRefresh.addEventListener('click', () => loadAccountingInbox());
    }
    const accountingInboxPost = document.getElementById('processAccountingInboxPostBtn');
    if (accountingInboxPost) {
        accountingInboxPost.addEventListener('click', () => postAccountingInboxToTransaction());
    }
    /* Accounting Due 弹窗：点击弹窗以外区域不关闭，仅通过 X 或 Cancel 关闭 */
});

window.addEventListener('resize', function () {
    if (selectedPermission === 'Bank') syncBankTableColumnWidth();
});

// 加载权限按钮
async function loadPermissionButtons() {
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');
    const permissionFilterEl = document.getElementById('process-list-permission-filter');
    const permissionContainer = document.getElementById('process-list-permission-buttons');

    if (!currentCompanyCode) {
        if (permissionFilterEl) permissionFilterEl.style.display = 'none';
        return;
    }

    try {
        const response = await fetch('api/domain/domain_api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_company_permissions',
                company_id: currentCompanyCode
            })
        });

        const result = await response.json();
        let permissions = result.success && result.data && result.data.permissions ? result.data.permissions : ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
        // 兼容旧数据：数据库可能仍是 "Gambling"，统一为 "Games" 显示与逻辑
        permissions = [...new Set(permissions.map(p => p === 'Gambling' ? 'Games' : p))];

        permissionContainer.innerHTML = '';

        if (permissions.length > 0) {
            if (permissionFilterEl) {
                permissionFilterEl.style.display = hidePermissionFilter ? 'none' : 'flex';
            }

            permissions.forEach(permission => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'process-company-btn';
                btn.textContent = permission;
                btn.dataset.permission = permission;
                btn.onclick = () => switchPermission(permission);
                permissionContainer.appendChild(btn);
            });

            // 尝试从 localStorage 恢复之前选择的权限（兼容旧值 Gambling）
            let savedPermission = localStorage.getItem(`selectedPermission_${currentCompanyCode}`);
            if (savedPermission === 'Gambling') savedPermission = 'Games';
            if (forcedPermission && permissions.includes(forcedPermission)) {
                switchPermission(forcedPermission);
            } else if (savedPermission && permissions.includes(savedPermission)) {
                switchPermission(savedPermission);
            } else if (permissions.length > 0 && !selectedPermission) {
                // 如果没有保存的权限，默认选择第一个
                switchPermission(permissions[0]);
            }
        } else {
            if (permissionFilterEl) permissionFilterEl.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading permissions:', error);
        if (permissionFilterEl) permissionFilterEl.style.display = 'none';
    }
}

// 切换权限
function switchPermission(permission) {
    const targetPage = getProcessListPageByPermission(permission);
    if (redirectToProcessListPage(targetPage, permission)) {
        return;
    }

    selectedPermission = permission;

    // 保存到 localStorage
    const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');
    if (currentCompanyCode) {
        localStorage.setItem(`selectedPermission_${currentCompanyCode}`, permission);
    }

    // 更新按钮状态
    const buttons = document.querySelectorAll('#process-list-permission-buttons .process-company-btn');
    buttons.forEach(btn => {
        if (btn.dataset.permission === permission) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 根据类别更新表格头部
    const gamblingHeaders = document.querySelectorAll('.gambling-header');
    const bankHeaders = document.querySelectorAll('.bank-header');
    const selectAllGambling = document.getElementById('selectAllProcesses');
    const selectAllBank = document.getElementById('selectAllBankProcesses');
    const tableHeader = document.getElementById('tableHeader');
    const processCards = document.querySelectorAll('.process-card');

    const processTableBodyEl = document.getElementById('processTableBody');
    const processTableWrapperEl = document.getElementById('processTableWrapper');
    const bankTableWrapperEl = document.getElementById('bankTableWrapper');
    if (permission === 'Bank') {
        if (processTableWrapperEl) processTableWrapperEl.style.display = 'none';
        if (bankTableWrapperEl) bankTableWrapperEl.style.display = 'block';
        if (processTableBodyEl) processTableBodyEl.classList.add('bank-mode');
        gamblingHeaders.forEach(header => header.style.display = 'none');
        bankHeaders.forEach(header => header.style.display = 'flex');
        if (selectAllGambling) selectAllGambling.style.display = 'none';
        if (selectAllBank) selectAllBank.style.display = 'inline-block';
        if (tableHeader) tableHeader.style.gridTemplateColumns = BANK_GRID_TEMPLATE_COLUMNS;
        processCards.forEach(card => { card.style.gridTemplateColumns = BANK_GRID_TEMPLATE_COLUMNS; });
    } else {
        if (processTableWrapperEl) processTableWrapperEl.style.display = 'grid';
        if (bankTableWrapperEl) bankTableWrapperEl.style.display = 'none';
        if (processTableBodyEl) processTableBodyEl.classList.remove('bank-mode');
        if (processTableBodyEl) processTableBodyEl.style.removeProperty('--table-header-width');
        // 显示 Games 表格头部，隐藏 Bank 表格头部
        gamblingHeaders.forEach(header => header.style.display = 'flex');
        bankHeaders.forEach(header => header.style.display = 'none');
        if (selectAllGambling) selectAllGambling.style.display = 'inline-block';
        if (selectAllBank) selectAllBank.style.display = 'none';

        // 恢复 Games 表格的列数（7列）
        if (tableHeader) {
            tableHeader.style.gridTemplateColumns = '0.3fr 0.8fr 1.1fr 0.2fr 0.3fr 1fr 0.3fr';
        }
        processCards.forEach(card => {
            card.style.gridTemplateColumns = '0.3fr 0.8fr 1.1fr 0.2fr 0.3fr 1.1fr 0.19fr';
        });
    }

    updateProcessListDateFilterVisibility();

    // Post to Transaction 仅 Bank 显示，Games 隐藏
    updatePostToTransactionButton();
    // Accounting Due Inbox: show only on Bank
    updateAccountingInboxVisibility();

    // 重新加载数据
    currentPage = 1;
    fetchProcesses();
}

async function switchProcessListCompany(companyId) {
    // 先更新 session
    try {
        const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
        const result = await response.json();
        if (!result.success) {
            console.error('Failed to update session:', result.error);
            // 即使 API 失败，也继续刷新页面（PHP 端会处理）
        }
    } catch (error) {
        console.error('Error updating session:', error);
        // 即使 API 失败，也继续刷新页面（PHP 端会处理）
    }

    const url = new URL(window.location.href);
    url.searchParams.set('company_id', companyId);
    window.location.href = url.toString();
}
