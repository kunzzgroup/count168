const MIN_THUMB_PX = 28;
const MAX_THUMB_RATIO = 0.42;
const IDLE_MS = 900;

const attached = new WeakMap();

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function isScrollableOverflow(value) {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function isPageScroller(el) {
  return (
    el === document.body ||
    el === document.documentElement ||
    el === document.scrollingElement
  );
}

function canScrollY(el) {
  return el.scrollHeight > el.clientHeight + 1;
}

function canScrollX(el) {
  return el.scrollWidth > el.clientWidth + 1;
}

function resolveScrollAxes(el) {
  const style = getComputedStyle(el);

  if (isPageScroller(el)) {
    return {
      vertical: canScrollY(el),
      horizontal: canScrollX(el),
    };
  }

  const yScroll = isScrollableOverflow(style.overflowY);
  const xScroll = isScrollableOverflow(style.overflowX);
  return {
    vertical: yScroll && canScrollY(el),
    horizontal: xScroll && canScrollX(el),
  };
}

function shouldEnhance(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.dataset.ecFbScroll === "1" || el.classList.contains("ec-fb-scroll-ignore")) return false;
  if (el.classList.contains("ec-fb-scroll-rail") || el.classList.contains("ec-fb-scroll-thumb")) {
    return false;
  }

  const axes = resolveScrollAxes(el);
  return axes.vertical || axes.horizontal;
}

/** Main viewport scroller (body on transaction-page, or documentElement). */
function resolvePageScroller() {
  const { body } = document;
  if (body) {
    const bodyStyle = getComputedStyle(body);
    if (isScrollableOverflow(bodyStyle.overflowY) && canScrollY(body)) return body;
  }

  const se = document.scrollingElement;
  if (se instanceof HTMLElement && canScrollY(se)) return se;

  const { documentElement } = document;
  if (canScrollY(documentElement)) return documentElement;

  return null;
}

function ensurePositioned(el) {
  if (getComputedStyle(el).position === "static") {
    el.classList.add("ec-fb-scroll-root--positioned");
  }
}

function updateAxis(el, rail, thumb, vertical) {
  const maxScroll = vertical
    ? el.scrollHeight - el.clientHeight
    : el.scrollWidth - el.clientWidth;

  if (maxScroll <= 0) {
    rail.hidden = true;
    return;
  }
  rail.hidden = false;

  const track = vertical ? el.clientHeight : el.clientWidth;
  const scrollPos = getScrollPos(el, vertical);
  const total = vertical ? el.scrollHeight : el.scrollWidth;

  const remaining = Math.max(0, total - scrollPos - track);
  let thumbSize = (remaining / total) * track;
  thumbSize = Math.max(MIN_THUMB_PX, Math.min(track * MAX_THUMB_RATIO, thumbSize));

  const travel = Math.max(0, track - thumbSize);
  const offset = maxScroll > 0 ? (scrollPos / maxScroll) * travel : 0;

  thumb.style.height = vertical ? `${thumbSize}px` : "100%";
  thumb.style.width = vertical ? "100%" : `${thumbSize}px`;
  thumb.style.transform = vertical
    ? `translateY(${offset}px)`
    : `translateX(${offset}px)`;
}

function getScrollPos(el, vertical) {
  if (!vertical) return el.scrollLeft;
  if (isPageScroller(el)) {
    return window.scrollY || document.documentElement.scrollTop || el.scrollTop || 0;
  }
  return el.scrollTop;
}

function setScrollPos(el, vertical, value) {
  if (!vertical) {
    el.scrollLeft = value;
    return;
  }
  if (isPageScroller(el)) {
    window.scrollTo(window.scrollX, value);
    return;
  }
  el.scrollTop = value;
}

function updateElement(el) {
  const state = attached.get(el);
  if (!state) return;
  if (state.vertical) updateAxis(el, state.railY, state.thumbY, true);
  if (state.horizontal) updateAxis(el, state.railX, state.thumbX, false);
}

function markActive(el) {
  el.classList.add("ec-fb-scroll--active");
  clearTimeout(el._ecFbScrollIdle);
  el._ecFbScrollIdle = window.setTimeout(() => {
    el.classList.remove("ec-fb-scroll--active");
  }, IDLE_MS);
}

