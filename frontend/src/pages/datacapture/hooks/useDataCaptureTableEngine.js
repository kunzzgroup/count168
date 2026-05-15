import { useCallback, useEffect, useMemo, useState } from "react";
import { applyTableDataToDom, captureTableDataFromDom } from "../utils/captureTableDataDom.js";

function hideAllContextMenus() {
  ["contextMenu", "columnContextMenu", "rowContextMenu"].forEach((id) => {
    const menu = document.getElementById(id);
    if (menu) menu.style.display = "none";
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

function getCoordKey({ rowIndex, colIndex }) {
  return `${rowIndex}:${colIndex}`;
}

function dedupeCoordinates(coords) {
  const map = new Map();
  coords.forEach((coord) => {
    if (!coord) return;
    map.set(getCoordKey(coord), coord);
  });
  return Array.from(map.values());
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

async function copyCellsToClipboard(tableData, coordinates) {
  if (!coordinates.length) return;
  const grouped = new Map();
  const model = normalizeModel(tableData);
  for (const { rowIndex, colIndex } of coordinates) {
    const cell = getModelDataCell(model.rows[rowIndex], colIndex);
    if (!cell) continue;
    if (!grouped.has(rowIndex)) grouped.set(rowIndex, []);
    grouped.get(rowIndex).push({ col: colIndex, text: String(cell.value || "") });
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

async function pasteFromClipboardToModel(tableData, coordinates) {
  if (!coordinates.length) return null;
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return null;
  }
  if (!text) return null;
  const rows = text.split(/\r?\n/).map((r) => r.split("\t"));
  const sorted = coordinates.slice().sort((a, b) => (a.rowIndex - b.rowIndex) || (a.colIndex - b.colIndex));
  const startRow = sorted[0]?.rowIndex;
  const startCol = sorted[0]?.colIndex;
  if (startRow == null || startCol == null) return null;
  const next = normalizeModel(tableData);

  rows.forEach((rowVals, rOffset) => {
    rowVals.forEach((value, cOffset) => {
      const row = next.rows[startRow + rOffset];
      const cell = getModelDataCell(row, startCol + cOffset);
      if (!cell) return;
      cell.value = String(value || "");
    });
  });
  return next;
}

export function useDataCaptureTableEngine({ ready, onTableMutated, readOnly = false } = {}) {
  const [selectedCells, setSelectedCells] = useState([]);
  const [activeColumnIndex, setActiveColumnIndex] = useState(null);
  const [activeRowIndex, setActiveRowIndex] = useState(null);
  const emitTableMutated = useCallback(() => {
    if (typeof onTableMutated === "function") onTableMutated();
  }, [onTableMutated]);

  const engine = useMemo(
    () => ({
      copySelectedCells: async () => {
        if (!selectedCells.length) return;
        await copyCellsToClipboard(captureTableDataFromDom(), selectedCells);
      },
      pasteToSelectedCells: async () => {
        if (!selectedCells.length) return;
        const next = await pasteFromClipboardToModel(captureTableDataFromDom(), selectedCells);
        if (!next) return;
        applyTableDataToDom(next);
        emitTableMutated();
      },
      clearSelectedCells: () => {
        if (!selectedCells.length) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        selectedCells.forEach(({ rowIndex, colIndex }) => {
          const row = tableData.rows[rowIndex];
          const cell = getModelDataCell(row, colIndex);
          if (cell) cell.value = "";
        });
        applyTableDataToDom(tableData);
        emitTableMutated();
      },
      showDeleteDialog: () => {
        if (!selectedCells.length) {
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
        const tableData = normalizeModel(captureTableDataFromDom());
        const coords = [];
        tableData.rows.forEach((row, rowIndex) => {
          const cells = row.filter((cell) => cell?.type === "data");
          cells.forEach((_, colIndex) => coords.push({ rowIndex, colIndex }));
        });
        setSelectedCells(coords);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
      },
      insertColumnLeft: () => {
        const colIndex = activeColumnIndex;
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
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        emitTableMutated();
      },
      insertColumnRight: () => {
        const colIndex = activeColumnIndex;
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
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        emitTableMutated();
      },
      deleteColumn: () => {
        const colIndex = activeColumnIndex;
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
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        emitTableMutated();
      },
      clearColumn: () => {
        const colIndex = activeColumnIndex;
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
        const rowIndex = activeRowIndex;
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const dataCols = Math.max(0, tableData.colCount - 1);
        const newRow = [{ type: "header", value: "0" }, ...Array.from({ length: dataCols }, (_, c) => ({ type: "data", value: "", col: c }))];
        tableData.rows.splice(rowIndex, 0, newRow);
        applyTableDataToDom(normalizeModel(tableData));
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        emitTableMutated();
      },
      insertRowBelow: () => {
        const rowIndex = activeRowIndex;
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const dataCols = Math.max(0, tableData.colCount - 1);
        const newRow = [{ type: "header", value: "0" }, ...Array.from({ length: dataCols }, (_, c) => ({ type: "data", value: "", col: c }))];
        tableData.rows.splice(rowIndex + 1, 0, newRow);
        applyTableDataToDom(normalizeModel(tableData));
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        emitTableMutated();
      },
      deleteRow: () => {
        const rowIndex = activeRowIndex;
        if (rowIndex == null) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        if (tableData.rows.length <= 1) return;
        tableData.rows.splice(rowIndex, 1);
        applyTableDataToDom(normalizeModel(tableData));
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        emitTableMutated();
      },
      clearRow: () => {
        const rowIndex = activeRowIndex;
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
        if (!selectedCells.length) return;
        const tableData = normalizeModel(captureTableDataFromDom());
        const option = document.querySelector("input[name='deleteOption']:checked")?.value || "shiftLeft";
        if (option === "shiftLeft") {
          applyTableDataToDom(shiftSelectedCellsLeft(tableData, selectedCells));
          emitTableMutated();
        } else if (option === "shiftUp") {
          applyTableDataToDom(shiftSelectedCellsUp(tableData, selectedCells));
          emitTableMutated();
        } else if (option === "entireRow") {
          const rowSet = [...new Set(selectedCells.map((c) => c.rowIndex))];
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
          const cols = [...new Set(selectedCells.map((c) => c.colIndex))].sort((a, b) => b - a);
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
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(null);
        const dialog = document.getElementById("deleteDialog");
        if (dialog) dialog.style.display = "none";
      },
    }),
    [activeColumnIndex, activeRowIndex, emitTableMutated, selectedCells]
  );

  useEffect(() => {
    if (!ready) return;
    const tableBody = document.getElementById("tableBody");
    if (!tableBody) return;
    const flag = readOnly ? "false" : "true";
    Array.from(tableBody.querySelectorAll("td[data-col]")).forEach((cell) => {
      cell.contentEditable = flag;
    });
  }, [ready, readOnly]);

  useEffect(() => {
    const tableBody = document.getElementById("tableBody");
    const tableHeader = document.getElementById("tableHeader");
    const contextMenu = document.getElementById("contextMenu");
    const columnContextMenu = document.getElementById("columnContextMenu");
    const rowContextMenu = document.getElementById("rowContextMenu");
    if (!ready || !tableBody || !tableHeader) return undefined;

    const showMenuAt = (menu, x, y) => {
      if (!menu) return;
      hideAllContextMenus();
      menu.style.display = "block";
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    };

    const onBodyMouseDown = (event) => {
      const cell = event.target.closest("#tableBody td[data-col]");
      if (!cell) return;
      const coords = getCellCoordinates(cell);
      if (!coords) return;
      setActiveColumnIndex(null);
      setActiveRowIndex(null);
      if (event.ctrlKey || event.metaKey) {
        setSelectedCells((prev) => {
          const key = getCoordKey(coords);
          const exists = prev.some((c) => getCoordKey(c) === key);
          if (exists) return prev.filter((c) => getCoordKey(c) !== key);
          return dedupeCoordinates([...prev, coords]);
        });
        return;
      }
      setSelectedCells([coords]);
    };

    const onBodyContextMenu = (event) => {
      const rowHeader = event.target.closest("#tableBody .row-header");
      if (rowHeader) {
        if (readOnly) return;
        event.preventDefault();
        const row = rowHeader.parentElement;
        const rowIndex = row ? Array.from(row.parentElement?.children || []).indexOf(row) : -1;
        if (rowIndex < 0) return;
        setSelectedCells([]);
        setActiveColumnIndex(null);
        setActiveRowIndex(rowIndex);
        showMenuAt(rowContextMenu, event.clientX, event.clientY);
        return;
      }

      const cell = event.target.closest("#tableBody td[data-col]");
      if (!cell) return;
      if (readOnly) return;
      event.preventDefault();
      const coords = getCellCoordinates(cell);
      if (!coords) return;
      setActiveColumnIndex(null);
      setActiveRowIndex(null);
      setSelectedCells((prev) => {
        const key = getCoordKey(coords);
        const exists = prev.some((c) => getCoordKey(c) === key);
        return exists ? prev : dedupeCoordinates([...prev, coords]);
      });
      showMenuAt(contextMenu, event.clientX, event.clientY);
    };

    const onHeaderMouseDown = (event) => {
      if (readOnly) return;
      const header = event.target.closest("#tableHeader th");
      if (!header) return;
      if (header.cellIndex === 0) return;
      setSelectedCells([]);
      setActiveRowIndex(null);
      setActiveColumnIndex(header.cellIndex - 1);
    };

    const onHeaderContextMenu = (event) => {
      if (readOnly) return;
      const header = event.target.closest("#tableHeader th");
      if (!header || header.cellIndex === 0) return;
      event.preventDefault();
      setSelectedCells([]);
      setActiveRowIndex(null);
      setActiveColumnIndex(header.cellIndex - 1);
      showMenuAt(columnContextMenu, event.clientX, event.clientY);
    };

    const onDocumentClick = (event) => {
      const insideMenu = event.target.closest(".context-menu");
      if (!insideMenu) hideAllContextMenus();
    };

    let timeoutId = null;
    const onTableInput = () => {
      if (readOnly) return;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => emitTableMutated(), 80);
    };
    tableBody.addEventListener("mousedown", onBodyMouseDown);
    tableBody.addEventListener("contextmenu", onBodyContextMenu);
    tableBody.addEventListener("input", onTableInput);
    const onTablePaste = (event) => {
      if (readOnly) {
        event.preventDefault();
        return;
      }
      onTableInput();
    };
    tableBody.addEventListener("paste", onTablePaste, true);
    tableHeader.addEventListener("mousedown", onHeaderMouseDown);
    tableHeader.addEventListener("contextmenu", onHeaderContextMenu);
    document.addEventListener("click", onDocumentClick);

    return () => {
      window.clearTimeout(timeoutId);
      tableBody.removeEventListener("mousedown", onBodyMouseDown);
      tableBody.removeEventListener("contextmenu", onBodyContextMenu);
      tableBody.removeEventListener("input", onTableInput);
      tableBody.removeEventListener("paste", onTablePaste, true);
      tableHeader.removeEventListener("mousedown", onHeaderMouseDown);
      tableHeader.removeEventListener("contextmenu", onHeaderContextMenu);
      document.removeEventListener("click", onDocumentClick);
    };
  }, [emitTableMutated, readOnly, ready]);

  useEffect(() => {
    if (!ready) return;
    const tableBody = document.getElementById("tableBody");
    const tableHeader = document.getElementById("tableHeader");
    if (!tableBody || !tableHeader) return;
    const keys = new Set(selectedCells.map(getCoordKey));

    Array.from(tableBody.querySelectorAll("td[data-col]")).forEach((cell) => {
      const coords = getCellCoordinates(cell);
      const selected = coords ? keys.has(getCoordKey(coords)) : false;
      cell.classList.toggle("multi-selected", selected);
      cell.classList.toggle("selected", false);
    });
    const first = selectedCells[0];
    if (first) {
      const firstCell = tableBody.querySelector(`tr:nth-child(${first.rowIndex + 1}) td[data-col="${first.colIndex}"]`);
      if (firstCell) firstCell.classList.add("selected");
    }

    Array.from(tableHeader.querySelectorAll("th")).forEach((th, index) => {
      const active = activeColumnIndex != null && index === activeColumnIndex + 1;
      th.classList.toggle("column-selected", active);
      th.classList.toggle("column-active", active);
    });
    Array.from(tableBody.querySelectorAll(".row-header")).forEach((td, index) => {
      const active = activeRowIndex != null && index === activeRowIndex;
      td.classList.toggle("row-selected", active);
      td.classList.toggle("row-active", active);
    });
  }, [activeColumnIndex, activeRowIndex, ready, selectedCells]);

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

      if (readOnly) {
        if (ctrlOrMeta && key === "c") {
          engine.copySelectedCells();
          event.preventDefault();
        }
        return;
      }

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
  }, [engine, readOnly]);

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
