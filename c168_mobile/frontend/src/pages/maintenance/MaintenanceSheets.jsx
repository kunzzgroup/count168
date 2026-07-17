import { useEffect, useState } from "react";

function Sheet({ open, title, onClose, children, footer = null }) {
  return (
    <div
      className={`m-sheet-overlay m-sheet-overlay--high${
        open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"
      }`}
      aria-hidden={!open}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <div
        className={`m-sheet-panel m-sheet-panel--tall${
          open ? " m-sheet-panel--open" : " m-sheet-panel--closed"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title m-sheet-title--bold">{title}</h2>
          <button
            type="button"
            className="m-sheet-close tap-scale"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-mt-sheet-body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

/** Company / group scope picker. */
export function MaintenanceScopeSheet({
  open,
  onClose,
  i18n,
  companies,
  groupIds,
  companyId,
  groupMode,
  selectedGroup,
  allowGroup,
  onApply,
}) {
  const pickable = (companies || []).filter(
    (c) => c?.company_id && String(c.company_id).trim() !== "",
  );

  const choose = async (draft) => {
    const ok = await onApply(draft);
    if (ok) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={i18n.selectScope}>
      {allowGroup && groupIds.length > 0 ? (
        <section className="m-mt-scope-section">
          <p className="m-mt-scope-label">{i18n.group}</p>
          {groupIds.map((gid) => (
            <button
              key={`g-${gid}`}
              type="button"
              className={`m-mt-scope-row tap-scale${
                groupMode && selectedGroup === gid ? " is-active" : ""
              }`}
              onClick={() => choose({ mode: "group", groupId: gid })}
            >
              <span>
                <i className="fas fa-layer-group" aria-hidden="true" /> {gid}
              </span>
              <small>{i18n.groupAggregate}</small>
            </button>
          ))}
        </section>
      ) : null}

      <section className="m-mt-scope-section">
        <p className="m-mt-scope-label">{i18n.company}</p>
        {pickable.map((c) => {
          const active = !groupMode && Number(c.id) === Number(companyId);
          return (
            <button
              key={`c-${c.id}`}
              type="button"
              className={`m-mt-scope-row tap-scale${active ? " is-active" : ""}`}
              onClick={() => choose({ mode: "company", companyId: Number(c.id) })}
            >
              <span>
                <i className="fas fa-building" aria-hidden="true" />{" "}
                {String(c.company_id).toUpperCase()}
              </span>
              {c.group_id ? <small>{String(c.group_id).toUpperCase()}</small> : null}
            </button>
          );
        })}
      </section>
    </Sheet>
  );
}

/** Date range (+ optional extra controls) filter sheet. */
export function MaintenanceFilterSheet({
  open,
  onClose,
  i18n,
  dateFrom,
  dateTo,
  onApply,
  readOnlyNote = false,
  children,
}) {
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);

  useEffect(() => {
    if (open) {
      setFrom(dateFrom);
      setTo(dateTo);
    }
  }, [open, dateFrom, dateTo]);

  const apply = () => {
    if (!from || !to) return;
    onApply({ dateFrom: from, dateTo: to });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={i18n.filter}
      footer={
        <div className="m-sheet-footer">
          <button
            type="button"
            className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale"
            onClick={onClose}
          >
            {i18n.cancel}
          </button>
          <button
            type="button"
            className="m-sheet-footer-btn m-sheet-footer-btn--primary tap-scale"
            onClick={apply}
          >
            {i18n.showResults}
          </button>
        </div>
      }
    >
      <div className="m-mt-filter-section">
        <p className="m-mt-scope-label">{i18n.dateRange}</p>
        <div className="m-mt-date-grid">
          <label className="m-mt-field">
            <span>{i18n.dateFrom}</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="m-mt-field">
            <span>{i18n.dateTo}</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      {children}

      {readOnlyNote ? (
        <p className="m-mt-readonly-note">
          <i className="fas fa-circle-info" aria-hidden="true" /> {i18n.readOnlyNote}
        </p>
      ) : null}
    </Sheet>
  );
}
