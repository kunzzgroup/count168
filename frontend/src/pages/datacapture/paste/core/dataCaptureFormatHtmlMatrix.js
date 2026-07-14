/** 2.Format HTML table → body matrix (PR6 batch 1). */

import {
  sanitizeFormatHtmlFragment,
  sanitizeCopiedStyleString,
} from "./dataCaptureFormatStyleUtils.js";
import {
  expandCollapsedTableRows,
  tokenizeCollapsedReportRow,
} from "./dataCaptureFormatClipboardNormalize.js";

function cellTextIsMoneyOrNumberLike(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[,$]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function isSummaryLabelToken(text) {
  const normalized = String(text ?? "")
    .trim()
    .replace(/:$/, "")
    .toUpperCase();
  return (
    normalized === "SUBTOTAL" ||
    normalized === "SUB TOTAL" ||
    normalized === "TOTAL AMOUNT" ||
    normalized === "TOTAL" ||
    normalized === "GRAND TOTAL"
  );
}

/** Agent-period style: one label + many money fields in a single collapsed cell. */
function looksLikeHorizontalReportFieldDump(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 3) return false;
  const moneyCount = tokens.filter((token) => cellTextIsMoneyOrNumberLike(token)).length;
  if (moneyCount < 2) return false;
  if (moneyCount < Math.ceil(tokens.length * 0.5)) return false;
  const first = String(tokens[0] ?? "").trim();
  if (!first) return false;
  if (cellTextIsMoneyOrNumberLike(first) && !isSummaryLabelToken(first)) return false;
  return true;
}

function collectNestedReportFieldCells(sourceCell) {
  if (!sourceCell) return [];
  const direct = Array.from(
    sourceCell.querySelectorAll(
      [
        ":scope > mat-cell",
        ":scope > mat-footer-cell",
        ":scope > mat-header-cell",
        ":scope > .mat-cell",
        ":scope > .mat-footer-cell",
        ":scope > .mat-header-cell",
        ':scope > [role="gridcell"]',
        ":scope > div",
        ":scope > span",
      ].join(", "),
    ),
  ).filter((el) => String(el.textContent || "").replace(/\s+/g, " ").trim());
  if (direct.length >= 2) return direct;

  const nested = Array.from(
    sourceCell.querySelectorAll(
      "mat-cell, mat-footer-cell, .mat-cell, .mat-footer-cell, [role='gridcell']",
    ),
  ).filter((el) => {
    let parent = el.parentElement;
    while (parent && parent !== sourceCell) {
      const tag = (parent.tagName || "").toLowerCase();
      if (tag === "mat-cell" || tag === "mat-footer-cell" || tag === "td" || tag === "th") {
        if (parent !== sourceCell) return false;
      }
      parent = parent.parentElement;
    }
    return parent === sourceCell;
  });
  return nested.filter((el) => String(el.textContent || "").replace(/\s+/g, " ").trim());
}

