function initSharedCompanyFilter() {
    const hub = document.getElementById('company-buttons-container');
    if (!hub || hub.dataset.sharedFilterBound === '1') return;
    hub.dataset.sharedFilterBound = '1';

    const groupBtns = document.querySelectorAll('.shared-group-btn');
    const companyBtns = document.querySelectorAll('.shared-company-btn');

    // 处理当前选中组的状态
    const activeGroupBtn = document.querySelector('.shared-group-btn.active');
    let currentSelectedGroup = activeGroupBtn ? activeGroupBtn.getAttribute('data-group-id') : null;

    groupBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const clickedGroup = this.getAttribute('data-group-id');

            if (currentSelectedGroup === clickedGroup) {
                currentSelectedGroup = null;
                sessionStorage.removeItem('dashboard_group_filter');
                groupBtns.forEach(b => b.classList.remove('active'));

                companyBtns.forEach(cBtn => {
                    const cGroupId = cBtn.getAttribute('data-group-id');
                    if (!cGroupId || cGroupId.trim() === '') {
                        cBtn.style.display = '';
                    } else {
                        cBtn.style.display = 'none';
                    }
                });

                triggerFirstVisibleCompany();
            } else {
                currentSelectedGroup = clickedGroup;
                sessionStorage.setItem('dashboard_group_filter', currentSelectedGroup);

                groupBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                companyBtns.forEach(cBtn => {
                    const cGroupId = cBtn.getAttribute('data-group-id');
                    if (cGroupId === currentSelectedGroup) {
                        cBtn.style.display = '';
                    } else {
                        cBtn.style.display = 'none';
                    }
                });

                triggerFirstVisibleCompany();
            }
        });
    });

    companyBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            if (this.style.display === 'none') return;

            const companyId = this.getAttribute('data-company-id');
            const companyCode = this.getAttribute('data-company-code');

            companyBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            if (typeof window.onSharedCompanyFilterChanged === 'function') {
                window.onSharedCompanyFilterChanged(companyId, companyCode);
            }
        });
    });

    function triggerFirstVisibleCompany() {
        let firstVisible = null;
        for (let i = 0; i < companyBtns.length; i++) {
            if (companyBtns[i].style.display !== 'none') {
                firstVisible = companyBtns[i];
                break;
            }
        }

        if (firstVisible) {
            companyBtns.forEach(b => b.classList.remove('active'));
            firstVisible.classList.add('active');

            const companyId = firstVisible.getAttribute('data-company-id');
            const companyCode = firstVisible.getAttribute('data-company-code');

            if (typeof window.onSharedCompanyFilterChanged === 'function') {
                window.onSharedCompanyFilterChanged(companyId, companyCode);
            }
        } else {
            if (typeof window.onSharedCompanyFilterChanged === 'function') {
                window.onSharedCompanyFilterChanged(null, null);
            }
        }
    }
}

window.initSharedCompanyFilter = initSharedCompanyFilter;

function scheduleSharedCompanyFilterInit() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function onDcl() {
            document.removeEventListener('DOMContentLoaded', onDcl);
            initSharedCompanyFilter();
        });
    } else {
        initSharedCompanyFilter();
    }
}

scheduleSharedCompanyFilterInit();
