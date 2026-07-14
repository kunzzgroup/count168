/**
 * Map Angular Material / report-center class cues → inline visual styles for 2.FORMAT.
 * Fail-closed: only known status / summary / link cues; never invent layout.
 *
 * Clipboard CSS often lives in class names (positive / negative / footer) without
 * embedded <style>, so normalize must bake these onto style="" before sanitize
 * strips class attributes.
 */

export const MATERIAL_VISUAL = {
  positive: "rgb(0, 200, 83)",
  negative: "rgb(244, 67, 54)",
  link: "rgb(33, 150, 243)",
};

const POSITIVE_CLASS_RE =
  /\b(?:positive|text-success|text-green(?:-\d+)?)\b/i;
const NEGATIVE_CLASS_RE =
  /\b(?:negative|text-danger|text-red(?:-\d+)?|text-error)\b/i;
const BOLD_CLASS_RE =
  /\b(?:font-bold|font-weight-bold|fw-bold|mat-footer-cell|cdk-footer-cell|footer-cell)\b/i;
const FOOTER_ROW_CLASS_RE =
  /\b(?:mat-footer-row|cdk-footer-row|mat-footer|footer-row)\b/i;
const SUMMARY_LABEL_RE =
  /^(?:SUB\s*TOTAL|SUBTOTAL|TOTAL\s*AMOUNT|GRAND\s*TOTAL|TOTAL)\s*:?\s*$/i;

function parseStyleDeclarations(styleString) {
  const out = {};
  String(styleString || "")
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
  Object.assign(current, extraObj);
  const css = styleObjectToCssText(current);
  if (css) el.setAttribute("style", `${css};`);
  else el.removeAttribute("style");
}

function looksLikeSummaryRowLabel(text) {
  const cleaned = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/:$/, "");
  if (!cleaned) return false;
  if (SUMMARY_LABEL_RE.test(cleaned)) return true;
  const upper = cleaned.toUpperCase();
  return (
    upper === "SUB TOTAL" ||
    upper === "SUB TOTAL" ||
    upper === "TOTAL AMOUNT" ||
    upper === "GRAND TOTAL" ||
    upper === "TOTAL"
  );
}

/**
 * @param {{
 *   className?: string,
 *   rowClassName?: string,
 *   text?: string,
 *   hasLink?: boolean,
 *   forceBold?: boolean,
 * }} [opts]
 * @returns {Record<string, string>}
 */
