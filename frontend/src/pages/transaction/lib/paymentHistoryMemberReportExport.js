import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatDmyFromYmd } from "../../maintenance/shared/maintenanceDateHelpers.js";
import { computeTableTotals, formatPaymentHistoryMoney } from "../../member/memberPageHelpers.js";
import { parseJsonResponse } from "../../member/memberWinLossApi.js";
import { formatMemberRowDescription, getMemberText } from "../../../translateFile/pages/memberTranslate.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productCell(row) {
  if (row?.is_bank_process_transaction) return row.card_owner || "-";
  return row?.product || "-";
}

function remarkCell(row) {
  const raw = row?.remark || row?.sms || "-";
  return String(raw).toUpperCase();
}

function parseMoneyNumber(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function buildMoneyCellHtml(value) {
  const n = parseMoneyNumber(value);
  const display = escapeHtml(formatPaymentHistoryMoney(value));
  if (n === null) return `<span class="amt amt--empty">–</span>`;
  if (n === 0) return `<span class="amt amt--zero">-</span>`;
  const tone = n > 0 ? "pos" : "neg";
  return `<span class="amt amt--${tone}">${display}</span>`;
}

function buildAccountMetaLabel(accountCode, accountName) {
  const code = String(accountCode || "").trim();
  const name = String(accountName || "").trim();
  if (!code && !name) return "";
  if (!name || name === code) return code;
  const upper = name.toUpperCase();
  if (upper === "CURRENCY" || upper === code.toUpperCase()) return code;
  return `${code} (${name})`;
}

const PRINT_TABLE_COLS = [
  { className: "col-date", width: "11%" },
  { className: "col-product", width: "12%" },
  { className: "col-rate", width: "6%" },
  { className: "col-winloss", width: "10%" },
  { className: "col-crdr", width: "10%" },
  { className: "col-balance", width: "10%" },
  { className: "col-desc", width: "34%" },
  { className: "col-remark", width: "7%" },
];

const MEMBER_REPORT_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { width: 210mm; min-height: 297mm; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .report-section { page-break-after: always; }
  .report-section:last-child { page-break-after: auto; }
  .report-title {
    margin: 0 0 8px;
    font-size: 13pt;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: 0.01em;
  }
  .report-meta {
    margin: 0 0 12px;
    font-size: 10pt;
    font-weight: 600;
    color: #64748b;
    letter-spacing: 0.01em;
  }
  .wl-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    font-size: 10pt;
  }
  .wl-table thead th {
    background: #002c49;
    color: #ffffff;
    padding: 7px 8px;
    font-size: 10pt;
    font-weight: 700;
    border: 1px solid #1e3a5f;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }
  .wl-table thead th.col-rate,
  .wl-table thead th.col-winloss,
  .wl-table thead th.col-crdr,
  .wl-table thead th.col-balance {
    text-align: right;
  }
  .wl-table thead th.col-remark {
    text-align: center;
  }
  .wl-table tbody td {
    padding: 6px 8px;
    border: 1px solid #e8edf3;
    font-size: 10pt;
    font-weight: 600;
    color: #0f172a;
    vertical-align: middle;
    line-height: 1.3;
    word-break: break-word;
  }
  .wl-table tbody tr:nth-child(odd) td { background: #ffffff; }
  .wl-table tbody tr:nth-child(even) td { background: #f4f7fc; }
  .wl-table tbody tr.bf-row td {
    background: #eef4ff !important;
    color: #1e3a5f;
  }
  .wl-table td.col-rate,
  .wl-table td.col-winloss,
  .wl-table td.col-crdr,
  .wl-table td.col-balance {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .wl-table td.col-rate,
  .wl-table td.col-remark {
    color: #64748b;
  }
  .wl-table td.col-remark {
    text-align: center;
  }
  .wl-table td.col-desc,
  .wl-table td.col-remark {
    text-transform: uppercase;
  }
  .wl-table tbody td.col-winloss:has(.amt--zero),
  .wl-table tbody td.col-crdr:has(.amt--zero),
  .wl-table tbody td.col-balance:has(.amt--zero) {
    text-align: center;
  }
  .wl-table tfoot td {
    padding: 7px 8px;
    border: 1px solid #e2e8f0;
    border-top-color: #d6e3f2;
    background: #eef4ff !important;
    color: #0f172a;
    font-size: 10pt;
    font-weight: 700;
    vertical-align: middle;
  }
  .wl-table tfoot .total-label {
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .wl-table tfoot td.col-winloss,
  .wl-table tfoot td.col-crdr,
  .wl-table tfoot td.col-balance {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .amt {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .amt--pos { color: #172a9f; }
  .amt--neg { color: #b91c1c; }
  .amt--zero {
    color: #002c49;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .amt--empty { color: #cbd5e1; font-weight: 400; }
`;

function buildPrintColgroup() {
  return `<colgroup>${PRINT_TABLE_COLS.map(
    (col) => `<col class="${col.className}" style="width:${col.width}">`,
  ).join("")}</colgroup>`;
}

function buildPrintTableHead(headers) {
  const thClasses = PRINT_TABLE_COLS.map((col) => col.className);
  const cells = headers
    .map((label, i) => `<th class="${thClasses[i] || ""}">${escapeHtml(label)}</th>`)
    .join("");
  return `<thead><tr class="wl-head">${cells}</tr></thead>`;
}

function buildPrintTableBody(rows, lang) {
  return (rows || [])
    .map((row) => {
      const rowClass = row.row_type === "bf" ? " bf-row" : "";
      const desc = escapeHtml(String(formatMemberRowDescription(lang, row)).toUpperCase());
      const cells = [
        `<td class="col-date">${escapeHtml(row.date || "-")}</td>`,
        `<td class="col-product">${escapeHtml(productCell(row))}</td>`,
        `<td class="col-rate">${escapeHtml(row.rate || "-")}</td>`,
        `<td class="col-winloss">${buildMoneyCellHtml(row.win_loss)}</td>`,
        `<td class="col-crdr">${buildMoneyCellHtml(row.cr_dr)}</td>`,
        `<td class="col-balance">${buildMoneyCellHtml(row.balance)}</td>`,
        `<td class="col-desc">${desc}</td>`,
        `<td class="col-remark">${escapeHtml(remarkCell(row))}</td>`,
      ];
      return `<tr class="wl-row${rowClass}">${cells.join("")}</tr>`;
    })
    .join("");
}

function buildPrintTableFoot(totalLabel, totalWinLoss, totalCrDr, closingBalance) {
  return `<tfoot><tr class="wl-foot">
    <td class="total-label col-date" colspan="3">${escapeHtml(totalLabel)}</td>
    <td class="col-winloss">${buildMoneyCellHtml(totalWinLoss.toString())}</td>
    <td class="col-crdr">${buildMoneyCellHtml(totalCrDr.toString())}</td>
    <td class="col-balance">${buildMoneyCellHtml(closingBalance.toString())}</td>
    <td class="col-desc" colspan="2"></td>
  </tr></tfoot>`;
}

function buildMemberReportSectionHtml({
  title,
  subtitle,
  headers,
  rows,
  lang,
  totalLabel,
  totalWinLoss,
  totalCrDr,
  closingBalance,
}) {
  return `<section class="report-section">
  <h3 class="report-title">${escapeHtml(title)}</h3>
  <p class="report-meta">${escapeHtml(subtitle)}</p>
  <table class="wl-table wl-table--by-currency">
    ${buildPrintColgroup()}
    ${buildPrintTableHead(headers)}
    <tbody>${buildPrintTableBody(rows, lang)}</tbody>
    ${buildPrintTableFoot(totalLabel, totalWinLoss, totalCrDr, closingBalance)}
  </table>
</section>`;
}

function wrapPrintDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${MEMBER_REPORT_PRINT_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/** Account currencies for export modal (member report scope). */
export async function fetchPaymentHistoryExportCurrencies(accountId, companyId, signal) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  if (!id || !cid) return [];
  const res = await fetch(
    buildApiUrl(
      `api/accounts/account_currency_api.php?action=get_account_currencies&account_id=${id}&company_id=${cid}`,
    ),
    { credentials: "include", cache: "no-store", signal },
  );
  const json = await parseJsonResponse(await res.text());
  if (!json?.success || !Array.isArray(json.data)) return [];
  return json.data
    .map((row) =>
      String(row.currency_code || row.code || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
}

/**
 * Member Win/Loss table rows — same request + same formatting as the Member page.
 * `member_view=1` forces the backend to apply the member-side description rules
 * (PAYMENT → Payment Settlement, CLAIM → Claim Settlement, RATE → Currency Exchange,
 * CONTRA → Contra Account) even when an agent/admin triggers the export.
 */
export async function fetchMemberReportHistory({ accountId, companyId, dateFrom, dateTo, currency, signal }) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  if (!id || !cid) {
    throw new Error("Account or company is missing");
  }
  const params = new URLSearchParams({
    account_id: String(id),
    date_from: String(dateFrom),
    date_to: String(dateTo),
    company_id: String(cid),
    currency: String(currency || "")
      .trim()
      .toUpperCase(),
    member_view: "1",
  });
  const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await parseJsonResponse(await res.text());
  if (!json?.success) {
    throw new Error(json?.error || json?.message || "History request failed");
  }
  return Array.isArray(json.data?.history) ? json.data.history : [];
}

export function resolveExportCurrencyDefault(scopeCurrency, currencies) {
  return resolveExportCurrenciesDefault(scopeCurrency, currencies).codes[0] || "";
}

/** Initial multi-select state for export modal (comma-separated scope currency or ALL). */
export function resolveExportCurrenciesDefault(scopeCurrency, currencies) {
  const list = Array.isArray(currencies) ? currencies : [];
  if (!list.length) {
    return { isAllSelected: true, codes: [] };
  }
  const raw = String(scopeCurrency || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "ALL") {
    return { isAllSelected: true, codes: [] };
  }
  const parts = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const matched = parts.filter((p) => list.includes(p));
  if (!matched.length) {
    return { isAllSelected: true, codes: [] };
  }
  if (matched.length === list.length) {
    return { isAllSelected: true, codes: [] };
  }
  return { isAllSelected: false, codes: matched };
}

export function exportCurrencyCodes(isAllSelected, selectedCurrencies, availableCurrencies) {
  const list = Array.isArray(availableCurrencies) ? availableCurrencies : [];
  if (!list.length) return [];
  if (isAllSelected) return [...list];
  const picked = (selectedCurrencies || []).filter((c) => list.includes(c));
  return picked.length ? picked : [...list];
}

export function ymdRangeToDmy(dateFromYmd, dateToYmd) {
  return {
    dateFrom: formatDmyFromYmd(dateFromYmd),
    dateTo: formatDmyFromYmd(dateToYmd),
  };
}

function buildMemberReportSectionData({
  rows,
  currency,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const t = (key, params) => getMemberText(lang, key, params);
  const { totalWinLoss, totalCrDr, closingBalance } = computeTableTotals(rows);
  const accountMeta = buildAccountMetaLabel(accountCode, accountName);
  const title = t("currencyTitle", { currency });
  const subtitle = `${accountMeta}${accountMeta ? " · " : ""}${dateFrom} – ${dateTo}`;
  const headers = [
    t("colDate"),
    t("colIdProduct"),
    t("colRate"),
    t("colWinLoss"),
    t("colCrDr"),
    t("colBalance"),
    t("colDescription"),
    t("colRemark"),
  ];
  return {
    title,
    subtitle,
    headers,
    rows: rows || [],
    lang,
    totalLabel: t("totalRow", { currency }),
    totalWinLoss,
    totalCrDr,
    closingBalance,
  };
}

export function buildMemberReportPrintHtml(props) {
  const section = buildMemberReportSectionData(props);
  return wrapPrintDocument(section.title, buildMemberReportSectionHtml(section));
}

/** One print document with a table per selected currency (page break between sections). */
export function buildCombinedMemberReportPrintHtml({
  sections,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const sectionHtml = (sections || [])
    .map(({ currency, rows }) =>
      buildMemberReportSectionHtml(
        buildMemberReportSectionData({
          rows,
          currency,
          accountCode,
          accountName,
          dateFrom,
          dateTo,
          lang,
        }),
      ),
    )
    .join("");
  const firstCurrency = sections?.[0]?.currency || "Report";
  const docTitle = `${firstCurrency}${sections?.length > 1 ? ` +${sections.length - 1}` : ""}`;
  return wrapPrintDocument(docTitle, sectionHtml);
}

/**
 * Open the print window synchronously (must run inside the click handler so the
 * browser keeps the user-gesture context — otherwise it becomes a blocked/blank tab).
 */
export function openReportPrintWindow(loadingLabel = "Loading…") {
  const win = window.open("", "_blank");
  if (!win) return null;
  win.document.open();
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(loadingLabel)}</title>` +
      `<style>body{font-family:"Segoe UI",Arial,sans-serif;color:#475569;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>` +
      `</head><body>${escapeHtml(loadingLabel)}</body></html>`,
  );
  win.document.close();
  return win;
}

/** Render report HTML into an already-opened window and trigger the print dialog. */
export function renderReportToWindow(win, { html, documentTitle }) {
  if (!win || win.closed) throw new Error("Popup blocked");
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.document.title = documentTitle;
  } catch {
    /* ignore */
  }
  const triggerPrint = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 300);
  } else {
    win.addEventListener("load", () => window.setTimeout(triggerPrint, 300));
  }
}

export function buildMemberReportFilename({ accountCode, currency, currencies, dateFrom, dateTo }) {
  const code = String(accountCode || "account").replace(/[^\w.-]+/g, "_");
  const list = Array.isArray(currencies) && currencies.length
    ? currencies
    : [String(currency || "CCY").toUpperCase()];
  const cu =
    list.length === 1
      ? list[0]
      : list.length <= 3
        ? list.join("-")
        : "MULTI";
  const from = String(dateFrom || "").replace(/\//g, "-");
  const to = String(dateTo || "").replace(/\//g, "-");
  return `WinLoss-${code}-${cu}-${from}-${to}`;
}
