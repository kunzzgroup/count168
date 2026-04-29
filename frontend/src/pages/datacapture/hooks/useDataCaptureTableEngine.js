import { useEffect, useMemo } from "react";

function getEditableCells() {
  return Array.from(document.querySelectorAll("#tableBody td[contenteditable='true']"));
}

function getSelectedEditableCells() {
  const selected = Array.from(document.querySelectorAll("#tableBody td[contenteditable='true'].multi-selected"));
  if (selected.length > 0) return selected;
  const active = Array.from(document.querySelectorAll("#tableBody td[contenteditable='true'].selected"));
  return active;
}

function clearSelectionClasses() {
  getEditableCells().forEach((cell) => {
    cell.classList.remove("multi-selected");
    cell.classList.remove("selected");
  });
}

function hideAllContextMenus() {
  ["contextMenu", "columnContextMenu", "rowContextMenu"].forEach((id) => {
    const menu = document.getElementById(id);
    if (menu) menu.style.display = "none";
  });
}

function getDataColCount() {
  const firstRow = document.querySelector("#tableBody tr");
  if (!firstRow) return 0;
  return Array.from(firstRow.querySelectorAll("td[data-col]")).length;
}

function findActiveColumnIndex() {
  const headerCells = Array.from(document.querySelectorAll("#tableHeader tr th"));
  const activeHeader = headerCells.find((th) => th.classList.contains("column-selected") || th.classList.contains("column-active"));
  if (!activeHeader) return null;
  return Math.max(0, headerCells.indexOf(activeHeader) - 1);
}

function findActiveRowIndex() {
  const rows = Array.from(document.querySelectorAll("#tableBody tr"));
  const idx = rows.findIndex((row) => {
    const header = row.querySelector(".row-header");
    return header && (header.classList.contains("row-selected") || header.classList.contains("row-active"));
  });
  return idx >= 0 ? idx : null;
}

function refreshHeaderLabels() {
  const rowHeaders = Array.from(document.querySelectorAll("#tableBody .row-header"));
  rowHeaders.forEach((header, idx) => {
    header.textContent = String(idx + 1);
  });
}

function createEditableCell(col) {
  const cell = document.createElement("td");
  cell.contentEditable = "true";
  cell.dataset.col = String(col);
  return cell;
}

function normalizeDataCols() {
  const rows = Array.from(document.querySelectorAll("#tableBody tr"));
  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td[data-col]"));
    cells.forEach((cell, idx) => {
      cell.dataset.col = String(idx);
    });
  });
}

function notify(message, type = "danger") {
  const container = document.getElementById("processNotificationContainer");
  if (!container) return;
  const node = document.createElement("div");
  node.className = `process-notification process-notification-${type}`;
  node.textContent = message;
  container.appendChild(node);
  setTimeout(() => node.classList.add("show"), 10);
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 300);
  }, 1500);
}

function getCellCoordinates(cell) {
  const row = cell?.parentElement;
  if (!row) return null;
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return null;
  const rowIndex = Array.from(tableBody.children).indexOf(row);
  const colIndex = Number(cell.dataset.col);
  if (rowIndex < 0 || Number.isNaN(colIndex)) return null;
  return { rowIndex, colIndex };
}

function shiftSelectedCellsLeft(selectedCells) {
  const byRow = new Map();
  selectedCells.forEach((cell) => {
    const coords = getCellCoordinates(cell);
    if (!coords) return;
    if (!byRow.has(coords.rowIndex)) byRow.set(coords.rowIndex, []);
    byRow.get(coords.rowIndex).push(coords.colIndex);
  });
  byRow.forEach((cols, rowIndex) => {
    const row = document.querySelectorAll("#tableBody tr")[rowIndex];
    if (!row) return;
    const maxCols = row.querySelectorAll("td[data-col]").length;
    cols
      .slice()
      .sort((a, b) => b - a)
      .forEach((colIndex) => {
        for (let c = colIndex; c < maxCols - 1; c += 1) {
          const current = row.querySelector(`td[data-col="${c}"]`);
          const next = row.querySelector(`td[data-col="${c + 1}"]`);
          if (!current || !next) continue;
          current.textContent = next.textContent || "";
        }
        const last = row.querySelector(`td[data-col="${maxCols - 1}"]`);
        if (last) last.textContent = "";
      });
  });
}

