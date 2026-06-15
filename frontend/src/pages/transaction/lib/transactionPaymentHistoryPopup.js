const REPORT_CARD_MAX_WIDTH = 1320;
const POPUP_ROOT_PAD_X = 56;
const POPUP_MAX_WIDTH = 1520;
const POPUP_MIN_WIDTH = 1180;
const POPUP_MIN_HEIGHT = 360;
const POPUP_MARGIN = 16;
const POPUP_ROW_HEIGHT = 44;

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

/** Place popup beside the Transaction window when possible (matches reference layout). */
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

export function buildPaymentHistoryPopupFeatures() {
  const screen = screenAvailRect();
  const width = Math.min(
    POPUP_MAX_WIDTH,
    Math.max(POPUP_MIN_WIDTH, REPORT_CARD_MAX_WIDTH + POPUP_ROOT_PAD_X),
    screen.width - POPUP_MARGIN * 2,
  );
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
  const padX = parseFloat(rootStyle.paddingLeft) + parseFloat(rootStyle.paddingRight);
  const padY = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom);
  const tableWidth = table
    ? Math.ceil(Math.max(table.scrollWidth, table.getBoundingClientRect().width))
    : REPORT_CARD_MAX_WIDTH;
  const contentWidth = Math.ceil(Math.max(tableWidth + padX, REPORT_CARD_MAX_WIDTH + padX));
  const contentHeight = Math.ceil(panel.getBoundingClientRect().height + padY);

  return { contentWidth, contentHeight };
}

/** Fit popup outer size to the white card + table; keep full report width. */
export function fitPaymentHistoryPopupToContent() {
  if (!isPaymentHistoryPopupWindow()) return;

  try {
    const layout = measurePaymentHistoryLayout();
    if (!layout) return;

    const screen = screenAvailRect();
    const chromeW = Math.max(0, window.outerWidth - window.innerWidth);
    const chromeH = Math.max(0, window.outerHeight - window.innerHeight);

    const nextW = Math.min(
      POPUP_MAX_WIDTH,
      screen.width - POPUP_MARGIN,
      Math.max(POPUP_MIN_WIDTH, layout.contentWidth + chromeW),
    );
    const nextH = Math.min(
      screen.height - POPUP_MARGIN,
      Math.max(POPUP_MIN_HEIGHT, layout.contentHeight + chromeH),
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
  const rootPad = 56;
  const thead = 44;
  const rows = Math.max(1, Number(rowCount) || 1);
  return rootPad + header + bodyPad + thead + rows * POPUP_ROW_HEIGHT + 12;
}
