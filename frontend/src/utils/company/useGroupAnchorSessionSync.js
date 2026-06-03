import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [anchorSessionReady, setAnchorSessionReady] = useState(true);

  const needsAnchorSession = useMemo(() => {
    if (!enabled || !isDashboardGroupOnlyMode() || !selectedGroup) return false;
    if (companyId != null && Number(companyId) > 0) return false;
    return true;
  }, [enabled, selectedGroup, companyId]);

  const anchorId = useMemo(() => {
    if (!needsAnchorSession) return null;
    const anchor =
      pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
        preferredCompanyId: sessionCompanyId,
      }) ?? pickGroupAnchorCompany(companies, selectedGroup);
    const id = anchor?.id != null ? Number(anchor.id) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [needsAnchorSession, companies, selectedGroup, sessionCompanyId]);

  useEffect(() => {
    if (!needsAnchorSession) {
      setAnchorSessionReady(true);
      return;
    }
    if (!anchorId) {
      setAnchorSessionReady(false);
      return;
    }

    const g = String(selectedGroup).trim().toUpperCase();
    const prev = ref.current;
    if (prev.group === g && prev.companyId === anchorId) {
      setAnchorSessionReady(true);
      return;
    }

    let cancelled = false;
    setAnchorSessionReady(false);
    (async () => {
      const json = await syncCompanySessionApi(anchorId, g);
      if (cancelled) return;
      if (json?.success) {
        ref.current = { group: g, companyId: anchorId };
        notifyCompanySessionUpdated();
      }
      setAnchorSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsAnchorSession, anchorId, selectedGroup]);

  const resetAnchorSessionRef = useCallback(() => {
    ref.current = { group: null, companyId: null };
    setAnchorSessionReady(false);
  }, []);

  const markAnchorSynced = useCallback((group, id) => {
    const g = group ? String(group).trim().toUpperCase() : null;
    const cid = id != null ? Number(id) : null;
    ref.current = {
      group: g,
      companyId: Number.isFinite(cid) && cid > 0 ? cid : null,
    };
    setAnchorSessionReady(true);
  }, []);

  return {
    resetAnchorSessionRef,
    markAnchorSynced,
    anchorSessionReady: !needsAnchorSession || anchorSessionReady,
  };
}
