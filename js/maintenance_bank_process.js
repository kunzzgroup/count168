/**
 * Bank category: fixed Process dropdown for maintenance pages
 * (PROFIT / SALARY / COMMISSION / BONUS — same as Data Capture)
 */
(function (global) {
    'use strict';

    var BANK_MAINTENANCE_PROCESSES = ['PROFIT', 'SALARY', 'COMMISSION', 'BONUS'];

    function getMaintenanceCompanyCode() {
        if (typeof global.currentCompanyCode === 'string' && global.currentCompanyCode) {
            return global.currentCompanyCode;
        }
        if (global.TRANSACTION_MAINTENANCE && global.TRANSACTION_MAINTENANCE.currentCompanyCode) {
            return String(global.TRANSACTION_MAINTENANCE.currentCompanyCode);
        }
        if (typeof global.SIDEBAR_COMPANY_CODE !== 'undefined' && global.SIDEBAR_COMPANY_CODE) {
            return String(global.SIDEBAR_COMPANY_CODE);
        }
        return '';
    }

    function companyHasMaintenanceGamesFlag() {
        if (global.MAINTENANCE_COMPANY_HAS_GAMES === true) return true;
        return typeof global.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' && !!global.SIDEBAR_COMPANY_HAS_GAMBLING;
    }

    function companyHasMaintenanceBankFlag() {
        if (global.MAINTENANCE_COMPANY_HAS_BANK === true) return true;
        return typeof global.SIDEBAR_COMPANY_HAS_BANK !== 'undefined' && !!global.SIDEBAR_COMPANY_HAS_BANK;
    }

    function canAccessMaintenancePage() {
        return companyHasMaintenanceGamesFlag() || companyHasMaintenanceBankFlag();
    }

    function isMaintenanceCategoryBankFromStorage() {
        var code = getMaintenanceCompanyCode();
        if (!code) return false;
        var raw = localStorage.getItem('selectedPermission_' + code);
        if (raw === 'Gambling') raw = 'Games';
        return raw === 'Bank';
    }

    /**
     * @param {string|null|undefined} selectedPermission Active Category button (Games/Bank/...)
     */
    function isBankMaintenanceProcessMode(selectedPermission) {
        if (selectedPermission === 'Bank') return true;
        var bankPerm = companyHasMaintenanceBankFlag();
        var hasGambling = companyHasMaintenanceGamesFlag();
        if (bankPerm && !hasGambling) return true;
        return isMaintenanceCategoryBankFromStorage();
    }

    function renderBankMaintenanceProcessSelect() {
        var processButton = document.getElementById('filter_process');
        var dropdown = document.getElementById('filter_process_dropdown');
        var optionsContainer = dropdown && dropdown.querySelector('.custom-select-options');
        if (!processButton || !dropdown || !optionsContainer) {
            return false;
        }

        var previousValue = processButton.getAttribute('data-value') || '';
        optionsContainer.innerHTML = '';

        var allOption = document.createElement('div');
        allOption.className = 'custom-select-option';
        allOption.textContent = '--Select All--';
        allOption.setAttribute('data-value', '');
        if (!previousValue) {
            allOption.classList.add('selected');
            processButton.textContent = '--Select All--';
        }
        optionsContainer.appendChild(allOption);

        BANK_MAINTENANCE_PROCESSES.forEach(function (code) {
            var option = document.createElement('div');
            option.className = 'custom-select-option';
            option.textContent = code;
            option.setAttribute('data-value', code);
            if (previousValue && previousValue === code) {
                option.classList.add('selected');
                processButton.textContent = code;
                processButton.setAttribute('data-value', code);
            }
            optionsContainer.appendChild(option);
        });

        if (!previousValue) {
            processButton.textContent = processButton.getAttribute('data-placeholder') || '--Select All--';
            processButton.removeAttribute('data-value');
        }

        return true;
    }

    function resolveMaintenanceCompanyFlags(hasGamblingFromSession, hasBankFromSession) {
        var hasGambling = hasGamblingFromSession !== undefined
            ? hasGamblingFromSession
            : companyHasMaintenanceGamesFlag();
        var hasBank = hasBankFromSession !== undefined
            ? hasBankFromSession
            : companyHasMaintenanceBankFlag();
        return { hasGambling: !!hasGambling, hasBank: !!hasBank };
    }

    global.BANK_MAINTENANCE_PROCESSES = BANK_MAINTENANCE_PROCESSES;
    global.canAccessMaintenancePage = canAccessMaintenancePage;
    global.resolveMaintenanceCompanyFlags = resolveMaintenanceCompanyFlags;
    global.isBankMaintenanceProcessMode = isBankMaintenanceProcessMode;
    global.renderBankMaintenanceProcessSelect = renderBankMaintenanceProcessSelect;
})(typeof window !== 'undefined' ? window : this);
