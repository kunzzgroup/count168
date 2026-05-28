import { useState, useEffect, useMemo } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import {
  formatDomainFeeDisplay2,
  formatDomainFeeEdit2,
  DOMAIN_FEE_PERIOD_KEYS,
  defaultDomainPeriodPrices,
  normalizeDomainPeriodPricesFromApi,
} from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/pages/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Fee Settings Modal — default amount per billing period (C168 admin)
 * Props:
 *   onClose()
 *   onFeeSaved(data) — { period_prices, company_price, group_price, price }
 */
const FEE_MODAL_OVERLAY_Z = 2147482998;

const PERIOD_LABEL_KEYS = {
  "7days": "sevenDays",
  "1month": "oneMonth",
  "3months": "threeMonths",
  "6months": "sixMonths",
  "1year": "oneYear",
};

function resolveFeeEditValue(raw) {
  const formatted = formatDomainFeeEdit2(raw);
  return formatted;
}

export default function DomainFeeModal({ onClose, onFeeSaved, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const [periodPrices, setPeriodPrices] = useState(defaultDomainPeriodPrices);

  useEffect(() => {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_domain_fee_settings" }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const normalized = normalizeDomainPeriodPricesFromApi(res.data);
          const next = {};
          DOMAIN_FEE_PERIOD_KEYS.forEach((key) => {
            const raw = normalized[key];
            next[key] = raw !== "" ? resolveFeeEditValue(raw) : "";
          });
          setPeriodPrices(next);
        } else {
          showDomainAlert(res.message || t("couldNotLoadSettings"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("couldNotLoadSettings"), "danger"));
  }, [lang]);

  const displayRows = useMemo(() => {
    const items = DOMAIN_FEE_PERIOD_KEYS.map((key) => ({
      key,
      label: t(PERIOD_LABEL_KEYS[key]),
      value: formatDomainFeeDisplay2(periodPrices[key]),
    }));
    return [items.slice(0, 3), items.slice(3)];
  }, [periodPrices, lang]);

  function updatePeriod(key, value) {
    setPeriodPrices((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_domain_fee_settings",
        period_prices: periodPrices,
        company_price: periodPrices["6months"] ?? "",
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          showDomainAlert(res.message || t("saved"));
          if (res.data) onFeeSaved(res.data);
          onClose();
        } else {
          showDomainAlert(res.message || t("saveFailed"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("saveFailed"), "danger"));
  }

  return (
    <DomainModalPortal>
      <div
        className="domain-fee-react-overlay"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: FEE_MODAL_OVERLAY_Z,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="domain-fee-react-modal modal-content domain-fee-react-modal--periods">
          <div className="modal-header domain-fee-modal-header">
            <h2>{t("price")}</h2>
            <button type="button" className="account-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="domain-fee-description">{t("priceDescription")}</p>

            <div className="domain-fee-summary-display" aria-live="polite">
              <div className="domain-fee-summary-display-title">{t("displayPrices")}</div>
              {displayRows.map((row, rowIdx) => (
                <div key={rowIdx} className="domain-fee-period-display-row">
                  {row.map(({ key, label, value }) => (
                    <div key={key} className="domain-fee-period-display-item">
                      <span className="domain-fee-period-display-label">{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <p className="domain-fee-edit-hint">{t("editPeriodHint")}</p>
            <div className="domain-fee-period-edit-grid">
              {DOMAIN_FEE_PERIOD_KEYS.map((key) => (
                <div key={key} className="form-group domain-fee-period-form-group">
                  <label htmlFor={`domainFeePeriod_${key}`}>{t(PERIOD_LABEL_KEYS[key])}</label>
                  <input
                    type="number"
                    id={`domainFeePeriod_${key}`}
                    className="form-group-input domain-fee-period-input"
                    step="0.01"
                    placeholder={t("pricePlaceholder")}
                    value={periodPrices[key] ?? ""}
                    onChange={(e) => updatePeriod(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-save" onClick={handleSave}>
                {t("save")}
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}
