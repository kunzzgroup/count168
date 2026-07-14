/**
 * Normalize non-standard clipboard grids (Angular Material / ARIA role grids)
 * into a real HTML <table> so 2.Format can fill the editable Data Capture grid
 * while preserving inline styles and class-driven colors from clipboard CSS.
 */

import { detectVerticalFieldDump } from "./dataCaptureVerticalDumpDetect.js";

const GRID_HINT_RE =
  /mat-row|mat-cell|mat-header-row|mat-header-cell|mat-footer-cell|cdk-row|cdk-cell|role\s*=\s*["'](?:row|gridcell|columnheader|rowheader)["']/i;

/** Angular Material / CDK / ARIA grid clipboard (report sites). */
const ANGULAR_MATERIAL_HINT_RE =
  /mat-(?:row|cell|header|footer)|cdk-(?:row|cell|header|footer)|role\s*=\s*["'](?:grid|row|gridcell|columnheader|rowheader)["']/i;

/** Match Report Center / Format matrix: positive #82c751, negative #ff7575, agent link #82b8b9 */
const FMT_COLOR_POSITIVE = "#82c751";
const FMT_COLOR_NEGATIVE = "#ff7575";
const FMT_COLOR_LINK = "#82b8b9";

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

/** DataTables / Material paginator pulled in by drag-to-end over-select. */
function gridRowLooksLikePaginator(row) {
  const className = String(row.className || "").toLowerCase();
  if (/datatables_info|mat-paginator|paginator|page-navigation/i.test(className)) return true;
  const text = String(row.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  return /^Showing\s+\d+\s+to\s+\d+\s+of\s+\d+/i.test(text);
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
  return rows
    .filter((row) => !rows.some((other) => other !== row && row.contains(other)))
    .filter((row) => !gridRowLooksLikePaginator(row));
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

/** True when clipboard HTML is a table or table-like grid (Material / ARIA / DataTables). */
export function clipboardHtmlLooksLikeGrid(html) {
  if (!html) return false;
  if (/<table\b/i.test(html)) return true;
  if (/dataTables_scroll(?:Body|Foot|Head)?/i.test(html)) return true;
  return GRID_HINT_RE.test(html);
}

/**
 * DataTables splits head/body/foot into separate tables. Merge into one <table>
 * so Total / Grand Total in scrollFoot are not dropped when only the first
 * <table> would otherwise be parsed.
 */
function tryMergeDataTablesScrollTables(root) {
  const bodyTable =
    root.querySelector(".dataTables_scrollBody table") ||
    root.querySelector("table.dataTable");
  const footTable = root.querySelector(".dataTables_scrollFoot table");
  const headTable = root.querySelector(".dataTables_scrollHead table");
  if (!bodyTable || (!footTable && !headTable)) return null;

  const merged = document.createElement("table");
  const tbody = document.createElement("tbody");

  const rowSignature = (tr) =>
    Array.from(tr.querySelectorAll("th,td"))
      .map((cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim())
      .join("\t");

  const seen = new Set();
  const appendUniqueRows = (table, { onlyTdRows = false, includeSummaryTh = true } = {}) => {
    if (!table) return;
    Array.from(table.querySelectorAll("tr")).forEach((tr) => {
      const sig = rowSignature(tr);
      if (!sig.replace(/\t/g, "").trim()) return;
      if (seen.has(sig)) return;

      const tdCount = tr.querySelectorAll("td").length;
      const thCount = tr.querySelectorAll("th").length;
      const cells = Array.from(tr.querySelectorAll("th,td"));
      const texts = cells.map((c) => String(c.textContent || "").trim()).filter(Boolean);
      const first = (texts[0] || "").replace(/:$/, "").toUpperCase();
      const isSummary =
        first === "TOTAL" ||
        first === "GRAND TOTAL" ||
        first === "SUBTOTAL" ||
        first === "SUB TOTAL";
      const nums = texts.filter((t) =>
        /^-?[\d,]+(?:\.\d+)?$/.test(t.replace(/[,$]/g, "").replace(/^\((.*)\)$/, "-$1")),
      ).length;

      if (onlyTdRows) {
        if (tdCount === 0) return;
      } else if (tdCount === 0 && thCount > 0) {
        // Keep Total/Grand Total footers; drop column-title header clones.
        if (!includeSummaryTh) return;
        if (!isSummary && nums < 2) return;
      }

      seen.add(sig);
      tbody.appendChild(tr.cloneNode(true));
    });
  };

  // Prefer visual order: member/data rows, then footer Total / Grand Total.
  appendUniqueRows(bodyTable, { onlyTdRows: true });
  appendUniqueRows(footTable, { includeSummaryTh: true });
  // Body-only clipboard (no foot): keep summary th rows after data.
  if (!footTable) {
    appendUniqueRows(bodyTable, { onlyTdRows: false, includeSummaryTh: true });
  }
  if (!tbody.children.length) {
    appendUniqueRows(headTable, { includeSummaryTh: false });
    appendUniqueRows(bodyTable, { onlyTdRows: false, includeSummaryTh: true });
    appendUniqueRows(footTable, { includeSummaryTh: true });
  }

  if (!tbody.children.length) return null;
  merged.appendChild(tbody);
  return merged;
}

/**
 * Clone one Material/ARIA cell onto a <td>/<th> with visual styles baked inline
 * (sanitize later strips classes — styles must survive as attributes).
 */
function bakeMatCellOntoTd(td, cell) {
  if (!td || !cell) return;
  const cellStyle = cell.getAttribute?.("style");
  if (cellStyle) td.setAttribute("style", sanitizeStyleKeepVisual(cellStyle));

  const colspan = cell.getAttribute?.("colspan") || cell.getAttribute?.("aria-colspan");
  if (colspan && Number(colspan) > 1) td.setAttribute("colspan", String(colspan));
  const rowspan = cell.getAttribute?.("rowspan") || cell.getAttribute?.("aria-rowspan");
  if (rowspan && Number(rowspan) > 1) td.setAttribute("rowspan", String(rowspan));

  const cls = String(cell.className || "");
  const styleText = td.getAttribute("style") || "";
  const hasColor = /\bcolor\s*:/i.test(styleText);
  const baked = {};
  if (/\bpositive\b/i.test(cls) && !hasColor) baked.color = FMT_COLOR_POSITIVE;
  if (/\bnegative\b/i.test(cls) && !hasColor) baked.color = FMT_COLOR_NEGATIVE;
  if (cell.querySelector?.("a")) {
    if (!hasColor && !baked.color) baked.color = FMT_COLOR_LINK;
    baked["text-decoration"] = "underline";
  }
  if (/\b(mat-header-cell|cdk-header-cell|mat-footer-cell|cdk-footer-cell)\b/i.test(cls)) {
    if (!/\bfont-weight\s*:/i.test(styleText)) baked["font-weight"] = "700";
  }
  if (Object.keys(baked).length) mergeStyleAttr(td, baked);

  if (cell.innerHTML != null) {
    td.innerHTML = cell.innerHTML || escapeHtml(cell.textContent || "");
  } else {
    td.textContent = String(cell.textContent || cell || "");
  }
}

function replaceRowWithElements(tr, elements, asHeader) {
  while (tr.firstChild) tr.removeChild(tr.firstChild);
  elements.forEach((el) => {
    const td = document.createElement(asHeader || isHeaderLikeCell(el) ? "th" : "td");
    bakeMatCellOntoTd(td, el);
    tr.appendChild(td);
  });
}

function replaceRowWithTextColumns(tr, lines, asHeader) {
  while (tr.firstChild) tr.removeChild(tr.firstChild);
  lines.forEach((line) => {
    const td = document.createElement(asHeader ? "th" : "td");
    td.textContent = line;
    tr.appendChild(td);
  });
}

function splitCellTextToColumnLines(cell) {
  const html = String(cell.innerHTML || "");
  if (/<br\s*\/?>/i.test(html)) {
    const marked = html
      .replace(/<br\s+[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n");
    const tmp = document.createElement("div");
    tmp.innerHTML = marked;
    return String(tmp.textContent || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const raw = String(cell.textContent || "").replace(/\u00a0/g, " ");
  let lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 1) {
    const single = lines[0];
    if (single.includes("\t")) {
      lines = single.split("\t").map((part) => part.trim()).filter(Boolean);
    } else {
      const spaced = single.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
      if (spaced.length >= 2) lines = spaced;
    }
  }
  if (lines.length >= 2) return lines;

  // Chrome Material copies often flatten a whole report row into one TD with
  // single spaces (no <br>, no tabs). Tokenize labels + numeric/money fields.
  const tokenized = tokenizeCollapsedReportRow(raw);
  return tokenized.length >= 2 ? tokenized : lines;
}

/**
 * Split a collapsed billing-statement row into column tokens.
 * Keeps multi-word labels like "TOTAL AMOUNT" / "SUB TOTAL".
 */
export function tokenizeCollapsedReportRow(text) {
  const raw = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];

  const tokens = [];
  const re =
    /TOTAL\s+AMOUNT|SUB\s*TOTAL|SUBTOTAL|\$?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$?-?\d+(?:\.\d+)?|\S+/gi;
  let match;
  while ((match = re.exec(raw))) {
    const token = String(match[0] || "").trim();
    if (token) tokens.push(token);
  }

  // Only treat as columns when we see multiple numeric/money fields.
  const numericLike = tokens.filter((token) =>
    /^\$?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\$?-?\d+(?:\.\d+)?$/.test(token.replace(/\s/g, "")),
  ).length;
  if (tokens.length >= 3 && numericLike >= 2) return tokens;
  if (tokens.length >= 2 && numericLike >= 1 && /SUB\s*TOTAL|TOTAL\s+AMOUNT/i.test(raw)) {
    return tokens;
  }
  return [];
}

function cellLooksHorizontallyCollapsed(cell) {
  if (!cell) return false;
  const childBlocks = Array.from(cell.children || []).filter(
    (child) => String(child.textContent || "").trim() !== "",
  );
  if (childBlocks.length >= 2) return true;
  if (collectRowCells(cell).length >= 2) return true;
  if (splitCellTextToColumnLines(cell).length >= 2) return true;
  return false;
}

/**
 * Expand tables where each logical row was collapsed into one TD/TH
 * (nested mat-cells, colspan wrappers, or flattened column values).
 * Mutates the table in place. Returns true when any row was expanded.
 */
export function expandCollapsedTableRows(table) {
  if (!table) return false;
  let changed = false;

  Array.from(table.querySelectorAll("tr")).forEach((tr) => {
    const cells = Array.from(tr.children || []).filter((el) => {
      const tag = (el.tagName || "").toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    if (!cells.length) return;

    // One real content cell (ignore trailing empty TDs) — Material/Chrome dump mode.
    const nonEmptyCells = cells.filter(
      (cell) =>
        String(cell.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim() !== "",
    );
    if (nonEmptyCells.length !== 1) return;
    const only = nonEmptyCells[0];

    if (
      !cellLooksHorizontallyCollapsed(only) &&
      Number.parseInt(only.getAttribute("colspan") || "1", 10) <= 1
    ) {
      // Still try tokenize on plain single-cell rows with dense report text.
      const tokenized = tokenizeCollapsedReportRow(only.textContent || "");
      if (tokenized.length >= 2) {
        const asHeader = (only.tagName || "").toUpperCase() === "TH" || isHeaderLikeCell(only);
        replaceRowWithTextColumns(tr, tokenized, asHeader);
        changed = true;
        return;
      }
      // Glued agent+amounts (no spaces) fails tokenize — fall through to unwrap nested spans.
    }

    const asHeader = (only.tagName || "").toUpperCase() === "TH" || isHeaderLikeCell(only);

    // Unwrap single MsoNormal / layout wrappers so field children become visible.
    let scanRoot = only;
    for (let depth = 0; depth < 6; depth += 1) {
      const kids = Array.from(scanRoot.children || []).filter(
        (child) => String(child.textContent || "").trim() !== "",
      );
      if (kids.length !== 1) break;
      const tag = (kids[0].tagName || "").toLowerCase();
      if (!["p", "div", "span", "font", "section", "article", "center"].includes(tag)) break;
      const grand = Array.from(kids[0].children || []).filter(
        (child) => String(child.textContent || "").trim() !== "",
      );
      if (grand.length < 2) break;
      scanRoot = kids[0];
    }

    let nested = collectRowCells(scanRoot);
    if (nested.length < 2) {
      nested = collectRowCells(only);
    }
    if (nested.length < 2) {
      const kids = Array.from(scanRoot.children || []).filter(
        (child) => String(child.textContent || "").trim() !== "",
      );
      if (kids.length >= 2) nested = kids;
    }

    if (nested.length >= 2) {
      replaceRowWithElements(tr, nested, asHeader);
      changed = true;
      return;
    }

    const lines = splitCellTextToColumnLines(scanRoot);
    if (lines.length >= 2) {
      // Each line is itself a full report row (Agent + amounts…) → one <tr> per line.
      const denseLines = lines.filter((line) => tokenizeCollapsedReportRow(line).length >= 2);
      if (denseLines.length >= 2 && denseLines.length === lines.length) {
        const parent = tr.parentNode;
        if (!parent) return;
        denseLines.forEach((line, index) => {
          const tokens = tokenizeCollapsedReportRow(line);
          const newTr = document.createElement("tr");
          tokens.forEach((token) => {
            const td = document.createElement(asHeader ? "th" : "td");
            td.textContent = token;
            newTr.appendChild(td);
          });
          if (index === 0) parent.replaceChild(newTr, tr);
          else parent.appendChild(newTr);
        });
        changed = true;
        return;
      }

      replaceRowWithTextColumns(tr, lines, asHeader);
      changed = true;
    }
  });

  // Chrome often strips mat-* tags and leaves one field per <tr><td> (Fig1 N×1).
  if (reshapeVerticalNx1FieldDumpTable(table)) changed = true;

  return changed;
}

/**
 * Reshape a vertical field dump table (one token per TR) into horizontal report
 * rows — same heuristic as plain-text mat-row reshape. Mutates table in place.
 */
export function reshapeVerticalNx1FieldDumpTable(table) {
  if (!table) return false;
  const trs = Array.from(table.querySelectorAll("tr"));
  if (trs.length < 6) return false;

  const tokens = [];
  for (const tr of trs) {
    const cells = Array.from(tr.children || []).filter((el) => {
      const tag = (el.tagName || "").toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    const nonEmpty = cells.filter(
      (cell) =>
        String(cell.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim() !== "",
    );
    // Already multi-column → leave alone.
    if (nonEmpty.length > 1) return false;
    if (!nonEmpty.length) continue;
    const only = nonEmpty[0];
    // BR / nested mat-cell rows belong to expandCollapsedTableRows, not this path.
    if (cellLooksHorizontallyCollapsed(only)) return false;
    const text = String(only.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    // Multi-token single cell without BR markers → not a pure N×1 dump.
    if (tokenizeCollapsedReportRow(text).length >= 3) return false;
    tokens.push(text);
  }

  if (tokens.length < 6) return false;
  const rows = detectVerticalFieldDump(tokens);
  if (!rows?.length || (rows[0]?.length || 0) < 2) return false;

  while (table.firstChild) table.removeChild(table.firstChild);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    (row || []).forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value ?? "");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return true;
}

/** True when a parsed table still looks like columns crushed into one cell/column. */
export function tableLooksHorizontallyCollapsed(table, maxCols) {
  if (!table) return true;
  if (maxCols >= 2) {
    // colspan can fake a wide table while content still sits in one TD.
    const rows = Array.from(table.querySelectorAll("tr"));
    const hasFakeWidth = rows.some((tr) => {
      const cells = Array.from(tr.children || []).filter((el) => {
        const tag = (el.tagName || "").toUpperCase();
        return tag === "TD" || tag === "TH";
      });
      const nonEmpty = cells.filter(
        (cell) =>
          String(cell.textContent || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim() !== "",
      );
      // Wide empty TDs still crush content into one filled cell (Material dump).
      if (nonEmpty.length === 1 && cells.length > 1) return true;
      if (cells.length !== 1) return false;
      const colspan = Number.parseInt(cells[0].getAttribute("colspan") || "1", 10);
      return colspan >= 2 || cellLooksHorizontallyCollapsed(cells[0]);
    });
    return hasFakeWidth;
  }
  return Array.from(table.querySelectorAll("tr")).some((tr) => {
    const cell = Array.from(tr.children || []).find((el) => {
      const tag = (el.tagName || "").toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    return cellLooksHorizontallyCollapsed(cell);
  });
}

function tableColumnCount(table) {
  let maxCols = 0;
  Array.from(table.querySelectorAll("tr")).forEach((tr) => {
    const cells = Array.from(tr.children || []).filter((el) => {
      const tag = (el.tagName || "").toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    maxCols = Math.max(maxCols, cells.length);
  });
  return maxCols;
}

/** Build a real <table> from mat/cdk/ARIA row shells (1:1 horizontal columns). */
function buildTableFromMaterialGridRows(gridRows) {
  if (!gridRows?.length) return null;
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
      bakeMatCellOntoTd(td, cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (!tbody.children.length) return null;
  table.appendChild(tbody);
  return table;
}

/** True when clipboard HTML looks like Angular Material / CDK / ARIA report grid. */
export function clipboardHtmlLooksLikeAngularMaterial(html) {
  if (!html) return false;
  return ANGULAR_MATERIAL_HINT_RE.test(String(html));
}

/**
 * Parse Angular Material / CDK / role=grid clipboard into a real HTML <table>
 * with visual styles baked inline for Format 1:1 cloning.
 * Returns null when no Material/ARIA grid rows (or usable table) found.
 */
export function parseAngularMaterialTable(html) {
  const raw = String(html || "");
  if (!raw.trim() || !clipboardHtmlLooksLikeAngularMaterial(raw)) return null;

  try {
    const root = document.createElement("div");
    root.innerHTML = raw;

    const rules = collectClipboardClassRules(root);
    applyClipboardClassRulesAsInline(root, rules);

    const styleHtml = Array.from(root.querySelectorAll("style"))
      .map((el) => el.outerHTML)
      .join("\n");

    const gridRows = collectGridRows(root);
    if (gridRows.length) {
      const table = buildTableFromMaterialGridRows(gridRows);
      if (!table) return null;
      expandCollapsedTableRows(table);
      return `${styleHtml}\n${table.outerHTML}`;
    }

    // Already a <table> with Material classes wrapped in cells — expand in place.
    const existingTable = root.querySelector("table");
    if (existingTable) {
      expandCollapsedTableRows(existingTable);
      if (tableColumnCount(existingTable) >= 2) {
        return `${styleHtml}\n${existingTable.outerHTML}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert Material/ARIA grid markup into a real HTML table.
 * Returns original HTML when already table-based or conversion is not possible.
 */
export function normalizeClipboardHtmlToTable(html) {
  const raw = String(html || "");
  if (!raw.trim()) return "";

  try {
    // Prefer the dedicated Material parser for report-site cloning.
    const matParsed = parseAngularMaterialTable(raw);
    if (matParsed) return matParsed;

    const root = document.createElement("div");
    root.innerHTML = raw;

    const rules = collectClipboardClassRules(root);
    applyClipboardClassRulesAsInline(root, rules);

    const styleHtml = Array.from(root.querySelectorAll("style"))
      .map((el) => el.outerHTML)
      .join("\n");

    const existingTable = root.querySelector("table");
    const gridRows = collectGridRows(root);
    const mergedDataTables = tryMergeDataTablesScrollTables(root);
    if (mergedDataTables) {
      expandCollapsedTableRows(mergedDataTables);
      if (tableColumnCount(mergedDataTables) >= 2) {
        return `${styleHtml}\n${mergedDataTables.outerHTML}`;
      }
    }

    // Clipboard already has a <table>, but rows may be 1-TD wrappers around mat-cells.
    if (existingTable && !gridRows.length) {
      expandCollapsedTableRows(existingTable);
      if (tableColumnCount(existingTable) >= 2) {
        return `${styleHtml}\n${existingTable.outerHTML}`;
      }
      return raw;
    }

    if (!gridRows.length) {
      return raw;
    }

    const table = buildTableFromMaterialGridRows(gridRows);
    if (!table) return raw;
    expandCollapsedTableRows(table);

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
