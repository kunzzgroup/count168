/**
 * Shared 1.TEXT / 2.FORMAT helper (PHP datacapture):
 * pick the better report matrix from clipboard plain vs normalized HTML
 * so both modes paste the same shape.
 *
 * - agent_period: plain vertical-dump often wins (HTML collapses to col1)
 * - C8/Kendo Win Loss: HTML keeps Name/AGENT cells + footer empties (plain merges "87 AGENT")
 */
(function (global) {
  "use strict";

  function cellText(cell) {
    return String(cell ?? "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function matrixShape(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) return { rows: 0, cols: 0 };
    const cols = Math.max(...matrix.map((row) => (Array.isArray(row) ? row.length : 0)), 0);
    return { rows: matrix.length, cols };
  }

  function padMatrix(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) return null;
    const cols = Math.max(...matrix.map((row) => (Array.isArray(row) ? row.length : 0)), 0);
    if (cols < 1) return null;
    return matrix.map((row) => {
      const next = Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [];
      while (next.length < cols) next.push("");
      return next;
    });
  }

  function isMoneyLike(text) {
    const raw = cellText(text);
    if (!raw) return false;
    if (/^\$/.test(raw)) return true;
    const normalized = raw.replace(/[,$]/g, "").replace(/^\((.*)\)$/, "-$1");
    return /^-?\d+(?:\.\d+)?$/.test(normalized);
  }

  function matrixLooksCol1Stacked(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) return false;
    const nonEmptyCols = (row) => (row || []).filter((cell) => cellText(cell)).length;
    const maxFilled = Math.max(...matrix.map(nonEmptyCols), 0);
    const stackedRows = matrix.filter((row) => {
      const text = cellText(row?.[0]);
      const lineHits = text.split(/\r?\n/).filter((line) => line.trim()).length;
      const moneyHits = (text.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
      return lineHits >= 3 || moneyHits >= 3;
    }).length;
    return stackedRows >= 1 && maxFilled <= 2;
  }

  function matrixHasMergedNameUserType(matrix) {
    return (matrix || []).some((row) =>
      (row || []).some((cell) => /^\d+\s+(AGENT|MEMBER)$/i.test(cellText(cell))),
    );
  }

  function matrixHasAlignedMoneyFooter(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) return false;
    const last = matrix[matrix.length - 1] || [];
    let first = -1;
    for (let i = 0; i < last.length; i += 1) {
      if (cellText(last[i])) {
        first = i;
        break;
      }
    }
    if (first < 0) return false;
    const token = cellText(last[first]);
    if (first >= 2 && isMoneyLike(token)) return true;
    if (first >= 1 && /sub\s*total|total\s*amount|grand\s*total/i.test(token)) return true;
    return false;
  }

  function scoreReportPasteMatrix(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) return -1;
    if (matrixLooksCol1Stacked(matrix)) return -1;
    const { rows, cols } = matrixShape(matrix);
    if (rows < 1 || cols < 2) return -1;
    if (matrix.length > 1 && cols === 1) return -1;

    let score = rows * 100 + cols * 10;
    if (matrixHasAlignedMoneyFooter(matrix)) score += 50;
    if (matrixHasMergedNameUserType(matrix)) score -= 80;
    return score;
  }

  function tableHtmlToMatrix(html) {
    if (!html || !/<table\b/i.test(html)) return null;
    try {
      const root = document.createElement("div");
      root.innerHTML = html;
      const table = root.querySelector("table");
      if (!table) return null;

      const rows = [];
      table.querySelectorAll("tr").forEach((tr) => {
        const row = [];
        tr.querySelectorAll("td, th").forEach((cell) => {
          const colspan = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
          row.push(cellText(cell.textContent));
          for (let i = 1; i < colspan; i += 1) row.push("");
        });
        rows.push(row);
      });
      return padMatrix(rows);
    } catch (_) {
      return null;
    }
  }

  function matrixFromClipboardHtml(html) {
    if (!html) return null;
    const norm = global.DataCaptureClipboardNormalize;
    let normalized = html;
    if (norm && typeof norm.normalizeClipboardHtmlToTable === "function") {
      const looksGrid =
        /<table\b/i.test(html) ||
        (typeof norm.clipboardHtmlLooksLikeGrid === "function" &&
          norm.clipboardHtmlLooksLikeGrid(html));
      if (looksGrid) {
        normalized = norm.normalizeClipboardHtmlToTable(html) || html;
      }
    }
    return tableHtmlToMatrix(normalized);
  }

  /**
   * @param {string} html
   * @param {string} text
   * @returns {{ matrix: string[][], source: "html" | "plain", htmlNormalized?: string } | null}
   */
  function selectPreferredReportPasteMatrix(html, text) {
    const matrixApi = global.DataCapturePasteMatrix;
    const plainMatrix =
      text &&
      text.trim() &&
      matrixApi &&
      typeof matrixApi.parsePlainTextMatrix === "function"
        ? padMatrix(matrixApi.parsePlainTextMatrix(text))
        : null;

    const norm = global.DataCaptureClipboardNormalize;
    let htmlNormalized = "";
    if (html && norm && typeof norm.normalizeClipboardHtmlToTable === "function") {
      const looksGrid =
        /<table\b/i.test(html) ||
        (typeof norm.clipboardHtmlLooksLikeGrid === "function" &&
          norm.clipboardHtmlLooksLikeGrid(html));
      if (looksGrid) {
        htmlNormalized = norm.normalizeClipboardHtmlToTable(html) || "";
      }
    }
    if (!htmlNormalized && html && /<table\b/i.test(html)) {
      htmlNormalized = html;
    }

    const htmlMatrix = matrixFromClipboardHtml(html);

    const plainScore = scoreReportPasteMatrix(plainMatrix);
    const htmlScore = scoreReportPasteMatrix(htmlMatrix);

    if (htmlScore < 0 && plainScore < 0) return null;

    if (htmlScore >= plainScore && htmlScore >= 0) {
      return {
        matrix: htmlMatrix,
        source: "html",
        htmlNormalized: htmlNormalized || "",
      };
    }
    if (plainScore >= 0) {
      return { matrix: plainMatrix, source: "plain" };
    }
    return {
      matrix: htmlMatrix,
      source: "html",
      htmlNormalized: htmlNormalized || "",
    };
  }

  global.DataCapturePastePrefer = {
    scoreReportPasteMatrix,
    matrixLooksCol1Stacked,
    selectPreferredReportPasteMatrix,
    tableHtmlToMatrix,
  };
})(typeof window !== "undefined" ? window : globalThis);