export function mapMaterialVisualDecls(opts = {}) {
  const className = String(opts.className || "");
  const rowClassName = String(opts.rowClassName || "");
  const text = String(opts.text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const decls = {};

  if (POSITIVE_CLASS_RE.test(className)) {
    decls.color = MATERIAL_VISUAL.positive;
  } else if (NEGATIVE_CLASS_RE.test(className)) {
    decls.color = MATERIAL_VISUAL.negative;
  } else if (/^\+\s*[\d(]/.test(text)) {
    // Explicit "+" money tokens sometimes appear without status class.
    decls.color = MATERIAL_VISUAL.positive;
  }

  if (opts.hasLink) {
    if (!decls.color) decls.color = MATERIAL_VISUAL.link;
    decls["text-decoration"] = "underline";
  }

  const bold =
    Boolean(opts.forceBold) ||
    BOLD_CLASS_RE.test(className) ||
    FOOTER_ROW_CLASS_RE.test(className) ||
    FOOTER_ROW_CLASS_RE.test(rowClassName) ||
    looksLikeSummaryRowLabel(text);

  if (bold) decls["font-weight"] = "700";

  return decls;
}

/** Style string for buildFormatDataCellStyle merge (trailing semicolon). */
export function materialVisualDeclsToCssText(decls) {
  const css = styleObjectToCssText(decls);
  return css ? `${css};` : "";
}

/**
 * Infer visual style from a live DOM cell (class on self or nested status span).
 * @param {Element | null | undefined} sourceCell
 */
export function inferMaterialVisualStyleFromCell(sourceCell) {
  if (!sourceCell) return "";
  const row = sourceCell.parentElement;
  const decls = mapMaterialVisualDecls({
    className: sourceCell.className,
    rowClassName: row?.className,
    text: sourceCell.textContent,
    hasLink: Boolean(sourceCell.querySelector?.("a")),
    forceBold: looksLikeSummaryRowLabel(
      Array.from(row?.children || [])
        .find((el) => {
          const tag = (el.tagName || "").toUpperCase();
          return tag === "TD" || tag === "TH";
        })
        ?.textContent,
    ),
  });

  if (!decls.color) {
    const nested = sourceCell.querySelector?.(
      ".positive, .negative, .text-success, .text-danger, .text-green, .text-red, [class*='positive'], [class*='negative']",
    );
    if (nested) {
      const nestedDecls = mapMaterialVisualDecls({
        className: nested.className,
        text: nested.textContent,
      });
      if (nestedDecls.color) decls.color = nestedDecls.color;
    }
  }

  return materialVisualDeclsToCssText(decls);
}

/**
 * Bake known Material cues onto an element without overwriting existing props.
 * @param {Element} el
 * @param {{
 *   className?: string,
 *   rowClassName?: string,
 *   text?: string,
 *   hasLink?: boolean,
 *   forceBold?: boolean,
 * }} [opts]
 */
export function bakeMaterialVisualOntoElement(el, opts = {}) {
  if (!el) return;
  const current = parseStyleDeclarations(el.getAttribute("style") || "");
  const decls = mapMaterialVisualDecls({
    className: opts.className != null ? opts.className : el.className,
    rowClassName: opts.rowClassName,
    text: opts.text != null ? opts.text : el.textContent,
    hasLink:
      opts.hasLink != null
        ? opts.hasLink
        : Boolean(el.matches?.("a") || el.querySelector?.("a")),
    forceBold: opts.forceBold,
  });

  const filtered = {};
  Object.entries(decls).forEach(([prop, value]) => {
    if (current[prop]) return;
    filtered[prop] = value;
  });
  mergeStyleAttr(el, filtered);
}

/**
 * Walk a normalized <table> and bake class / summary / nested-status cues to inline styles.
 * Safe to call multiple times; existing inline props win.
 * @param {HTMLTableElement | Element | null | undefined} table
 */
export function applyMaterialStyleHintsToTable(table) {
  if (!table || typeof table.querySelectorAll !== "function") return;

  Array.from(table.querySelectorAll("tr")).forEach((tr) => {
    const cells = Array.from(tr.children || []).filter((el) => {
      const tag = (el.tagName || "").toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    if (!cells.length) return;

    const firstText = String(cells[0].textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const rowIsSummary =
      looksLikeSummaryRowLabel(firstText) ||
      FOOTER_ROW_CLASS_RE.test(String(tr.className || ""));

    cells.forEach((cell) => {
      bakeMaterialVisualOntoElement(cell, {
        className: cell.className,
        rowClassName: tr.className,
        text: cell.textContent,
        hasLink: Boolean(cell.querySelector("a")),
        forceBold: rowIsSummary,
      });

      // Status color often sits on an inner span while the TD stays unstyled.
      Array.from(
        cell.querySelectorAll(
          ".positive, .negative, .text-success, .text-danger, .text-green, .text-red, [class*='positive'], [class*='negative'], a",
        ),
      ).forEach((node) => {
        bakeMaterialVisualOntoElement(node, {
          className: node.className,
          rowClassName: tr.className,
          text: node.textContent,
          hasLink: (node.tagName || "").toLowerCase() === "a" || Boolean(node.querySelector?.("a")),
          forceBold: rowIsSummary,
        });
      });

      // Promote nested status color onto the TD when TD has no color yet.
      const cellStyle = parseStyleDeclarations(cell.getAttribute("style") || "");
      if (!cellStyle.color) {
        const colored = Array.from(cell.querySelectorAll("[style]")).find((node) => {
          const st = parseStyleDeclarations(node.getAttribute("style") || "");
          return Boolean(st.color);
        });
        if (colored) {
          const st = parseStyleDeclarations(colored.getAttribute("style") || "");
          if (st.color) mergeStyleAttr(cell, { color: st.color });
        }
      }
    });
  });
}
