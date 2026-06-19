import {
  getPasteGridModel,
  gridClearAllSelections,
  gridRecomputeSubmitState,
  notifyPasteUser,
  replacePasteGridModel,
  runConvertTableOnSubmit,
} from "../lib/dataCaptureBridge.js";
import { cloneGrid, setCell } from "./gridModel.js";

const MAX_HISTORY_SIZE = 50;

/** @type {Array<{ type: "grid", snapshot: import("./gridModel.js").DataCaptureGridModel } | unknown[]>} */
export const pasteHistory = [];

/** Index of the current grid checkpoint in `pasteHistory`. */
let checkpointCursor = -1;

/** Bumps on undo to cancel in-flight post-paste convert + checkpoint commits. */
let pasteFinalizeGeneration = 0;

function isGridSnapshotEntry(entry) {
  return entry?.type === "grid" && entry.snapshot;
}

function truncateForwardCheckpoints() {
  if (checkpointCursor < 0) {
    pasteHistory.length = 0;
    return;
  }
  pasteHistory.length = checkpointCursor + 1;
}

function pushCheckpointSnapshot(snapshot) {
  if (!snapshot) return;
  truncateForwardCheckpoints();
  pasteHistory.push({ type: "grid", snapshot });
  checkpointCursor = pasteHistory.length - 1;
  if (pasteHistory.length > MAX_HISTORY_SIZE) {
    pasteHistory.shift();
    checkpointCursor = pasteHistory.length - 1;
  }
}

/** Establish baseline checkpoint after grid init / clear / restore. */
export function resetPasteUndoCheckpoints(grid) {
  pasteFinalizeGeneration += 1;
  pasteHistory.length = 0;
  checkpointCursor = -1;
  const snapshot = cloneGrid(grid ?? getPasteGridModel());
  if (snapshot) {
    pushCheckpointSnapshot(snapshot);
  }
}

/** Record grid state after a successful paste (and optional convert). */
export function commitPasteGridCheckpoint(grid = getPasteGridModel()) {
  const snapshot = cloneGrid(grid);
  if (!snapshot) return;
  pushCheckpointSnapshot(snapshot);
}

export function pushPasteHistory(entry) {
  if (isGridSnapshotEntry(entry)) {
    pushCheckpointSnapshot(cloneGrid(entry.snapshot));
    return;
  }
  if (Array.isArray(entry) && entry.length > 0) {
    truncateForwardCheckpoints();
    pasteHistory.push(entry);
    checkpointCursor = pasteHistory.length - 1;
    if (pasteHistory.length > MAX_HISTORY_SIZE) {
      pasteHistory.shift();
      checkpointCursor = pasteHistory.length - 1;
    }
  }
}

/** @param {import("./gridModel.js").DataCaptureGridModel | null | undefined} grid */
export function pushPasteGridSnapshot(grid) {
  commitPasteGridCheckpoint(grid);
}

/**
 * Finish paste pipeline: optionally run convert, then commit one undo checkpoint.
 * @param {number} successCount
 * @param {{ runConvert?: boolean, convertDelay?: number, beforeCommit?: () => void }} [options]
 */
export function finalizePasteWithOptionalConvert(successCount, options = {}) {
  if (!(successCount > 0)) return;

  const { runConvert = false, convertDelay = 100, beforeCommit = null } = options;
  const generation = ++pasteFinalizeGeneration;

  const finish = () => {
    if (generation !== pasteFinalizeGeneration) return;
    if (typeof beforeCommit === "function") {
      beforeCommit();
    }
    commitPasteGridCheckpoint();
    gridRecomputeSubmitState();
  };

  if (!runConvert) {
    finish();
    return;
  }

  const run = () => {
    if (generation !== pasteFinalizeGeneration) return;
    runConvertTableOnSubmit();
    finish();
  };

  if (convertDelay > 0) {
    setTimeout(run, convertDelay);
  } else {
    run();
  }
}

export function clearPasteHistory() {
  resetPasteUndoCheckpoints(getPasteGridModel());
}

export function hasPasteHistory() {
  return checkpointCursor > 0;
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
  pasteFinalizeGeneration += 1;

  if (checkpointCursor <= 0) {
    notifyPasteUser("No paste operation to undo", "danger");
    return;
  }

  const current = getPasteGridModel();
  if (!current) return;

  checkpointCursor -= 1;
  const target = pasteHistory[checkpointCursor];

  if (Array.isArray(target)) {
    const { next, undoCount } = restoreLegacyCellChanges(target, current);
    replacePasteGridModel(next);
    gridClearAllSelections();
    gridRecomputeSubmitState();
    notifyPasteUser(`Undo completed: ${undoCount} cells restored`, "success");
    return;
  }

  if (!isGridSnapshotEntry(target)) {
    checkpointCursor += 1;
    notifyPasteUser("No paste operation to undo", "danger");
    return;
  }

  replacePasteGridModel(cloneGrid(target.snapshot));
  gridClearAllSelections();
  gridRecomputeSubmitState();

  const remaining = checkpointCursor;
  notifyPasteUser(
    remaining > 0
      ? `Undo completed (${remaining} more paste step${remaining === 1 ? "" : "s"} can be undone)`
      : "Undo completed: restored initial table state",
    "success",
  );
}
