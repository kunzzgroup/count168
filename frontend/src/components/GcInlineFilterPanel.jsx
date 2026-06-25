/**
 * Shared Group / Company pill strip. Currency row is omitted — pages manage currency separately.
 * Set showAllOption only on Dashboard (Group/Company "All" aggregate).
 */
export default function GcInlineFilterPanel({
  t,
  groupIds = [],
  groupsAllMode = false,
  selectedGroup = null,
  onPickAllGroups,
  onPickGroup,
  companiesForPicker = [],
  groupAllMode = false,
  pickerCompanyId = null,
  /** When pill list row id differs from session id, match highlight by company code. */
  pickerCompanyCode = null,
  onPickAllInGroup,
  onPickCompany,
  /** Optional hover/focus warm-up (Process List cache prefetch, etc.). */
  onWarmCompany,
  onClearCompanyPill = null,
  allowCompanyDeselect = false,
  switchingCompany = false,
  showGroupRow = true,
  showCompanyRow = true,
  showAllOption = false,
  allLabelKey = "groupFilterAll",
  /** When true, render rows only (parent already provides .user-gc-inline-panel grid). */
  embedded = false,
  children = null,
}) {
  const selectedGroupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  const highlightCode = normalizePickerCompanyCode(pickerCompanyCode);
  const allLabelRaw = typeof t === "function" ? t(allLabelKey) : allLabelKey;
  const allLabel =
    allLabelRaw && allLabelRaw !== allLabelKey ? allLabelRaw : "ALL";

  if (!showGroupRow && !showCompanyRow && !children) return null;
  if (!groupIds.length && !companiesForPicker.length && !children) return null;

  const rows = (
    <>
      {showGroupRow && groupIds.length > 0 && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("groupId")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
              {showAllOption ? (
                <button
                  type="button"
                  className={`user-gc-segment${groupsAllMode ? " is-on" : ""}`}
                  onClick={() => void onPickAllGroups?.()}
                >
                  {allLabel}
                </button>
              ) : null}
              {groupIds.map((gid) => (
                <button
                  key={gid}
                  type="button"
                  className={`user-gc-segment${!groupsAllMode && gid === selectedGroupKey ? " is-on" : ""}`}
                  onClick={() => void onPickGroup?.(gid)}
                >
                  {gid}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showCompanyRow && (groupIds.length > 0 || companiesForPicker.length > 0) && (
        <div className="user-gc-inline-row user-gc-inline-row--company">
          <span className="user-gc-inline-label">{t("company")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
              {showAllOption ? (
                <button
                  type="button"
                  className={`user-gc-segment${groupAllMode ? " is-on" : ""}`}
                  onClick={() => void onPickAllInGroup?.()}
                >
                  {allLabel}
                </button>
              ) : null}
              {companiesForPicker.map((c) => {
                const rowCode = normalizePickerCompanyCode(c.company_id);
                const pickId =
                  pickerCompanyId != null && pickerCompanyId !== ""
                    ? Number(pickerCompanyId)
                    : Number.NaN;
                const activeById = Number.isFinite(pickId) && pickId > 0 && pickId === Number(c.id);
                const activeByCode = highlightCode !== "" && rowCode === highlightCode;
                const active = activeByCode || activeById;
                const pending = switchingCompany && active;
                const label = String(c.company_id || "").toUpperCase();
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`user-gc-segment${active ? " is-on" : ""}${pending ? " is-pending" : ""}`}
                    onMouseEnter={() => onWarmCompany?.(c)}
                    onFocus={() => onWarmCompany?.(c)}
                    onClick={() => {
                      if (active && allowCompanyDeselect && onClearCompanyPill) {
                        onClearCompanyPill(c);
                        return;
                      }
                      void onPickCompany?.(c, active);
                    }}
                  >
                    <span className="user-gc-segment-label">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );

  if (embedded) return rows;

  return <div className="user-gc-inline-panel">{rows}</div>;
}

function normalizePickerCompanyCode(code) {
  return String(code ?? "").trim().toUpperCase();
}
