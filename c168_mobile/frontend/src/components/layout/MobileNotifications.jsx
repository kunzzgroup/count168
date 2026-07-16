import { useEffect, useState } from "react";
import AnnouncementUpdateCard from "../announcements/AnnouncementUpdateCard.jsx";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { fetchJson } from "../../lib/fetchJson.js";

export async function fetchMobileAnnouncements(signal) {
  const { res, json } = await fetchJson(
    buildApiUrl("api/announcements/announcement_get_dashboard_api.php"),
    { signal },
  );
  if (!res.ok || !json?.success) return [];
  return Array.isArray(json.data) ? json.data : [];
}

export default function MobileNotifications({ open, onClose, i18n, items = [], loading }) {
  const [active, setActive] = useState(null);
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  const panelTitle = i18n?.announcements || i18n?.notifications || "Announcements";
  const emptyText = i18n?.noAnnouncements || i18n?.noNotifications || "No announcements";
  const cardLabels = {
    updateIncludes: i18n?.updateIncludes,
    versionUpdated: i18n?.versionUpdated,
    teamName: i18n?.announcementTeam,
  };

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button
        type="button"
        aria-label={i18n?.dismissMenu || "Dismiss announcements"}
        onClick={onClose}
        className="absolute inset-0 size-full border-0 bg-slate-900/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={panelTitle}
        className={`absolute inset-x-0 bottom-0 flex max-h-[78%] flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-2 pt-2">
          <h2 className="text-[18px] font-bold text-slate-900">{panelTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500"
            aria-label={i18n?.closeMenu || "Close"}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div
          className="flex-1 space-y-2 overflow-y-auto px-4 pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          {loading ? (
            <p className="py-10 text-center text-[13px] font-semibold text-slate-400">
              {i18n?.loadingAnnouncements || i18n?.loading}
            </p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-[13px] font-semibold text-slate-400">{emptyText}</p>
          ) : (
            items.map((item) => {
              const isOpen = Number(active) === Number(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(isOpen ? null : item.id)}
                  className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left ring-1 ring-slate-100"
                >
                  <AnnouncementUpdateCard
                    announcement={item}
                    labels={cardLabels}
                    collapsed={!isOpen}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
