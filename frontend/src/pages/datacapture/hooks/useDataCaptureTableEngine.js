import { useCallback, useEffect, useMemo } from "react";
import { applyTableDataToDom, captureTableDataFromDom } from "../utils/captureTableDataDom.js";

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

function clearHeaderSelectionClasses() {
  document.querySelectorAll("#tableHeader th").forEach((th) => {
    th.classList.remove("column-selected", "column-active");
  });
  document.querySelectorAll("#tableBody .row-header").forEach((td) => {
    td.classList.remove("row-selected", "row-active");
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

function normalizeModel(tableData) {
  if (!tableData || !Array.isArray(tableData.rows)) return { headers: [], rows: [], rowCount: 0, colCount: 0 };
  const rows = tableData.rows.map((row) => (Array.isArray(row) ? row.map((cell) => ({ ...cell })) : []));
  const colCount = rows.reduce((max, row) => Math.max(max, row.filter((cell) => cell?.type === "data").length), 0);
  rows.forEach((row, rowIndex) => {
    const header = row.find((cell) => cell?.type === "header");
    if (header) header.value = String(rowIndex + 1);
    const dataCells = row.filter((cell) => cell?.type === "data");
    for (let c = 0; c < colCount; c += 1) {
      if (!dataCells[c]) {
        row.push({ type: "data", value: "", col: c });
      } else {
        dataCells[c].col = c;
      }
    }
  });
  return {
    headers: Array.from({ length: colCount + 1 }, (_, idx) => (idx === 0 ? "#" : String(idx))),
    rows,
    rowCount: rows.length,
    colCount: colCount + 1,
  };
}

function getSelectedCoordinates() {
  return getSelectedEditableCells().map((cell) => getCellCoordinates(cell)).filter(Boolean);
}

function getModelDataCell(row, colIndex) {
  const dataCells = (Array.isArray(row) ? row : []).filter((cell) => cell?.type === "data");
  return dataCells[colIndex] || null;
}

function shiftSelectedCellsLeft(tableData, coordinates) {
  const next = normalizeModel(tableData);
  const byRow = new Map();
  coordinates.forEach(({ rowIndex, colIndex }) => {
    if (!byRow.has(rowIndex)) byRow.set(rowIndex, []);
    byRow.get(rowIndex).push(colIndex);
  });
  const maxCols = Math.max(0, next.colCount - 1);
  byRow.forEach((cols, rowIndex) => {
    const row = next.rows[rowIndex];
    if (!row) return;
    cols
      .slice()
      .sort((a, b) => b - a)
      .forEach((colIndex) => {
        for (let c = colIndex; c < maxCols - 1; c += 1) {
          const current = getModelDataCell(row, c);
          const right = getModelDataCell(row, c + 1);
          if (current) current.value = String(right?.value || "");
        }
        const last = getModelDataCell(row, maxCols - 1);
        if (last) last.value = "";
      });
  });
  return next;
}

function shiftSelectedCellsUp(tableData, coordinates) {
  const next = normalizeModel(tableData);
  const byCol = new Map();
  coordinates.forEach(({ rowIndex, colIndex }) => {
    if (!byCol.has(colIndex)) byCol.set(colIndex, []);
    byCol.get(colIndex).push(rowIndex);
  });
  byCol.forEach((rowIndexes, colIndex) => {
    rowIndexes
      .slice()
      .sort((a, b) => b - a)
      .forEach((rowIndex) => {
        for (let r = rowIndex; r < next.rows.length - 1; r += 1) {
          const current = getModelDataCell(next.rows[r], colIndex);
          const below = getModelDataCell(next.rows[r + 1], colIndex);
          if (current) current.value = String(below?.value || "");
        }
        const last = getModelDataCell(next.rows[next.rows.length - 1], colIndex);
        if (last) last.value = "";
      });
  });
  return next;
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

export function useDataCaptureTableEngine({ ready, onTableMutated } = {}) {
  const emitTableMutated = useCallback(() => {
    if (typeof onTableMutated === "function") onTableMutated();
  }, [onTableMutated]);

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
        emitTableMutated();
      },
      clearSelectedCells: () => {
        const coords = getSelectedCoordinates();
        if (!coords.length) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        coords.forEach(({ rowIndex, colIndex }) => {
          const row = tableData.rows[rowIndex];
          const cell = getModelDataCell(row, colIndex);
          if (cell) cell.value = "";
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
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
        const tableData = normalizeModel(captureTableDataFromDom());
        tableData.rows.forEach((row) => {
          const dataCells = row.filter((cell) => cell?.type === "data");
          dataCells.splice(colIndex, 0, { type: "data", value: "", col: colIndex });
          dataCells.forEach((cell, idx) => {
            cell.col = idx;
          });
          const headerCell = row.find((cell) => cell?.type === "header");
          row.length = 0;
          if (headerCell) row.push(headerCell);
          row.push(...dataCells);
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
      },
      insertColumnRight: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const insertAt = colIndex + 1;
        const tableData = normalizeModel(captureTableDataFromDom());
        tableData.rows.forEach((row) => {
          const dataCells = row.filter((cell) => cell?.type === "data");
          dataCells.splice(insertAt, 0, { type: "data", value: "", col: insertAt });
          dataCells.forEach((cell, idx) => {
            cell.col = idx;
          });
          const headerCell = row.find((cell) => cell?.type === "header");
          row.length = 0;
          if (headerCell) row.push(headerCell);
          row.push(...dataCells);
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
      },
      deleteColumn: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const totalCols = Math.max(0, tableData.colCount - 1);
        if (totalCols <= 1) return;
        tableData.rows.forEach((row) => {
          const dataCells = row.filter((cell) => cell?.type === "data");
          dataCells.splice(colIndex, 1);
          dataCells.forEach((cell, idx) => {
            cell.col = idx;
          });
          const headerCell = row.find((cell) => cell?.type === "header");
          row.length = 0;
          if (headerCell) row.push(headerCell);
          row.push(...dataCells);
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
      },
      clearColumn: () => {
        const colIndex = findActiveColumnIndex();
        if (colIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        tableData.rows.forEach((row) => {
          const cell = getModelDataCell(row, colIndex);
          if (cell) cell.value = "";
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
      },
      insertRowAbove: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const dataCols = Math.max(0, tableData.colCount - 1);
        const newRow = [{ type: "header", value: "0" }, ...Array.from({ length: dataCols }, (_, c) => ({ type: "data", value: "", col: c }))];
        tableData.rows.splice(rowIndex, 0, newRow);
        applyTableDataToDom(normalizeModel(tableData));
        emitTableMutated();
      },
      insertRowBelow: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const dataCols = Math.max(0, tableData.colCount - 1);
        const newRow = [{ type: "header", value: "0" }, ...Array.from({ length: dataCols }, (_, c) => ({ type: "data", value: "", col: c }))];
        tableData.rows.splice(rowIndex + 1, 0, newRow);
        applyTableDataToDom(normalizeModel(tableData));
        emitTableMutated();
      },
      deleteRow: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        if (tableData.rows.length <= 1) return;
        tableData.rows.splice(rowIndex, 1);
        applyTableDataToDom(normalizeModel(tableData));
        emitTableMutated();
      },
      clearRow: () => {
        const rowIndex = findActiveRowIndex();
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const row = tableData.rows[rowIndex];
        if (!row) return;
        row.forEach((cell) => {
          if (cell?.type === "data") cell.value = "";
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
      },
      closeDeleteDialog: () => {
        const dialog = document.getElementById("deleteDialog");
        if (dialog) dialog.style.display = "none";
      },
      confirmDelete: () => {
        const coords = getSelectedCoordinates();
        if (!coords.length) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const option = document.querySelector("input[name='deleteOption']:checked")?.value || "shiftLeft";
        if (option === "shiftLeft") {
          applyTableDataToDom(shiftSelectedCellsLeft(tableData, coords));
          emitTableMutated();
        } else if (option === "shiftUp") {
          applyTableDataToDom(shiftSelectedCellsUp(tableData, coords));
          emitTableMutated();
        } else if (option === "entireRow") {
          const rowSet = [...new Set(coords.map((c) => c.rowIndex))];
          if (tableData.rows.length - rowSet.length < 1) {
            notify("Cannot delete the last row", "danger");
            return;
          }
          rowSet
            .slice()
            .sort((a, b) => b - a)
            .forEach((rowIndex) => {
              tableData.rows.splice(rowIndex, 1);
            });
          applyTableDataToDom(normalizeModel(tableData));
          emitTableMutated();
        } else if (option === "entireColumn") {
          const totalCols = Math.max(0, tableData.colCount - 1);
          const cols = [...new Set(coords.map((c) => c.colIndex))].sort((a, b) => b - a);
          if (totalCols - cols.length < 1) {
            notify("Cannot delete the last column", "danger");
            return;
          }
          cols.forEach((colIndex) => {
            tableData.rows.forEach((row) => {
              const dataCells = row.filter((cell) => cell?.type === "data");
              dataCells.splice(colIndex, 1);
              dataCells.forEach((cell, idx) => {
                cell.col = idx;
              });
              const headerCell = row.find((cell) => cell?.type === "header");
              row.length = 0;
              if (headerCell) row.push(headerCell);
              row.push(...dataCells);
            });
          });
          applyTableDataToDom(normalizeModel(tableData));
          emitTableMutated();
        }
        clearSelectionClasses();
        const dialog = document.getElementById("deleteDialog");
        if (dialog) dialog.style.display = "none";
      },
    }),
    [emitTableMutated]
  );

  useEffect(() => {
    const tableBody = document.getElementById("tableBody");
    const tableHeader = document.getElementById("tableHeader");
    const contextMenu = document.getElementById("contextMenu");
    const columnContextMenu = document.getElementById("columnContextMenu");
    const rowContextMenu = document.getElementById("rowContextMenu");
    if (!tableBody || !tableHeader) return undefined;

    const showMenuAt = (menu, x, y) => {
      if (!menu) return;
      hideAllContextMenus();
      menu.style.display = "block";
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    };

    const onBodyMouseDown = (event) => {
      const cell = event.target.closest("#tableBody td[contenteditable='true']");
      if (!cell) return;
      clearHeaderSelectionClasses();
      if (event.ctrlKey || event.metaKey) {
        cell.classList.toggle("multi-selected");
        cell.classList.add("selected");
        return;
      }
      clearSelectionClasses();
      cell.classList.add("selected", "multi-selected");
    };

    const onBodyContextMenu = (event) => {
      const rowHeader = event.target.closest("#tableBody .row-header");
      if (rowHeader) {
        event.preventDefault();
        clearSelectionClasses();
        clearHeaderSelectionClasses();
        rowHeader.classList.add("row-active", "row-selected");
        showMenuAt(rowContextMenu, event.clientX, event.clientY);
        return;
      }

      const cell = event.target.closest("#tableBody td[contenteditable='true']");
      if (!cell) return;
      event.preventDefault();
      clearHeaderSelectionClasses();
      if (!cell.classList.contains("multi-selected")) {
        clearSelectionClasses();
        cell.classList.add("selected", "multi-selected");
      }
      showMenuAt(contextMenu, event.clientX, event.clientY);
    };

    const onHeaderMouseDown = (event) => {
      const header = event.target.closest("#tableHeader th");
      if (!header) return;
      if (header.cellIndex === 0) return;
      clearSelectionClasses();
      clearHeaderSelectionClasses();
      header.classList.add("column-active", "column-selected");
    };

    const onHeaderContextMenu = (event) => {
      const header = event.target.closest("#tableHeader th");
      if (!header || header.cellIndex === 0) return;
      event.preventDefault();
      clearSelectionClasses();
      clearHeaderSelectionClasses();
      header.classList.add("column-active", "column-selected");
      showMenuAt(columnContextMenu, event.clientX, event.clientY);
    };

    const onDocumentClick = (event) => {
      const insideMenu = event.target.closest(".context-menu");
      if (!insideMenu) hideAllContextMenus();
    };

    let timeoutId = null;
    const onTableInput = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => emitTableMutated(), 80);
    };
    tableBody.addEventListener("mousedown", onBodyMouseDown);
    tableBody.addEventListener("contextmenu", onBodyContextMenu);
    tableBody.addEventListener("input", onTableInput);
    tableBody.addEventListener("paste", onTableInput, true);
    tableHeader.addEventListener("mousedown", onHeaderMouseDown);
    tableHeader.addEventListener("contextmenu", onHeaderContextMenu);
    document.addEventListener("click", onDocumentClick);

    return () => {
      window.clearTimeout(timeoutId);
      tableBody.removeEventListener("mousedown", onBodyMouseDown);
      tableBody.removeEventListener("contextmenu", onBodyContextMenu);
      tableBody.removeEventListener("input", onTableInput);
      tableBody.removeEventListener("paste", onTableInput, true);
      tableHeader.removeEventListener("mousedown", onHeaderMouseDown);
      tableHeader.removeEventListener("contextmenu", onHeaderContextMenu);
      document.removeEventListener("click", onDocumentClick);
    };
  }, [ready, emitTableMutated]);

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
