/**
 * Normalize non-standard clipboard grids (Angular Material / ARIA role grids)
 * into a real HTML <table> so 2.Format can fill the editable Data Capture grid
 * while preserving inline styles and class-driven colors from clipboard CSS.
 */

const GRID_HINT_RE =
  /mat-row|mat-cell|mat-header-row|mat-header-cell|mat-footer-cell|cdk-row|cdk-cell|role\s*=\s*["'](?:row|gridcell|columnheader|rowheader)["']/i;

const STYLE_RULE_RE = /([^{}@]+)\{([^{}]+)\}/g;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseStyleDeclarations(body) {
  const out = {};
  String(body || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!prop || !value) return;
      out[prop] = value;
    });
  return out;
}

function styleObjectToCssText(styleObj) {
  return Object.entries(styleObj || {})
    .map(([prop, value]) => `${prop}: ${value}`)
    .join("; ");
}

function mergeStyleAttr(el, extraObj) {
  if (!el || !extraObj || !Object.keys(extraObj).length) return;
  const current = parseStyleDeclarations(el.getAttribute("style") || "");
  const merged = { ...extraObj, ...current };
  const cssText = styleObjectToCssText(merged);
  if (cssText) el.setAttribute("style", cssText);
}

function collectClipboardClassRules(root) {
  const rules = [];
  root.querySelectorAll("style").forEach((styleEl) => {
    const cssText = String(styleEl.textContent || "");
    let match;
    STYLE_RULE_RE.lastIndex = 0;
    while ((match = STYLE_RULE_RE.exec(cssText))) {
      const selectors = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const decls = parseStyleDeclarations(match[2]);
      if (!selectors.length || !Object.keys(decls).length) continue;
      selectors.forEach((selector) => {
        rules.push({ selector, decls });
      });
    }
  });
  return rules;
}

function applyClipboardClassRulesAsInline(root, rules) {
  if (!rules.length) return;
  rules.forEach(({ selector, decls }) => {
    const simple = selector.trim();
    // Only apply class / tag.class selectors. Skip complex combinators.
    if (!/^[#.]?[\w-]+(?:\.[#\w-]+)*$/.test(simple) && !/^[\w-]+(?:\.[\w-]+)+$/.test(simple)) {
      return;
    }
    let nodes = [];
    try {
      nodes = Array.from(root.querySelectorAll(simple));
    } catch {
      nodes = [];
    }
    nodes.forEach((node) => mergeStyleAttr(node, decls));
  });
}

function isHeaderLikeCell(el) {
  const tag = (el.tagName || "").toLowerCase();
  if (tag.includes("header")) return true;
  const className = String(el.className || "").toLowerCase();
  if (/(?:^|\s)(?:mat|cdk)-header-cell(?:\s|$)/.test(className)) return true;
  const role = String(el.getAttribute("role") || "").toLowerCase();
  return role === "columnheader" || role === "rowheader";
}

function isRowShell(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "mat-row" || tag === "mat-header-row" || tag === "mat-footer-row") return true;
  const role = String(el.getAttribute("role") || "").toLowerCase();
  if (role === "row") return true;
  const className = String(el.className || "").toLowerCase();
  return /(?:^|\s)(?:mat|cdk)-(?:header-)?row(?:\s|$)/.test(className)
    || /(?:^|\s)(?:mat|cdk)-footer-row(?:\s|$)/.test(className);
}

function rowHasCellHints(row) {
  return Boolean(
    row.querySelector(
      [
        "mat-cell",
        "mat-header-cell",
        "mat-footer-cell",
        '[role="gridcell"]',
        '[role="columnheader"]',
        '[role="rowheader"]',
        ".mat-cell",
        ".mat-header-cell",
        ".mat-footer-cell",
        ".cdk-cell",
        ".cdk-header-cell",
        ".cdk-footer-cell",
      ].join(", "),
    ),
  );
}

function rowLooksLikeFlattenedColumns(row) {
  const lines = String(row.textContent || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length >= 2;
}

function collectGridRows(root) {
  const seen = new Set();
  const rows = [];

  const pushUnique = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    rows.push(node);
  };

  // 1) Native Angular Material element tags
  root.querySelectorAll("mat-row, mat-header-row, mat-footer-row").forEach(pushUnique);

  // 2) Class-based rows (Chrome clipboard often rewrites <mat-row> → <div class="mat-row">)
  root
    .querySelectorAll(".mat-row, .mat-header-row, .mat-footer-row, .cdk-row, .cdk-header-row, .cdk-footer-row")
    .forEach(pushUnique);

  // 3) ARIA rows that contain cell-like children or newline-flattened column text
  Array.from(root.querySelectorAll('[role="row"]')).forEach((row) => {
    if (rowHasCellHints(row) || rowLooksLikeFlattenedColumns(row)) pushUnique(row);
  });

  // Drop outer shells that only wrap other rows (keep leaf data rows).
  return rows.filter((row) => !rows.some((other) => other !== row && row.contains(other)));
}

