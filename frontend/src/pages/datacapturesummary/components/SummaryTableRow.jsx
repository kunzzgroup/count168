import { useEffect, useRef } from "react";
import { bindSummaryRowLegacyHandlers } from "../summaryTablePostPopulate.js";

export default function SummaryTableRow({ idProduct, rowIndex }) {
  const rowRef = useRef(null);

  useEffect(() => {
    bindSummaryRowLegacyHandlers(rowRef.current, idProduct);
  }, [idProduct]);

  if (!idProduct?.trim()) return null;

  return (
    <tr ref={rowRef} data-row-index={String(rowIndex)} data-product-type="main">
      <td className="id-product" data-main-product={idProduct} data-sub-product="" title={idProduct}>
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
        <input type="checkbox" className="summary-row-checkbox" data-value={idProduct} />
      </td>
    </tr>
  );
}