function bindDrag(el, thumb, vertical) {
  thumb.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const maxScroll = vertical
      ? el.scrollHeight - el.clientHeight
      : el.scrollWidth - el.clientWidth;
    const track = vertical ? el.clientHeight : el.clientWidth;
    const thumbSize = vertical ? thumb.offsetHeight : thumb.offsetWidth;
    const travel = Math.max(1, track - thumbSize);
    const ratio = maxScroll / travel;

    const startPos = vertical ? e.clientY : e.clientX;
    const startScroll = getScrollPos(el, vertical);

    const onMove = (ev) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      setScrollPos(el, vertical, startScroll + delta * ratio);
      markActive(el);
      updateElement(el);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    markActive(el);
  });
}

function createRail(el, vertical) {
  const rail = document.createElement("div");
  rail.className = vertical
    ? "ec-fb-scroll-rail ec-fb-scroll-rail--y"
    : "ec-fb-scroll-rail ec-fb-scroll-rail--x";
  rail.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("div");
  thumb.className = "ec-fb-scroll-thumb";
  rail.appendChild(thumb);
  el.appendChild(rail);
  bindDrag(el, thumb, vertical);
  return { rail, thumb };
}

export function attachFacebookScrollbar(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.dataset.ecFbScroll === "1" || attached.has(el)) return false;

  const axes = resolveScrollAxes(el);
  if (!axes.vertical && !axes.horizontal) return false;

  el.dataset.ecFbScroll = "1";
  el.classList.add("ec-fb-scroll-root");
  if (isPageScroller(el)) {
    el.classList.add("ec-fb-page-scroll");
    document.documentElement.classList.add("ec-fb-scroll-enabled");
  }
  ensurePositioned(el);

  const state = {
    vertical: axes.vertical,
    horizontal: axes.horizontal,
    isPage: isPageScroller(el),
  };

  if (axes.vertical) {
    const { rail, thumb } = createRail(el, true);
    state.railY = rail;
    state.thumbY = thumb;
  }
  if (axes.horizontal) {
    const { rail, thumb } = createRail(el, false);
    state.railX = rail;
    state.thumbX = thumb;
  }

  const onScroll = () => {
    markActive(el);
    requestAnimationFrame(() => updateElement(el));
  };

  el.addEventListener("scroll", onScroll, { passive: true });
  if (state.isPage) {
    window.addEventListener("scroll", onScroll, { passive: true });
    state.onWindowScroll = onScroll;
  }

  const ro = new ResizeObserver(() => {
    requestAnimationFrame(() => updateElement(el));
  });
  ro.observe(el);
  if (state.isPage) {
    ro.observe(document.body);
    ro.observe(document.documentElement);
  }

  attached.set(el, { ...state, onScroll, ro });
  updateElement(el);
  return true;
}

function collectCandidates(appRoot) {
  const seen = new Set();
  const list = [];

  const add = (el) => {
    if (!(el instanceof HTMLElement) || seen.has(el)) return;
    seen.add(el);
    if (shouldEnhance(el)) list.push(el);
  };

  const page = resolvePageScroller();
  if (page) add(page);

  if (appRoot instanceof HTMLElement) {
    add(appRoot);
    appRoot.querySelectorAll("*").forEach(add);
  }

  return list;
}

export function scanFacebookScrollbars(appRoot = document.getElementById("root") || document.body) {
  const candidates = collectCandidates(appRoot);
  let count = 0;
  candidates.forEach((el) => {
    if (attachFacebookScrollbar(el)) count += 1;
  });
  return count;
}

export function installFacebookScrollbars() {
  if (typeof window === "undefined") return () => {};

  document.documentElement.classList.add("ec-fb-scroll-enabled");

  const scheduleScan = debounce(() => {
    scanFacebookScrollbars(document.getElementById("root") || document.body);
  }, 200);

  const boot = () => {
    scheduleScan();
    [400, 1000, 2000, 4000].forEach((ms) => {
      window.setTimeout(scheduleScan, ms);
    });

    const root = document.getElementById("root");
    const observers = [];

    if (root) {
      const mo = new MutationObserver(scheduleScan);
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      observers.push(() => mo.disconnect());
    }

    const bodyMo = new MutationObserver(scheduleScan);
    bodyMo.observe(document.body, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observers.push(() => bodyMo.disconnect());

    window.addEventListener("resize", scheduleScan, { passive: true });
    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("load", scheduleScan);

    return () => {
      observers.forEach((off) => off());
      window.removeEventListener("resize", scheduleScan);
      window.removeEventListener("popstate", scheduleScan);
      window.removeEventListener("load", scheduleScan);
    };
  };

  let teardown;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      teardown = boot();
    }, { once: true });
  } else {
    teardown = boot();
  }

  return () => teardown?.();
}
