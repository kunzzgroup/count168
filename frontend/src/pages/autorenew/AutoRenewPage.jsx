import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  calculateCountdown,
  calculateExpirationDate,
  formatDate,
} from "../domain/domainHelpers.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import PageContentLoader from "../../components/PageContentLoader.jsx";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { getAutoRenewText } from "../../translateFile/pages/autoRenewTranslate.js";
import {
  AUTO_RENEW_PERIODS,
  fetchAutoRenewCompanies,
  fetchAutoRenewSettings,
  saveAutoRenewSettings,
} from "./autoRenewLogic.js";
import "../../../public/css/auto_renew.css";
import "../../../public/css/domain.css";

function formatRemainingLabel(t, daysLeft) {
  if (daysLeft == null) return t("notSet");
  if (daysLeft < 0) return t("expExpired");
  if (daysLeft === 0) return t("expToday");
  return t("expDaysLeft", { days: daysLeft });
}

export default function AutoRenewPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAutoRenewText(lang, key, params), [lang]);

  const [bootDone, setBootDone] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [data, setData] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [period, setPeriod] = useState("1month");
  const [saving, setSaving] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2500);
  }, []);

  useEffect(() => {
    document.body.classList.add("auto-renew-page-active");
    return () => document.body.classList.remove("auto-renew-page-active");
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootDone(false);
    setLoadError("");

    (async () => {
      if (!me.has_c168_auto_renew_access) {
        navigate("/dashboard", { replace: true });
        return;
      }

      try {
        const listData = await fetchAutoRenewCompanies();
        if (cancelled) return;
        const rows = Array.isArray(listData?.companies) ? listData.companies : [];
        setCompanies(rows);
        if (rows.length === 0) {
          setBootDone(true);
          return;
        }
        const firstId = rows[0].company_numeric_id;
        setSelectedCompanyId(firstId);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || "load");
        setBootDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, navigate, sessionReady]);

  useEffect(() => {
    if (!selectedCompanyId) return undefined;

    let cancelled = false;
    setLoadingCompany(true);

    (async () => {
      try {
        const settings = await fetchAutoRenewSettings(selectedCompanyId);
        if (cancelled) return;
        setData(settings);
        setEnabled(Boolean(settings.auto_renew_enabled));
        setPeriod(settings.auto_renew_period || "1month");
        setBootDone(true);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message || "load");
        setBootDone(true);
      } finally {
        if (!cancelled) setLoadingCompany(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const canEdit = Boolean(data?.can_edit);
  const hasExpiration = Boolean(data?.expiration_date);
  const formDisabled = !canEdit || !hasExpiration || loadingCompany;

  const previewNext = useMemo(() => {
    if (!enabled || !period || !data?.expiration_date) return null;
    return calculateExpirationDate(period, data.expiration_date);
  }, [data?.expiration_date, enabled, period]);

  const remainingLabel = useMemo(() => {
    if (!data?.expiration_date) return t("noExpirationDate");
    const countdown = calculateCountdown(data.expiration_date);
    return countdown?.text || formatRemainingLabel(t, data.days_until_expiration);
  }, [data?.days_until_expiration, data?.expiration_date, t]);

  const statusClass = data?.expiration_status || "normal";

  const handleSave = useCallback(async () => {
    if (formDisabled || saving || !selectedCompanyId) return;
    setSaving(true);
    try {
      const saved = await saveAutoRenewSettings({
        targetCompanyId: selectedCompanyId,
        autoRenewEnabled: enabled,
        autoRenewPeriod: enabled ? period : null,
      });
      setData(saved);
      setEnabled(Boolean(saved.auto_renew_enabled));
      setPeriod(saved.auto_renew_period || "1month");
      setCompanies((prev) =>
        prev.map((row) =>
          row.company_numeric_id === selectedCompanyId
            ? { ...row, auto_renew_enabled: saved.auto_renew_enabled, auto_renew_period: saved.auto_renew_period }
            : row,
        ),
      );
      notify(t("saved"), "success");
    } catch (err) {
      notify(t("saveFailed", { message: err.message }), "error");
    } finally {
      setSaving(false);
    }
  }, [enabled, formDisabled, notify, period, saving, selectedCompanyId, t]);

  if (!sessionReady || !bootDone) {
    return <PageContentLoader />;
  }

  if (loadError) {
    return (
      <div className="auto-renew-page">
        <h1 className="auto-renew-page-title">{t("pageTitle")}</h1>
        <div className="auto-renew-notice warn">{t("loadFailed", { message: loadError })}</div>
        <button type="button" className="auto-renew-btn auto-renew-btn-secondary" onClick={() => navigate("/dashboard")}>
          {t("backDashboard")}
        </button>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="auto-renew-page">
        <h1 className="auto-renew-page-title">{t("pageTitle")}</h1>
        <div className="auto-renew-notice warn">{t("noCompanies")}</div>
        <button type="button" className="auto-renew-btn auto-renew-btn-secondary" onClick={() => navigate("/dashboard")}>
          {t("backDashboard")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="auto-renew-toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`auto-renew-toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      <div className="auto-renew-page">
        <h1 className="auto-renew-page-title">{t("pageTitle")}</h1>

        <section className="auto-renew-card">
          <h2 className="auto-renew-card-title">{t("selectCompanyTitle")}</h2>
          <div className="auto-renew-field">
            <label className="auto-renew-field-label" htmlFor="autoRenewCompanySelect">
              {t("company")}
            </label>
            <select
              id="autoRenewCompanySelect"
              className="auto-renew-period-select auto-renew-company-select"
              value={selectedCompanyId ?? ""}
              onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
            >
              {companies.map((row) => (
                <option key={row.company_numeric_id} value={row.company_numeric_id}>
                  {row.company_code}
                  {row.auto_renew_enabled ? ` (${t("autoRenewOnShort")})` : ""}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="auto-renew-card">
          <h2 className="auto-renew-card-title">{t("subscriptionInfo")}</h2>
          <div className="auto-renew-info-grid">
            <span className="auto-renew-info-label">{t("company")}</span>
            <span className="auto-renew-info-value">{data?.company_code || "-"}</span>

            <span className="auto-renew-info-label">{t("expirationDate")}</span>
            <span className="auto-renew-info-value">
              {data?.expiration_date ? formatDate(data.expiration_date) : t("notSet")}
            </span>

            <span className="auto-renew-info-label">{t("timeRemaining")}</span>
            <span className="auto-renew-info-value">
              <span className={`auto-renew-status-badge ${statusClass}`}>{remainingLabel}</span>
            </span>
          </div>
        </section>

        {!hasExpiration && (
          <div className="auto-renew-notice warn">{t("noDateNotice")}</div>
        )}

        {!canEdit && (
          <div className="auto-renew-notice info">{t("readOnlyNotice")}</div>
        )}

        <section className="auto-renew-card">
          <h2 className="auto-renew-card-title">{t("autoRenewSettings")}</h2>

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
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="company-share-charge-switch__track" aria-hidden="true">
                  <span className="company-share-charge-switch__thumb" />
                </span>
              </label>
            </div>
          </div>
          <p className="auto-renew-hint">{t("enableAutoRenewHint")}</p>

          <div className="auto-renew-field">
            <label className="auto-renew-field-label" htmlFor="autoRenewPeriod">
              {t("renewalPeriod")}
            </label>
            <select
              id="autoRenewPeriod"
              className="auto-renew-period-select"
              value={period}
              disabled={formDisabled || !enabled}
              onChange={(e) => setPeriod(e.target.value)}
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
                from: formatDate(data.expiration_date),
                to: formatDate(previewNext),
              })
            ) : (
              t("previewNeedPeriod")
            )}
          </div>

          {data?.auto_renew_updated_at && (
            <p className="auto-renew-meta">
              {t("lastUpdated", {
                at: data.auto_renew_updated_at,
                by: data.auto_renew_updated_by || "-",
              })}
            </p>
          )}

          {canEdit && hasExpiration && (
            <div className="auto-renew-actions">
              <button
                type="button"
                className="auto-renew-btn auto-renew-btn-primary"
                disabled={saving || loadingCompany || (enabled && !period)}
                onClick={handleSave}
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
