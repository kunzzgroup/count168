import { EDIT_FORMULA_INPUT_METHODS, CALCULATOR_KEYPAD } from "../editFormulaConstants.js";

function CalcButton({ value, action, className = "" }) {
  const isOperator = ["/", "*", "-", "+"].includes(value);
  const isClear = action === "clear";
  const isEquals = action === "equals";
  let btnClass = "calc-btn";
  if (isOperator) btnClass += " calc-operator";
  if (isClear) btnClass += " calc-clear";
  if (isEquals) btnClass += " calc-operator";
  if (className) btnClass += ` ${className}`;

  return (
    <button
      type="button"
      className={btnClass}
      data-value={value || undefined}
      data-action={action || undefined}
    >
      {isClear ? "Clr" : isEquals ? "=" : value}
    </button>
  );
}

/**
 * React-owned Edit Formula modal shell — form fields match legacy DOM ids
 * so initEditFormulaFormAfterMount / saveFormula continue to work unchanged.
 */
export default function EditFormulaModal({ open, productValue, onClose }) {
  if (!open) return null;

  return (
    <div
      id="editFormulaModal"
      className="summary-modal"
      style={{ display: "flex" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-formula-title"
    >
      <div className="summary-confirm-modal-content" id="editFormulaModalContent">
        <div id="editFormulaForm" className="edit-formula-form-container">
          <div className="form-header">
            <h3 id="edit-formula-title">Edit Formula</h3>
          </div>
          <div className="form-content">
            <div className="form-layout">
              <div className="form-left-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="process">Id Product</label>
                    <input type="text" id="process" defaultValue={productValue || ""} readOnly />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="account">Account</label>
                    <div className="account-select-with-buttons">
                      <div className="custom-select-wrapper">
                        <button
                          type="button"
                          className="custom-select-button"
                          id="account"
                          data-placeholder="Select Account"
                          name="account"
                        >
                          Select Account
                        </button>
                        <div className="custom-select-dropdown" id="account_dropdown">
                          <div className="custom-select-search">
                            <input type="text" placeholder="Search account..." autoComplete="off" />
                          </div>
                          <div className="custom-select-options" />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="account-add-btn"
                        onClick={() => window.showAddAccountModal?.()}
                        title="Add New Account"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row source-percent-row">
                  <div className="form-group source-percent-group">
                    <label htmlFor="sourcePercent">Source</label>
                    <input type="text" id="sourcePercent" placeholder="e.g. 1 or 2 or 0.5 (倍数)" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="descriptionSelect1">Data</label>
                    <div className="description-select-with-buttons">
                      <select id="descriptionSelect1" defaultValue="">
                        <option value="">Select Id Product</option>
                      </select>
                      <select id="descriptionSelect2" defaultValue="">
                        <option value="">Select Row Data</option>
                      </select>
                      <button
                        type="button"
                        className="description-add-btn"
                        onClick={() => window.addSelectedDataToFormula?.()}
                        title="Add Selected Data To Formula"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formula">Formula</label>
                    <input type="text" id="formula" placeholder="e.g. $5+$10*0.6/7" />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDisplay" />
                    <input
                      type="text"
                      id="formulaDisplay"
                      readOnly
                      style={{
                        backgroundColor: "#f5f5f5",
                        cursor: "not-allowed",
                        color: "#666",
                        fontStyle: "italic",
                      }}
                      placeholder=""
                    />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDataGrid" />
                    <div id="formulaDataGrid" className="formula-data-grid" />
                  </div>
                </div>
              </div>

              <div className="form-middle-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="inputMethod">Input Method</label>
                    <select id="inputMethod" defaultValue="">
                      {EDIT_FORMULA_INPUT_METHODS.map((opt) => (
                        <option key={opt.value || "empty"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="currency">Currency</label>
                    <select id="currency" defaultValue="">
                      <option value="">Select Currency</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <input type="text" id="description" placeholder="" />
                  </div>
                </div>
              </div>

              <div className="form-right-column calculator-column">
                <div className="calculator-keypad">
                  {CALCULATOR_KEYPAD.map((row, rowIndex) => (
                    <div className="calculator-row" key={`calc-row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => {
                        if (cell === "") {
                          return <button key={`empty-${cellIndex}`} type="button" className="calc-btn calc-empty" />;
                        }
                        if (cell === "clear") {
                          return <CalcButton key="clear" action="clear" />;
                        }
                        if (cell === "equals") {
                          return <CalcButton key="equals" action="equals" />;
                        }
                        return <CalcButton key={cell} value={cell} />;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" id="editFormulaSaveBtn" className="btn btn-save" disabled>
                Save
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
