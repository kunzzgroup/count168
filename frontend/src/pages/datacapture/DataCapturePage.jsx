import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { injectStylesheet } from "../../utils/injectStylesheet.js";
import {
  applySharedGroupClickWithCompanySwitch,
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  isCompanyVisibleForSharedFilter,
  normalizeOwnerCompanyRow,
  persistDashboardGroupFilter,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
} from "../../utils/sharedCompanyFilter.js";

import "../../../public/css/datacapture.css";
import "../../../public/css/global-13inch.css";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const clean = src.split(/[?#]/)[0];
    const nodes = document.querySelectorAll("script[src]");
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const ns = n.getAttribute("src") || "";
      if (ns.split(/[?#]/)[0] === clean) {
        if (n.dataset.loaded === "1") {
          resolve();
          return;
        }
        n.addEventListener("load", () => resolve(), { once: true });
        n.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        return;
      }
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

export default function DataCapturePage() {
  const navigate = useNavigate();

  const [bootLoading, setBootLoading] = useState(true);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const companiesDeduped = useMemo(
    () => dedupeOwnerCompaniesByCode(companies.map(normalizeOwnerCompanyRow), companyId),
    [companies, companyId]
  );

  const groups = useMemo(() => sortedUniqueGroupIds(companiesDeduped), [companiesDeduped]);

  const currentCompanyRow = useMemo(
    () => companiesDeduped.find((c) => Number(c.id) === Number(companyId)) || null,
    [companiesDeduped, companyId]
  );

  const companyCode = currentCompanyRow?.company_id ? String(currentCompanyRow.company_id) : "";

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page");
    document.body.classList.add("dashboard-page", "datacapture-page");
    return () => {
      document.body.classList.remove("datacapture-page", "page-ready");
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
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!alive) return;
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        const perms = Array.isArray(u.company_permissions) ? u.company_permissions : [];
        if (perms.length === 0) {
          navigate("/process-list?error=no_permission", { replace: true });
          return;
        }

        const companiesJson = await companiesRes.json();
        const raw = Array.isArray(companiesJson?.data) ? companiesJson.data.map(normalizeOwnerCompanyRow) : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effectiveCompany = queryCompany || u.company_id || raw[0]?.id || null;
        effectiveCompany = effectiveCompany ? Number(effectiveCompany) : null;

        if (queryCompany && effectiveCompany && Number(effectiveCompany) !== Number(u.company_id)) {
          try {
            const syncRes = await fetch(
              buildApiUrl(`api/session/update_company_session_api.php?company_id=${effectiveCompany}`),
              { credentials: "include" }
            );
            const syncJson = await syncRes.json();
            if (!syncJson.success) {
              effectiveCompany = u.company_id ? Number(u.company_id) : effectiveCompany;
            }
          } catch {
            effectiveCompany = u.company_id ? Number(u.company_id) : effectiveCompany;
          }
        }

        const rowForPick = raw.find((c) => Number(c.id) === Number(effectiveCompany)) || null;
        const initialGroup = resolveInitialSelectedGroupFromSession(raw, rowForPick);

        setMe(u);
        setCompanies(raw);
        setCompanyId(effectiveCompany);
        setSelectedGroup(initialGroup);
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

  const switchCompanyFullReload = useCallback(async (nextCompanyId) => {
    const id = Number(nextCompanyId);
    if (!id) return;
    try {
      await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`), {
        credentials: "include",
      });
      notifyCompanySessionUpdated();
    } catch {
      /* continue navigation — backend may still accept */
    }
    const u = new URL(window.location.href);
    u.searchParams.set("company_id", String(id));
    window.location.assign(u.toString());
  }, []);

  useEffect(() => {
    if (bootLoading || !me || !companyId || !companyCode) return;

    window.__DATA_CAPTURE_SPA_BOOTSTRAP__ = true;

    window.DATACAPTURE_COMPANY_ID = companyId;
    window.DATACAPTURE_USER_ROLE = String(me.role || "").toLowerCase();
    window.DATACAPTURE_COMPANY_CODE = companyCode;

    window.onSharedCompanyFilterChanged = (cid) => {
      if (cid) window.switchDataCaptureCompany?.(Number(cid));
    };

    let alive = true;
    setEngineLoading(true);
    setEngineError("");

    (async () => {
      try {
        await loadScriptOnce(buildApiUrl("js/decimal.min.js"));
        await loadScriptOnce(buildApiUrl("js/money-decimal.js"));
        await loadScriptOnce(buildApiUrl("js/datacapture.js"));
        if (!alive) return;
        if (typeof window.initDataCapturePage === "function") {
          await window.initDataCapturePage();
        }
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setEngineError("Failed to load Data Capture scripts.");
      } finally {
        if (alive) setEngineLoading(false);
      }
    })();

    return () => {
      alive = false;
      window.__DATA_CAPTURE_SPA_BOOTSTRAP__ = false;
      try {
        delete window.onSharedCompanyFilterChanged;
      } catch {
        window.onSharedCompanyFilterChanged = undefined;
      }
    };
  }, [bootLoading, me, companyId, companyCode]);

  const onGroupClick = async (gid) => {
    await applySharedGroupClickWithCompanySwitch({
      clickedGroupId: gid,
      currentSelectedGroup: selectedGroup,
      companies: companiesDeduped,
      currentCompanyId: companyId,
      setSelectedGroup,
      switchCompany: async (comp) => switchCompanyFullReload(comp.id),
    });
  };

  const onCompanyClick = async (comp) => {
    if (!comp?.id) return;
    persistDashboardGroupFilter(selectedGroup);
    await switchCompanyFullReload(comp.id);
  };

  if (bootLoading) {
    return (
      <div className="container" style={{ padding: "24px" }}>
        <p style={{ margin: 0 }}>Loading…</p>
      </div>
    );
  }

  const list = filterCompaniesWithDisplayId(companiesDeduped);

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          marginTop: 20,
        }}
      >
        <h1 style={{ margin: 0 }}>Data Capture</h1>

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div id="data-capture-permission-filter" className="data-capture-company-filter data-capture-permission-filter-header" style={{ display: "none" }}>
            <span className="data-capture-company-label">Category:</span>
            <div id="data-capture-permission-buttons" className="data-capture-company-buttons" />
          </div>
        </div>
      </div>

      {(engineLoading || engineError) && (
        <div style={{ marginBottom: 12, color: engineError ? "#b91c1c" : "#444" }}>
          {engineError || "Initializing table engine…"}
        </div>
      )}

      <div className="top-section">
        <div className="form-column">
          <div className="form-container">
            <form id="dataCaptureForm" className="process-form" method="POST">
              {groups.length > 0 ? (
                <div id="group-buttons-wrapper" className="data-capture-company-filter shared-group-wrapper">
                  <span className="data-capture-company-label">GroupID:</span>
                  <div id="group-buttons-container" className="data-capture-company-buttons">
                    {groups.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`data-capture-company-btn shared-group-btn ${selectedGroup === gid ? "active" : ""}`.trim()}
                        data-group-id={gid}
                        onClick={() => void onGroupClick(gid)}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {list.length > 0 ? (
                <div id="company-buttons-wrapper" className="data-capture-company-filter shared-company-wrapper">
                  <span className="data-capture-company-label">Company:</span>
                  <div id="company-buttons-container" className="data-capture-company-buttons">
                    {list.map((comp) => {
                      const gid = String(comp.group_id || "").trim().toUpperCase();
                      const visible = isCompanyVisibleForSharedFilter(comp, selectedGroup, false, "follow");
                      const active = Number(comp.id) === Number(companyId);
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          style={{ display: visible ? undefined : "none" }}
                          className={`data-capture-company-btn shared-company-btn ${active ? "active" : ""}`.trim()}
                          data-company-id={comp.id}
                          data-group-id={gid}
                          data-company-code={comp.company_id || ""}
                          onClick={() => void onCompanyClick(comp)}
                        >
                          {comp.company_id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

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
              <div className="no-data">No processes submitted yet</div>
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
          <button id="dataCaptureSubmitBtn" type="submit" className="btn btn-save" onClick={() => window.submitDataCaptureForm?.()}>
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
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.copySelectedCells?.(); }}>
          <span>📋 Copy</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.pasteToSelectedCells?.(); }}>
          <span>📄 Paste</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.clearSelectedCells?.(); }}>
          <span>🗑️ Clear</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.showDeleteDialog?.(e); }}>
          <span>🗑️ Delete</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => window.selectAllCells?.(e)}>
          <span>☑️ Select All</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertColumnLeft?.()}>
          <span>➕ Insert 1 column left</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertColumnRight?.()}>
          <span>➕ Insert 1 column right</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.deleteColumn?.()}>
          <span>🗑️ Delete column</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.clearColumn?.()}>
          <span>❌ Clear column</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu" style={{ display: "none" }}>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertRowAbove?.()}>
          <span>➕ Insert 1 row above</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertRowBelow?.()}>
          <span>➕ Insert 1 row below</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.deleteRow?.()}>
          <span>🗑️ Delete row</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.clearRow?.()}>
          <span>❌ Clear row</span>
        </div>
      </div>

      <div id="deleteDialog" className="delete-dialog" style={{ display: "none" }}>
        <div className="delete-dialog-content">
          <div className="delete-dialog-header">
            <span>Delete</span>
            <span className="delete-dialog-close" role="presentation" onClick={() => window.closeDeleteDialog?.()}>
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
            <button type="button" className="btn btn-save" onClick={(e) => { e.stopPropagation(); window.confirmDelete?.(); }}>
              OK
            </button>
            <button type="button" className="btn btn-cancel" onClick={(e) => { e.stopPropagation(); window.closeDeleteDialog?.(); }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
