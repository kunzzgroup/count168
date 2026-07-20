/**
 * Material mat-row plain-text matrix reshape (PHP datacapture).
 * Handles clipboard text/plain where each cell is one line (no tabs).
 */
(function (global) {
  "use strict";

  function isMoneyOrNumberLikeToken(text) {
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
      .replace(/\s+/g, " ")
      .toUpperCase();
    return (
      normalized === "SUBTOTAL" ||
      normalized === "SUB TOTAL" ||
      normalized === "TOTAL AMOUNT"
    );
  }

  function isDenseReportRow(row) {
    if (!row || row.length < 3) return false;
    if (isMoneyOrNumberLikeToken(row[0])) return false;
    const nums = row.filter((cell) => isMoneyOrNumberLikeToken(cell)).length;
    return nums >= 2 && nums >= Math.ceil(row.length * 0.5);
  }

  function detectFlattenedStatementColCount(tokens) {
    const summaryIndices = [];
    tokens.forEach((token, index) => {
      if (isSummaryLabelToken(token)) summaryIndices.push(index);
    });
    if (!summaryIndices.length) return null;

    const candidateDiffs = [];
    for (let i = 1; i < summaryIndices.length; i += 1) {
      const diff = summaryIndices[i] - summaryIndices[i - 1];
      if (diff >= 8 && diff <= 20) candidateDiffs.push(diff);
    }
    if (candidateDiffs.length) {
      const counts = new Map();
      candidateDiffs.forEach((diff) => counts.set(diff, (counts.get(diff) || 0) + 1));
      let best = candidateDiffs[0];
      let bestCount = 0;
      counts.forEach((count, diff) => {
        if (count > bestCount) {
          best = diff;
          bestCount = count;
        }
      });
      return best;
    }

    const firstIdx = summaryIndices[0];
    if (firstIdx >= 8 && firstIdx <= 12) return firstIdx;
    if (firstIdx >= 16 && firstIdx <= 24) {
      const half = Math.round(firstIdx / 2);
      if (half >= 8 && half <= 12) return half;
    }
    return 10;
  }

  function parseFlattenedStatementMatrix(nonEmptyLines) {
    if (nonEmptyLines.length < 8) return null;

    const tokens = nonEmptyLines.map((line) => line.trim()).filter(Boolean);
    const numericLikeCount = tokens.filter((token) => isMoneyOrNumberLikeToken(token)).length;
    if (numericLikeCount < Math.ceil(tokens.length * 0.4)) return null;

    const colCount = detectFlattenedStatementColCount(tokens);
    if (!colCount || colCount < 2) return null;

    let start = 0;
    const firstSummary = tokens.findIndex((token) => isSummaryLabelToken(token));
    if (firstSummary > colCount && firstSummary % colCount === 0) {
      start = firstSummary >= colCount * 2 ? colCount : 0;
      if (firstSummary === colCount * 2) start = colCount;
    }

    const dataTokens = tokens.slice(start);
    const dataRows = [];
    for (let i = 0; i < dataTokens.length; i += colCount) {
      const chunk = dataTokens.slice(i, i + colCount);
      if (chunk.length < colCount) break;
      dataRows.push(chunk);
    }
    if (dataRows.length < 2) return null;

    const hasSummaryRow = dataRows.some((row) => row.length && isSummaryLabelToken(row[0]));
    if (!hasSummaryRow) return null;
    return dataRows;
  }

  /**
   * mat-row copy: one field per line, no tabs → 1..N horizontal rows.
   * Uses label stride + numeric density (no hard-coded column count / account).
   */
  function tryParseVerticalFieldDump(nonEmptyLines) {
    const tokens = nonEmptyLines.map((line) => String(line ?? "").trim()).filter(Boolean);
    if (tokens.length < 3) return null;

    if (tokens.some((token) => token.includes("\t") || /\s{2,}/.test(token))) return null;

    const numericLikeCount = tokens.filter((token) => isMoneyOrNumberLikeToken(token)).length;
    if (numericLikeCount < 2) return null;
    if (numericLikeCount < Math.ceil(tokens.length * 0.5)) return null;

    const labelIndices = [];
    tokens.forEach((token, index) => {
      if (!isMoneyOrNumberLikeToken(token)) labelIndices.push(index);
    });

    if (labelIndices.length === 0) return null;

    if (labelIndices.length >= 2) {
      const diffs = [];
      for (let i = 1; i < labelIndices.length; i += 1) {
        diffs.push(labelIndices[i] - labelIndices[i - 1]);
      }
      const stride = diffs[0];
      const steady =
        stride >= 3 && diffs.every((diff) => diff === stride) && labelIndices[0] === 0;
      if (steady) {
        const rows = [];
        for (let i = 0; i < tokens.length; i += stride) {
          rows.push(tokens.slice(i, i + stride));
        }
        if (!rows.every((row) => isDenseReportRow(row))) return null;
        rows.forEach((row) => {
          while (row.length < stride) row.push("");
        });
        return rows;
      }
    }

    if (labelIndices.length <= 2 && labelIndices[0] === 0) {
      return [tokens];
    }

    return null;
  }

  function plainTextLooksLikeAlignedTsv(text) {
    const api = global.DataCaptureC8WinLossPasteHelper;
    if (api && typeof api.plainTextLooksLikeAlignedTsv === "function") {
      return api.plainTextLooksLikeAlignedTsv(text);
    }
    const lines = String(text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim() !== "");
    if (lines.length < 2) return false;
    const tabLines = lines.filter((line) => line.includes("\t")).length;
    return tabLines >= Math.ceil(lines.length * 0.6);
  }

  function parsePlainTextMatrix(pastedData) {
    const normalized = String(pastedData || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalized.trim()) return [];

    // Dense spreadsheet TSV first (keeps empty Player/Name/Type cells 1:1).
    if (plainTextLooksLikeAlignedTsv(normalized)) {
      const tabRows = normalized
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => line.split("\t"));
      if (!tabRows.length) return [];
      const maxCols = Math.max(...tabRows.map((row) => row.length));
      tabRows.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return tabRows;
    }

    // Scoped C8 Win Loss Detail helper — null for all other report pastes.
    const c8Api = global.DataCaptureC8WinLossPasteHelper;
    if (c8Api && typeof c8Api.tryReshapeC8WinLossPlainMatrix === "function") {
      const c8Rows = c8Api.tryReshapeC8WinLossPlainMatrix(normalized);
      if (c8Rows && c8Rows.length) return c8Rows;
    }

    // Legacy: any remaining tab-separated lines (sparse / mixed).
    if (normalized.includes("\t")) {
      const tabRows = normalized
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => line.split("\t"));
      if (!tabRows.length) return [];
      const maxCols = Math.max(...tabRows.map((row) => row.length));
      tabRows.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return tabRows;
    }

    const rawLines = normalized.split("\n");
    const hasBlankLine = rawLines.some((line) => line.trim() === "");
    if (hasBlankLine) {
      const rowBlocks = [];
      let currentRow = [];
      rawLines.forEach((line) => {
        if (line.trim() === "") {
          if (currentRow.length) {
            rowBlocks.push(currentRow);
            currentRow = [];
          }
          return;
        }
        currentRow.push(line);
      });
      if (currentRow.length) rowBlocks.push(currentRow);

      const hasMultiColBlock = rowBlocks.some((row) => row.length > 1);
      if (rowBlocks.length >= 2 && hasMultiColBlock) {
        const maxCols = Math.max(...rowBlocks.map((row) => row.length));
        rowBlocks.forEach((row) => {
          while (row.length < maxCols) row.push("");
        });
        return rowBlocks;
      }
    }

    const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");

    const verticalDumpRows = tryParseVerticalFieldDump(nonEmptyLines);
    if (verticalDumpRows) return verticalDumpRows;

    const spacingSplitRows = nonEmptyLines.map((line) =>
      line
        .trim()
        .split(/\s{2,}/)
        .map((cell) => cell.trim())
        .filter((cell) => cell !== ""),
    );
    if (spacingSplitRows.length >= 2) {
      const maxCols = Math.max(...spacingSplitRows.map((row) => row.length));
      const multiColRows = spacingSplitRows.filter((row) => row.length >= 2).length;
      const minRowsForWideSplit = Math.max(2, Math.ceil(spacingSplitRows.length * 0.6));
      if (maxCols >= 2 && multiColRows >= minRowsForWideSplit) {
        spacingSplitRows.forEach((row) => {
          while (row.length < maxCols) row.push("");
        });
        return spacingSplitRows;
      }
    }

    const flattenedStatementRows = parseFlattenedStatementMatrix(nonEmptyLines);
    if (flattenedStatementRows) return flattenedStatementRows;

    return nonEmptyLines.map((line) => [line]);
  }

  function plainMatrixToHtmlTable(matrix) {
    if (!matrix || !matrix.length) return "";
    let html = "<table><tbody>";
    matrix.forEach((row) => {
      html += "<tr>";
      (row || []).forEach((cell) => {
        const raw = String(cell != null ? cell : "");
        const escaped = raw
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        html += "<td>" + escaped + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  global.DataCapturePasteMatrix = {
    parsePlainTextMatrix,
    plainMatrixToHtmlTable,
    tryParseVerticalFieldDump,
  };
})(typeof window !== "undefined" ? window : globalThis);
