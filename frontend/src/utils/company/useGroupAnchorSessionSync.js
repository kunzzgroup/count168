import { useCallback, useEffect, useMemo, useRef } from "react";

import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { syncCompanySessionApi } from "./companySessionSync.js";
import { isDashboardGroupOnlyMode, pickDefaultSubsidiaryForGroup, pickGroupAnchorCompany } from "./sharedCompanyFilter.js";

/**
 * Group-only UI keeps company unselected; sync anchor company to PHP session so sidebar
 * flags (e.g. C168 domain access) match AP vs IG without selecting company in the filter.
 */
export function useGroupAnchorSessionSync({
  companies = [],
  selectedGroup,
  companyId,
  sessionCompanyId = null,
  enabled = true,
}) {
  const ref = useRef({ group: null, companyId: null });

  const anchorId = useMemo(() => {
    if (!enabled || !isDashboardGroupOnlyMode() || !selectedGroup) return null;
    if (companyId != null && Number(companyId) > 0) return null;
    const anchor =
      pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
        preferredCompanyId: sessionCompanyId,
      }) ?? pickGroupAnchorCompany(companies, selectedGroup);
    const id = anchor?.id != null ? Number(anchor.id) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [enabled, companies, selectedGroup, companyId]);

  useEffect(() => {
    if (!anchorId) return;
    const g = String(selectedGroup).trim().toUpperCase();
    const prev = ref.current;
    if (prev.group === g && prev.companyId === anchorId) return;
    if (
      sessionCompanyId != null &&
      Number(sessionCompanyId) === anchorId &&
      prev.group === g
    ) {
      ref.current = { group: g, companyId: anchorId };
      return;
    }

    let cancelled = false;
    (async () => {
      const json = await syncCompanySessionApi(anchorId, g);
      if (cancelled || !json?.success) return;
      ref.current = { group: g, companyId: anchorId };
      notifyCompanySessionUpdated();
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorId, selectedGroup, sessionCompanyId]);

  const resetAnchorSessionRef = useCallback(() => {
    ref.current = { group: null, companyId: null };
  }, []);

  const markAnchorSynced = useCallback((group, id) => {
    const g = group ? String(group).trim().toUpperCase() : null;
    const cid = id != null ? Number(id) : null;
    ref.current = {
      group: g,
      companyId: Number.isFinite(cid) && cid > 0 ? cid : null,
    };
  }, []);

  return { resetAnchorSessionRef, markAnchorSynced };
}
