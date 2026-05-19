import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { injectStylesheet } from "../../utils/injectStylesheet.js";
import SummaryProcessInfo from "./components/SummaryProcessInfo.jsx";
import SummaryTable, { SummaryEmptyState } from "./components/SummaryTable.jsx";
import EditFormulaModalHost from "./components/EditFormulaModalHost.jsx";
import SummaryActionBar from "./components/SummaryActionBar.jsx";
import SummarySubmitBar from "./components/SummarySubmitBar.jsx";
import SummaryNotification from "./components/SummaryNotification.jsx";
import SummaryConfirmDeleteModal from "./components/SummaryConfirmDeleteModal.jsx";
import { useSummaryBoot } from "./hooks/useSummaryBoot.js";
import { useSummaryCaptureBootstrap } from "./hooks/useSummaryCaptureBootstrap.js";
import { useSummaryRows } from "./hooks/useSummaryRows.js";
import { useSummaryPageActions } from "./hooks/useSummaryPageActions.js";
import { useSummaryOverlays } from "./hooks/useSummaryOverlays.js";
import {
  useSummaryTableBridge,
  showSummarySuccessNotificationIfNeededFromReact,
} from "./hooks/useSummaryTableBridge.js";
import { clearSummaryCaptureRoundStorage } from "./summaryStorage.js";

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
      if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) {
        finish(n);
        return;
      }
      n.addEventListener("load", () => finish(n), { once: true });
      n.addEventListener(
        "error",
        () => {
          n.remove();
          loadScriptOnce(src, isAlreadyLoaded).then(resolve).catch(reject);
        },
        { once: true }
      );
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

export default function DataCaptureSummaryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { companyId, bootLoading: sessionBootLoading, bootError } = useSummaryBoot();

  const [scriptsReady, setScriptsReady] = useState(false);
  const [engineError, setEngineError] = useState("");

  const sessionReady = !sessionBootLoading && !bootError && companyId != null;

  const capture = useSummaryCaptureBootstrap({
    companyId,
    searchParams,
    enabled: sessionReady,
  });

  const { rows: summaryRows, syncFromDom } = useSummaryRows(
    capture.transformedTableData,
    capture.hasCaptureData
  );

  useSummaryTableBridge({
    tableData: capture.transformedTableData,
    hasCaptureData: capture.hasCaptureData,
    processData: capture.processData,
    syncFromDom,
  });

  const pageActions = useSummaryPageActions({ companyId, scriptsReady });
  const overlays = useSummaryOverlays();

  const showEmptyState =
    sessionReady &&
    scriptsReady &&
    !engineError &&
    !capture.hasCaptureData &&
    !capture.serverStateLoading;

  const hydrateRef = useRef(capture.hydrateLegacyGlobals);
  hydrateRef.current = capture.hydrateLegacyGlobals;

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page", "datacapture-page");
    document.body.classList.add("dashboard-page");
    return () => {
      document.body.classList.remove("page-ready");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    let alive = true;
    window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = true;
    setEngineError("");
    setScriptsReady(false);

    (async () => {
      try {
        await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
      } catch {
        /* ignore */
      }

      try {
        await Promise.all([
          loadScriptOnce(buildApiUrl("js/decimal.min.js"), () => typeof window.Decimal !== "undefined"),
          loadScriptOnce(buildApiUrl("js/money-decimal.js"), () => typeof window.MoneyDecimal !== "undefined"),
          loadScriptOnce(buildApiUrl("js/datacapturesummary.js"), () => typeof window.initDataCaptureSummaryPage === "function"),
        ]);
        if (alive) setScriptsReady(true);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setEngineError("Failed to load Data Capture Summary scripts.");
      }
    })();

    return () => {
      alive = false;
      setScriptsReady(false);
      window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = false;
    };
  }, [sessionReady]);

  /** Hydrate React-loaded capture state, then run legacy table init after full shell mounts. */
  useEffect(() => {
    if (!sessionReady || !scriptsReady || engineError) return;
    if (capture.hasCaptureData && capture.serverStateLoading) return;

    let cancelled = false;
    const runInit = () => {
      if (cancelled) return;
      hydrateRef.current();
      showSummarySuccessNotificationIfNeededFromReact();
      const shell = document.querySelector(".container");
      if (shell) delete shell.dataset.summaryPageInit;
      if (typeof window.initDataCaptureSummaryPage === "function") {
        window.initDataCaptureSummaryPage();
      }
    };

    const id = requestAnimationFrame(runInit);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [
    sessionReady,
    scriptsReady,
    engineError,
    capture.hasCaptureData,
    capture.serverStateLoading,
    capture.serverState,
  ]);

  /** Sidebar Data Capture → fresh capture round (SPA navigate). */
  useEffect(() => {
    function navigateToDataCaptureFresh() {
      window.isNavigatingAwayByBackOrSubmit = true;
      clearSummaryCaptureRoundStorage();
      navigate("/datacapture", { replace: true });
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
  }, [navigate]);

  const alertDayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
  const pageBootLoading = sessionBootLoading || (sessionReady && !scriptsReady && !engineError);

  if (pageBootLoading) {
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

      <SummaryActionBar
        rateInput={pageActions.rateInput}
        onRateInputChange={pageActions.setRateInput}
        rateSelectAllLabel={pageActions.rateSelectAllLabel}
        rateSelectAllRef={pageActions.rateSelectAllRef}
        onToggleRateSelectAll={pageActions.handleToggleRateSelectAll}
        onRateBatchSubmit={pageActions.handleRateBatchSubmit}
        deleteCount={pageActions.deleteCount}
        deleteDisabled={pageActions.deleteDisabled}
        onDeleteSelected={pageActions.handleDeleteSelected}
      />

      <div className="summary-table-container" id="summaryTableContainer" style={{ display: "none" }}>
        <SummaryProcessInfo processData={capture.processData} visible={capture.hasCaptureData} />
        <SummaryTable
          tableData={capture.transformedTableData}
          rows={summaryRows}
          visible={capture.hasCaptureData}
        />
      </div>

      {showEmptyState ? <SummaryEmptyState /> : null}

      <EditFormulaModalHost />

      <SummarySubmitBar
        submitting={pageActions.submitting}
        onSubmit={pageActions.handleSubmitSummary}
        onBack={pageActions.handleBack}
        onRefresh={pageActions.handleRefresh}
      />

      <SummaryNotification
        notification={overlays.notification}
        shown={overlays.notificationShown}
        onClose={overlays.hideNotification}
      />

      <SummaryConfirmDeleteModal
        open={overlays.confirmOpen}
        message={overlays.confirmMessage}
        onCancel={overlays.closeConfirmDelete}
        onConfirm={overlays.confirmDelete}
      />

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
