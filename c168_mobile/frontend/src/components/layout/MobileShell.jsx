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

  const deg = spinning ? 0 : Math.round(progress * 270);
  const label = spinning
    ? labels.loading || "Loading…"
    : armed
      ? labels.releaseToRefresh || "Release to refresh"
      : labels.pullToRefresh || "Pull to refresh";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{
        height: Math.max(pullPx, spinning ? 52 : 0),
        opacity: Math.min(1, 0.35 + progress * 0.75),
        transition: spinning || phase === "idle" ? "height 220ms ease, opacity 180ms ease" : undefined,
      }}
      aria-hidden={phase === "idle"}
    >
      <div className="flex flex-col items-center justify-end gap-1.5 pb-1.5">
        <span
          className={`grid size-8 place-items-center rounded-full bg-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80 ${
            spinning ? "animate-[mDashRefresh_0.9s_linear_infinite]" : ""
          }`}
          style={
            spinning
              ? undefined
              : {
                  transform: `rotate(${deg}deg)`,
                  transition: "transform 40ms linear",
                }
          }
        >
          <i
            className={`fas fa-arrow-down text-[13px] ${armed || spinning ? "text-[#2f6bf6]" : "text-slate-400"}`}
            style={!spinning && armed ? { transform: "rotate(180deg)" } : undefined}
            aria-hidden="true"
          />
        </span>
        <span
          className={`text-[11px] font-semibold tracking-wide ${
            armed || spinning ? "text-[#2f6bf6]" : "text-slate-400"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
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

      <main ref={mainRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
        <PullRefreshIndicator pullPx={pullPx} progress={progress} phase={phase} labels={labels} />
        <div
          style={{
            transform: contentShift ? `translate3d(0, ${contentShift}px, 0)` : undefined,
            transition: active && phase !== "pulling" && phase !== "armed" ? "transform 220ms ease" : undefined,
            willChange: active ? "transform" : undefined,
          }}
        >
          {children}
        </div>
      </main>

      {showBottomNav ? (
        <nav
          className="relative z-10 shrink-0 border-t border-slate-200/70 bg-white/85 px-2 pt-1.5 backdrop-blur-xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
          aria-label="Main"
        >
          <div className="mx-auto flex max-w-lg items-stretch justify-around">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
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
