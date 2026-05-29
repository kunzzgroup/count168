/**
 * Shared Group / Company pill strip (Dashboard-style All + per-group segments).
 * Currency row is intentionally omitted — pages manage currency separately.
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
  onPickAllInGroup,
  onPickCompany,
  switchingCompany = false,
  showGroupRow = true,
  showCompanyRow = true,
  allLabelKey = "groupFilterAll",
  children = null,
}) {
  const selectedGroupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  const allLabel = typeof t === "function" ? t(allLabelKey) : allLabelKey;

  if (!showGroupRow && !showCompanyRow && !children) return null;
  if (!groupIds.length && !companiesForPicker.length && !children) return null;

  return (
    <div className="user-gc-inline-panel">
      {showGroupRow && groupIds.length > 0 && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("groupId")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
              <button
                type="button"
                className={`user-gc-segment${groupsAllMode ? " is-on" : ""}`}
                onClick={() => void onPickAllGroups?.()}
              >
                {allLabel}
              </button>
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
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("company")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
              <button
                type="button"
                className={`user-gc-segment${groupAllMode ? " is-on" : ""}`}
                onClick={() => void onPickAllInGroup?.()}
              >
                {allLabel}
              </button>
              {companiesForPicker.map((c) => {
                const active = !groupAllMode && Number(pickerCompanyId) === Number(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`user-gc-segment${active ? " is-on" : ""}`}
                    onClick={() => {
                      if (switchingCompany) return;
                      void onPickCompany?.(c);
                    }}
                  >
                    {String(c.company_id || "").toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
