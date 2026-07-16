import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import {
  PERIOD_PRESET_KEYS,
  daysInclusive,
  formatDisplayDate,
  formatYmd,
  parseYmd,
  todayYmd,
} from "../../lib/dashboardDateUtils.js";
import { dashboardLabel } from "../../translateFile/dashboardTranslate.js";

function Pill({ active, disabled, onClick, block, tone = "blue", children }) {
  const activeCls =
    tone === "violet"
      ? "border-transparent bg-violet-600 text-white shadow-[0_6px_14px_-4px_rgba(124,58,237,0.45)]"
      : "border-transparent bg-[#2f6bf6] text-white shadow-[0_6px_14px_-4px_rgba(47,107,246,0.5)]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`tap-scale rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
        block ? "w-full text-center" : "shrink-0"
      } ${active ? activeCls : "border-slate-200 bg-white text-slate-600"} ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, trailing, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function DateRangeRow({ fromLabel, toLabel, dateFrom, dateTo, active, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`tap-scale flex w-full items-stretch gap-2 rounded-2xl border bg-slate-50 p-1.5 text-left transition-colors ${
        active
          ? "border-[#2f6bf6] ring-2 ring-[#2f6bf6]/20"
          : "border-slate-200 active:bg-slate-100"
      }`}
      aria-label={`${fromLabel} ${dateFrom ? formatDisplayDate(dateFrom) : "—"} · ${toLabel} ${dateTo ? formatDisplayDate(dateTo) : "—"}`}
    >
      <span className="grid size-11 shrink-0 place-items-center self-center rounded-xl bg-white text-[#2f6bf6] shadow-sm ring-1 ring-slate-100">
        <i className="far fa-calendar text-[15px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1 py-1 pr-1">
        <span className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{fromLabel}</span>
          <span className="truncate text-[14px] font-bold tabular-nums text-slate-900">
            {dateFrom ? formatDisplayDate(dateFrom) : "—"}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{toLabel}</span>
          <span className="truncate text-[14px] font-bold tabular-nums text-slate-900">
            {dateTo ? formatDisplayDate(dateTo) : "—"}
          </span>
        </span>
      </span>
      <span className="grid shrink-0 place-items-center self-center pr-2 text-slate-300">
        <i className="fas fa-chevron-right text-[11px]" aria-hidden="true" />
      </span>
    </button>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function cmpYmd(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function inRangeYmd(day, from, to) {
  if (!day || !from || !to) return false;
  const lo = cmpYmd(from, to) <= 0 ? from : to;
  const hi = cmpYmd(from, to) <= 0 ? to : from;
  return cmpYmd(day, lo) >= 0 && cmpYmd(day, hi) <= 0;
}

/**
 * Same range picker for From/To — first tap = start, second tap = end (auto-swap if needed).
 */
function DateRangeCalendarSheet({ open, onClose, dateFrom, dateTo, maxYmd, labels, onApply }) {
  const [cursor, setCursor] = useState(() => parseYmd(dateFrom || maxYmd || todayYmd()));
  const [draftFrom, setDraftFrom] = useState(dateFrom || "");
  const [draftTo, setDraftTo] = useState(dateTo || "");
  const [picking, setPicking] = useState("start"); // start | end

  useEffect(() => {
    if (!open) return;
    setDraftFrom(dateFrom || "");
    setDraftTo(dateTo || "");
    setPicking("start");
    setCursor(parseYmd(dateFrom || maxYmd || todayYmd()));
  }, [open, dateFrom, dateTo, maxYmd]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const monthLabel = cursor.toLocaleString("en", { month: "long", year: "numeric" });

  const pickDay = (dayNum) => {
    if (!dayNum) return;
    const ymd = formatYmd(new Date(year, month, dayNum));
    if (maxYmd && cmpYmd(ymd, maxYmd) > 0) return;

    if (picking === "start" || !draftFrom) {
      setDraftFrom(ymd);
      setDraftTo("");
      setPicking("end");
      return;
    }

    let from = draftFrom;
    let to = ymd;
    if (cmpYmd(to, from) < 0) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    setDraftFrom(from);
    setDraftTo(to);
    setPicking("start");
    onApply?.(from, to);
    onClose?.();
  };

  const shiftMonth = (delta) => {
    setCursor(new Date(year, month + delta, 1));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label={labels.close} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.selectDateRange}
        className="relative z-10 max-h-[88dvh] overflow-hidden rounded-t-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-slate-900">{labels.selectDateRange}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">{labels.rangePickHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
            aria-label={labels.close}
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div
              className={`rounded-xl px-3 py-2 ring-1 ${
                picking === "start" ? "bg-sky-50 ring-[#2f6bf6]" : "bg-slate-50 ring-slate-200"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{labels.from}</p>
              <p className="mt-0.5 text-[14px] font-bold tabular-nums text-slate-900">
                {draftFrom ? formatDisplayDate(draftFrom) : "—"}
              </p>
            </div>
            <div
              className={`rounded-xl px-3 py-2 ring-1 ${
                picking === "end" ? "bg-sky-50 ring-[#2f6bf6]" : "bg-slate-50 ring-slate-200"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{labels.toDate}</p>
              <p className="mt-0.5 text-[14px] font-bold tabular-nums text-slate-900">
                {draftTo ? formatDisplayDate(draftTo) : "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="tap-scale grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"
              aria-label="Previous month"
            >
              <i className="fas fa-chevron-left text-[12px]" aria-hidden="true" />
            </button>
            <p className="text-[14px] font-bold text-slate-900">{monthLabel}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="tap-scale grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"
              aria-label="Next month"
            >
              <i className="fas fa-chevron-right text-[12px]" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {w}
              </span>
            ))}
            {cells.map((dayNum, idx) => {
              if (!dayNum) return <span key={`e-${idx}`} />;
              const ymd = formatYmd(new Date(year, month, dayNum));
              const disabled = Boolean(maxYmd && cmpYmd(ymd, maxYmd) > 0);
              const isStart = draftFrom && ymd === draftFrom;
              const isEnd = draftTo && ymd === draftTo;
              const inMid = draftFrom && draftTo && inRangeYmd(ymd, draftFrom, draftTo) && !isStart && !isEnd;
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(dayNum)}
                  className={`tap-scale aspect-square rounded-xl text-[13px] font-semibold tabular-nums transition-colors ${
                    disabled
                      ? "cursor-not-allowed text-slate-300"
                      : isStart || isEnd
                        ? "bg-[#2f6bf6] text-white shadow-sm"
                        : inMid
                          ? "bg-[#2f6bf6]/15 text-[#2f6bf6]"
                          : "text-slate-800 active:bg-slate-100"
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex gap-2 border-t border-slate-100 px-4 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={() => {
              setDraftFrom("");
              setDraftTo("");
              setPicking("start");
            }}
            className="tap-scale flex-1 rounded-2xl bg-slate-100 py-3 text-[13px] font-bold text-slate-600"
          >
            {labels.clear}
          </button>
          <button
            type="button"
            onClick={() => {
              const t = maxYmd || todayYmd();
              setDraftFrom(t);
              setDraftTo(t);
              setPicking("start");
              setCursor(parseYmd(t));
              onApply?.(t, t);
              onClose?.();
            }}
            className="tap-scale flex-1 rounded-2xl bg-slate-100 py-3 text-[13px] font-bold text-slate-600"
          >
            {labels.today}
          </button>
          <button
            type="button"
            disabled={!draftFrom || !draftTo}
            onClick={() => {
              if (!draftFrom || !draftTo) return;
              let from = draftFrom;
              let to = draftTo;
              if (cmpYmd(to, from) < 0) {
                const tmp = from;
                from = to;
                to = tmp;
              }
              onApply?.(from, to);
              onClose?.();
            }}
            className="tap-scale flex-[1.4] rounded-2xl bg-[#2f6bf6] py-3 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {labels.done}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FilterSheet({ open, onClose, dash }) {
  const { i18n } = dash;
  const bodyRef = useRef(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  useOverlayLock(open, onClose);

  useEffect(() => {
    if (!open) {
      setRangeOpen(false);
      return;
    }
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [open]);

  const handleReset = () => {
    dash.resetFilters();
  };

  const applyPresetAndClose = (key) => {
    dash.applyPreset(key);
    onClose?.();
  };

  const switchCompanyAndClose = (id) => {
    void dash.switchCompany(id);
    onClose?.();
  };

  const setCurrencyAndClose = (code) => {
    dash.setCurrency(code);
    onClose?.();
  };

  const pickAllGroupsAndClose = () => {
    dash.pickAllGroups();
    onClose?.();
  };

  const pickAllInGroupAndClose = () => {
    dash.pickAllInGroup();
    onClose?.();
  };

  const maxDay = todayYmd();
  const span = daysInclusive(dash.dateFrom, dash.dateTo);
  const daysLabel = (i18n.daysCount || "{n} days").replace("{n}", String(span));

  return (
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button
        type="button"
        aria-label="Close filter"
        onClick={onClose}
        className="absolute inset-0 size-full border-0 bg-slate-900/30 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.filter}
        className={`absolute inset-x-0 bottom-0 flex max-h-[82%] flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <h2 className="text-[18px] font-semibold text-slate-900">{i18n.filter}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500"
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 space-y-6 overflow-y-auto px-5 pb-4">
          <Section
            title={i18n.dateRange}
            trailing={
              span > 0 ? (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    dash.activePreset
                      ? "bg-slate-100 text-slate-500"
                      : "bg-[#2f6bf6]/12 text-[#2f6bf6]"
                  }`}
                >
                  {dash.activePreset ? daysLabel : `${i18n.customRange} · ${daysLabel}`}
                </span>
              ) : null
            }
          >
            <DateRangeRow
              fromLabel={i18n.from}
              toLabel={i18n.toDate}
              dateFrom={dash.dateFrom}
              dateTo={dash.dateTo}
              active={rangeOpen}
              onOpen={() => setRangeOpen(true)}
            />
          </Section>

          <Section title={i18n.quickSelect}>
            <div className="grid grid-cols-3 gap-2">
              {PERIOD_PRESET_KEYS.map((key) => (
                <Pill
                  key={key}
                  active={dash.activePreset === key}
                  onClick={() => applyPresetAndClose(key)}
                  block
                >
                  {dashboardLabel(i18n, key)}
                </Pill>
              ))}
            </div>
          </Section>

          {dash.groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="flex flex-wrap gap-2">
                <Pill tone="violet" active={dash.groupsAllMode} onClick={pickAllGroupsAndClose}>
                  {i18n.all}
                </Pill>
                {dash.groupIds.map((gid) => (
                  <Pill
                    key={gid}
                    tone="violet"
                    active={dash.selectedGroup === gid && !dash.groupsAllMode}
                    onClick={() => {
                      dash.pickGroup(gid);
                      onClose?.();
                    }}
                  >
                    {gid}
                  </Pill>
                ))}
              </div>
              <p className="text-[11px] font-medium leading-snug text-slate-400">
                {i18n.groupHint || "Group only — or pick All under Company to aggregate"}
              </p>
            </Section>
          )}

          <Section title={i18n.company}>
            <div className="flex flex-wrap gap-2">
              {(dash.companiesForPicker.length > 1 || dash.selectedGroup) && (
                <Pill
                  active={dash.groupAllMode}
                  disabled={!dash.selectedGroup || dash.groupsAllMode}
                  onClick={pickAllInGroupAndClose}
                >
                  {i18n.all}
                </Pill>
              )}
              {dash.companiesForPicker.map((c) => {
                const label = String(c.company_id || c.name || c.id).toUpperCase();
                const active =
                  !dash.groupAllMode &&
                  !dash.groupOnlyMode &&
                  Number(dash.companyId) === Number(c.id);
                return (
                  <Pill key={String(c.id)} active={active} onClick={() => switchCompanyAndClose(c.id)}>
                    {label}
                  </Pill>
                );
              })}
            </div>
          </Section>

          {dash.currencies.length > 0 && (
            <Section title={i18n.currency}>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {dash.currencies.map((code) => (
                  <Pill key={code} active={dash.currency === code} onClick={() => setCurrencyAndClose(code)}>
                    {code}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {Array.isArray(dash.categories) && dash.categories.length > 0 && (
            <Section title={dash.m?.category || i18n.category || "Category"}>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                <Pill
                  active={!dash.selectedCategories?.length}
                  onClick={() => {
                    dash.setSelectedCategories?.([]);
                    onClose?.();
                  }}
                >
                  {dash.m?.selectAllCategories || i18n.all}
                </Pill>
                {dash.categories.map((cat) => {
                  const label = String(cat?.name || cat?.category || cat || "");
                  const value = String(cat?.name || cat?.category || cat || "");
                  if (!value) return null;
                  const active = (dash.selectedCategories || []).includes(value);
                  return (
                    <Pill
                      key={value}
                      active={active}
                      onClick={() => {
                        dash.toggleCategory?.(value);
                        onClose?.();
                      }}
                    >
                      {label}
                    </Pill>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        <div
          className="flex gap-3 border-t border-slate-100 px-5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          <button
            type="button"
            onClick={handleReset}
            className="tap-scale flex-1 rounded-2xl bg-slate-100 py-3.5 text-[14px] font-semibold text-slate-600"
          >
            {i18n.reset}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale flex-[2] rounded-2xl bg-[#2f6bf6] py-3.5 text-[14px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(47,107,246,0.6)]"
          >
            {i18n.applyFilter}
          </button>
        </div>
      </div>

      <DateRangeCalendarSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        dateFrom={dash.dateFrom}
        dateTo={dash.dateTo}
        maxYmd={maxDay}
        labels={{
          selectDateRange: i18n.selectDateRange,
          rangePickHint: i18n.rangePickHint,
          from: i18n.from,
          toDate: i18n.toDate,
          today: i18n.today,
          clear: i18n.clear,
          done: i18n.done,
          close: i18n.closeMenu || "Close",
        }}
        onApply={(from, to) => dash.setCustomDateRange(from, to)}
      />
    </div>
  );
}
