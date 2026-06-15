const CARD_MAX_WIDTH = 1320;
const POPUP_CHROME_PAD = 48;
const POPUP_MIN_WIDTH = 680;
const POPUP_MIN_HEIGHT = 320;
const POPUP_MARGIN = 12;
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

function windowChromeSize() {
  return {
    w: Math.max(0, window.outerWidth - window.innerWidth),
    h: Math.max(0, window.outerHeight - window.innerHeight),
  };
}

/** 分屏：优先贴在 Transaction 窗口右侧，宽度为剩余可用区域。 */
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
      left = ox + ow + 8;
      top = oy + 32;
      const rightEdge = screen.left + screen.width - POPUP_MARGIN;
      if (left + outerWidth > rightEdge) {
        left = Math.max(screen.left + POPUP_MARGIN, rightEdge - outerWidth);
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

/** 分屏宽度：Transaction 右侧剩余空间，上限 1320 卡片宽。 */
export function resolvePaymentHistoryPopupOpenSize() {
  const screen = screenAvailRect();
  let width = Math.min(CARD_MAX_WIDTH + POPUP_CHROME_PAD, screen.width - POPUP_MARGIN * 2);

  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      const ox = opener.screenX ?? opener.screenLeft ?? screen.left;
      const ow = opener.outerWidth ?? 0;
      const spaceRight = screen.left + screen.width - (ox + ow) - POPUP_MARGIN * 2;
      width = Math.min(CARD_MAX_WIDTH + POPUP_CHROME_PAD, Math.max(POPUP_MIN_WIDTH, spaceRight));
    }
  } catch {
    /* ignore */
  }

  width = Math.max(POPUP_MIN_WIDTH, Math.min(width, screen.width - POPUP_MARGIN * 2));
  const height = Math.min(820, Math.max(POPUP_MIN_HEIGHT, screen.height - POPUP_MARGIN * 2));
  return { width, height };
}

export function buildPaymentHistoryPopupFeatures() {
  const { width, height } = resolvePaymentHistoryPopupOpenSize();
  const { left, top } = resolvePaymentHistoryPopupPosition(width, height);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

function measurePaymentHistoryPanelHeight() {
  const root = document.querySelector(".transaction-payment-history-page-root");
  const panel = document.querySelector(".transaction-payment-history-panel");
  if (!root || !panel) return null;

  const rootStyle = getComputedStyle(root);
  const padY = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom);
  return Math.ceil(panel.getBoundingClientRect().height + padY);
}

/**
 * 仅在数据加载后调用一次：只调整高度以包住表格行。
 * 不改宽度、不 moveTo —— 用户可自由分屏/拖拽。
 */
export function fitPaymentHistoryPopupHeightOnce() {
  if (!isPaymentHistoryPopupWindow()) return;

  try {
    const contentHeight = measurePaymentHistoryPanelHeight();
    if (!contentHeight) return;

    const screen = screenAvailRect();
    const chrome = windowChromeSize();
    const nextH = Math.min(
      screen.height - POPUP_MARGIN,
      Math.max(POPUP_MIN_HEIGHT, contentHeight + chrome.h),
    );

    window.resizeTo(window.outerWidth, nextH);
  } catch {
    /* resizeTo may be blocked */
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
