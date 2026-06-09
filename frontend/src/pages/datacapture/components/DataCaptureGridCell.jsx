import { memo, useCallback, useLayoutEffect, useRef } from "react";
import { highlightHeadersForCell } from "../grid/gridCellInteraction.js";
import { applyCellModelToElement } from "../grid/gridDomAdapter.js";
import { formatMoneyDisplay } from "../paste/core/dataCapturePasteMoneyUtils.js";
import { getBridgeCaptureType, gridHandleCellPaste, gridRecomputeSubmitState } from "../lib/dataCaptureBridge.js";

function shouldSkipBlurMoneyFormat() {
  const captureType = getBridgeCaptureType("");
  return captureType === "1.Text" || captureType === "2.Format";
}

/**
 * Editable grid cell — uncontrolled contentEditable; DOM syncs to model on blur / version bumps.
 */
function DataCaptureGridCell({
  rowIndex,
  colIndex,
  cell,
  gridVersion,
  onMouseDown,
  onMouseOver,
  onClick,
  onKeyDown,
  onContextMenu,
}) {
  const elRef = useRef(null);
  const lastVersionRef = useRef(-1);

  const setRef = useCallback((el) => {
    elRef.current = el;
  }, []);

  useLayoutEffect(() => {
    if (!elRef.current) return;
    const versionBumped = lastVersionRef.current !== gridVersion;
    if (versionBumped) {
      lastVersionRef.current = gridVersion;
    }
    if (document.activeElement === elRef.current && !versionBumped) return;
    applyCellModelToElement(elRef.current, cell);
  }, [cell, gridVersion]);

  const handleFocus = useCallback((e) => {
    const target = e.currentTarget;
    target.classList.add("selected");
    highlightHeadersForCell(target);
    gridRecomputeSubmitState();
  }, []);

  const handleBlur = useCallback((e) => {
    const target = e.currentTarget;
    target.classList.remove("selected");
    if (shouldSkipBlurMoneyFormat()) return;

    const t = (target.textContent || "").trim();
    if (!t) return;

    const displayed = formatMoneyDisplay(t);
    if (displayed !== t) {
      target.textContent = displayed;
    }
  }, []);

  const handlePaste = useCallback((e) => {
    gridHandleCellPaste(e);
  }, []);

  const sharedProps = {
    ref: setRef,
    contentEditable: true,
    suppressContentEditableWarning: true,
    "data-col": colIndex,
    "data-row": rowIndex,
    onMouseDown,
    onMouseOver,
    onClick,
    onKeyDown,
    onContextMenu,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onPaste: handlePaste,
  };

  if (cell?.hidden) {
    return (
      <td
        {...sharedProps}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    );
  }

  const colspan = cell?.colspan && cell.colspan > 1 ? cell.colspan : undefined;

  return <td {...sharedProps} colSpan={colspan} />;
}

export default memo(DataCaptureGridCell);
