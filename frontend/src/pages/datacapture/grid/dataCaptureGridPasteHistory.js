import {
  getPasteGridModel,
  gridClearAllSelections,
  gridRecomputeSubmitState,
  notifyPasteUser,
  replacePasteGridModel,
} from "../lib/dataCaptureBridge.js";
import { cloneGrid, setCell } from "./gridModel.js";

const MAX_HISTORY_SIZE = 50;

export const pasteHistory = [];

function isGridSnapshotEntry(entry) {
  return entry?.type === "grid" && entry.snapshot;
}

export function pushPasteHistory(entry) {
  if (!entry) return;

  if (isGridSnapshotEntry(entry)) {
    pasteHistory.push(entry);
  } else if (Array.isArray(entry) && entry.length > 0) {
    pasteHistory.push(entry);
  } else {
    return;
  }

  if (pasteHistory.length > MAX_HISTORY_SIZE) {
    pasteHistory.shift();
  }
}

/** @param {import("./gridModel.js").DataCaptureGridModel | null | undefined} grid */
export function pushPasteGridSnapshot(grid) {
  const snapshot = cloneGrid(grid);
  if (!snapshot) return;
  pushPasteHistory({ type: "grid", snapshot });
}

export function clearPasteHistory() {
  pasteHistory.length = 0;
}

export function hasPasteHistory() {
  return pasteHistory.length > 0;
}

function restoreLegacyCellChanges(lastPaste, grid) {
  let next = grid;
  let undoCount = 0;

  lastPaste.forEach((change) => {
    if (!next.cells?.[change.row]?.[change.col]) return;
    const patch = {
      value: change.oldValue ?? "",
      html: change.oldHtml,
      style: change.oldStyle,
      styleCssText: change.oldStyleCssText,
      className: change.oldClassName,
      colspan: change.oldColspan,
      hidden: change.oldHidden,
    };
    next = setCell(next, change.row, change.col, patch);
    undoCount += 1;
  });

  return { next, undoCount };
}

export function undoLastPaste() {
  if (pasteHistory.length === 0) {
    notifyPasteUser("No paste operation to undo", "danger");
    return;
  }

  const lastPaste = pasteHistory.pop();
  const current = getPasteGridModel();
  if (!current) return;

  if (isGridSnapshotEntry(lastPaste)) {
    replacePasteGridModel(cloneGrid(lastPaste.snapshot));
    gridClearAllSelections();
    gridRecomputeSubmitState();
    notifyPasteUser("Undo completed: restored previous table state", "success");
    return;
  }

  if (Array.isArray(lastPaste)) {
    const { next, undoCount } = restoreLegacyCellChanges(lastPaste, current);
    replacePasteGridModel(next);
    gridClearAllSelections();
    gridRecomputeSubmitState();
    notifyPasteUser(`Undo completed: ${undoCount} cells restored`, "success");
    return;
  }

  notifyPasteUser("No paste operation to undo", "danger");
}
