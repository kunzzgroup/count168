import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { syncCompanySessionApi } from "./companySessionSync.js";
import { pickDefaultSubsidiaryForGroup, pickGroupAnchorCompany } from "./sharedCompanyFilter.js";

function isGroupOnlyFilterUi(selectedGroup, companyId) {
  if (!selectedGroup) return false;
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  return !(Number.isFinite(cid) && cid > 0);
}

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

  const needsAnchorSession = useMemo(() => {
    if (!enabled) return false;
    return isGroupOnlyFilterUi(selectedGroup, companyId);
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

  const [anchorSessionReady, setAnchorSessionReady] = useState(
    () => !isGroupOnlyFilterUi(selectedGroup, companyId),
  );

  useEffect(() => {
    if (!needsAnchorSession) {
      setAnchorSessionReady(true);
      return;
    }
    if (!anchorId) {
      // Wait for companies list; do not block search forever once companies are loaded.
      setAnchorSessionReady((companies?.length ?? 0) === 0);
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
  }, [needsAnchorSession, anchorId, selectedGroup, companies]);

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