function collectRowCells(row) {
  const directMatCells = Array.from(
    row.querySelectorAll(
      ":scope > mat-cell, :scope > mat-header-cell, :scope > mat-footer-cell",
    ),
  );
  if (directMatCells.length) return directMatCells;

  const directRoleCells = Array.from(
    row.querySelectorAll(
      ':scope > [role="gridcell"], :scope > [role="columnheader"], :scope > [role="rowheader"]',
    ),
  );
  if (directRoleCells.length) return directRoleCells;

  const directClassCells = Array.from(
    row.querySelectorAll(
      ":scope > .mat-cell, :scope > .mat-header-cell, :scope > .mat-footer-cell, :scope > .cdk-cell, :scope > .cdk-header-cell, :scope > .cdk-footer-cell",
    ),
  );
  if (directClassCells.length) return directClassCells;

  const nested = Array.from(
    row.querySelectorAll(
      [
        "mat-cell",
        "mat-header-cell",
        "mat-footer-cell",
        '[role="gridcell"]',
        '[role="columnheader"]',
        '[role="rowheader"]',
        ".mat-cell",
        ".mat-header-cell",
        ".mat-footer-cell",
        ".cdk-cell",
        ".cdk-header-cell",
        ".cdk-footer-cell",
      ].join(", "),
    ),
  ).filter((cell) => {
    // Keep cells that belong to this row, not a nested row shell.
    let parent = cell.parentElement;
    while (parent && parent !== row) {
      if (isRowShell(parent)) return false;
      parent = parent.parentElement;
    }
    return parent === row;
  });
  if (nested.length) return nested;

  // Flex/grid clipboard leftovers: multiple non-row direct children with text ≈ columns.
  const directKids = Array.from(row.children || []).filter((child) => {
    if (isRowShell(child)) return false;
    return String(child.textContent || "").trim() !== "";
  });
  if (directKids.length >= 2) return directKids;

  return [];
}

/** When a row collapsed to one cell / plain text, split newline tokens into columns. */
function expandCollapsedRowTextToCells(rowEl, tr) {
  const raw = String(rowEl.textContent || "").replace(/\u00a0/g, " ");
  let lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Some clipboards flatten columns to a single line with wide spacing / tabs.
  if (lines.length === 1) {
    const single = lines[0];
    if (single.includes("\t")) {
      lines = single.split("\t").map((part) => part.trim()).filter(Boolean);
    } else {
      const spaced = single.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
      if (spaced.length >= 2) lines = spaced;
    }
  }

  if (lines.length < 2) {
    const text = lines[0] || raw.trim();
    if (!text) return false;
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
    return true;
  }
  lines.forEach((line) => {
    const td = document.createElement("td");
    td.textContent = line;
    tr.appendChild(td);
  });
  return true;
}

/** True when clipboard HTML is a table or table-like grid (Material / ARIA). */
export function clipboardHtmlLooksLikeGrid(html) {
  if (!html) return false;
  if (/<table\b/i.test(html)) return true;
  return GRID_HINT_RE.test(html);
}

/**
 * Convert Material/ARIA grid markup into a real HTML table.
 * Returns original HTML when already table-based or conversion is not possible.
 */
export function normalizeClipboardHtmlToTable(html) {
  const raw = String(html || "");
  if (!raw.trim()) return "";

  try {
    const root = document.createElement("div");
    root.innerHTML = raw;

    const rules = collectClipboardClassRules(root);
    applyClipboardClassRulesAsInline(root, rules);

    const existingTable = root.querySelector("table");
    const gridRows = collectGridRows(root);
    if (existingTable && !gridRows.length) {
      return raw;
    }
    if (!gridRows.length) {
      return raw;
    }

    const table = document.createElement("table");
    const tbody = document.createElement("tbody");

    gridRows.forEach((row) => {
      const tr = document.createElement("tr");
      let cells = collectRowCells(row);

      // Some clipboards wrap all columns inside one outer cell/div.
      if (cells.length === 1) {
        const nested = collectRowCells(cells[0]);
        if (nested.length >= 2) cells = nested;
      }

      if (!cells.length) {
        if (!expandCollapsedRowTextToCells(row, tr)) return;
        tbody.appendChild(tr);
        return;
      }

      // One cell whose text is newline-flattened columns (user symptom).
      if (cells.length === 1 && rowLooksLikeFlattenedColumns(cells[0])) {
        if (!expandCollapsedRowTextToCells(cells[0], tr)) return;
        tbody.appendChild(tr);
        return;
      }

      cells.forEach((cell) => {
        const td = document.createElement(isHeaderLikeCell(cell) ? "th" : "td");
        const cellStyle = cell.getAttribute("style");
        if (cellStyle) td.setAttribute("style", sanitizeStyleKeepVisual(cellStyle));
        td.innerHTML = cell.innerHTML || escapeHtml(cell.textContent || "");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    if (!tbody.children.length) return raw;
    table.appendChild(tbody);

    // Keep clipboard <style> blocks so downstream preview/style harvest can use them.
    const styleHtml = Array.from(root.querySelectorAll("style"))
      .map((el) => el.outerHTML)
      .join("\n");
    return `${styleHtml}\n${table.outerHTML}`;
  } catch {
    return raw;
  }
}

function sanitizeStyleKeepVisual(styleString) {
  if (!styleString) return "";
  const blocked = new Set(["position", "top", "left", "right", "bottom", "z-index", "float", "transform"]);
  const parts = String(styleString)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((decl) => {
      const idx = decl.indexOf(":");
      const prop = (idx >= 0 ? decl.slice(0, idx) : decl).trim().toLowerCase();
      return !blocked.has(prop);
    });
  return parts.length ? `${parts.join("; ")};` : "";
}
