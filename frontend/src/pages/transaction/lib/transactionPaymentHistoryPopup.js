const POPUP_MAX_WIDTH = 1400;
const POPUP_MIN_WIDTH = 1024;
const POPUP_MIN_HEIGHT = 420;
const POPUP_MARGIN = 20;

export function isPaymentHistoryPopupWindow() {
  try {
    return Boolean(window.opener && !window.opener.closed);
  } catch {
    return false;
  }
}

/** Initial popup geometry — large enough for the report table before content-fit runs. */
export function buildPaymentHistoryPopupFeatures() {
  const availW = window.screen?.availWidth ?? 1280;
  const availH = window.screen?.availHeight ?? 800;
  const width = Math.min(POPUP_MAX_WIDTH, Math.max(POPUP_MIN_WIDTH, availW - POPUP_MARGIN * 2));
  const height = Math.max(POPUP_MIN_HEIGHT, availH - POPUP_MARGIN * 2);
  const left = Math.max(0, Math.round((availW - width) / 2));
  const top = Math.max(0, Math.round((availH - height) / 2));
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

/** Shrink (or grow) the popup to fit loaded history rows; cap at available screen height. */
export function fitPaymentHistoryPopupToContent() {
  if (!isPaymentHistoryPopupWindow()) return;

  try {
    const root = document.querySelector(".transaction-payment-history-page-root");
    if (!root) return;

    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    const chromeW = Math.max(0, window.outerWidth - window.innerWidth);
    const chromeH = Math.max(0, window.outerHeight - window.innerHeight);

    const contentW = Math.ceil(Math.max(root.scrollWidth, root.offsetWidth, POPUP_MIN_WIDTH));
    const contentH = Math.ceil(Math.max(root.scrollHeight, root.offsetHeight, POPUP_MIN_HEIGHT));

    const nextW = Math.min(POPUP_MAX_WIDTH, availW - POPUP_MARGIN, contentW + chromeW);
    const nextH = Math.min(availH - POPUP_MARGIN, contentH + chromeH);

    window.resizeTo(Math.max(POPUP_MIN_WIDTH, nextW), Math.max(POPUP_MIN_HEIGHT, nextH));

    const left = Math.max(0, Math.round((availW - window.outerWidth) / 2));
    const top = Math.max(0, Math.round((availH - window.outerHeight) / 2));
    window.moveTo(left, top);
  } catch {
    /* resizeTo / moveTo may be blocked */
  }
}
