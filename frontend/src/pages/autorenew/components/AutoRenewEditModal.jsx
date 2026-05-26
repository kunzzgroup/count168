import { useEffect } from "react";
import { calculateExpirationDate, formatDate } from "../../domain/domainHelpers.js";
import { AUTO_RENEW_PERIODS } from "../autoRenewLogic.js";
import { periodToLabelKey } from "../autoRenewPageHelpers.js";

export default function AutoRenewEditModal({
  open,
  row,
  enabled,
  period,
  saving,
  canEdit,
  onEnabledChange,
  onPeriodChange,
  onClose,
  onSave,
  t,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !row) return null;

  const hasExpiration = Boolean(row.expiration_date);
  const formDisabled = !canEdit || !hasExpiration || saving;
  const previewNext =
    enabled && period && row.expiration_date
      ? calculateExpirationDate(period, row.expiration_date)
      : null;

  return (
    <div
      className="auto-renew-modal-overlay"
      aria-hidden="false"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auto-renew-modal" role="dialog" aria-labelledby="autoRenewModalTitle">
        <div className="auto-renew-modal-header">
          <h2 id="autoRenewModalTitle">{t("editAutoRenewTitle", { company: row.company_code })}</h2>
          <button type="button" className="account-close" aria-label={t("close")} onClick={onClose} />
        </div>

        <div className="auto-renew-modal-body">
          <div className="auto-renew-info-grid auto-renew-info-grid--modal">
            <span className="auto-renew-info-label">{t("company")}</span>
            <span className="auto-renew-info-value">{row.company_code}</span>
            <span className="auto-renew-info-label">{t("expirationDate")}</span>
            <span className="auto-renew-info-value">
              {row.expiration_date ? formatDate(row.expiration_date) : t("notSet")}
            </span>
          </div>

          {!hasExpiration && (
            <div className="auto-renew-notice warn">{t("noDateNotice")}</div>
          )}

          <div className="auto-renew-toggle-row">
            <span className="auto-renew-toggle-label">{t("enableAutoRenew")}</span>
            <div className="auto-renew-toggle-controls">
              <span className={`auto-renew-toggle-state${enabled ? " is-on" : ""}`}>
                {enabled ? t("autoRenewOn") : t("autoRenewOff")}
              </span>
              <label className="company-share-charge-switch">
                <input
                  type="checkbox"
                  className="company-share-charge-switch__input"
                  role="switch"
                  aria-label={t("enableAutoRenew")}
                  checked={enabled}
                  disabled={formDisabled}
                  onChange={(e) => onEnabledChange(e.target.checked)}
                />
                <span className="company-share-charge-switch__track" aria-hidden="true">
                  <span className="company-share-charge-switch__thumb" />
                </span>
              </label>
            </div>
          </div>
          <p className="auto-renew-hint">{t("enableAutoRenewHint")}</p>

          <div className="auto-renew-field">
            <label className="auto-renew-field-label" htmlFor="autoRenewModalPeriod">
              {t("renewalPeriod")}
            </label>
            <select
              id="autoRenewModalPeriod"
              className="auto-renew-period-select auto-renew-period-select--modal"
              value={period}
              disabled={formDisabled || !enabled}
              onChange={(e) => onPeriodChange(e.target.value)}
            >
              <option value="">{t("selectPeriod")}</option>
              {AUTO_RENEW_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="auto-renew-preview">
            <strong>{t("previewTitle")}: </strong>
            {previewNext ? (
              t("previewExtend", {
                from: formatDate(row.expiration_date),
                to: formatDate(previewNext),
              })
            ) : (
              t("previewNeedPeriod")
            )}
          </div>

          {row.auto_renew_updated_at && (
            <p className="auto-renew-meta">
              {t("lastUpdated", {
                at: row.auto_renew_updated_at,
                by: row.auto_renew_updated_by || "-",
              })}
            </p>
          )}
        </div>

        <div className="auto-renew-modal-footer">
          <button type="button" className="auto-renew-btn auto-renew-btn-secondary" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </button>
          {canEdit && hasExpiration && (
            <button
              type="button"
              className="auto-renew-btn auto-renew-btn-primary"
              disabled={formDisabled || (enabled && !period)}
              onClick={onSave}
            >
              {saving ? t("saving") : t("save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AutoRenewPeriodCell({ period, t }) {
  const key = periodToLabelKey(period);
  if (!key) return <span className="auto-renew-table-muted">-</span>;
  return <span>{t(key)}</span>;
}
