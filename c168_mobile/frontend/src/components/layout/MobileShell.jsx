import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { usePullToRefresh } from "../../hooks/usePullToRefresh.js";
import { useScrollChromeOffset } from "../../hooks/useScrollChromeOffset.js";
import { useScrollIdleVisible } from "../../hooks/useScrollIdleVisible.js";
import { mobileNavItems } from "../../utils/mobilePermissions.js";
import MobileAppBar from "./MobileAppBar.jsx";
import MobileNotifications, { fetchMobileAnnouncements } from "./MobileNotifications.jsx";
import MobileSidebar from "./MobileSidebar.jsx";
import PullRefreshIndicator from "./PullRefreshIndicator.jsx";

export default function MobileShell({
  children,
  overlay = null,
  stickyBar = null,
  floatingAction = null,
  onMainScrollStart,
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
  const topChromeRef = useRef(null);
  const [topChromeH, setTopChromeH] = useState(118);

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

  const { pullPx, progress, phase, active, isAnimating } = usePullToRefresh(mainRef, {
    onRefresh: refreshPage,
    enabled: typeof onRefresh === "function",
    refreshing,
  });

  const floatingIdleVisible = useScrollIdleVisible(mainRef, {
    idleMs: 320,
    onScrollStart: onMainScrollStart,
  });
  const showFloating = Boolean(floatingAction) && floatingIdleVisible && !overlayOpen;

  useLayoutEffect(() => {
    const el = topChromeRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) setTopChromeH(h);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stickyBar, refreshing]);

  const chromeOffsetRaw = useScrollChromeOffset(mainRef, {
    maxOffset: Math.max(topChromeH, 1),
    topReveal: 12,
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

  const forceChrome =
    active || isAnimating || overlayOpen || sidebarOpen || notifyOpen || refreshing;
  const chromeOffset = forceChrome ? 0 : chromeOffsetRaw;
  const chromeProgress = topChromeH > 0 ? Math.min(1, chromeOffset / topChromeH) : 0;
  const navHidden = showBottomNav && chromeProgress > 0.88;
  const contentShift = pullPx > 0.5 ? pullPx : 0;
  const contentTransition = isAnimating && phase !== "pulling" && phase !== "armed";
  const mainPadTop = topChromeH;

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f2f5fb]">
      <div
        ref={topChromeRef}
        className="fixed inset-x-0 top-0 z-30 will-change-transform"
        style={{ transform: `translate3d(0, ${-chromeOffset}px, 0)` }}
        aria-hidden={chromeProgress > 0.95}
      >
        <MobileAppBar
          i18n={labels}
          notificationCount={announcements.length}
          onOpenSidebar={openSidebar}
          onOpenNotifications={openNotifications}
          onRefresh={typeof onRefresh === "function" ? refreshPage : undefined}
          refreshing={refreshing}
        />

        {stickyBar ? (
          <div className="border-b border-slate-200/50 bg-[#f2f5fb] px-3.5 py-2">
            <div className="mx-auto max-w-lg">{stickyBar}</div>
          </div>
        ) : null}
      </div>

      <main
        ref={mainRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingTop: mainPadTop,
          paddingBottom: showBottomNav
            ? "calc(env(safe-area-inset-bottom, 0px) + 88px)"
            : "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <div
          style={{
            transform: contentShift ? `translate3d(0, ${contentShift}px, 0)` : undefined,
            transition: contentTransition ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
          }}
        >
          <PullRefreshIndicator pullPx={pullPx} progress={progress} phase={phase} labels={labels} />
          <div className={refreshing ? "pointer-events-none select-none opacity-[0.92] transition-opacity duration-200" : ""}>
            {children}
          </div>
        </div>
      </main>

      {showBottomNav ? (
        <nav
          className={`absolute inset-x-0 bottom-0 z-20 px-3 will-change-transform ${
            navHidden ? "pointer-events-none" : ""
          }`}
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
            transform: `translate3d(0, ${chromeProgress * 120}%, 0)`,
            opacity: Math.max(0, 1 - chromeProgress * 1.15),
          }}
          aria-label="Main"
          aria-hidden={navHidden}
        >
          <div
            className="mx-auto flex max-w-lg items-stretch gap-0.5 rounded-[1.75rem] border border-white/70 bg-white/55 p-1.5 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-slate-900/[0.06]"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                tabIndex={navHidden ? -1 : undefined}
                className={({ isActive }) =>
                  [
                    "flex min-h-[52px] flex-1 touch-manipulation flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 text-[10px] font-semibold leading-none tracking-wide transition-[background-color,color,transform,box-shadow] duration-200 [-webkit-tap-highlight-color:transparent] active:scale-[0.97]",
                    isActive
                      ? "bg-[#2f6bf6]/14 text-[#2f6bf6] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      : "text-slate-500 active:bg-white/50",
                  ].join(" ")
                }
              >
                <i className={`fas ${item.icon} text-[20px]`} aria-hidden="true" />
                <span className="max-w-full truncate px-0.5">{labels[item.key]}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}

      {floatingAction ? (
        <div
          className={`fixed bottom-0 left-0 z-50 transition-opacity duration-300 ease-out ${
            showFloating ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!showFloating}
        >
          {floatingAction}
        </div>
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
