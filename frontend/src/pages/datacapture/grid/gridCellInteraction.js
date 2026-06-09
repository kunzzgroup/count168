/**
 * Active cell, click, and keyboard interaction — merged from legacy grid cell modules.
 */
import {
  gridAddNewColumn,
  gridAddNewRow,
  gridClearAllSelections,
  gridGetSelectedCells,
  gridHasPasteHistory,
  gridRegisterSelectedCell,
  gridRecomputeSubmitState,
  gridUndoLastPaste,
  setBridgeTableActive,
} from "../lib/dataCaptureBridge.js";

function clearAllSelections() {
  gridClearAllSelections();
}

function registerSelectedCell(cell) {
  gridRegisterSelectedCell(cell);
}

export function highlightHeadersForCell(cell) {
  if (!cell || cell.contentEditable !== "true") return;

  const colIndex = parseInt(cell.dataset.col, 10);
  if (Number.isNaN(colIndex)) return;

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return;

  const row = cell.parentElement;
  const rowIndex = Array.from(tableBody.children).indexOf(row);
  if (rowIndex === -1) return;

  const headers = document.querySelectorAll("#dataTable th");
  headers.forEach((header, index) => {
    if (index === 0) return;
    if (index === colIndex + 1) {
      if (!header.classList.contains("column-selected")) {
        header.classList.add("column-active");
      }
    } else if (!header.classList.contains("column-selected")) {
      header.classList.remove("column-active");
    }
  });

  const rowHeader = row.querySelector(".row-header");
  if (rowHeader && !rowHeader.classList.contains("row-selected")) {
    rowHeader.classList.add("row-active");
  }

  Array.from(tableBody.children).forEach((r, index) => {
    const rh = r.querySelector(".row-header");
    if (rh && index !== rowIndex && !rh.classList.contains("row-selected")) {
      rh.classList.remove("row-active");
    }
  });
}

export function setActiveCellCore(cell) {
  if (!cell || cell.contentEditable !== "true") return;

  const activeEl = document.activeElement;
  if (activeEl && activeEl !== cell && activeEl.contentEditable === "true") {
    activeEl.blur();
  }

  clearAllSelections();

  const tableBody = document.getElementById("tableBody");
  if (tableBody) {
    tableBody.querySelectorAll("td.selected").forEach((c) => c.classList.remove("selected"));
  }

  cell.classList.add("selected");
  registerSelectedCell(cell);
  cell.classList.add("multi-selected");
  highlightHeadersForCell(cell);
}

export function setActiveCell(cell) {
  if (!cell || cell.contentEditable !== "true") return;
  setActiveCellCore(cell);
  cell.focus();
}

export function moveCaretToEnd(cell) {
  try {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  } catch (err) {
    console.error("Failed to move caret to end:", err);
  }
}

export function setActiveCellWithoutFocus(cell) {
  if (!cell || cell.contentEditable !== "true") return;
  setActiveCellCore(cell);
}

export function setActiveCellForMouseEdit(cell) {
  if (!cell || cell.contentEditable !== "true") return;
  setActiveCellCore(cell);
  cell.focus();
  moveCaretToEnd(cell);
}

