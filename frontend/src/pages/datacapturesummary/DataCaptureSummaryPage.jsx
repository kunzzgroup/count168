import { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { injectStylesheet } from "../../utils/injectStylesheet.js";
import SummaryProcessInfo from "./components/SummaryProcessInfo.jsx";
import SummaryTable, { SummaryEmptyState } from "./components/SummaryTable.jsx";
import EditFormulaModal from "./components/EditFormulaModal.jsx";
import AccountModal from "../../components/AccountModal.jsx";
import { useSummaryEditFormula } from "./hooks/useSummaryEditFormula.js";
import { useSummaryAddAccount, purgeLegacySummaryAddAccountModal } from "./hooks/useSummaryAddAccount.js";
import SummaryActionBar from "./components/SummaryActionBar.jsx";
import SummarySubmitBar from "./components/SummarySubmitBar.jsx";
import SummaryNotification from "./components/SummaryNotification.jsx";
import SummaryConfirmDeleteModal from "./components/SummaryConfirmDeleteModal.jsx";
import { useSummaryBoot } from "./hooks/useSummaryBoot.js";
import { useSummaryCaptureBootstrap } from "./hooks/useSummaryCaptureBootstrap.js";
import { useSummaryRows } from "./hooks/useSummaryRows.js";
import { useSummaryPageActions } from "./hooks/useSummaryPageActions.js";
import { useSummaryOverlays } from "./hooks/useSummaryOverlays.js";
import { useSummaryLegacyChrome } from "./hooks/useSummaryLegacyChrome.js";
import {
  useSummaryTableBridge,
  hideSummaryLoadingChrome,
  showSummaryTableChrome,
  removeLegacySummaryEmptyStateDom,
} from "./hooks/useSummaryTableBridge.js";
import { useSummaryTablePopulate } from "./hooks/useSummaryTablePopulate.js";
import { useSummaryFormulaEngine } from "./hooks/useSummaryFormulaEngine.js";
import { clearSummaryCaptureRoundStorage } from "./summaryStorage.js";

import "../../../public/css/account-list.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/datacapturesummary.css";
import "../../../public/css/global-13inch.css";

/** Legacy engine present (SPA revisit or full page load after prior visit). */
function areSummaryLegacyScriptsLoaded() {
  return (
    typeof window.Decimal !== "undefined" &&
    typeof window.MoneyDecimal !== "undefined" &&
    typeof window.initDataCaptureSummaryPage === "function"
  );
}

/** Avoid hanging when `load` already fired before listeners attach (SPA revisit / cache). */
function loadScriptOnce(src, isAlreadyLoaded) {
  return new Promise((resolve, reject) => {
    const clean = src.split(/[?#]/)[0];
    const finish = (node) => {
      if (node) node.dataset.loaded = "1";
      resolve();
    };

    if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) {
      resolve();
      return;
    }

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
      const onLoad = () => finish(n);
      const timeoutId = window.setTimeout(() => {
        n.removeEventListener("load", onLoad);
        if (typeof isAlreadyLoaded === "function" && isAlreadyLoaded()) {
          finish(n);
          return;
        }
        n.remove();
        loadScriptOnce(src, isAlreadyLoaded).then(resolve).catch(reject);
      }, 10000);
      n.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeoutId);
          onLoad();
        },
        { once: true }
      );
      n.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeoutId);
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

class SummaryPageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container">
          <h1>Data Capture Summary</h1>
          <p role="alert" style={{ color: "#b91c1c", padding: "12px 0" }}>
            Failed to load Data Capture Summary. Please refresh the page or return to Data Capture.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function DataCaptureSummaryPageInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { companyId, bootLoading: sessionBootLoading, bootError } = useSummaryBoot();

  const [scriptsReady, setScriptsReady] = useState(() => areSummaryLegacyScriptsLoaded());
  const [engineError, setEngineError] = useState("");
  const [legacyInitDone, setLegacyInitDone] = useState(false);
  const [dataPopulating, setDataPopulating] = useState(false);

  const sessionReady = !sessionBootLoading && !bootError && companyId != null;

  const capture = useSummaryCaptureBootstrap({
    companyId,
    searchParams,
    enabled: sessionReady,
  });

  const { rows: summaryRows, syncFromDom, resetToInitialRows } = useSummaryRows(
    capture.transformedTableData,
    capture.hasCaptureData
  );

  useSummaryTableBridge({
    hasCaptureData: capture.hasCaptureData,
    processData: capture.processData,
  });

  useSummaryTablePopulate({
    tableData: capture.transformedTableData,
    hasCaptureData: capture.hasCaptureData,
    scriptsReady,
    legacyInitDone,
    syncFromDom,
    resetToInitialRows,
    onPopulatingChange: setDataPopulating,
  });

  useEffect(() => {
    if (capture.hasCaptureData && scriptsReady) {
      setDataPopulating(true);
    } else if (!capture.hasCaptureData) {
      setDataPopulating(false);
    }
  }, [capture.hasCaptureData, scriptsReady]);

  const pageActions = useSummaryPageActions({ companyId, scriptsReady });
  const editFormula = useSummaryEditFormula({ scriptsReady });
  const overlays = useSummaryOverlays();
  const addAccount = useSummaryAddAccount({
    companyId,
    scriptsReady,
    notify: overlays.showNotification,
  });
  useSummaryFormulaEngine();
  useSummaryLegacyChrome(scriptsReady);

  const showEmptyState =
    sessionReady &&
    scriptsReady &&
    !engineError &&
    !capture.hasCaptureData &&
    !(capture.serverStateQueryEnabled && capture.serverStateLoading);

  /** Revisit only: wait for saved summary state. Fresh capture (?success=1) must not block init. */
  const waitForServerStateBeforeInit =
    capture.hasCaptureData &&
    !capture.freshFromCapture &&
    capture.serverStateQueryEnabled &&
    capture.serverStateLoading;

  const hydrateRef = useRef(capture.hydrateLegacyGlobals);
  hydrateRef.current = capture.hydrateLegacyGlobals;
  const initGenerationRef = useRef(0);
  const legacyInitDoneRef = useRef(false);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page", "datacapture-page");
    document.body.classList.add("dashboard-page");
    purgeLegacySummaryAddAccountModal();
    return () => {
      document.body.classList.remove("page-ready");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    window.__DATACAPTURESUMMARY_SPA_BOOTSTRAP__ = true;
    setEngineError("");

    if (areSummaryLegacyScriptsLoaded()) {
      setScriptsReady(true);
      return undefined;
    }

    let alive = true;

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
        if (areSummaryLegacyScriptsLoaded()) {
          setScriptsReady(true);
          return;
        }
        console.error(e);
        setEngineError("Failed to load Data Capture Summary scripts.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionReady]);

  /** Hydrate React-loaded capture state, then run legacy table init after full shell mounts. */
  useEffect(() => {
    if (!sessionReady || !scriptsReady || engineError) return;
    if (waitForServerStateBeforeInit) return;

    const generation = initGenerationRef.current + 1;
    initGenerationRef.current = generation;
    let cancelled = false;

    const runInit = () => {
      if (cancelled || initGenerationRef.current !== generation) return;
      if (legacyInitDoneRef.current) return;
      legacyInitDoneRef.current = true;

      hydrateRef.current();
      const shell = document.querySelector(".container");
      if (shell) delete shell.dataset.summaryPageInit;
      if (typeof window.initDataCaptureSummaryPage === "function") {
        window.initDataCaptureSummaryPage();
      }
      if (capture.hasCaptureData) {
        removeLegacySummaryEmptyStateDom();
      }
      setLegacyInitDone(true);
    };

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(runInit);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [
    sessionReady,
    scriptsReady,
    engineError,
    waitForServerStateBeforeInit,
    capture.hasCaptureData,
  ]);

  useEffect(() => {
    return () => {
      legacyInitDoneRef.current = false;
      setLegacyInitDone(false);
      setDataPopulating(false);
      const shell = document.querySelector(".container");
      if (shell) delete shell.dataset.summaryPageInit;
    };
  }, []);

  /** Apply server state when it arrives after init (revisit / refresh paths). */
  useEffect(() => {
    if (!sessionReady || !scriptsReady || capture.freshFromCapture) return;
    if (capture.serverState == null) return;

    window._summaryStateFromServer = capture.serverState;

    const shell = document.querySelector(".container");
    if (shell?.dataset.summaryPageInit !== "1") return;

    try {
      window.restoreFormulaSourceFromRefresh?.();
      window.restoreRateValuesFromRefresh?.();
    } catch (e) {
      console.warn("Late summary server-state restore failed:", e);
    }
  }, [sessionReady, scriptsReady, capture.serverState, capture.freshFromCapture]);

  /** React-owned loading fallback when legacy init is delayed or skipped. */
  useLayoutEffect(() => {
    if (!sessionReady || !scriptsReady || engineError) return;
    if (waitForServerStateBeforeInit) return;

    if (!capture.hasCaptureData) {
      hideSummaryLoadingChrome();
      showSummaryTableChrome();
    }
  }, [
    sessionReady,
    scriptsReady,
    engineError,
    waitForServerStateBeforeInit,
    capture.hasCaptureData,
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

  const pageBootLoading = sessionBootLoading || (sessionReady && !scriptsReady && !engineError);

  const showPageBootOverlay = pageBootLoading;
  const showDataLoading =
    !showPageBootOverlay && capture.hasCaptureData && dataPopulating && !engineError;

  return (
    <div className="container">
      <h1>Data Capture Summary</h1>

      {showPageBootOverlay ? (
        <div
          className="loading-container"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px" }}
          aria-busy="true"
        >
          <div className="loading-spinner" />
          <p style={{ margin: "12px 0 0" }}>Loading…</p>
        </div>
      ) : null}

      {engineError ? (
        <div style={{ marginBottom: 12, color: "#b91c1c" }} role="alert">
          {engineError}
        </div>
      ) : null}

      <div
        id="loadingState"
        className="loading-container"
        style={{ display: showDataLoading ? undefined : "none" }}
      >
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

      <EditFormulaModal
        key={editFormula.sessionKey}
        open={editFormula.open}
        productValue={editFormula.productValue}
        onClose={() => window.closeEditFormulaForm?.()}
        onOpenAddAccount={addAccount.showAddAccount}
      />

      <AccountModal {...addAccount.accountModalProps} />

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
    </div>
  );
}

export default function DataCaptureSummaryPage() {
  return (
    <SummaryPageErrorBoundary>
      <DataCaptureSummaryPageInner />
    </SummaryPageErrorBoundary>
  );
}
