import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { usePullToRefresh } from "../../hooks/usePullToRefresh.js";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileAppBar from "./MobileAppBar.jsx";
import MobileNotifications, { fetchMobileAnnouncements } from "./MobileNotifications.jsx";
import MobileSidebar from "./MobileSidebar.jsx";

function PullRefreshIndicator({ pullPx, progress, phase, labels }) {
  const spinning = phase === "refreshing";
  const armed = phase === "armed";
  const visible = phase !== "idle" || pullPx > 1;
  if (!visible) return null;

  const deg = spinning ? 0 : Math.round(progress * 280);
  const label = spinning
    ? labels.loading || "Loading…"
    : armed
      ? labels.releaseToRefresh || "Release to refresh"
      : labels.pullToRefresh || "Pull to refresh";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-visible"
      style={{
        height: 0,
        opacity: Math.min(1, 0.25 + progress * 0.85),
        transition: phase === "idle" ? "opacity 180ms ease" : undefined,
      }}
      aria-hidden={phase === "idle"}
    >
      <div
        className="flex flex-col items-center gap-1.5"
        style={{
          transform: `translate3d(0, ${Math.max(10, pullPx * 0.72)}px, 0)`,
          transition: spinning || phase === "idle" ? "transform 220ms cubic-bezier(.22,1,.36,1)" : undefined,
        }}
      >
        <span
          className={`grid size-9 place-items-center rounded-full bg-white/95 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/90 ${
            spinning ? "animate-[mDashRefresh_0.85s_linear_infinite]" : ""
          }`}
          style={
            spinning
              ? undefined
              : {
                  transform: `rotate(${deg}deg) scale(${0.86 + Math.min(progress, 1) * 0.18})`,
                }
          }
        >
          <i
            className={`fas fa-arrow-down text-[13px] transition-colors ${
              armed || spinning ? "text-[#2f6bf6]" : "text-slate-400"
            }`}
            style={!spinning && armed ? { transform: "rotate(180deg)" } : undefined}
            aria-hidden="true"
          />
        </span>
        <span
          className={`rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tracking-wide shadow-sm ${
            armed || spinning ? "text-[#2f6bf6]" : "text-slate-400"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

/** Hide bottom tab bar while scrolling down; reveal on scroll up (iOS/Android pattern). */
function useScrollAwareNav(scrollRef, { disabled = false } = {}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const acc = useRef(0);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || disabled) {
      setHidden(false);
      return undefined;
    }

    lastY.current = el.scrollTop;
    acc.current = 0;

    const onScroll = () => {
      const y = el.scrollTop;
      const dy = y - lastY.current;
      lastY.current = y;

      if (y <= 16) {
        acc.current = 0;
        setHidden(false);
        return;
      }

      if (dy > 1.5) {
        acc.current = Math.min(100, Math.max(0, acc.current) + dy);
        if (acc.current > 28) setHidden(true);
      } else if (dy < -1.5) {
        acc.current = Math.max(-100, Math.min(0, acc.current) + dy);
        if (acc.current < -14) setHidden(false);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, disabled]);

  // Re-show when overlays claim the screen.
  useEffect(() => {
    if (disabled) setHidden(false);
  }, [disabled]);

  return hidden;
}

export default function MobileShell({
  children,
  overlay = null,
  stickyBar = null,
  i18n,
  me,
  companyCode = "",
  groupId = "",
  onLogout,
  onRefresh,
  refreshing = false,
  showBottomNav = true,
  lang = "en",
  onLangChange,
  onChromeOpen,
  overlayOpen = false,
}) {
  const labels = i18n || {
    navHome: "Home",
    navReport: "Report",
    navTransaction: "Transaction",
    navMore: "More",
  };
  const navItems = mobileNavItems(me);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const mainRef = useRef(null);

  const refreshPage = useCallback(async () => {
    if (typeof onRefresh === "function") {
      await onRefresh();
      return;
    }
    try {
      const rows = await fetchMobileAnnouncements();
      setAnnouncements(rows);
    } catch {
      /* ignore */
    }
  }, [onRefresh]);

  const { pullPx, progress, phase, active } = usePullToRefresh(mainRef, {
    onRefresh: refreshPage,
    enabled: typeof onRefresh === "function",
    refreshing,
  });

  const chromeOpen = sidebarOpen || notifyOpen || overlayOpen || active;
  const navHidden = useScrollAwareNav(mainRef, {
    disabled: !showBottomNav || chromeOpen || refreshing,
  });

  const openSidebar = () => {
    onChromeOpen?.();
    setNotifyOpen(false);
    setSidebarOpen(true);
  };
  const openNotifications = () => {
    onChromeOpen?.();
    setSidebarOpen(false);
    setNotifyOpen(true);
  };

  useEffect(() => {
    if (!overlayOpen) return;
    setSidebarOpen(false);
    setNotifyOpen(false);
  }, [overlayOpen]);

  useEffect(() => {
    if (!me) return undefined;
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await fetchMobileAnnouncements(ac.signal);
        if (!ac.signal.aborted) setAnnouncements(rows);
      } catch {
        if (!ac.signal.aborted) setAnnouncements([]);
      }
    })();
    return () => ac.abort();
  }, [me]);

  useEffect(() => {
    if (!notifyOpen) return undefined;
    setNotifyLoading(true);
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await fetchMobileAnnouncements(ac.signal);
        if (!ac.signal.aborted) setAnnouncements(rows);
      } catch {
        /* keep previous */
      } finally {
        if (!ac.signal.aborted) setNotifyLoading(false);
      }
    })();
    return () => ac.abort();
  }, [notifyOpen]);

  const contentShift = active ? pullPx : 0;
  const navPad = showBottomNav ? "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]" : "pb-5";

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f2f5fb]">
      <MobileAppBar
        i18n={labels}
        notificationCount={announcements.length}
        onOpenSidebar={openSidebar}
        onOpenNotifications={openNotifications}
        onRefresh={typeof onRefresh === "function" ? refreshPage : undefined}
        refreshing={refreshing}
      />

      {stickyBar ? (
        <div className="z-[15] shrink-0 border-b border-slate-200/50 bg-[#f2f5fb]/95 px-3.5 py-2 backdrop-blur-md">
          <div className="mx-auto max-w-lg">{stickyBar}</div>
        </div>
      ) : null}

      <main ref={mainRef} className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain ${navPad}`}>
        <PullRefreshIndicator pullPx={pullPx} progress={progress} phase={phase} labels={labels} />
        <div
          style={{
            transform: contentShift ? `translate3d(0, ${contentShift}px, 0)` : undefined,
            transition:
              active && phase !== "pulling" && phase !== "armed"
                ? "transform 220ms cubic-bezier(.22,1,.36,1)"
                : undefined,
            willChange: active ? "transform" : undefined,
          }}
        >
          {children}
        </div>
      </main>

      {showBottomNav ? (
        <nav
          className={`absolute inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/90 px-2 pt-1.5 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
            navHidden ? "pointer-events-none translate-y-[calc(100%+1px)]" : "translate-y-0"
          }`}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
          aria-label="Main"
          aria-hidden={navHidden}
        >
          <div className="mx-auto flex max-w-lg items-stretch justify-around">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                tabIndex={navHidden ? -1 : undefined}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                    isActive ? "text-[#2f80ed]" : "text-slate-400"
                  }`
                }
              >
                <i className={`fas ${item.icon} text-[18px]`} aria-hidden="true" />
                <span>{labels[item.key]}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}

      {overlay}
      <MobileSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        i18n={labels}
        me={me}
        companyCode={companyCode}
        groupId={groupId}
        onLogout={onLogout}
        lang={lang}
        onLangChange={onLangChange}
      />
      <MobileNotifications
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        i18n={labels}
        items={announcements}
        loading={notifyLoading}
      />
    </div>
  );
}
