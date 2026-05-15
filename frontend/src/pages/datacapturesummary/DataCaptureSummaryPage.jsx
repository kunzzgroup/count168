import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import { injectStylesheet } from "../../utils/injectStylesheet.js";

import "../../../public/css/accountCSS.css";
import "../../../public/css/datacapturesummary.css";
import "../../../public/css/global-13inch.css";

/** Avoid hanging when `load` already fired before listeners attach (SPA revisit / cache). */
function loadScriptOnce(src, isAlreadyLoaded) {
  return new Promise((resolve, reject) => {
    const clean = src.split(/[?#]/)[0];
    const finish = (node) => {
      node.dataset.loaded = "1";
      resolve();
    };
    const nodes = document.querySelectorAll("script[src]");
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const ns = n.getAttribute("src") || "";
      if (ns.split(/[?#]/)[0] !== clean) continue;
      if (n.dataset.loaded === "1") {
        resolve();
        return;
      }
      n.addEventListener("load", () => finish(n), { once: true });
      n.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      queueMicrotask(() => {
        if (n.dataset.loaded === "1") return;
        if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) finish(n);
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => finish(s);
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

const CAPTURE_STORAGE_KEYS = [
  "capturedTableData",
  "capturedProcessData",
  "capturedDataCaptureType",
  "capturedFormatPreviewHtml",
  "captured655PreviewHtml",
  "capturedTableRateValues",
  "capturedTableFormulaSourceForRefresh",
  "capturedCaptureId",
];

export default function DataCaptureSummaryPage() {
  const navigate = useNavigate();
  const [bootLoading, setBootLoading] = useState(true);
  const [engineError, setEngineError] = useState("");
  const [companyId, setCompanyId] = useState(null);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page", "datacapture-page");
    document.body.classList.add("dashboard-page");
    return () => {
      document.body.classList.remove("page-ready");
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
      } catch {
        /* ignore */
      }
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!alive) return;
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const id = meJson.data.company_id != null ? Number(meJson.data.company_id) : null;
        setCompanyId(Number.isFinite(id) ? id : null);
      } catch {
        if (!alive) return;
        navigate("/login", { replace: true });
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  /** Match legacy PHP: sidebar Data Capture title starts a fresh capture round */
  useEffect(() => {
    function navigateToDataCaptureFresh() {
      window.isNavigatingAwayByBackOrSubmit = true;
      try {
        for (const k of CAPTURE_STORAGE_KEYS) localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      window.location.assign(buildApiUrl("datacapture"));
    }

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const dcSection = document.getElementById("sidebar-datacapture-section");
      const dcTitle = dcSection?.querySelector(".informationmenu-section-title");
      if (dcTitle && dcTitle.dataset.summaryFreshNavBound !== "1") {
        dcTitle.dataset.summaryFreshNavBound = "1";
        dcTitle.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigateToDataCaptureFresh();
          },
          true
        );
        window.clearInterval(timer);
      }
      if (tries >= 50) window.clearInterval(timer);
    }, 100);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (bootLoading) return;

    let alive = true;
    window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = true;
    window.DATACAPTURESUMMARY_COMPANY_ID = companyId != null ? companyId : null;

    setEngineError("");

    (async () => {
      try {
        await loadScriptOnce(buildApiUrl("js/decimal.min.js"), () => typeof window.Decimal !== "undefined");
        await loadScriptOnce(buildApiUrl("js/money-decimal.js"), () => typeof window.MoneyDecimal !== "undefined");
        await loadScriptOnce(buildApiUrl("js/datacapturesummary.js"), () => typeof window.initDataCaptureSummaryPage === "function");
        if (!alive) return;
        if (typeof window.initDataCaptureSummaryPage === "function") {
          window.initDataCaptureSummaryPage();
        }
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setEngineError("Failed to load Data Capture Summary scripts.");
      }
    })();

    return () => {
      alive = false;
      window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = false;
    };
  }, [bootLoading, companyId]);

  const alertDayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

  if (bootLoading) {
    return (
      <div className="container">
        <p style={{ padding: "24px", margin: 0 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Data Capture Summary</h1>

      {engineError ? (
        <div style={{ marginBottom: 12, color: "#b91c1c" }} role="alert">
          {engineError}
        </div>
      ) : null}

      <div id="loadingState" className="loading-container">
        <div className="loading-spinner" />
        <p>Loading data...</p>
      </div>

      <div className="summary-action-buttons" id="actionButtons" style={{ display: "none" }}>
        <div style={{ flex: 1 }} />
        <div className="batch-controls-group">
          <label htmlFor="rateInput" className="batch-label">
            Rate
          </label>
          <input type="text" id="rateInput" className="batch-input" placeholder="e.g. *3 or /3" />
          <button type="button" className="btn-update-all" id="rateSelectAllBtn" onClick={(e) => window.toggleAllRate?.(e.currentTarget)}>
            Select All
          </button>
          <button type="button" className="btn-update-all" id="topSubmitBtn" onClick={() => window.submitRateValues?.()}>
            Submit
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="summary-btn summary-btn-delete"
          id="summaryDeleteSelectedBtn"
          onClick={() => window.deleteSelectedRows?.()}
          title="Delete selected rows"
          disabled
        >
          Delete
        </button>
      </div>

      <div className="summary-table-container" id="summaryTableContainer" style={{ display: "none" }}>
        <div className="process-info-container" id="processInfoContainer" style={{ display: "none" }}>
          <div className="process-info-row">
            <div className="process-info-item">
              <span className="process-info-label">Date:</span>
              <span className="process-info-value" id="processInfoDate">
                -
              </span>
            </div>
            <div className="process-info-item">
              <span className="process-info-label">Process:</span>
              <span className="process-info-value" id="processInfoProcess">
                -
              </span>
            </div>
            <div className="process-info-item">
              <span className="process-info-label">Description:</span>
              <span className="process-info-value" id="processInfoDescription">
                -
              </span>
            </div>
            <div className="process-info-item">
              <span className="process-info-label">Currency:</span>
              <span className="process-info-value" id="processInfoCurrency">
                -
              </span>
            </div>
            <div className="process-info-item">
              <span className="process-info-label">Remark:</span>
              <span className="process-info-value" id="processInfoRemark">
                -
              </span>
            </div>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="summary-table" id="summaryTable">
            <thead>
              <tr>
                <th className="id-product-header">Id Product</th>
                <th>Account</th>
                <th />
                <th>Currency</th>
                <th>Formula</th>
                <th>Source</th>
                <th>Rate</th>
                <th>Rate Value</th>
                <th>Processed Amount</th>
                <th>Skip</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody id="summaryTableBody" />
            <tfoot>
              <tr id="summaryTotalRow">
                <td colSpan={8} className="summary-total-label" />
                <td id="summaryTotalAmount">0.00</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="summary-submit-container" id="summarySubmitContainer" style={{ display: "none" }}>
        <button type="button" className="btn btn-submit" id="summarySubmitBtn" onClick={() => window.submitSummaryData?.()}>
          Submit
        </button>
        <button type="button" className="btn btn-cancel" onClick={() => window.goBackToDataCapture?.()} style={{ marginLeft: 10 }}>
          Back
        </button>
        <button type="button" className="btn btn-refresh" onClick={() => window.refreshPage?.()} title="Refresh page">
          <img src={assetUrl("images/refresh.svg")} alt="Refresh" style={{ width: "clamp(23px, 1.8vw, 35px)", height: "clamp(23px, 1.8vw, 35px)" }} />
        </button>
      </div>

      <div id="notificationPopup" className="notification-popup" style={{ display: "none" }}>
        <div className="notification-header">
          <span className="notification-title" id="notificationTitle">
            Notification
          </span>
          <button type="button" className="notification-close" onClick={() => window.hideNotification?.()}>
            &times;
          </button>
        </div>
        <div className="notification-message" id="notificationMessage">
          Message
        </div>
      </div>

      <div id="confirmDeleteModal" className="summary-modal" style={{ display: "none" }}>
        <div className="summary-confirm-modal-content">
          <div className="summary-confirm-icon-container">
            <svg className="summary-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="summary-confirm-title">Confirm Delete</h2>
          <p id="confirmDeleteMessage" className="summary-confirm-message">
            This action cannot be undone.
          </p>
          <div className="summary-confirm-actions">
            <button type="button" className="summary-btn summary-btn-cancel confirm-cancel" onClick={() => window.closeConfirmDeleteModal?.()}>
              Cancel
            </button>
            <button type="button" className="summary-btn summary-btn-delete confirm-delete" onClick={() => window.confirmDelete?.()}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <div id="addModal" className="account-modal" style={{ display: "none" }}>
        <div className="account-modal-content">
          <div className="account-modal-header">
            <h2>Add Account</h2>
            <span className="account-close" role="presentation" onClick={() => window.closeAddModal?.()}>
              &times;
            </span>
          </div>
          <div className="account-modal-body">
            <form id="addAccountForm" className="account-form">
              <div className="account-form-columns">
                <div className="account-form-column">
                  <h3 className="account-section-header">Personal Information</h3>
                  <div className="account-form-group">
                    <label htmlFor="add_account_id">Account ID *</label>
                    <input type="text" id="add_account_id" name="account_id" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_name">Name *</label>
                    <input type="text" id="add_name" name="name" required />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_role">Role *</label>
                    <select id="add_role" name="role" required defaultValue="">
                      <option value="">Select Role</option>
                    </select>
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_password">Password *</label>
                    <input type="password" id="add_password" name="password" required autoComplete="new-password" />
                  </div>
                </div>

                <div className="account-form-column">
                  <h3 className="account-section-header">Payment</h3>
                  <div className="account-form-group" />
                  <div className="account-form-group">
                    <label>Payment Alert</label>
                    <div className="account-radio-group">
                      <label className="account-radio-label">
                        <input type="radio" name="add_payment_alert" value="1" />
                        Yes
                      </label>
                      <label className="account-radio-label">
                        <input type="radio" name="add_payment_alert" value="0" defaultChecked />
                        No
                      </label>
                    </div>
                  </div>
                  <div className="account-form-row" id="add_alert_fields" style={{ display: "none" }}>
                    <div className="account-form-group">
                      <label htmlFor="add_alert_type">Alert Type</label>
                      <select id="add_alert_type" name="alert_type" defaultValue="">
                        <option value="">Select Type</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        {alertDayOptions.map((d) => (
                          <option key={d} value={String(d)}>
                            {d} Days
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="add_alert_start_date">Start Date</label>
                      <input type="date" id="add_alert_start_date" name="alert_start_date" />
                    </div>
                  </div>
                  <div className="account-form-group" id="add_alert_amount_row" style={{ display: "none" }}>
                    <label htmlFor="add_alert_amount">Alert (Amount)</label>
                    <input type="number" id="add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)" />
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_remark">Remark</label>
                    <textarea id="add_remark" name="remark" rows={1} style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} />
                  </div>
                </div>
              </div>

              <div className="account-form-section">
                <div className="account-advance-section">
                  <h3>Advanced Account</h3>

                  <div className="account-other-currency">
                    <label>Other Currency:</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <input
                        type="text"
                        id="addCurrencyInput"
                        placeholder="Enter new currency code (e.g., EUR, JPY, GBP)"
                        style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
                      />
                      <button type="button" className="account-btn-add-currency" onClick={() => window.addCurrencyFromInput?.("add")}>
                        Create Currency
                      </button>
                    </div>
                    <div className="account-currency-list" id="addCurrencyList" />
                  </div>

                  <div className="account-other-currency" style={{ marginTop: 20 }}>
                    <label>Company:</label>
                    <div className="account-currency-list" id="addCompanyList" />
                  </div>
                </div>
              </div>

              <div className="account-form-actions">
                <button type="submit" className="account-btn account-btn-save">
                  Add Account
                </button>
                <button type="button" className="account-btn account-btn-cancel" onClick={() => window.closeAddModal?.()}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