export function moveCaretToClickPosition(cell, clickEvent) {
  try {
    if (document.activeElement !== cell) {
      cell.focus();
    }

    const selection = window.getSelection();
    if (!selection) return;

    setTimeout(() => {
      try {
        let range = null;

        if (document.caretRangeFromPoint) {
          range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (range && cell.contains(range.commonAncestorContainer)) {
            selection.removeAllRanges();
            selection.addRange(range);
            return;
          }
        }

        if (document.caretPositionFromPoint) {
          const caretPos = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
          if (caretPos?.offsetNode && cell.contains(caretPos.offsetNode)) {
            range = document.createRange();
            range.setStart(caretPos.offsetNode, caretPos.offset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
          }
        }

        const rect = cell.getBoundingClientRect();
        const x = clickEvent.clientX - rect.left;
        const text = cell.textContent || "";

        if (text.length === 0) {
          const newRange = document.createRange();
          newRange.setStart(cell, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }

        let textNode = null;
        if (cell.firstChild?.nodeType === Node.TEXT_NODE) {
          textNode = cell.firstChild;
        } else {
          textNode = document.createTextNode(text);
          cell.textContent = "";
          cell.appendChild(textNode);
        }

        const tempRange = document.createRange();
        let charIndex = text.length;
        let minDistance = Infinity;

        for (let i = 0; i <= text.length; i += 1) {
          tempRange.setStart(textNode, i);
          tempRange.setEnd(textNode, i);
          const charRect = tempRange.getBoundingClientRect();
          const charX = charRect.left - rect.left;
          const distance = Math.abs(x - charX);

          if (distance < minDistance) {
            minDistance = distance;
            charIndex = i;
          }
          if (x < charX && i > 0) {
            charIndex = i;
            break;
          }
        }

        charIndex = Math.max(0, Math.min(charIndex, text.length));
        const newRange = document.createRange();
        newRange.setStart(textNode, charIndex);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      } catch (err) {
        console.error("Error setting caret position:", err);
        moveCaretToEnd(cell);
      }
    }, 10);
  } catch (err) {
    console.error("Error moving caret to click position:", err);
    cell.focus();
    moveCaretToEnd(cell);
  }
}

export function handleCellClick(e, cellEl) {
  const cell = cellEl || e.currentTarget || e.target;
  if (!cell || cell.contentEditable !== "true") return;

  setBridgeTableActive(true);
  if (e.ctrlKey || e.metaKey) return;

  setActiveCellCore(cell);
  if (document.activeElement !== cell) {
    cell.focus();
  }
  moveCaretToClickPosition(cell, e);
}

function hasPasteHistory() {
  return gridHasPasteHistory();
}

function undoLastPaste() {
  gridUndoLastPaste();
}

function getSelectedCells() {
  return gridGetSelectedCells();
}

function recomputeSubmitState() {
  gridRecomputeSubmitState();
}

function addNewColumn() {
  return gridAddNewColumn();
}

function addNewRow() {
  return gridAddNewRow();
}

export function handleCellKeydown(e) {
  const raw = e.target;
  const cell =
    raw?.nodeType === Node.TEXT_NODE
      ? raw.parentElement?.closest?.("td[contenteditable='true']")
      : raw?.closest?.("td[contenteditable='true']") || (raw?.contentEditable === "true" ? raw : null);
  if (!cell) return;

  const key = (e.key || "").toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
    if (hasPasteHistory()) {
      e.preventDefault();
      e.stopPropagation();
      undoLastPaste();
      return;
    }
    return;
  }

  const row = cell.parentNode;
  const table = row.parentNode;

  if (e.key === "Backspace" || e.key === "Delete") {
    const hasFocusForDelete = document.activeElement === cell;
    const isSelected = cell.classList.contains("selected") || getSelectedCells().includes(cell);

    if (e.key === "Delete" && (isSelected || hasFocusForDelete)) {
      e.preventDefault();
      cell.textContent = "";
      recomputeSubmitState();
      return;
    }

    const hasContent = cell.textContent.trim() !== "";
    let cursorAtStart = false;
    if (e.key === "Backspace" && hasFocusForDelete) {
      try {
        const selection = window.getSelection();
        if (selection?.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const textNode = range.startContainer;
          const offset = range.startOffset;
          if (textNode.nodeType === Node.TEXT_NODE) {
            cursorAtStart = offset === 0;
          } else {
            cursorAtStart = offset === 0 && !textNode.previousSibling;
          }
        }
      } catch {
        cursorAtStart = false;
      }
    }

    if (!hasFocusForDelete && (cell.classList.contains("selected") || getSelectedCells().includes(cell))) {
      e.preventDefault();
      cell.textContent = "";
      recomputeSubmitState();
      return;
    }

    if (hasFocusForDelete && e.key === "Backspace" && (cursorAtStart || !hasContent)) {
      e.preventDefault();
      cell.textContent = "";
      recomputeSubmitState();
    }
    return;
  }

  const currentRowIdx = Array.from(table.children).indexOf(row);
  const currentColIdx = parseInt(cell.dataset.col, 10);

  switch (e.key) {
    case "Tab": {
      e.preventDefault();
      const nextCell = e.shiftKey ? cell.previousElementSibling : cell.nextElementSibling;
      if (nextCell?.contentEditable === "true") {
        setActiveCell(nextCell);
      } else if (!e.shiftKey) {
        const currentCols = document.querySelectorAll("#tableHeader th").length - 1;
        if (currentCols < 30) {
          const newColIndex = addNewColumn();
          if (newColIndex !== null) {
            const newCell = row.children[newColIndex + 1];
            if (newCell?.contentEditable === "true") {
              setActiveCell(newCell);
            }
          }
        }
      }
      break;
    }
    case "Enter": {
      e.preventDefault();
      const currentRowIndex = Array.from(table.children).indexOf(row);
      const currentCellIndex = Array.from(row.children).indexOf(cell);
      let nextRow = table.children[currentRowIndex + 1];
      if (!nextRow && table.children.length < 702) {
        const newRowIndex = addNewRow();
        if (newRowIndex !== null) {
          nextRow = table.children[newRowIndex];
        }
      }
      if (nextRow) {
        const nextRowCell = nextRow.children[currentCellIndex];
        if (nextRowCell?.contentEditable === "true") {
          setActiveCellForMouseEdit(nextRowCell);
        }
      }
      break;
    }
    case "ArrowUp":
    case "ArrowDown": {
      e.preventDefault();
      e.stopPropagation();
      const verticalDirection = e.key === "ArrowUp" ? -1 : 1;
      const targetRow = table.children[currentRowIdx + verticalDirection];
      if (targetRow) {
        const targetCell = targetRow.children[currentColIdx + 1];
        if (targetCell?.contentEditable === "true") {
          cell.blur();
          clearAllSelections();
          setActiveCellWithoutFocus(targetCell);
        }
      }
      break;
    }
    case "ArrowLeft":
    case "ArrowRight": {
      e.preventDefault();
      e.stopPropagation();
      const horizontalDirection = e.key === "ArrowLeft" ? -1 : 1;
      const targetColIdx = currentColIdx + horizontalDirection;
      const maxCols = document.querySelectorAll("#tableHeader th").length - 1;
      if (targetColIdx >= 0 && targetColIdx < maxCols) {
        cell.blur();
        const targetCell = row.children[targetColIdx + 1];
        if (targetCell?.contentEditable === "true") {
          clearAllSelections();
          setActiveCellWithoutFocus(targetCell);
        }
      }
      break;
    }
    default:
      break;
  }
}
