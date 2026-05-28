const MIN_THUMB_PX = 28;
const MAX_THUMB_RATIO = 0.42;
const RAIL_INSET_PX = 2;
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

function shouldEnhance(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.dataset.ecFbScroll === "1" || el.classList.contains("ec-fb-scroll-ignore")) return false;
  if (el.classList.contains("ec-fb-scroll-rail") || el.classList.contains("ec-fb-scroll-thumb")) return false;

  const style = getComputedStyle(el);
  const yScroll = isScrollableOverflow(style.overflowY);
  const xScroll = isScrollableOverflow(style.overflowX);
  if (!yScroll && !xScroll) return false;

  const canY = yScroll && el.scrollHeight > el.clientHeight + 1;
  const canX = xScroll && el.scrollWidth > el.clientWidth + 1;
  return canY || canX;
}

function ensurePositioned(el) {
  const pos = getComputedStyle(el).position;
  if (pos === "static") el.classList.add("ec-fb-scroll-root--positioned");
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
  const scrollPos = vertical ? el.scrollTop : el.scrollLeft;
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
    const startScroll = vertical ? el.scrollTop : el.scrollLeft;

    const onMove = (ev) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - startPos;
      if (vertical) el.scrollTop = startScroll + delta * ratio;
      else el.scrollLeft = startScroll + delta * ratio;
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
  rail.className = vertical ? "ec-fb-scroll-rail ec-fb-scroll-rail--y" : "ec-fb-scroll-rail ec-fb-scroll-rail--x";
  rail.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("div");
  thumb.className = "ec-fb-scroll-thumb";
  rail.appendChild(thumb);
  el.appendChild(rail);
  bindDrag(el, thumb, vertical);
  return { rail, thumb };
}

export function attachFacebookScrollbar(el) {
  if (!shouldEnhance(el) || attached.has(el)) return false;

  const style = getComputedStyle(el);
  const vertical = isScrollableOverflow(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
  const horizontal = isScrollableOverflow(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
  if (!vertical && !horizontal) return false;

  el.dataset.ecFbScroll = "1";
  el.classList.add("ec-fb-scroll-root");
  ensurePositioned(el);

  const state = { vertical, horizontal };

  if (vertical) {
    const { rail, thumb } = createRail(el, true);
    state.railY = rail;
    state.thumbY = thumb;
  }
  if (horizontal) {
    const { rail, thumb } = createRail(el, false);
    state.railX = rail;
    state.thumbX = thumb;
  }

  const onScroll = () => {
    markActive(el);
    requestAnimationFrame(() => updateElement(el));
  };

  el.addEventListener("scroll", onScroll, { passive: true });

  const ro = new ResizeObserver(() => {
    requestAnimationFrame(() => updateElement(el));
  });
  ro.observe(el);

  attached.set(el, { ...state, onScroll, ro });
  updateElement(el);
  return true;
}

function collectCandidates(root) {
  const list = [];
  const scrollingEl = document.scrollingElement;
  if (scrollingEl instanceof HTMLElement) list.push(scrollingEl);

  if (root instanceof HTMLElement && root !== scrollingEl && shouldEnhance(root)) {
    list.push(root);
  }

  const nodes = root.querySelectorAll?.("*");
  if (!nodes) return list;

  nodes.forEach((node) => {
    if (node instanceof HTMLElement && shouldEnhance(node)) list.push(node);
  });
  return list;
}

export function scanFacebookScrollbars(root = document.body) {
  const candidates = collectCandidates(root);
  let count = 0;
  candidates.forEach((el) => {
    if (attachFacebookScrollbar(el)) count += 1;
  });
  return count;
}

export function installFacebookScrollbars() {
  if (typeof window === "undefined") return () => {};

  const scheduleScan = debounce(() => {
    scanFacebookScrollbars(document.getElementById("root") || document.body);
  }, 280);

  const boot = () => {
    scheduleScan();
    const root = document.getElementById("root");
    if (root) {
      const mo = new MutationObserver(scheduleScan);
      mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
      window.addEventListener("resize", scheduleScan, { passive: true });
      window.addEventListener("popstate", scheduleScan);
      return () => {
        mo.disconnect();
        window.removeEventListener("resize", scheduleScan);
        window.removeEventListener("popstate", scheduleScan);
      };
    }
    return undefined;
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