function patchFromPlainReportToken(token, colIndex, rowTokens) {
  const value = String(token ?? "").trim();
  const styles = ["border: 1px solid #d0d7de !important;"];
  let html;

  if (colIndex === 0 && !isSummaryLabelToken(value) && /^[A-Z0-9][A-Z0-9_-]{2,}$/i.test(value)) {
    styles.push("color: #82b8b9", "text-decoration: underline");
    html = `<a href="#" style="color: #82b8b9;">${value}</a>`;
  } else if (colIndex === rowTokens.length - 1 && cellTextIsMoneyOrNumberLike(value)) {
    const numeric = Number(String(value).replace(/[$,]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) {
      styles.push("color: #82c751");
      html = `<span style="color: #82c751;">${value}</span>`;
    } else if (Number.isFinite(numeric) && numeric < 0) {
      styles.push("color: #ff7575");
      html = `<span style="color: #ff7575;">${value}</span>`;
    }
  }

  if (isSummaryLabelToken(value) || (colIndex === 0 && isSummaryLabelToken(value))) {
    styles.push("font-weight: 700");
  }

  return {
    value,
    ...(html ? { html } : {}),
    styleCssText: styles.join(" "),
  };
}

/** DataTables footers often use <th> for Total / Grand Total data rows. */
function allThRowLooksLikeDataOrSummary(tr) {
  const cells = Array.from(tr.querySelectorAll("th,td"));
  if (cells.length < 2) return false;
  const texts = cells.map((cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim());
  const nonEmpty = texts.filter(Boolean);
  if (nonEmpty.length < 2) return false;

  const first = nonEmpty[0].replace(/:$/, "").toUpperCase();
  if (
    first === "TOTAL" ||
    first === "GRAND TOTAL" ||
    first === "SUBTOTAL" ||
    first === "SUB TOTAL" ||
    first === "TOTAL AMOUNT"
  ) {
    return true;
  }

  const nums = nonEmpty.filter((text) => cellTextIsMoneyOrNumberLike(text)).length;
  return nums >= 2 && nums >= Math.ceil(nonEmpty.length * 0.5);
}

function trLooksLikePaginatorOrInfoRow(tr) {
  const className = String(tr.className || "").toLowerCase();
  if (/datatables_info|mat-paginator|paginator/i.test(className)) return true;
  const texts = Array.from(tr.querySelectorAll("th,td"))
    .map((cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!texts.length) return true;
  const joined = texts.join(" ");
  return /^Showing\s+\d+\s+to\s+\d+\s+of\s+\d+/i.test(joined);
}

/** @returns {{ headerRows: Element[], dataRows: Element[], maxCols: number, allRows: Element[] } | null} */
export function parseFormatHtmlTableStructure(htmlString) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlString;

  const table = tempDiv.querySelector("table");
  if (!table) return null;

  expandCollapsedTableRows(table);

  const allRows = Array.from(table.querySelectorAll("tr"));
  if (allRows.length === 0) return null;

  const headerRows = [];
  const dataRows = [];

  allRows.forEach((tr) => {
    // Match PHP: only <thead> rows, or rows that are entirely <th> (no <td>).
    // Exception: DataTables Total/Grand Total footers are all <th> but must stay as data.
    const inThead = !!tr.closest("thead");
    const thCount = tr.querySelectorAll("th").length;
    const tdCount = tr.querySelectorAll("td").length;
    const allTh = thCount > 0 && tdCount === 0;
    const isHeaderRow = inThead || (allTh && !allThRowLooksLikeDataOrSummary(tr));
    if (isHeaderRow) {
      headerRows.push(tr);
    } else if (!trLooksLikePaginatorOrInfoRow(tr)) {
      dataRows.push(tr);
    }
  });

  let maxCols = 0;
  allRows.forEach((tr) => {
    const cells = tr.querySelectorAll("td, th");
    let colCount = 0;
    cells.forEach((cell) => {
      colCount += parseInt(cell.getAttribute("colspan") || "1", 10);
    });
    maxCols = Math.max(maxCols, colCount);
  });

  if (maxCols === 0) return null;

  return { headerRows, dataRows, maxCols, allRows };
}

function extractCellLines(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const cellText = (sourceCell.textContent || sourceCell.innerText || "").trim();

  const hasBrTag =
    /<br\s*\/?>/i.test(cellHtml) ||
    /<br\s+[^>]*>/i.test(cellHtml) ||
    /<br\s+style[^>]*>/i.test(cellHtml);
  const hasNewline =
    cellText.includes("\n") || cellText.includes("\r\n") || cellText.includes("\r");

  let lines = [];

  if (hasBrTag) {
    const htmlWithMarker = cellHtml
      .replace(/<br\s+[^>]*>/gi, "|||SPLIT_MARKER|||")
      .replace(/<br\s*\/?>/gi, "|||SPLIT_MARKER|||");
    const markerDiv = document.createElement("div");
    markerDiv.innerHTML = htmlWithMarker;
    const textWithMarker = markerDiv.textContent || markerDiv.innerText || "";
    lines = textWithMarker
      .split("|||SPLIT_MARKER|||")
      .map((part) => {
        const cleanDiv = document.createElement("div");
        cleanDiv.innerHTML = part;
        return (cleanDiv.textContent || cleanDiv.innerText || "").trim();
      })
      .filter((part) => part !== "");
  } else if (hasNewline) {
    lines = cellText.split(/\r?\n|\r/).map((part) => part.trim()).filter((part) => part !== "");
  } else {
    const nestedFields = collectNestedReportFieldCells(sourceCell);
    if (nestedFields.length >= 3) {
      lines = nestedFields
        .map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
    } else {
      const directChildren = Array.from(sourceCell.childNodes || []);
      const directSpans = directChildren.filter(
        (node) => node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN",
      );
      const hasOnlySpanChildren = directChildren.every((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return !String(node.textContent || "").trim();
        }
        return node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN";
      });

      const spansAreBlockLike =
        directSpans.length >= 2 &&
        directSpans.every((span) => {
          const styleAttr = String(span.getAttribute("style") || "").toLowerCase();
          return /\bdisplay\s*:\s*(block|table|flex|grid|list-item)\b/.test(styleAttr);
        });

      // Avoid false positives: inline spans are often just styling wrappers, not vertical split rows.
      if (hasOnlySpanChildren && spansAreBlockLike) {
        const parts = directSpans
          .map((span) => (span.textContent || "").trim())
          .filter((part) => part !== "");
        if (parts.length >= 2) {
          lines = parts;
        }
      }
    }
  }

  return lines;
}

/** First-cell BR/SPAN check used for required row count pre-detection. */
function sourceRowNeedsVerticalSplit(sourceCells) {
  if (sourceCells.length === 0) return false;
  const lines = extractCellLines(sourceCells[0]);
  // Agent-period collapsed rows are HORIZONTAL field dumps, not 2-line vertical splits.
  if (looksLikeHorizontalReportFieldDump(lines)) return false;
  return lines.length >= 2;
}

/** Count tbody rows after vertical splits (SUB TOTAL / GRAND TOTAL). */
export function countFormatRequiredBodyRows(dataRows) {
  let count = dataRows.length;
  dataRows.forEach((sourceRow) => {
    const sourceCells = sourceRow.querySelectorAll("td, th");
    if (sourceRowNeedsVerticalSplit(sourceCells)) {
      count += 1;
    }
  });
  return count;
}

function detectRowVerticalSplit(sourceCells) {
  let hasVerticalSplit = false;
  const cellsWithSplit = [];

  sourceCells.forEach((sourceCell, cellIndex) => {
    const lines = extractCellLines(sourceCell);
    if (lines.length >= 2) {
      hasVerticalSplit = true;
      cellsWithSplit.push({
        index: cellIndex,
        cell: sourceCell,
        topData: lines[0],
        bottomData: lines[1],
        allLines: lines,
      });
    }
  });

  const isFirstCellWithBrOrSpan = cellsWithSplit.some((entry) => entry.index === 0);
  return { hasVerticalSplit, cellsWithSplit, isFirstCellWithBrOrSpan };
}

function extractPlainText(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = cellHtml;
  return (tempDiv.textContent || tempDiv.innerText || "").trim();
}

/** Material report status classes often carry color without inline style. */
function inferVisualStyleFromCellClass(sourceCell) {
  const cls = String(sourceCell?.className || "");
  const parts = [];
  // Match Report Center: positive #82c751, agent link #82b8b9
  if (/\bpositive\b/i.test(cls)) parts.push("color: #82c751");
  if (/\bnegative\b/i.test(cls)) parts.push("color: #ff7575");
  if (sourceCell?.querySelector?.("a")) {
    parts.push("color: #82b8b9", "text-decoration: underline");
  }
  return parts.length ? `${parts.join("; ")};` : "";
}

export function buildFormatDataCellStyle(sourceCell) {
  const sourceCellStyle = sourceCell.getAttribute("style");
  let sourceCellComputedStyle = null;
  try {
    if (typeof window?.getComputedStyle === "function") {
      sourceCellComputedStyle = window.getComputedStyle(sourceCell);
    }
  } catch {
    sourceCellComputedStyle = null;
  }

  const classVisual = inferVisualStyleFromCellClass(sourceCell);

  // 2.Format 1:1 — keep color/background/weight from clipboard; only drop layout props.
  if (sourceCellStyle) {
    const sanitizedCellStyle = sanitizeCopiedStyleString(sourceCellStyle);
    const merged = [sanitizedCellStyle, classVisual].filter(Boolean).join(" ").trim();
    return merged && !merged.includes("border")
      ? `border: 1px solid #d0d7de !important; ${merged}`
      : merged || "border: 1px solid #d0d7de !important;";
  }

  const color = sourceCellComputedStyle?.color;
  const fontWeight = sourceCellComputedStyle?.fontWeight;
  const textAlign = sourceCellComputedStyle?.textAlign;
  const backgroundColor = sourceCellComputedStyle?.backgroundColor;
  let styleString = "border: 1px solid #d0d7de !important;";
  if (color && color !== "rgb(0, 0, 0)") styleString += ` color: ${color} !important;`;
  if (
    backgroundColor &&
    backgroundColor !== "rgba(0, 0, 0, 0)" &&
    backgroundColor !== "transparent"
  ) {
    styleString += ` background-color: ${backgroundColor} !important;`;
  }
  if (fontWeight && fontWeight !== "normal" && fontWeight !== "400") {
    styleString += ` font-weight: ${fontWeight} !important;`;
  }
  if (textAlign && textAlign !== "left") styleString += ` text-align: ${textAlign} !important;`;
  if (classVisual) styleString += ` ${classVisual}`;
  return styleString;
}

/** @param {Element} sourceCell @param {string} [displayText] split override — plain text only */
export function buildFormatDataCellPatch(sourceCell, displayText) {
  const styleCssText = buildFormatDataCellStyle(sourceCell);

  if (displayText !== undefined) {
    return { value: displayText, styleCssText };
  }

  let cellContent = sourceCell.innerHTML;
  if (!cellContent || cellContent.trim() === "") {
    cellContent = sourceCell.textContent || "";
  }
  const cellText = sourceCell.textContent || sourceCell.innerText || "";

  const cleanContent = cellContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return {
      value: cellText,
      html: sanitizeFormatHtmlFragment(cleanContent),
      styleCssText,
    };
  }

  if (cellText && cellText.trim() !== "") {
    const sourceCellStyle = sourceCell.getAttribute("style");
    const classVisual = inferVisualStyleFromCellClass(sourceCell);
    if (sourceCellStyle || classVisual) {
      const sanitizedSpanStyle = [sanitizeCopiedStyleString(sourceCellStyle || ""), classVisual]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (sanitizedSpanStyle) {
        return {
          value: cellText,
          html: `<span style="${sanitizedSpanStyle}">${cellText}</span>`,
          styleCssText,
        };
      }
    }
    return { value: cellText, styleCssText };
  }

  return { value: "", styleCssText };
}

