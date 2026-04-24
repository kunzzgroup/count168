import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-dc-script="${safe}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.dcScript = safe;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

export default function DataCapturePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  /** Frozen after first load so React re-renders do not clobber vanilla `display` on company pills */
  const [filterSnapshot, setFilterSnapshot] = useState(null);

  const companyCode = useMemo(() => {
    const cur = filterSnapshot?.snapCompanies?.find((c) => Number(c.id) === Number(companyId));
    return cur ? String(cur.company_id || "") : "";
  }, [filterSnapshot, companyId]);

  const companyButtonStyle = useCallback((comp, snapGroup) => {
    const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
    if (snapGroup) {
      return cGid === snapGroup ? {} : { display: "none" };
    }
    return cGid ? { display: "none" } : {};
  }, []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page");
    document.body.classList.add("dashboard-page", "datacapture-page");
    return () => {
      document.body.classList.remove("datacapture-page", "page-ready");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canDc = hasFull || perms.includes("datacapture");
        if (!canDc || !u.company_has_gambling) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && current?.group_id?.trim()) {
          selGroup = String(current.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            snapCompanies: snapRows,
            snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
          });
          setCompanyId(effective);
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const hrefs = [assetUrl("css/datacapture.css"), assetUrl("css/global-13inch.css")];
    (async () => {
      await Promise.all(hrefs.map((h) => injectStylesheet(h)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || forbidden || companyId == null) return;

    let cancelled = false;

    const runVanilla = async () => {
      window.DATACAPTURE_COMPANY_ID = companyId;
      window.DATACAPTURE_COMPANY_CODE = companyCode;

      window._sharedCompanyFilterInitialized = false;
      try {
        await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
        if (cancelled) return;
        window.__initSharedCompanyFilter?.();

        await loadScriptOnce(assetUrl("js/datacapture.js"));
        if (cancelled) return;

        window.onSharedCompanyFilterChanged = (id /* , companyCodeArg */) => {
          if (typeof window.switchDataCaptureCompany === "function") {
            window.switchDataCaptureCompany(id);
          }
        };

        const form = document.getElementById("dataCaptureForm");
        if (form) form.removeAttribute("data-dc-spa-init");
        await window.__initDataCapturePage?.();
      } catch (e) {
        console.error(e);
      }
    };

    runVanilla();

    return () => {
      cancelled = true;
      window._sharedCompanyFilterInitialized = false;
      const form = document.getElementById("dataCaptureForm");
      if (form) form.removeAttribute("data-dc-spa-init");
    };
  }, [loading, forbidden, companyId, companyCode]);

  if (forbidden) {
    return <Navigate to="/process-list" replace />;
  }
  if (loading || companyId == null || !filterSnapshot) {
    return null;
  }

  const fs = filterSnapshot;

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, marginTop: 20 }}>
        <h1 style={{ margin: 0 }}>Data Capture</h1>

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div
            id="data-capture-permission-filter"
            className="data-capture-company-filter data-capture-permission-filter-header"
            style={{ display: "none" }}
          >
            <span className="data-capture-company-label">Category:</span>
            <div id="data-capture-permission-buttons" className="data-capture-company-buttons" />
          </div>
        </div>
      </div>

      <div className="top-section">
        <div className="form-column">
          <div className="form-container">
            <form id="dataCaptureForm" className="process-form" method="POST" action="#">
              {fs.snapGroupIds.length > 0 && (
                <div id="group-buttons-wrapper" className="data-capture-company-filter shared-group-wrapper">
                  <span className="data-capture-company-label">GroupID:</span>
                  <div id="group-buttons-container" className="data-capture-company-buttons">
                    {fs.snapGroupIds.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`data-capture-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`}
                        data-group-id={gid}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fs.snapCompanies.length > 0 && (
                <div id="company-buttons-wrapper" className="data-capture-company-filter shared-company-wrapper">
                  <span className="data-capture-company-label">Company:</span>
                  <div id="company-buttons-container" className="data-capture-company-buttons">
                    {fs.snapCompanies.map((comp) => (
                      <button
                        key={comp.id}
                        type="button"
                        style={companyButtonStyle(comp, fs.selectedGroup)}
                        className={`data-capture-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`}
                        data-company-id={comp.id}
                        data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                        data-company-code={comp.company_id}
                      >
                        {comp.company_id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="capture_date">Date</label>
                <select id="capture_date" name="capture_date" required defaultValue="">
                  <option value="">Select Date</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="capture_process">Process</label>
                <div className="custom-select-wrapper">
                  <button type="button" className="custom-select-button" id="capture_process" data-placeholder="Select Process" name="process">
                    Select Process
                  </button>
                  <div className="custom-select-dropdown" id="capture_process_dropdown">
                    <div className="custom-select-search">
                      <input type="text" placeholder="Search process..." autoComplete="off" />
                    </div>
                    <div className="custom-select-options" />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_description">Description</label>
                <div className="input-with-icon">
                  <input
                    type="text"
                    id="capture_description"
                    name="description"
                    required
                    readOnly
                    placeholder="Click + to select descriptions"
                  />
                  <button type="button" className="add-icon" onClick={() => window.expandDescription?.()}>
                    +
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_currency">Currency</label>
                <select id="capture_currency" name="currency" defaultValue="">
                  <option value="">Select Currency</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="capture_remove_word">Remove Word</label>
                <input type="text" id="capture_remove_word" name="remove_word" placeholder="Enter words to remove" />
                <small className="field-help" style={{ display: "block", marginTop: 0, fontStyle: "italic", color: "#666" }}>
                  (Use semicolon to separate multiple words, e.g. abc;cde;efg)
                </small>
              </div>

              <div className="form-group replace-word-group">
                <label htmlFor="capture_replace_word_from">Replace Word</label>
                <div className="replace-word-fields">
                  <input type="text" id="capture_replace_word_from" name="replace_word_from" placeholder="Old word" />
                  <span className="replace-arrow">→</span>
                  <input type="text" id="capture_replace_word_to" name="replace_word_to" placeholder="New word" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="capture_remark">Remark</label>
                <input type="text" id="capture_remark" name="remark" placeholder="Enter remark" />
              </div>
            </form>
          </div>
        </div>

        <div className="submitted-column">
          <div className="submitted-container">
            <h2 className="submitted-title">Submitted Processes</h2>
            <div className="submitted-list" id="submittedProcessesList">
              <div className="no-data">No processes submitted for this date</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-section">
        <div className="excel-table-container">
          <div className="excel-table-header">
            <span>Data Capture Table</span>
            <select id="dataCaptureTypeSelector" className="data-capture-type-selector" defaultValue="1.Text">
              <option value="1.Text">1.TEXT</option>
              <option value="2.Format">2.FORMAT</option>
              <option value="CITIBET_MAJOR">3.CITIBET</option>
              <option value="4.RETURN">4.RETURN</option>
            </select>
            <button type="button" className="btn btn-cancel" onClick={() => window.resetForm?.()}>
              Reset
            </button>
          </div>
          <table className="excel-table" id="dataTable">
            <thead id="tableHeader">
              <tr>
                <th />
              </tr>
            </thead>
            <tbody id="tableBody" />
          </table>
          <div id="tablePreviewFormat" className="table-preview-format" style={{ display: "none" }}>
            <iframe id="tablePreviewFrameFormat" className="table-preview-frame-format" title="Format Table Preview" />
          </div>
          <div
            id="pasteAreaFormat"
            className="paste-area-format"
            style={{ display: "none" }}
            contentEditable
            data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
            suppressContentEditableWarning
          />
        </div>

        <div className="form-actions">
          <button id="dataCaptureSubmitBtn" type="button" className="btn btn-save" onClick={() => window.submitDataCaptureForm?.()}>
            Submit
          </button>
        </div>
      </div>

      <div id="descriptionSelectionModal" className="modal" style={{ display: "none" }}>
        <div className="modal-content description-selection-modal">
          <div className="modal-header">
            <h2>Select or Add Description</h2>
            <span className="close" onClick={() => window.closeDescriptionSelectionModal?.()} role="presentation">
              &times;
            </span>
          </div>
          <div className="modal-body">
            <div className="description-selection-container">
              <div className="selected-descriptions-section">
                <h3>Selected Descriptions</h3>
                <div className="selected-descriptions-list" id="selectedDescriptionsInModal" />
              </div>

              <div className="available-descriptions-section">
                <div className="add-description-bar">
                  <h3>Add New Description</h3>
                  <form id="addDescriptionForm" className="add-description-form">
                    <div className="add-description-input-group">
                      <input type="text" id="new_description_name" name="description_name" placeholder="Enter new description name..." required />
                      <button type="submit" className="btn btn-save">
                        Add
                      </button>
                    </div>
                  </form>
                </div>

                <h3>Available Descriptions</h3>
                <div className="description-search">
                  <input type="text" id="descriptionSearch" placeholder="Search descriptions..." onKeyUp={() => window.filterDescriptions?.()} />
                </div>
                <div className="description-list" id="existingDescriptions" />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-save" id="confirmDescriptionsBtn" onClick={() => window.confirmDescriptions?.()}>
                Confirm
              </button>
              <button type="button" className="btn btn-cancel" onClick={() => window.closeDescriptionSelectionModal?.()}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="processNotificationContainer" className="process-notification-container" />

      <div id="contextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => window.copySelectedCells?.()} role="presentation">
          <span>📋 Copy</span>
        </div>
        <div className="context-menu-item" onClick={() => window.pasteToSelectedCells?.()} role="presentation">
          <span>📄 Paste</span>
        </div>
        <div className="context-menu-item" onClick={() => window.clearSelectedCells?.()} role="presentation">
          <span>🗑️ Clear</span>
        </div>
        <div className="context-menu-item" onClick={(e) => window.showDeleteDialog?.(e)} role="presentation">
          <span>🗑️ Delete</span>
        </div>
        <div className="context-menu-item" onClick={(e) => window.selectAllCells?.(e)} role="presentation">
          <span>☑️ Select All</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => window.insertColumnLeft?.()} role="presentation">
          <span>➕ Insert 1 column left</span>
        </div>
        <div className="context-menu-item" onClick={() => window.insertColumnRight?.()} role="presentation">
          <span>➕ Insert 1 column right</span>
        </div>
        <div className="context-menu-item" onClick={() => window.deleteColumn?.()} role="presentation">
          <span>🗑️ Delete column</span>
        </div>
        <div className="context-menu-item" onClick={() => window.clearColumn?.()} role="presentation">
          <span>❌ Clear column</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" onClick={() => window.insertRowAbove?.()} role="presentation">
          <span>➕ Insert 1 row above</span>
        </div>
        <div className="context-menu-item" onClick={() => window.insertRowBelow?.()} role="presentation">
          <span>➕ Insert 1 row below</span>
        </div>
        <div className="context-menu-item" onClick={() => window.deleteRow?.()} role="presentation">
          <span>🗑️ Delete row</span>
        </div>
        <div className="context-menu-item" onClick={() => window.clearRow?.()} role="presentation">
          <span>❌ Clear row</span>
        </div>
      </div>

      <div id="deleteDialog" className="delete-dialog" style={{ display: "none" }}>
        <div className="delete-dialog-content">
          <div className="delete-dialog-header">
            <span>Delete</span>
            <span className="delete-dialog-close" onClick={() => window.closeDeleteDialog?.()} role="presentation">
              &times;
            </span>
          </div>
          <div className="delete-dialog-body">
            <div className="delete-dialog-title">Delete</div>
            <div className="delete-options">
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="shiftLeft" defaultChecked />
                <span>Shift cells left</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="shiftUp" />
                <span>Shift cells up</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="entireRow" />
                <span>Entire row</span>
              </label>
              <label className="delete-option">
                <input type="radio" name="deleteOption" value="entireColumn" />
                <span>Entire column</span>
              </label>
            </div>
          </div>
          <div className="delete-dialog-footer">
            <button type="button" className="btn btn-save" onClick={(e) => window.confirmDelete?.(e)} role="presentation">
              OK
            </button>
            <button type="button" className="btn btn-cancel" onClick={(e) => window.closeDeleteDialog?.(e)} role="presentation">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
