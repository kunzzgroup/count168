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
  const activeMod =
    tone === "violet" ? "m-filter-pill--active-violet" : "m-filter-pill--active-blue";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`m-filter-pill tap-scale${block ? " m-filter-pill--block" : " m-filter-pill--inline"}${
        active ? ` ${activeMod}` : ""
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, trailing, children }) {
  return (
    <div className="m-filter-section">
      <div className="m-filter-section-head">
        <p className="m-filter-section-title">{title}</p>
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
      className={`m-filter-range-row tap-scale${active ? " m-filter-range-row--active" : ""}`}
      aria-label={`${fromLabel} ${dateFrom ? formatDisplayDate(dateFrom) : "—"} · ${toLabel} ${dateTo ? formatDisplayDate(dateTo) : "—"}`}
    >
      <span className="m-filter-range-icon">
        <i className="far fa-calendar" aria-hidden="true" />
      </span>
      <span className="m-filter-range-fields">
        <span className="m-filter-range-field">
          <span className="m-filter-range-label">{fromLabel}</span>
          <span className="m-filter-range-value">{dateFrom ? formatDisplayDate(dateFrom) : "—"}</span>
        </span>
        <span className="m-filter-range-field">
          <span className="m-filter-range-label">{toLabel}</span>
          <span className="m-filter-range-value">{dateTo ? formatDisplayDate(dateTo) : "—"}</span>
        </span>
      </span>
      <span className="m-filter-range-chevron">
        <i className="fas fa-chevron-right" aria-hidden="true" />
      </span>
    </button>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
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

function DateRangeCalendarSheet({ open, onClose, dateFrom, dateTo, maxYmd, labels, onApply }) {
  const [cursor, setCursor] = useState(() => parseYmd(dateFrom || maxYmd || todayYmd()));
  const [draftFrom, setDraftFrom] = useState(dateFrom || "");
  const [draftTo, setDraftTo] = useState(dateTo || "");
  const [picking, setPicking] = useState("start");

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
    <div className="m-sheet-host-flex">
      <button type="button" className="m-sheet-backdrop m-sheet-backdrop--light" aria-label={labels.close} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.selectDateRange}
        className="m-sheet-panel m-sheet-panel--calendar"
      >
        <div className="m-filter-cal-header">
          <div className="min-w-0">
            <p className="m-filter-cal-title">{labels.selectDateRange}</p>
            <p className="m-filter-cal-hint">{labels.rangePickHint}</p>
          </div>
          <button type="button" onClick={onClose} className="m-sheet-close m-sheet-close--square tap-scale" aria-label={labels.close}>
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="m-filter-cal-body">
          <div className="m-filter-cal-draft-grid">
            <div className={`m-filter-cal-draft${picking === "start" ? " m-filter-cal-draft--active" : ""}`}>
              <p className="m-filter-cal-draft-label">{labels.from}</p>
              <p className="m-filter-cal-draft-value">{draftFrom ? formatDisplayDate(draftFrom) : "—"}</p>
            </div>
            <div className={`m-filter-cal-draft${picking === "end" ? " m-filter-cal-draft--active" : ""}`}>
              <p className="m-filter-cal-draft-label">{labels.toDate}</p>
              <p className="m-filter-cal-draft-value">{draftTo ? formatDisplayDate(draftTo) : "—"}</p>
            </div>
          </div>

          <div className="m-filter-cal-nav">
            <button type="button" onClick={() => shiftMonth(-1)} className="m-filter-cal-nav-btn tap-scale" aria-label="Previous month">
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <p className="m-filter-cal-month">{monthLabel}</p>
            <button type="button" onClick={() => shiftMonth(1)} className="m-filter-cal-nav-btn tap-scale" aria-label="Next month">
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <div className="m-filter-cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="m-filter-cal-weekday">
                {w}
              </span>
            ))}
          </div>
          <div className="m-filter-cal-grid">
            {cells.map((dayNum, idx) => {
              if (!dayNum) return <span key={`e-${idx}`} />;
              const ymd = formatYmd(new Date(year, month, dayNum));
              const disabled = Boolean(maxYmd && cmpYmd(ymd, maxYmd) > 0);
              const isStart = draftFrom && ymd === draftFrom;
              const isEnd = draftTo && ymd === draftTo;
              const inMid = draftFrom && draftTo && inRangeYmd(ymd, draftFrom, draftTo) && !isStart && !isEnd;
              let dayMod = "";
              if (disabled) dayMod = " m-filter-cal-day--disabled";
              else if (isStart || isEnd) dayMod = " m-filter-cal-day--edge";
              else if (inMid) dayMod = " m-filter-cal-day--mid";
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(dayNum)}
                  className={`m-filter-cal-day tap-scale${dayMod}`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>

        <div className="m-filter-cal-footer">
          <button
            type="button"
            onClick={() => {
              setDraftFrom("");
              setDraftTo("");
              setPicking("start");
            }}
            className="m-filter-cal-footer-btn tap-scale"
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
            className="m-filter-cal-footer-btn tap-scale"
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
            className="m-filter-cal-footer-btn m-filter-cal-footer-btn--primary tap-scale"
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
      className={`m-sheet-overlay${open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"}`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button type="button" aria-label="Close filter" onClick={onClose} className="m-sheet-backdrop" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.filter}
        className={`m-sheet-panel${open ? " m-sheet-panel--open" : " m-sheet-panel--closed"}`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>

        <div className="m-sheet-header">
          <h2 className="m-sheet-title">{i18n.filter}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="m-sheet-close tap-scale">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="m-sheet-body m-sheet-body--spaced">
          <Section
            title={i18n.dateRange}
            trailing={
              span > 0 ? (
                <span
                  className={`m-filter-span-badge${
                    dash.activePreset ? " m-filter-span-badge--preset" : " m-filter-span-badge--custom"
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
            <div className="m-filter-pill-grid">
              {PERIOD_PRESET_KEYS.map((key) => (
                <Pill key={key} active={dash.activePreset === key} onClick={() => applyPresetAndClose(key)} block>
                  {dashboardLabel(i18n, key)}
                </Pill>
              ))}
            </div>
          </Section>

          {dash.groupIds.length > 0 && (
            <Section title={i18n.groupId}>
              <div className="m-filter-pill-wrap">
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
              <p className="m-filter-hint">{i18n.groupHint || "Group only — or pick All under Company to aggregate"}</p>
            </Section>
          )}

          <Section title={i18n.company}>
            <div className="m-filter-pill-wrap">
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
                  !dash.groupAllMode && !dash.groupOnlyMode && Number(dash.companyId) === Number(c.id);
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
              <div className="m-filter-pill-scroll">
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
              <div className="m-filter-pill-scroll">
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

        <div className="m-sheet-footer">
          <button type="button" onClick={handleReset} className="m-sheet-footer-btn m-sheet-footer-btn--muted tap-scale">
            {i18n.reset}
          </button>
          <button type="button" onClick={onClose} className="m-sheet-footer-btn m-sheet-footer-btn--primary tap-scale">
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