function emptyRowPatch(maxCols) {
  return Array.from({ length: maxCols }, () => ({ value: "" }));
}

function fillSourceRowPatches(targetRow, sourceCells, maxCols, lineSelector) {
  let currentCol = 0;

  sourceCells.forEach((sourceCell, cellIndex) => {
    const colspan = parseInt(sourceCell.getAttribute("colspan") || "1", 10);
    const splitInfo = lineSelector(cellIndex, sourceCell);

    if (currentCol < maxCols) {
      if (splitInfo) {
        targetRow[currentCol] = buildFormatDataCellPatch(sourceCell, splitInfo);
      } else {
        targetRow[currentCol] = buildFormatDataCellPatch(sourceCell);
      }
    }

    for (let spanIndex = 1; spanIndex < colspan; spanIndex += 1) {
      currentCol += 1;
      if (currentCol < maxCols) {
        targetRow[currentCol] = { value: "" };
      }
    }
    currentCol += 1;
  });

  return targetRow;
}

function expandSourceRowToMatrixRows(sourceRow, maxCols) {
  const sourceCells = Array.from(sourceRow.querySelectorAll("td, th"));

  // Collapsed Material row: one TD holding nested mat-cells / newline fields → expand HORIZONTALLY.
  if (sourceCells.length === 1) {
    const only = sourceCells[0];
    const nested = collectNestedReportFieldCells(only);
    if (nested.length >= 3 && looksLikeHorizontalReportFieldDump(nested.map((el) => extractPlainText(el)))) {
      const width = Math.max(maxCols, nested.length);
      const row = nested.map((el) => buildFormatDataCellPatch(el));
      while (row.length < width) row.push({ value: "" });
      return [row];
    }

    const lines = extractCellLines(only);
    if (looksLikeHorizontalReportFieldDump(lines)) {
      const width = Math.max(maxCols, lines.length);
      const row = lines.map((token, index) => patchFromPlainReportToken(token, index, lines));
      while (row.length < width) row.push({ value: "" });
      return [row];
    }

    const tokens = tokenizeCollapsedReportRow(only.textContent || "");
    if (looksLikeHorizontalReportFieldDump(tokens)) {
      const width = Math.max(maxCols, tokens.length);
      const row = tokens.map((token, index) => patchFromPlainReportToken(token, index, tokens));
      while (row.length < width) row.push({ value: "" });
      return [row];
    }
  }

  const { hasVerticalSplit, cellsWithSplit, isFirstCellWithBrOrSpan } =
    detectRowVerticalSplit(sourceCells);

  const firstSplitLines = cellsWithSplit.find((entry) => entry.index === 0)?.allLines || [];
  if (looksLikeHorizontalReportFieldDump(firstSplitLines) && sourceCells.length === 1) {
    const width = Math.max(maxCols, firstSplitLines.length);
    const row = firstSplitLines.map((token, index) =>
      patchFromPlainReportToken(token, index, firstSplitLines),
    );
    while (row.length < width) row.push({ value: "" });
    return [row];
  }

  if (isFirstCellWithBrOrSpan && hasVerticalSplit && cellsWithSplit.length > 0) {
    // True vertical split (e.g. two stacked labels in one Excel cell) — only top/bottom.
    // Do not use this path for 9-field agent dumps.
    if ((cellsWithSplit[0]?.allLines?.length || 0) <= 2) {
      const topRow = emptyRowPatch(maxCols);
      const bottomRow = emptyRowPatch(maxCols);

      fillSourceRowPatches(topRow, sourceCells, maxCols, (cellIndex) => {
        const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
        if (splitInfo) return splitInfo.topData;
        return extractPlainText(sourceCells[cellIndex]);
      });

      fillSourceRowPatches(bottomRow, sourceCells, maxCols, (cellIndex) => {
        const splitInfo = cellsWithSplit.find((entry) => entry.index === cellIndex);
        if (splitInfo) return splitInfo.bottomData;
        return extractPlainText(sourceCells[cellIndex]);
      });

      return [topRow, bottomRow];
    }
  }

  const row = emptyRowPatch(Math.max(maxCols, sourceCells.length));
  fillSourceRowPatches(row, sourceCells, row.length, () => null);
  return [row];
}

/** @returns {Array<Array<{ value: string, html?: string, styleCssText?: string }>>} */
export function buildFormatBodyMatrix(dataRows, maxCols) {
  const matrix = [];
  dataRows.forEach((sourceRow) => {
    expandSourceRowToMatrixRows(sourceRow, maxCols).forEach((row) => matrix.push(row));
  });
  return matrix;
}
