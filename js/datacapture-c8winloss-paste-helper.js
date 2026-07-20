/**
 * C8Play Win Loss Detail (cswinlossdetail) clipboard helper — scoped only.
 *
 * Other report pastes must NOT go through this. Callers use
 * tryReshapeC8WinLossPlainMatrix() which returns null when the clipboard
 * is not a Win Loss agent-grid dump.
 *
 * Fixes unique to this source:
 * - sparse tab "87\tAGENT" must stay two columns (not "87 AGENT")
 * - money-only Subtotal footer (empty Player/Name/Type) must left-pad
 */
(function (global) {
  "use strict";

  function normalizeToken(text) {
    return String(text ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMoneyToken(text) {
    const cleaned = normalizeToken(text)
      .replace(/[,$]/g, "")
      .replace(/^\((.*)\)$/, "-$1");
    if (!cleaned) return false;
    return /^-?\d+(?:\.\d+)?$/.test(cleaned);
  }

  function isSummaryLabel(text) {
    const normalized = normalizeToken(text).replace(/:$/, "").toUpperCase();
    return (
      normalized === "SUBTOTAL" ||
      normalized === "SUB TOTAL" ||
      normalized === "TOTAL AMOUNT" ||
      normalized === "TOTAL" ||
      normalized === "GRAND TOTAL"
    );
  }

  function isUserTypeToken(token) {
    return /^(AGENT|MEMBER)$/i.test(normalizeToken(token));
  }

  function isPlayerCodeToken(token) {
    const t = normalizeToken(token);
    if (!t || isMoneyToken(t) || isSummaryLabel(t)) return false;
    if (isUserTypeToken(t)) return false;
    return /^[A-Z0-9][A-Z0-9_-]{2,}$/i.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t);
  }

  function looksLikeMoneyOnlyFooter(chunk, width) {
    if (!Array.isArray(chunk) || chunk.length < 3) return false;
    if (!isMoneyToken(chunk[0])) return false;
    const moneyCount = chunk.filter((t) => isMoneyToken(t)).length;
    if (moneyCount < Math.max(3, Math.ceil(chunk.length * 0.75))) return false;
    if (width && chunk.length > width) return false;
    return true;
  }

  /** Expand tabs before whitespace normalize so "87\\tAGENT" stays two fields. */
  function expandC8WinLossClipboardTokens(pastedData) {
    const lines = String(pastedData ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => String(line ?? "").replace(/\u00a0/g, " ").trim() !== "");

    const tokens = [];
    lines.forEach((line) => {
      const raw = String(line ?? "").replace(/\u00a0/g, " ");
      if (raw.includes("\t")) {
        raw.split("\t").forEach((part) => {
          // Normalize each part alone — do NOT normalize the whole line first
          // (that would collapse \\t into a space → "87 AGENT").
          const token = String(part ?? "")
            .replace(/\u00a0/g, " ")
            .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
            .replace(/[ \t\f\v]+/g, " ")
            .trim();
          if (token) tokens.push(token);
        });
        return;
      }
      const normalized = normalizeToken(raw);
      if (normalized) tokens.push(normalized);
    });
    return tokens;
  }

  /**
   * Strict gate: wide Win Loss rows with Player + Name + AGENT/MEMBER + amounts.
   * Rejects agent_period / OB / other mat-row dumps.
   */
  function looksLikeC8WinLossPlain(pastedData) {
    const tokens = expandC8WinLossClipboardTokens(pastedData);
    if (tokens.length < 20) return false;
    if (!tokens.some(isUserTypeToken)) return false;

    const agentIdx = [];
    tokens.forEach((token, index) => {
      if (isPlayerCodeToken(token)) agentIdx.push(index);
    });
    if (agentIdx.length < 2) return false;

    const width = agentIdx[1] - agentIdx[0];
    if (width < 12 || width > 24) return false;
    for (let i = 1; i < agentIdx.length; i += 1) {
      if (agentIdx[i] - agentIdx[i - 1] !== width) return false;
    }
    if (agentIdx[0] > 2) return false;

    for (const idx of agentIdx) {
      if (!isUserTypeToken(tokens[idx + 2] || "")) return false;
      const row = tokens.slice(idx, idx + width);
      if (row.length < width) return false;
      const moneyCount = row.filter((t) => isMoneyToken(t)).length;
      if (moneyCount < Math.ceil(width * 0.5)) return false;
    }

    return true;
  }

  function leftPadMoneyFooter(row, width) {
    const next = Array.isArray(row) ? row.slice() : [];
    const lead = Math.max(0, width - next.length);
    const padded = [];
    for (let i = 0; i < lead; i += 1) padded.push("");
    for (let i = 0; i < next.length; i += 1) padded.push(next[i]);
    while (padded.length < width) padded.push("");
    return padded.slice(0, width);
  }

  function rightPadRow(row, width) {
    const next = Array.isArray(row) ? row.slice() : [];
    while (next.length < width) next.push("");
    return next.slice(0, width);
  }

  function plainTextLooksLikeAlignedTsv(text) {
    const lines = String(text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim() !== "");
    if (lines.length < 2) return false;
    const tabLines = lines.filter((line) => line.includes("\t")).length;
    return tabLines >= Math.ceil(lines.length * 0.6);
  }

  /**
   * Reshape C8 Win Loss plain clipboard into a horizontal matrix.
   * @returns {string[][]|null}
   */
  function tryReshapeC8WinLossPlainMatrix(pastedData) {
    const text = String(pastedData ?? "");
    // Dense TSV keeps empty Player/Name/Type cells — do not flatten via tokens.
    if (plainTextLooksLikeAlignedTsv(text)) return null;
    if (!looksLikeC8WinLossPlain(pastedData)) return null;

    const tokens = expandC8WinLossClipboardTokens(pastedData);
    const agentIdx = [];
    tokens.forEach((token, index) => {
      if (isPlayerCodeToken(token)) agentIdx.push(index);
    });
    const width = agentIdx[1] - agentIdx[0];
    const start = agentIdx[0];
    const dataTokens = tokens.slice(start);

    const rows = [];
    for (let i = 0; i < dataTokens.length; i += width) {
      const chunk = dataTokens.slice(i, i + width);
      if (chunk.length === width) {
        rows.push(chunk);
        continue;
      }
      if (!chunk.length) break;
      if (isSummaryLabel(chunk[0])) {
        rows.push(rightPadRow(chunk, width));
        break;
      }
      if (looksLikeMoneyOnlyFooter(chunk, width)) {
        rows.push(leftPadMoneyFooter(chunk, width));
        break;
      }
      break;
    }

    if (rows.length < 2) return null;
    return rows.map((row) => rightPadRow(row, width));
  }

  global.DataCaptureC8WinLossPasteHelper = {
    looksLikeC8WinLossPlain,
    tryReshapeC8WinLossPlainMatrix,
    expandC8WinLossClipboardTokens,
    plainTextLooksLikeAlignedTsv,
  };
})(typeof window !== "undefined" ? window : globalThis);
