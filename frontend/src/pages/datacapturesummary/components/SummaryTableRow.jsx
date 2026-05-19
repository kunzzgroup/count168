import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { bindSummaryRowLegacyHandlers } from "../summaryTablePostPopulate.js";

function SummaryTableRowInner({
  rowKey,
  idProduct,
  rowIndex,
  productType = "main",
  parentIdProduct = null,
  parentRowIndex = null,
  userCleared = false,
}) {
  const rowRef = useRef(null);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el || !rowKey) return;
    el.setAttribute("data-react-row-key", rowKey);
    if (userCleared) {
      el.setAttribute("data-row-user-cleared", "1");
    } else {
      el.removeAttribute("data-row-user-cleared");
    }
  }, [rowKey, userCleared]);

  useEffect(() => {
    if (userCleared) return;
    bindSummaryRowLegacyHandlers(rowRef.current, idProduct);
  }, [idProduct, rowKey, userCleared]);

  if (!idProduct?.trim()) return null;

  const isSub = productType === "sub";
  const idCellClass = isSub ? "id-product sub-id-product" : "id-product";

  return (
    <tr
      ref={rowRef}
      data-row-index={String(rowIndex)}
      data-product-type={productType}
      data-parent-id-product={isSub ? parentIdProduct || idProduct : undefined}
      data-parent-row-index={
        isSub && parentRowIndex != null ? String(parentRowIndex) : undefined
      }
    >
      <td
        className={idCellClass}
        data-main-product={idProduct}
        data-sub-product=""
        title={idProduct}
      >
        {idProduct}
      </td>
      <td />
      <td>
        <button type="button" className="add-account-btn">
          +
        </button>
      </td>
      <td />
      <td />
      <td />
      <td style={{ textAlign: "center" }}>
        <input type="checkbox" className="rate-checkbox" />
      </td>
      <td className="editable-cell" style={{ textAlign: "center", cursor: "text" }} />
      <td />
      <td style={{ textAlign: "center" }}>
        <input type="checkbox" className="summary-select-checkbox" />
      </td>
      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          className="summary-row-checkbox"
          data-value={idProduct}
          disabled={isSub}
          title={isSub ? "Empty sub rows cannot be deleted" : undefined}
        />
      </td>
    </tr>
  );
}

const SummaryTableRow = memo(
  SummaryTableRowInner,
  (prev, next) =>
    prev.rowKey === next.rowKey &&
    prev.idProduct === next.idProduct &&
    prev.rowIndex === next.rowIndex &&
    prev.productType === next.productType &&
    prev.parentIdProduct === next.parentIdProduct &&
    prev.parentRowIndex === next.parentRowIndex &&
    prev.userCleared === next.userCleared
);

export default SummaryTableRow;
