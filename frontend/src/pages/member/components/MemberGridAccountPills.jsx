import { useMemo } from "react";
import {
  applyWlGridAccountAll,
  applyWlGridAccountToggle,
  buildWinLossPillBands,
  getWlGridIncludedAccountIds,
  isWlGridAllSelected,
} from "../memberPageHelpers.js";

export default function MemberGridAccountPills({
  linkedAccounts,
  selectedIds,
  onApply,
  onNotify,
  maxPerBand,
  t,
}) {
  const accounts = Array.isArray(linkedAccounts) ? linkedAccounts : [];
  const perBand = Math.max(1, Number(maxPerBand) || 7);
  const showAllBtn = accounts.length > 1;

  const allSelected = isWlGridAllSelected(accounts, selectedIds);
  const included = new Set(getWlGridIncludedAccountIds(accounts, selectedIds));

  const bands = useMemo(() => {
    const cells = [];
    if (showAllBtn) cells.push({ type: "all" });
    accounts.forEach((acc) => cells.push({ type: "account", acc }));
    return buildWinLossPillBands(cells, perBand);
  }, [accounts, perBand, showAllBtn]);

  if (!accounts.length) return null;

  const handleAll = () => {
    if (allSelected) return;
    onApply(applyWlGridAccountAll(accounts));
  };

  const handleToggle = (accountId) => {
    const next = applyWlGridAccountToggle(accounts, selectedIds, accountId);
    if (!next.length) {
      onNotify(t("selectAtLeastOneAccount"), "warning");
      return;
    }
    onApply(next);
  };

  return (
    <div className="user-gc-inline-row" id="member_grid_account_filter">
      <span className="user-gc-inline-label">{t("gridAccountSelect")}</span>
      <div
        className="user-gc-inline-pills member-winloss-account-pills"
        id="member_grid_account_buttons"
        role="group"
        aria-label={t("linkedFilterTitle")}
      >
        {bands.map((band, segIdx) => (
          <div
            key={`member-grid-acc-band-${segIdx}`}
            className="user-gc-segment-group member-winloss-account-segments"
            style={{
              width: `${(band.length / perBand) * 100}%`,
              maxWidth: "100%",
              gridTemplateColumns: `repeat(${band.length}, minmax(max-content, 1fr))`,
            }}
          >
            {band.map((cell) => {
              if (cell.type === "all") {
                return (
                  <button
                    key="member-grid-acc-all"
                    type="button"
                    className={`user-gc-segment${allSelected ? " is-on" : ""}`}
                    onClick={handleAll}
                  >
                    {t("all")}
                  </button>
                );
              }
              const acc = cell.acc;
              const id = Number(acc.id);
              const label = String(acc.account_id || acc.name || acc.id);
              const isOn = showAllBtn ? !allSelected && included.has(id) : true;
              return (
                <button
                  key={acc.id}
                  type="button"
                  className={`user-gc-segment${isOn ? " is-on" : ""}`}
                  onClick={() => handleToggle(id)}
                >
                  <span className="member-winloss-account-pill-label">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
