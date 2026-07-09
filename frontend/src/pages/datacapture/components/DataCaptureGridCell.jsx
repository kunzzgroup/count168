import { memo, useCallback, useLayoutEffect, useRef } from "react";
import {
  highlightHeadersForCell,
  replaceTextContentPreservingCaret,
} from "../grid/gridCellInteraction.js";
import { applyCellModelToElement } from "../grid/gridDomAdapter.js";
import { formatMoneyDisplay } from "../paste/core/dataCapturePasteMoneyUtils.js";
import {
  getBridgeCaptureType,
  gridHandleCellPaste,
  gridRecomputeSubmitState,
  updateBridgeCell,
} from "../lib/dataCaptureBridge.js";
function isTextOrFormatCaptureType(captureType = getBridgeCaptureType("")) {
  return captureType === "1.Text" || captureType === "2.Format";
}

/** Manual cell edits are always stored uppercase (AAA, BBB, ABC, …). */
function normalizeCellEditValue(value) {
  return String(value ?? "").toUpperCase();
}

function finalizeCellEditValue(value, captureType = getBridgeCaptureType("")) {
  let next = normalizeCellEditValue(value);
  if (!isTextOrFormatCaptureType(captureType)) {
    const trimmed = String(next).trim();
    if (trimmed) {
      next = formatMoneyDisplay(trimmed);
    }
  }
  return next;
}

function shouldRenderCellTextHighlight(cell) {
  const value = String(cell?.value ?? "").trim();
  if (!value) return false;
  if (cell?.html) return false;
  if (cell?.styleCssText) return false;
  if (cell?.className) return false;
  if (cell?.style && typeof cell.style === "object" && Object.keys(cell.style).length > 0) {
    return false;
  }
  return true;
}

const CELL_HIGHLIGHT_CHAR_COUNT = 3;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHighlightedTextHtml(value, highlightCount = CELL_HIGHLIGHT_CHAR_COUNT) {
  const raw = String(value ?? "");
  if (!raw) return "";

  const chars = Array.from(raw);
  const safeCount = Math.max(0, Math.min(highlightCount, chars.length));
  const leading = chars.slice(0, safeCount).join("");
  const trailing = chars.slice(safeCount).join("");

  if (!leading) return escapeHtml(raw);
  return `<span class="dc-cell-highlight-token">${escapeHtml(leading)}</span>${escapeHtml(trailing)}`;
}

/**
 * Editable grid cell — contentEditable for input UX; React grid model is SSOT.
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
  const enableTextHighlight = shouldRenderCellTextHighlight(cell);
  const plainCellValue = String(cell?.value ?? "");

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
    if (document.activeElement === elRef.current) return;
    if (!enableTextHighlight) return;

    const highlightedHtml = buildHighlightedTextHtml(plainCellValue);
    if (highlightedHtml && elRef.current.innerHTML !== highlightedHtml) {
      elRef.current.innerHTML = highlightedHtml;
    }
  }, [cell, gridVersion, enableTextHighlight, plainCellValue]);

  const commitCellValue = useCallback(
    (value, extraPatch = {}) => {
      updateBridgeCell(rowIndex, colIndex, {
        value: value ?? "",
        html: undefined,
        ...extraPatch,
      });
      gridRecomputeSubmitState();
    },
    [rowIndex, colIndex],
  );

  const handleInput = useCallback(
    (e) => {
      const target = e.currentTarget;
      const value = normalizeCellEditValue(target.textContent ?? "");
      replaceTextContentPreservingCaret(target, value);
      commitCellValue(value);
    },
    [commitCellValue],
  );

  const handleFocus = useCallback(
    (e) => {
      const target = e.currentTarget;
      const value = String(cell?.value ?? target.textContent ?? "");
      if ((target.textContent ?? "") !== value) {
        target.textContent = value;
      }
      target.classList.add("selected");
      highlightHeadersForCell(target);
      gridRecomputeSubmitState();
    },
    [cell?.value],
  );

  const handleBlur = useCallback(
    (e) => {
      const target = e.currentTarget;
      target.classList.remove("selected");

      const value = finalizeCellEditValue(target.textContent ?? "");
      if (value !== target.textContent) {
        target.textContent = value;
      }

      commitCellValue(value);
    },
    [commitCellValue],
  );

  const handlePaste = useCallback((e) => {
    gridHandleCellPaste(e);
  }, []);

  const sharedProps = {
    ref: setRef,
    contentEditable: true,
    suppressContentEditableWarning: true,
    "data-col": colIndex,
    "data-row": rowIndex,
    "data-dc-highlight-text": enableTextHighlight ? "1" : "0",
    onMouseDown,
    onMouseOver,
    onClick,
    onKeyDown,
    onContextMenu,
    onInput: handleInput,
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
