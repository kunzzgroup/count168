import { useMemo } from "react";
import { parseAnnouncementCard } from "./parseAnnouncementCard.js";
import { toSafeRenderHtml } from "../../utils/content/richTextSanitizer.js";

function faviconUrl() {
  try {
    return new URL("/favicon.ico", window.location.origin).href;
  } catch {
    return "/favicon.ico";
  }
}

function padIndex(index) {
  return String(index + 1).padStart(2, "0");
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M12 3a5 5 0 0 0-5 5v2.2c0 .7-.2 1.4-.6 2L5.2 14a1.2 1.2 0 0 0 1 1.9h11.6a1.2 1.2 0 0 0 1-1.9l-1.2-1.8c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ThumbsUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M14 4.5 15.5 9H20a1.5 1.5 0 0 1 1.45 1.89l-1.6 7A1.5 1.5 0 0 1 18.4 19H10V9.7L12.2 4.9A1.4 1.4 0 0 1 14 4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 9H7.5A1.5 1.5 0 0 0 6 10.5v7A1.5 1.5 0 0 0 7.5 19H10" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3.5">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4.5l3 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RichTextBody({ html, className = "" }) {
  if (!html) return null;
  return (
    <div
      className={`rich-text-renderer text-[13px] font-medium leading-relaxed text-slate-600 [&_a]:text-[#2f6bf6] [&_a]:underline [&_h3]:text-[14px] [&_h3]:font-bold [&_h3]:text-slate-800 [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ol]:pl-4 [&_p+p]:mt-1.5 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-4 ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Structured announcement card. Falls back to classic title/html/time when parse fails.
 */
export default function AnnouncementUpdateCard({
  announcement,
  labels = {},
  className = "",
  onClick,
  collapsed = false,
}) {
  const parsed = useMemo(() => {
    if (announcement?.isExpirationReminder) return null;
    return parseAnnouncementCard(announcement);
  }, [announcement]);

  if (!parsed) {
    const safeHtml = toSafeRenderHtml(announcement?.content);
    return (
      <div className={className} onClick={onClick} role={onClick ? "button" : undefined}>
        <p className="truncate text-[14px] font-bold text-slate-900">{announcement?.title}</p>
        {collapsed ? (
          <p className="mt-1 line-clamp-2 text-[12px] font-medium text-slate-500">
            {(announcement?.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
          </p>
        ) : (
          <RichTextBody html={safeHtml} className="mt-2" />
        )}
        {announcement?.created_at ? (
          <p className="mt-2 text-[11px] font-medium text-slate-400">{announcement.created_at}</p>
        ) : null}
      </div>
    );
  }

  const subtitle =
    parsed.subtitle ||
    (parsed.version && labels.versionUpdated
      ? String(labels.versionUpdated).replace("{version}", parsed.version)
      : "");

  if (collapsed) {
    const preview = parsed.items[0] || subtitle || parsed.title;
    return (
      <div className={className} onClick={onClick} role={onClick ? "button" : undefined}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2f6bf6]">
            <BellIcon />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] font-bold text-slate-900">{parsed.title}</p>
              {parsed.version ? (
                <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#2f6bf6]">
                  {parsed.version}
                </span>
              ) : null}
            </div>
            {announcement?.created_at ? (
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">{announcement.created_at}</p>
            ) : null}
            <p className="mt-1 line-clamp-2 text-[12px] font-medium text-slate-500">{preview}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} space-y-3`.trim()} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2f6bf6]">
          <BellIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-bold text-slate-900">{parsed.title}</h3>
            {parsed.version ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#2f6bf6]">
                {parsed.version}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-[12px] font-medium text-slate-500">{subtitle}</p> : null}
        </div>
      </div>

      <div className="rounded-xl bg-slate-100/80 px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {parsed.sectionLabel || labels.updateIncludes || "Update includes"}
        </p>
      </div>

      <ol className="space-y-2">
        {parsed.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-[11px] font-bold text-slate-400">{padIndex(index)}</span>
            <span className="text-[13px] font-medium leading-relaxed text-slate-700">{item}</span>
          </li>
        ))}
      </ol>

      {parsed.intro.length > 0
        ? parsed.intro.map((line) => (
            <p key={line} className="text-[12px] font-medium text-slate-500">
              {line}
            </p>
          ))
        : null}

      {parsed.thankYou ? (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            <ThumbsUpIcon />
          </span>
          <p className="text-[12px] font-medium leading-relaxed">{parsed.thankYou}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
          <img className="size-[18px] rounded-sm" src={faviconUrl()} alt="" width={18} height={18} />
          <span>{labels.teamName || "EAZY COUNT Team"}</span>
        </div>
        {announcement?.created_at ? (
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <ClockIcon />
            <span>{announcement.created_at}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