function shiftSelectedCellsUp(selectedCells) {
  const byCol = new Map();
  selectedCells.forEach((cell) => {
    const coords = getCellCoordinates(cell);
    if (!coords) return;
    if (!byCol.has(coords.colIndex)) byCol.set(coords.colIndex, []);
    byCol.get(coords.colIndex).push(coords.rowIndex);
  });
  const rows = Array.from(document.querySelectorAll("#tableBody tr"));
  byCol.forEach((rowIndexes, colIndex) => {
    rowIndexes
      .slice()
      .sort((a, b) => b - a)
      .forEach((rowIndex) => {
        for (let r = rowIndex; r < rows.length - 1; r += 1) {
          const current = rows[r]?.querySelector(`td[data-col="${colIndex}"]`);
          const next = rows[r + 1]?.querySelector(`td[data-col="${colIndex}"]`);
          if (!current || !next) continue;
          current.textContent = next.textContent || "";
        }
        const last = rows[rows.length - 1]?.querySelector(`td[data-col="${colIndex}"]`);
        if (last) last.textContent = "";
      });
  });
}

async function copyCellsToClipboard(cells) {
  if (!cells.length) return;
  const grouped = new Map();
  for (const cell of cells) {
    const row = cell.parentElement;
    if (!row) continue;
    const rowIndex = row.rowIndex;
    const col = Number(cell.dataset.col);
    if (Number.isNaN(col)) continue;
    if (!grouped.has(rowIndex)) grouped.set(rowIndex, []);
    grouped.get(rowIndex).push({ col, text: cell.textContent || "" });
  }

  const sortedRows = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  const lines = sortedRows.map(([, items]) => items.sort((a, b) => a.col - b.col).map((i) => i.text).join("\t"));
  const text = lines.join("\n");
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

async function pasteFromClipboardToCells(targetCells) {
  if (!targetCells.length) return;
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (!text) return;
  const rows = text.split(/\r?\n/).map((r) => r.split("\t"));
  const first = targetCells[0];
  const startRow = first.parentElement?.rowIndex;
  const startCol = Number(first.dataset.col);
  if (startRow == null || Number.isNaN(startCol)) return;

  rows.forEach((rowVals, rIdx) => {
    rowVals.forEach((value, cIdx) => {
      const rowEl = document.querySelector(`#tableBody tr:nth-child(${startRow + rIdx})`);
      if (!rowEl) return;
      const cell = rowEl.querySelector(`td[data-col="${startCol + cIdx}"]`);
      if (!cell || cell.contentEditable !== "true") return;
      cell.textContent = value;
    });
  });
}

export function useDataCaptureTableEngine() {
  const engine = useMemo(
    () => ({
      copySelectedCells: async () => {
        const selected = getSelectedEditableCells();
        if (!selected.length) return;
        await copyCellsToClipboard(selected);
      },
      pasteToSelectedCells: async () => {
        const selected = getSelectedEditableCells();
        if (!selected.length) return;
        await pasteFromClipboardToCells(selected);
      },
      clearSelectedCells: () => {
        const selected = getSelectedEditableCells();
        selected.forEach((cell) => {
          cell.textContent = "";
        });
      },
      showDeleteDialog: () => {
        const selected = getSelectedEditableCells();
        if (!selected.length) {
          hideAllContextMenus();
          return;
        }
        hideAllContextMenus();
        const dialog = document.getElementById("deleteDialog");
        if (!dialog) return;
        const defaultOption = document.querySelector("input[name='deleteOption'][value='shiftLeft']");
        if (defaultOption) defaultOption.checked = true;
        dialog.style.display = "block";
      },
      selectAllCells: () => {
        clearSelectionClasses();
        const cells = getEditableCells();
        cells.forEach((cell, idx) => {
          cell.classList.add("multi-selected");
          if (idx === 0) cell.classList.add("selected");
        });
      },
      insertColumnLeft: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const headerRow = document.querySelector("#tableHeader tr");
        if (headerRow) {
          const th = document.createElement("th");
          headerRow.insertBefore(th, headerRow.children[colIndex + 1] || null);
        }
        const rows = Array.from(document.querySelectorAll("#tableBody tr"));
        rows.forEach((row) => {
          row.insertBefore(createEditableCell(colIndex), row.children[colIndex + 1] || null);
        });
        normalizeDataCols();
      },
      insertColumnRight: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const insertAt = colIndex + 1;
        const headerRow = document.querySelector("#tableHeader tr");
        if (headerRow) {
          const th = document.createElement("th");
          headerRow.insertBefore(th, headerRow.children[insertAt + 1] || null);
        }
        const rows = Array.from(document.querySelectorAll("#tableBody tr"));
        rows.forEach((row) => {
          row.insertBefore(createEditableCell(insertAt), row.children[insertAt + 1] || null);
        });
        normalizeDataCols();
      },
      deleteColumn: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const totalCols = getDataColCount();
        if (totalCols <= 1) return;
        const headerRow = document.querySelector("#tableHeader tr");
        if (headerRow?.children[colIndex + 1]) {
          headerRow.children[colIndex + 1].remove();
        }
        const rows = Array.from(document.querySelectorAll("#tableBody tr"));
        rows.forEach((row) => {
          const cell = row.querySelector(`td[data-col="${colIndex}"]`);
          if (cell) cell.remove();
        });
        normalizeDataCols();
      },
      clearColumn: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const rows = Array.from(document.querySelectorAll("#tableBody tr"));
        rows.forEach((row) => {
          const cell = row.querySelector(`td[data-col="${colIndex}"]`);
          if (cell) cell.textContent = "";
        });
      },
      insertRowAbove: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const body = document.getElementById("tableBody");
        const target = body?.children[rowIndex];
        if (!body || !target) return;
        const newRow = document.createElement("tr");
        const rowHeader = document.createElement("td");
        rowHeader.className = "row-header";
        rowHeader.textContent = "0";
        newRow.appendChild(rowHeader);
        const colCount = getDataColCount();
        for (let c = 0; c < colCount; c += 1) {
          newRow.appendChild(createEditableCell(c));
        }
        body.insertBefore(newRow, target);
        refreshHeaderLabels();
      },
      insertRowBelow: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const body = document.getElementById("tableBody");
        const target = body?.children[rowIndex];
        if (!body || !target) return;
        const newRow = document.createElement("tr");
        const rowHeader = document.createElement("td");
        rowHeader.className = "row-header";
        rowHeader.textContent = "0";
        newRow.appendChild(rowHeader);
        const colCount = getDataColCount();
        for (let c = 0; c < colCount; c += 1) {
          newRow.appendChild(createEditableCell(c));
        }
        body.insertBefore(newRow, target.nextSibling);
        refreshHeaderLabels();
      },
      deleteRow: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const body = document.getElementById("tableBody");
        if (!body || body.children.length <= 1) return;
        const row = body.children[rowIndex];
        if (row) row.remove();
        refreshHeaderLabels();
      },
      clearRow: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const row = document.querySelectorAll("#tableBody tr")[rowIndex];
        if (!row) return;
        Array.from(row.querySelectorAll("td[data-col]")).forEach((cell) => {
          cell.textContent = "";
        });
      },
      closeDeleteDialog: () => {
        const dialog = document.getElementById("deleteDialog");
        if (dialog) dialog.style.display = "none";
      },
      confirmDelete: () => {
        const selected = getSelectedEditableCells();
        if (!selected.length) return;
        const option = document.querySelector("input[name='deleteOption']:checked")?.value || "shiftLeft";
        if (option === "shiftLeft") {
          shiftSelectedCellsLeft(selected);
        } else if (option === "shiftUp") {
          shiftSelectedCellsUp(selected);
        } else if (option === "entireRow") {
          const body = document.getElementById("tableBody");
          if (!body) return;
          const uniqueRows = [...new Set(selected.map((cell) => cell.parentElement))];
          if (body.children.length - uniqueRows.length < 1) {
            notify("Cannot delete the last row", "danger");
            return;
          }
          uniqueRows.forEach((row) => row?.remove());
          refreshHeaderLabels();
        } else if (option === "entireColumn") {
          const totalCols = getDataColCount();
          const cols = [...new Set(selected.map((cell) => Number(cell.dataset.col)).filter((c) => !Number.isNaN(c)))].sort((a, b) => b - a);
          if (totalCols - cols.length < 1) {
            notify("Cannot delete the last column", "danger");
            return;
          }
          cols.forEach((colIndex) => {
            const headerRow = document.querySelector("#tableHeader tr");
            if (headerRow?.children[colIndex + 1]) headerRow.children[colIndex + 1].remove();
            const rows = Array.from(document.querySelectorAll("#tableBody tr"));
            rows.forEach((row) => {
              const cell = row.querySelector(`td[data-col="${colIndex}"]`);
              if (cell) cell.remove();
            });
          });
          normalizeDataCols();
        }
        clearSelectionClasses();
        const dialog = document.getElementById("deleteDialog");
        if (dialog) dialog.style.display = "none";
      },
    }),
    []
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tag = String(target?.tagName || "").toLowerCase();
      const isTyping =
        target?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";
      if (isTyping) return;

      const key = String(event.key || "").toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      if (ctrlOrMeta && key === "c") {
        engine.copySelectedCells();
        event.preventDefault();
      } else if (ctrlOrMeta && key === "v") {
        engine.pasteToSelectedCells();
        event.preventDefault();
      } else if (ctrlOrMeta && key === "a") {
        engine.selectAllCells();
        event.preventDefault();
      } else if (key === "delete") {
        engine.clearSelectedCells();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [engine]);

  useEffect(() => {
    const onClick = (event) => {
      const dialog = document.getElementById("deleteDialog");
      if (!dialog || dialog.style.display !== "block") return;
      if (event.target === dialog) {
        engine.closeDeleteDialog();
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [engine]);

  return engine;
}
