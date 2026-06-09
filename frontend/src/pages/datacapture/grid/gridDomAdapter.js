import { createEmptyGrid } from "./gridModel.js";

/** Apply grid model fields onto a live table cell element (restore / version bump). */
export function applyCellModelToElement(el, cell) {
  if (!el) return;

  if (cell?.colspan && cell.colspan > 1) {
    el.setAttribute("colspan", String(cell.colspan));
  } else {
    el.removeAttribute("colspan");
  }

  if (cell?.hidden) {
    el.style.display = "none";
  } else {
    el.style.display = "";
  }

  if (cell?.className) {
    el.className = cell.className;
  }

  if (cell?.style && typeof cell.style === "object") {
    Object.assign(el.style, cell.style);
  }

  const nextValue = cell?.value != null ? String(cell.value) : "";
  if (cell?.html) {
    if (el.innerHTML !== cell.html) {
      el.innerHTML = cell.html;
    }
  } else if ((el.textContent || "") !== nextValue) {
    el.textContent = nextValue;
  }

  if (cell?.styleCssText) {
    el.style.cssText = cell.styleCssText;
  }
}

/** Read live #dataTable tbody into a grid model (after paste / undo / DOM CRUD). */
export function readGridFromDom(rows = 26, cols = 20) {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return createEmptyGrid(rows, cols);

  const headerCols = document.querySelectorAll("#tableHeader th").length - 1;
  const domRows = tableBody.children.length;
  const r = Math.max(rows, domRows, 1);
  const c = Math.max(cols, headerCols, 1);
  const working = createEmptyGrid(r, c);

  for (let rowIndex = 0; rowIndex < r; rowIndex += 1) {
    const row = tableBody.children[rowIndex];
    if (!row) continue;
    for (let colIndex = 0; colIndex < c; colIndex += 1) {
      const cell = row.children[colIndex + 1];
      if (!cell || cell.contentEditable !== "true") continue;
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
      const hidden = cell.style.display === "none";
      working.cells[rowIndex][colIndex] = {
        value: (cell.textContent || "").trim(),
        ...(colspan > 1 ? { colspan } : {}),
        ...(hidden ? { hidden: true } : {}),
      };
      if (colspan > 1) {
        for (let i = 1; i < colspan; i += 1) {
          if (colIndex + i < c) working.cells[rowIndex][colIndex + i] = { value: "", hidden: true };
        }
      }
    }
  }

  return working;
}
