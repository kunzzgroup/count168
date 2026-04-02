<?php

if (!function_exists('renderBankProcessToolbarAction')) {
    function renderBankProcessToolbarAction()
    {
        ?>
        <!-- Accounting Due (Bank only): opens large modal like Add Process -->
        <div class="process-accounting-inbox-wrap" id="processAccountingInboxWrap" style="display: none;">
            <button type="button" class="process-accounting-inbox-btn process-accounting-inbox-main"
                id="processAccountingInboxBtn">
                <svg class="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="currentColor"
                    aria-hidden="true">
                    <path
                        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                Accounting Due
                <span class="process-accounting-inbox-badge" id="processAccountingInboxCount">0</span>
            </button>
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessFilterControls')) {
    function renderBankProcessFilterControls($showOfficialChecked, $showEInvoiceChecked)
    {
        ?>
        <div id="process-list-bank-only-filters" class="process-list-bank-only-filters"
            style="display: none; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="checkbox-section">
                <input type="checkbox" id="showOfficial" name="showOfficial" <?php echo $showOfficialChecked ? 'checked' : ''; ?>>
                <label for="showOfficial">Show Official</label>
            </div>
            <div class="checkbox-section">
                <input type="checkbox" id="showEInvoice" name="showEInvoice" <?php echo $showEInvoiceChecked ? 'checked' : ''; ?>>
                <label for="showEInvoice">Show E-Invoice</label>
            </div>
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessTableHeaders')) {
    function renderBankProcessTableHeaders()
    {
        ?>
        <div class="header-item bank-header" style="display: none;">No</div>
        <div class="header-item bank-header" style="display: none;">Supplier</div>
        <div class="header-item bank-header" style="display: none;">Country (Currency)</div>
        <div class="header-item bank-header" style="display: none;">Bank</div>
        <div class="header-item bank-header" style="display: none;">Types</div>
        <div class="header-item bank-header" style="display: none;">Card Owner</div>
        <div class="header-item bank-header" style="display: none;">Contract</div>
        <div class="header-item bank-header" style="display: none;">Insurance</div>
        <div class="header-item bank-header" style="display: none;">Customer</div>
        <div class="header-item bank-header" style="display: none;">Cost</div>
        <div class="header-item bank-header" style="display: none;">Price</div>
        <div class="header-item bank-header" style="display: none;">Profit</div>
        <div class="header-item bank-header" style="display: none;">Status</div>
        <div class="header-item bank-header" style="display: none;">Date</div>
        <div class="header-item bank-header bank-action-header" style="display: none;">Action
            <input type="checkbox" title="Select all" class="header-action-checkbox"
                style="margin-left: 10px; cursor: pointer;">
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessTableWrapper')) {
    function renderBankProcessTableWrapper()
    {
        ?>
        <div id="bankTableWrapper" class="bank-table-wrapper" style="display: none;">
            <table id="bankTable" class="bank-data-table">
                <thead>
                    <tr id="bankTableHeadRow"></tr>
                </thead>
                <tbody id="bankTableBody"></tbody>
            </table>
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessModals')) {
    function renderBankProcessModals()
    {
        ?>
        <div id="processAccountingDueModal" class="modal" style="display: none;">
            <div class="modal-content accounting-due-modal-content">
                <div class="modal-header">
                    <h2>
                        Accounting Due
                        <span class="process-accounting-inbox-badge" id="processAccountingInboxCountModal">0</span>
                    </h2>
                    <div class="modal-header-actions">
                        <span class="close" onclick="closeAccountingDueModal()">&times;</span>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="process-accounting-inbox-table-wrap">
                        <table class="process-accounting-inbox-table">
                            <thead>
                                <tr>
                                    <th style="width:36px;"><input type="checkbox" id="processAccountingInboxSelectAll" title="Select all" class="process-accounting-inbox-cb"></th>
                                    <th>No</th>
                                    <th>Start Date</th>
                                    <th>Card Owner</th>
                                    <th>Bank</th>
                                    <th>Contract</th>
                                    <th style="width:80px;">Delete <input type="checkbox" id="processAccountingInboxDeleteSelectAll" title="Select all for delete" class="process-accounting-inbox-delete-cb"></th>
                                </tr>
                            </thead>
                            <tbody id="processAccountingInboxTbody"></tbody>
                        </table>
                    </div>
                    <div class="process-accounting-inbox-actions">
                        <button type="button" class="btn btn-primary" id="processAccountingInboxPostBtn" disabled>Transaction</button>
                        <button type="button" class="btn btn-delete" id="processAccountingInboxDeleteBtn" onclick="deleteAccountingInboxSelected()" disabled>Delete</button>
                        <button type="button" class="btn btn-cancel" onclick="closeAccountingDueModal()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="addBankModal" class="modal bank-modal" style="display: none;">
            <div class="modal-content bank-modal-content">
                <div class="modal-header">
                    <h2 id="bankModalTitle">Add Process</h2>
                    <span class="close" onclick="closeAddBankModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="addBankProcessForm" class="process-form bank-form">
                        <input type="hidden" id="bank_edit_id" name="id" value="">
                        <div class="bank-form-row"><div class="bank-form-cell bank-form-cell-left"><h3 class="bank-section-title">Bank Information</h3><div class="form-row bank-row-two-cols"><div class="form-group"><label for="bank_country">Country (Currency)</label><div class="select-with-add"><select id="bank_country" name="country" class="bank-select" required><option value="">Select Country</option></select><button type="button" class="bank-add-btn" onclick="showAddCountryModal()" title="Add New Country">+</button></div></div><div class="form-group"><label for="bank_bank">Bank</label><div class="select-with-add"><select id="bank_bank" name="bank" class="bank-select" required><option value="">Select Bank</option></select><button type="button" class="bank-add-btn" onclick="showAddBankModal()" title="Add New Bank">+</button></div></div></div></div><div class="bank-form-cell bank-form-cell-right"><h3 class="bank-section-title">Detail</h3><div class="form-row bank-row-two-cols"><div class="form-group"><label for="bank_card_merchant">Supplier</label><div class="account-select-with-buttons"><div class="custom-select-wrapper"><button type="button" class="custom-select-button" id="bank_card_merchant" data-placeholder="Select Account" name="card_merchant">Select Account</button><div class="custom-select-dropdown" id="bank_card_merchant_dropdown"><div class="custom-select-search"><input type="text" placeholder="Search account..." autocomplete="off"></div><div class="custom-select-options"></div></div></div><button type="button" class="bank-add-btn" onclick="bankAccountPlusClick('bank_card_merchant')" title="Add New Account">+</button></div></div><div class="form-group"><label for="bank_cost">Buy Price</label><input type="text" id="bank_cost" name="cost" placeholder="Enter amount" class="bank-input" inputmode="decimal" autocomplete="off" required></div></div></div></div>
                        <div class="bank-form-row"><div class="bank-form-cell bank-form-cell-left"><div class="form-row bank-row-two-cols bank-row-type-name"><div class="form-group"><label for="bank_type">Type</label><select id="bank_type" name="type" class="bank-select" required><option value="">Select Type</option><option value="PERSONAL">PERSONAL</option><option value="ENTERPRISE">ENTERPRISE</option><option value="BUSINESS">BUSINESS</option></select></div><div class="form-group"><label for="bank_name">Card Owner</label><input type="text" id="bank_name" name="name" placeholder="Enter Card Owner" class="bank-input" oninput="this.value=this.value.toUpperCase()" required></div></div></div><div class="bank-form-cell bank-form-cell-right"><div class="form-row bank-row-two-cols"><div class="form-group"><label for="bank_customer">Customer</label><div class="account-select-with-buttons"><div class="custom-select-wrapper"><button type="button" class="custom-select-button" id="bank_customer" data-placeholder="Select Account" name="customer">Select Account</button><div class="custom-select-dropdown" id="bank_customer_dropdown"><div class="custom-select-search"><input type="text" placeholder="Search account..." autocomplete="off"></div><div class="custom-select-options"></div></div></div><button type="button" class="bank-add-btn" onclick="bankAccountPlusClick('bank_customer')" title="Add New Account">+</button></div></div><div class="form-group"><label for="bank_price">Sell Price</label><input type="text" id="bank_price" name="price" placeholder="Enter amount" class="bank-input" inputmode="decimal" autocomplete="off" required></div></div></div></div>
                        <div class="bank-form-row"><div class="bank-form-cell bank-form-cell-left"><div class="form-row bank-day-start-row"><div class="form-group bank-day-start-input-wrap"><label for="bank_day_start">Day start</label><input type="date" id="bank_day_start" name="day_start" class="bank-input"></div><div class="form-group bank-day-end-input-wrap"><label for="bank_day_end">Day end</label><input type="date" id="bank_day_end" name="day_end" class="bank-input"></div></div></div><div class="bank-form-cell bank-form-cell-right"><div class="form-row bank-row-two-cols"><div class="form-group"><label for="bank_profit_account">Company</label><div class="account-select-with-buttons"><div class="custom-select-wrapper"><button type="button" class="custom-select-button" id="bank_profit_account" data-placeholder="Select Account" name="profit_account">Select Account</button><div class="custom-select-dropdown" id="bank_profit_account_dropdown"><div class="custom-select-search"><input type="text" placeholder="Search account..." autocomplete="off"></div><div class="custom-select-options"></div></div></div><button type="button" class="bank-add-btn" onclick="bankAccountPlusClick('bank_profit_account')" title="Add New Account">+</button></div></div><div class="form-group"><label for="bank_profit">Profit</label><input type="number" id="bank_profit" name="profit" placeholder="Auto calculated" class="bank-input" readonly style="background-color: #f5f5f5;"></div></div></div></div>
                        <div class="bank-form-row bank-form-row-last"><div class="bank-form-cell bank-form-cell-left"><div class="form-group bank-day-start-frequency-wrap" style="margin-bottom: 20px;"><label for="bank_day_start_frequency">Frequency</label><select id="bank_day_start_frequency" name="day_start_frequency" class="bank-input bank-select"><option value="1st_of_every_month">1st of Every Month</option><option value="monthly">Monthly</option></select></div><input type="hidden" id="bank_profit_sharing" name="profit_sharing"><div class="bank-profit-sharing-container" class="form-group"><div class="bank-profit-sharing-header"><h3>Selected Profit Sharing</h3><button type="button" class="bank-add-btn" onclick="showAddProfitSharingModal()" title="Add Profit Sharing">+</button></div><div class="bank-profit-sharing-list" id="selectedProfitSharingList"><div class="no-profit-sharing"><p>No profit sharing selected</p></div></div></div></div><div class="bank-form-cell bank-form-cell-right"><div class="form-row bank-row-two-cols"><div class="form-group"><label for="bank_contract">Contract</label><select id="bank_contract" name="contract" class="bank-select" required><option value="">Select Contract</option><option value="1 MONTH">1 MONTH</option><option value="2 MONTHS">2 MONTHS</option><option value="3 MONTHS">3 MONTHS</option><option value="6 MONTHS">6 MONTHS</option><option value="1+1">1+1 MONTH</option><option value="1+2">1+2 MONTHS</option><option value="1+3">1+3 MONTHS</option></select></div><div class="form-group"><label for="bank_insurance">Insurance</label><input type="text" id="bank_insurance" name="insurance" placeholder="Enter amount" class="bank-input" inputmode="decimal" autocomplete="off"></div></div><div class="form-group bank-remark-wrap" style="margin-top: 12px;"><input type="hidden" id="bank_sop" name="sop" value=""><input type="hidden" id="bank_remark" name="remark" value=""><div class="bank-remark-actions"><button type="button" id="bank_sop_btn" class="btn btn-save" onclick="openProcessNoteModal('sop')">SOP</button><button type="button" id="bank_remark_btn" class="btn btn-save" onclick="openProcessNoteModal('remark')">Remark</button></div></div></div></div>
                        <div class="form-actions bank-actions"><button type="submit" class="btn btn-save" id="bankSubmitBtn" disabled>Add Process</button><button type="button" class="btn btn-cancel" onclick="closeAddBankModal()">Cancel</button></div>
                    </form>
                </div>
            </div>
        </div>
        <div id="sopModal" class="modal bank-modal sop-modal" style="display: none;"><div class="modal-content sop-modal-content"><div class="modal-header"><h2 id="processNoteModalTitle">Process Notes</h2><span class="close" onclick="closeSopModal()">&times;</span></div><div class="modal-body sop-modal-body"><textarea id="sop_content" placeholder="Enter notes for this process..." class="bank-input sop-modal-textarea"></textarea><div class="form-actions bank-actions sop-modal-actions"><button type="button" class="btn btn-save" onclick="saveProcessNoteAndClose()">Save</button><button type="button" class="btn btn-cancel" onclick="closeSopModal()">Cancel</button></div></div></div></div>
        <div id="addAccountModal" class="account-modal" style="display: none;"></div>
        <div id="editAccountModal" class="account-modal" style="display: none;"></div>
        <div id="profitSharingModal" class="modal" style="display: none;"></div>
        <div id="countrySelectionModal" class="modal" style="display: none;"></div>
        <div id="bankSelectionModal" class="modal" style="display: none;"></div>
        <div id="confirmInactiveModal" class="process-modal" style="display: none;">
            <div class="process-confirm-modal-content">
                <div class="process-confirm-icon-container">
                    <svg class="process-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 class="process-confirm-title">Confirm</h2>
                <p id="confirmInactiveMessage" class="process-confirm-message"></p>
                <div class="process-confirm-actions">
                    <button type="button" class="process-btn process-btn-cancel confirm-cancel"
                        onclick="closeConfirmInactiveModal()">Cancel</button>
                    <button type="button" id="confirmInactiveBtn" class="process-btn process-btn-inactive confirm-inactive"
                        onclick="confirmInactive()">Confirm</button>
                </div>
            </div>
        </div>
        <div id="confirmAccountingDueDeleteModal" class="process-modal" style="display: none;">
            <div class="process-confirm-modal-content">
                <div class="process-confirm-icon-container">
                    <svg class="process-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 class="process-confirm-title">Remove from Accounting Due</h2>
                <p id="confirmAccountingDueDeleteMessage" class="process-confirm-message"></p>
                <div class="process-confirm-actions">
                    <button type="button" class="process-btn process-btn-cancel confirm-cancel"
                        onclick="closeConfirmAccountingDueDeleteModal()">Cancel</button>
                    <button type="button" id="confirmAccountingDueDeleteBtn" class="process-btn process-btn-delete confirm-delete"
                        onclick="confirmAccountingDueDelete()">Delete</button>
                </div>
            </div>
        </div>
        <?php
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    require __DIR__ . '/processlist.php';
}