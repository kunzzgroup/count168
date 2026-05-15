import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const INPUT_METHOD_OPTIONS = [
  ["", "Select Input Method (Optional)"],
  ["positive_to_negative_negative_to_positive", "Positive to negative, negative to positive"],
  ["positive_to_negative_negative_to_zero", "Positive to negative, negative to zero"],
  ["negative_to_positive_positive_to_zero", "Negative to positive, positive to zero"],
  ["positive_unchanged_negative_to_zero", "Positive unchanged, negative to zero"],
  ["negative_unchanged_positive_to_zero", "Negative unchanged, positive to zero"],
  ["change_to_positive", "Change to positive"],
  ["change_to_negative", "Change to negative"],
  ["change_to_zero", "Change to zero"],
];

/**
 * Mirrors legacy js/datacapturesummary.js `showEditFormulaForm` modal shell (same CSS classes).
 * Full captured-table Data dropdown parity is iterative; calculator + Save back to summary row matches PHP UX.
 */
export function EditFormulaModal({
  visible,
  row,
  blankDraft,
  accountOptions,
  currencyOptions,
  idProductChoices,
  onClose,
  onSave,
  onOpenAddAccount,
  computeProcessedAmounts,
}) {
  const formulaRef = useRef(null);
  const [idProductDisplay, setIdProductDisplay] = useState("");
  const [draftAccountId, setDraftAccountId] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [draftCurrencyId, setDraftCurrencyId] = useState("");
  const [draftFormula, setDraftFormula] = useState("");
  const [draftInputMethod, setDraftInputMethod] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [dataSelect1, setDataSelect1] = useState("");

  useEffect(() => {
    if (!visible || !row) return;
    setIdProductDisplay(row.idProduct ?? "");
    setDataSelect1(row.idProduct ?? "");
    if (blankDraft) {
      setDraftAccountId("");
      setDraftSource("1");
      setDraftCurrencyId("");
      setDraftFormula("");
      setDraftInputMethod("");
      setDraftDescription("");
    } else {
      setDraftAccountId(row.accountId != null ? String(row.accountId) : "");
      setDraftSource(row.source ?? "1");
      setDraftCurrencyId(row.currencyId != null ? String(row.currencyId) : "");
      setDraftFormula(row.formula ?? "");
      setDraftInputMethod(row.inputMethod ?? "");
      setDraftDescription(row.description ?? "");
    }
    setTimeout(() => formulaRef.current?.focus(), 50);
  }, [visible, row, blankDraft]);

  const canSave = useMemo(() => {
    const fid = draftAccountId.trim();
    const cid = draftCurrencyId.trim();
    const f = String(draftFormula ?? "").trim();
    return fid.length > 0 && cid.length > 0 && f.length > 0;
  }, [draftAccountId, draftCurrencyId, draftFormula]);

  const insertIntoFormula = useCallback((snippet) => {
    const input = formulaRef.current;
    const raw = snippet;
    if (!input) {
      setDraftFormula((prev) => `${prev}${raw}`);
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = `${input.value.slice(0, start)}${raw}${input.value.slice(end)}`;
    setDraftFormula(next);
    requestAnimationFrame(() => {
      const el = formulaRef.current;
      if (!el) return;
      const pos = start + raw.length;
      el.selectionStart = el.selectionEnd = pos;
      el.focus();
    });
  }, []);

  const onCalcBtn = useCallback(
    (ev) => {
      const t = ev.currentTarget;
      const val = t.getAttribute("data-value");
      const action = t.getAttribute("data-action");
      if (action === "clear") {
        setDraftFormula("");
        return;
      }
      if (action === "equals") {
        return;
      }
      if (val) insertIntoFormula(val);
    },
    [insertIntoFormula],
  );

  const handleSave = useCallback(() => {
    if (!row || !canSave) return;
    const acc = accountOptions.find((a) => String(a.id) === draftAccountId);
    const cur = currencyOptions.find((c) => String(c.id) === draftCurrencyId);
    onSave(row.id, {
      accountId: acc?.id ?? null,
      account: acc ? `${acc.account_id}${acc.name ? ` (${acc.name})` : ""}` : "",
      currencyId: cur?.id ?? null,
      currency: cur?.code ?? "",
      source: draftSource.trim() === "" ? "1" : draftSource.trim(),
      formula: draftFormula.trim(),
      inputMethod: draftInputMethod || "",
      description: draftDescription.trim(),
      ...computeProcessedAmounts(draftFormula.trim(), draftSource.trim() === "" ? "1" : draftSource.trim(), row.rateValue),
    });
    onClose();
  }, [
    row,
    canSave,
    accountOptions,
    currencyOptions,
    draftAccountId,
    draftCurrencyId,
    draftSource,
    draftFormula,
    draftInputMethod,
    draftDescription,
    computeProcessedAmounts,
    onSave,
    onClose,
  ]);

  if (!visible || !row) return null;

  return (
    <div
      id="editFormulaModal"
      className="summary-modal"
      style={{ display: "flex", zIndex: 10000 }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="summary-confirm-modal-content" id="editFormulaModalContent" onMouseDown={(e) => e.stopPropagation()}>
        <div id="editFormulaForm" className="edit-formula-form-container">
          <div className="form-header">
            <h3>Edit Formula</h3>
          </div>
          <div className="form-content">
            <div className="form-layout">
              <div className="form-left-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="process">Id Product</label>
                    <input id="process" type="text" readOnly value={idProductDisplay} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="modalAccountSelect">Account</label>
                    <div className="account-select-with-buttons">
                      <select
                        id="modalAccountSelect"
                        value={draftAccountId}
                        onChange={(e) => setDraftAccountId(e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <option value="">Select Account</option>
                        {accountOptions.map((acc) => (
                          <option key={acc.id} value={String(acc.id)}>
                            {acc.account_id}
                            {acc.name ? ` (${acc.name})` : ""}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="account-add-btn" title="Add New Account" onClick={() => onOpenAddAccount(row.id)}>
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row source-percent-row">
                  <div className="form-group source-percent-group">
                    <label htmlFor="sourcePercent">Source</label>
                    <input
                      id="sourcePercent"
                      type="text"
                      placeholder="e.g. 1 or 2 or 0.5 (倍数)"
                      value={draftSource}
                      onChange={(e) => setDraftSource(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="descriptionSelect1-react">Data</label>
                    <div className="description-select-with-buttons">
                      <select id="descriptionSelect1-react" value={dataSelect1} onChange={(e) => setDataSelect1(e.target.value)}>
                        <option value="">Select Id Product</option>
                        {idProductChoices.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                      <select id="descriptionSelect2-react" value="" disabled title="Row data picker requires captured-table context (parity with legacy)">
                        <option value="">Select Row Data</option>
                      </select>
                      <button type="button" className="description-add-btn" disabled title="Add from captured cells (legacy parity)">
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formula">Formula</label>
                    <input
                      ref={formulaRef}
                      id="formula"
                      type="text"
                      placeholder="e.g. $5+$10*0.6/7"
                      value={draftFormula}
                      onChange={(e) => setDraftFormula(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label htmlFor="formulaDisplay" />
                    <input
                      id="formulaDisplay"
                      readOnly
                      style={{
                        backgroundColor: "#f5f5f5",
                        cursor: "not-allowed",
                        color: "#666",
                        fontStyle: "italic",
                      }}
                      value=""
                      placeholder=""
                    />
                  </div>
                </div>

                <div className="form-row formula-row-full-width">
                  <div className="form-group">
                    <label />
                    <div id="formulaDataGrid" className="formula-data-grid" />
                  </div>
                </div>
              </div>

              <div className="form-middle-column">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="inputMethod">Input Method</label>
                    <select id="inputMethod" value={draftInputMethod} onChange={(e) => setDraftInputMethod(e.target.value)}>
                      {INPUT_METHOD_OPTIONS.map(([v, lab]) => (
                        <option key={v || "empty"} value={v}>
                          {lab}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="currency">Currency</label>
                    <select id="currency" value={draftCurrencyId} onChange={(e) => setDraftCurrencyId(e.target.value)}>
                      <option value="">Select Currency</option>
                      {currencyOptions.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <input
                      id="description"
                      type="text"
                      placeholder=""
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
              </div>

              <div className="form-right-column calculator-column">
                <div className="calculator-keypad">
                  <div className="calculator-row">
                    <button type="button" className="calc-btn" data-value="7" onClick={onCalcBtn}>7</button>
                    <button type="button" className="calc-btn" data-value="8" onClick={onCalcBtn}>8</button>
                    <button type="button" className="calc-btn" data-value="9" onClick={onCalcBtn}>9</button>
                    <button type="button" className="calc-btn calc-operator" data-value="/" onClick={onCalcBtn}>/</button>
                  </div>
                  <div className="calculator-row">
                    <button type="button" className="calc-btn" data-value="4" onClick={onCalcBtn}>4</button>
                    <button type="button" className="calc-btn" data-value="5" onClick={onCalcBtn}>5</button>
                    <button type="button" className="calc-btn" data-value="6" onClick={onCalcBtn}>6</button>
                    <button type="button" className="calc-btn calc-operator" data-value="*" onClick={onCalcBtn}>*</button>
                  </div>
                  <div className="calculator-row">
                    <button type="button" className="calc-btn" data-value="1" onClick={onCalcBtn}>1</button>
                    <button type="button" className="calc-btn" data-value="2" onClick={onCalcBtn}>2</button>
                    <button type="button" className="calc-btn" data-value="3" onClick={onCalcBtn}>3</button>
                    <button type="button" className="calc-btn calc-operator" data-value="-" onClick={onCalcBtn}>-</button>
                  </div>
                  <div className="calculator-row">
                    <button type="button" className="calc-btn" data-value="0" onClick={onCalcBtn}>0</button>
                    <button type="button" className="calc-btn" data-value="." onClick={onCalcBtn}>.</button>
                    <button type="button" className="calc-btn calc-empty" disabled aria-hidden tabIndex={-1} />
                    <button type="button" className="calc-btn calc-operator" data-value="+" onClick={onCalcBtn}>+</button>
                  </div>
                  <div className="calculator-row">
                    <button type="button" className="calc-btn" data-value="(" onClick={onCalcBtn}>(</button>
                    <button type="button" className="calc-btn" data-value=")" onClick={onCalcBtn}>)</button>
                    <button type="button" className="calc-btn calc-clear" data-action="clear" onClick={onCalcBtn}>Clr</button>
                    <button type="button" className="calc-btn calc-operator" data-action="equals" onClick={onCalcBtn}>=</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" id="editFormulaSaveBtn" className="btn btn-save" disabled={!canSave} onClick={handleSave}>
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
