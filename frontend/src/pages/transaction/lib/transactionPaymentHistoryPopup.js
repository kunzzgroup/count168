const POPUP_ROOT_PAD_X = 48;
const POPUP_MIN_WIDTH = 960;
const POPUP_MIN_HEIGHT = 360;
const POPUP_MARGIN = 12;
const POPUP_ROW_HEIGHT = 44;

/** 10 列（含 Description）在 popup 中的参考最小总宽 — 用于测量不足时的兜底。 */
const POPUP_TABLE_MIN_WIDTH_WITH_DESC = 1240;

export function isPaymentHistoryPopupWindow() {
  try {
    return Boolean(window.opener && !window.opener.closed);
  } catch {
    return false;
  }
}

function screenAvailRect() {
  const left = window.screen.availLeft ?? 0;
  const top = window.screen.availTop ?? 0;
  const width = window.screen.availWidth ?? 1280;
  const height = window.screen.availHeight ?? 800;
  return { left, top, width, height };
}

function windowChromeSize() {
  return {
    w: Math.max(0, window.outerWidth - window.innerWidth),
    h: Math.max(0, window.outerHeight - window.innerHeight),
  };
}

/** Place popup beside the Transaction window when possible. */
export function resolvePaymentHistoryPopupPosition(outerWidth, outerHeight) {
  const screen = screenAvailRect();
  let left = Math.round(screen.left + (screen.width - outerWidth) / 2);
  let top = Math.round(screen.top + (screen.height - outerHeight) / 2);

  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      const ox = opener.screenX ?? opener.screenLeft ?? screen.left;
      const oy = opener.screenY ?? opener.screenTop ?? screen.top;
      const ow = opener.outerWidth ?? 0;
      left = ox + ow + 12;
      top = oy + 36;
      const rightEdge = screen.left + screen.width - POPUP_MARGIN;
      if (left + outerWidth > rightEdge) {
        left = Math.max(screen.left + POPUP_MARGIN, ox - outerWidth - 12);
      }
      const bottomEdge = screen.top + screen.height - POPUP_MARGIN;
      if (top + outerHeight > bottomEdge) {
        top = Math.max(screen.top + POPUP_MARGIN, bottomEdge - outerHeight);
      }
    }
  } catch {
    /* ignore cross-origin opener */
  }

  return { left, top };
}

/** Popup 宽度优先占满可用屏幕，让 10 列（含 Remark / Created by）都能放下。 */
export function resolvePaymentHistoryPopupWidth(contentInnerWidth = 0) {
  const screen = screenAvailRect();
  const maxOuter = screen.width - POPUP_MARGIN * 2;
  const neededInner = Math.max(
    POPUP_TABLE_MIN_WIDTH_WITH_DESC,
    Math.ceil(Number(contentInnerWidth) || 0),
  );
  const chrome = typeof window !== "undefined" ? windowChromeSize().w : 16;
  const neededOuter = neededInner + POPUP_ROOT_PAD_X + chrome;
  return Math.min(maxOuter, Math.max(POPUP_MIN_WIDTH, neededOuter));
}

export function buildPaymentHistoryPopupFeatures() {
  const screen = screenAvailRect();
  const width = resolvePaymentHistoryPopupWidth();
  const height = Math.max(POPUP_MIN_HEIGHT, screen.height - POPUP_MARGIN * 2);
  const { left, top } = resolvePaymentHistoryPopupPosition(width, height);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

function measurePaymentHistoryLayout() {
  const root = document.querySelector(".transaction-payment-history-page-root");
  const panel = document.querySelector(".transaction-payment-history-panel");
  const table = document.querySelector(".transaction-history-report-table");
  if (!root || !panel) return null;

  const rootStyle = getComputedStyle(root);
  const padY = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom);
  const tableInnerWidth = table
    ? Math.ceil(table.getBoundingClientRect().width)
    : POPUP_TABLE_MIN_WIDTH_WITH_DESC;
  const contentHeight = Math.ceil(panel.getBoundingClientRect().height + padY);

  return { tableInnerWidth, contentHeight };
}

/** 宽度占满屏幕（或内容所需宽度）；高度随表格行数收缩。 */
export function fitPaymentHistoryPopupToContent() {
  if (!isPaymentHistoryPopupWindow()) return;

  try {
    const layout = measurePaymentHistoryLayout();
    if (!layout) return;

    const screen = screenAvailRect();
    const chrome = windowChromeSize();

    const nextW = resolvePaymentHistoryPopupWidth(layout.tableInnerWidth);
    const nextH = Math.min(
      screen.height - POPUP_MARGIN,
      Math.max(POPUP_MIN_HEIGHT, layout.contentHeight + chrome.h),
    );

    window.resizeTo(nextW, nextH);
    const { left, top } = resolvePaymentHistoryPopupPosition(nextW, nextH);
    window.moveTo(left, top);
  } catch {
    /* resizeTo / moveTo may be blocked */
  }
}

export function estimatePaymentHistoryPopupHeight(rowCount) {
  const header = 78;
  const bodyPad = 36;
  const rootPad = 48;
  const thead = 44;
  const rows = Math.max(1, Number(rowCount) || 1);
  return rootPad + header + bodyPad + thead + rows * POPUP_ROW_HEIGHT + 12;
}
