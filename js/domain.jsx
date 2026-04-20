(function () {
    const MAX_VISIBLE = 3;

    function asText(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function parseCompanyList(domain) {
        const raw = asText(domain.companies).trim();
        if (!raw) return [];
        return raw.split(',').map((item) => item.trim()).filter(Boolean);
    }

    function findExpirationDate(companyId, companiesFull) {
        if (!Array.isArray(companiesFull)) return '';
        const matched = companiesFull.find((company) => asText(company.company_id) === companyId);
        return matched && matched.expiration_date ? asText(matched.expiration_date) : '';
    }

    function CompanyChips({ domain }) {
        const companyList = parseCompanyList(domain);
        const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];

        if (!companyList.length) return '-';

        const visible = companyList.slice(0, MAX_VISIBLE);
        const hidden = companyList.slice(MAX_VISIBLE);

        return (
            <div className="chip-group">
                {visible.map((companyId) => {
                    const exp = findExpirationDate(companyId, companiesFull);
                    return (
                        <span key={companyId} className="chip company-badge" data-exp={exp || undefined}>
                            {companyId}
                        </span>
                    );
                })}
                {hidden.length > 0 ? (
                    <span className="chip-more" title={hidden.join(', ')}>
                        +{hidden.length}
                    </span>
                ) : null}
            </div>
        );
    }

    function DomainCard({ domain, index }) {
        const ownerCode = asText(domain.owner_code).toUpperCase();
        const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];

        return (
            <div className="domain-card" data-id={asText(domain.id)}>
                <div className="card-item">{index + 1}</div>
                <div className="card-item uppercase-text">{ownerCode}</div>
                <div className="card-item">{asText(domain.name)}</div>
                <div className="card-item">{asText(domain.email)}</div>
                <div className="card-item">{asText(domain.group_ids) || '-'}</div>
                <div className="card-item companies-column" data-companies={JSON.stringify(companiesFull)}>
                    <CompanyChips domain={domain} />
                </div>
                <div className="card-item uppercase-text">{asText(domain.created_by || '-').toUpperCase()}</div>
                <div className="card-item">
                    <button
                        className="btn btn-edit edit-btn"
                        onClick={() => window.editDomain && window.editDomain(domain.id)}
                        aria-label="Edit"
                    >
                        <img src="images/edit.svg" alt="Edit" />
                    </button>
                    {ownerCode !== 'K' ? (
                        <input
                            type="checkbox"
                            className="domain-checkbox"
                            value={asText(domain.id)}
                            onChange={() => window.updateDeleteButton && window.updateDeleteButton()}
                        />
                    ) : null}
                </div>
            </div>
        );
    }

    function DomainListApp() {
        const initialData = Array.isArray(window.DOMAIN_INITIAL_DATA) ? window.DOMAIN_INITIAL_DATA : [];
        return (
            <>
                {initialData.map((domain, index) => (
                    <DomainCard
                        key={asText(domain.id) || `${asText(domain.owner_code)}-${index}`}
                        domain={domain}
                        index={index}
                    />
                ))}
            </>
        );
    }

    const container = document.getElementById('domainTableBody');
    if (!container || !window.ReactDOM || !window.React) return;

    const root = ReactDOM.createRoot(container);
    root.render(<DomainListApp />);
})();
