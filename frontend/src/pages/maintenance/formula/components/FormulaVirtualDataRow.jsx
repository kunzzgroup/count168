import { memo } from "react";
import { toUpperDisplay } from "../formulaMaintenanceLogic.js";
import { assetUrl } from "../../../../utils/apiUrl.js";

const FormulaVirtualDataRow = memo(function FormulaVirtualDataRow({
  row,
  index,
  selected,
  onToggleSelect,
  onEdit,
  m,
}) {
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";

  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row formula-virtual-data-row ${stripe}`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center">
        {row.no ?? index + 1}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        {row._process ?? toUpperDisplay(row.process)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        {row._account ?? toUpperDisplay(row.account)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-cell-currency">
        {row._currency ?? toUpperDisplay(row.currency)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap" title={row.source}>
        {row._source ?? toUpperDisplay(row.source)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap formula-virtual-cell--product">
        <span className="product-display">{row._product ?? toUpperDisplay(row.product)}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap formula-virtual-cell--input-method"
        title={row.input_method}
      >
        <span className="input-method-display">{row._inputMethod ?? toUpperDisplay(row.input_method)}</span>
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap formula-virtual-cell--formula"
        title={row.formula}
      >
        <span className="formula-display">{row._formula ?? toUpperDisplay(row.formula)}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left formula-virtual-cell--wrap">
        {row._description ?? toUpperDisplay(row.description)}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center formula-virtual-cell-actions">
        <div className="maintenance-formula-actions-inner">
          <button type="button" className="maintenance-edit-btn" onClick={() => onEdit(row)} title={m.edit}>
            <img
              src={assetUrl("images/edit.svg")}
              alt={m.edit}
              className="edit-icon"
              style={{ width: "16px", height: "16px" }}
              loading="lazy"
              decoding="async"
            />
          </button>
          <input
            type="checkbox"
            className="maintenance-row-checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.id)}
          />
        </div>
      </div>
    </div>
  );
});

export default FormulaVirtualDataRow;
