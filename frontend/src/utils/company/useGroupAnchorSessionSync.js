import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { syncCompanySessionApi } from "./companySessionSync.js";
import {
  notifyDashboardGroupFilterChanged,
  pickDefaultSubsidiaryForGroup,
  pickGroupAnchorCompany,
  resolvePreferredCompanyIdForGroupAnchor,
} from "./sharedCompanyFilter.js";

function isGroupOnlyFilterUi(selectedGroup, companyId) {
  if (!selectedGroup) return false;
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  return !(Number.isFinite(cid) && cid > 0);
}

function parsePositiveCompanyId(companyId) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  return Number.isFinite(cid) && cid > 0 ? cid : null;
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
  notifyOnSync = true,
}) {
  const ref = useRef({ group: null, companyId: null });
  const prevCompanyIdRef = useRef(parsePositiveCompanyId(companyId));

  const needsAnchorSession = useMemo(() => {
    if (!enabled) return false;
    return isGroupOnlyFilterUi(selectedGroup, companyId);
  }, [enabled, selectedGroup, companyId]);

  const anchorId = useMemo(() => {
    if (!needsAnchorSession) return null;
    const preferred = resolvePreferredCompanyIdForGroupAnchor(
      companies,
      selectedGroup,
      sessionCompanyId,
    );
    const anchor =
      pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
        preferredCompanyId: preferred,
      }) ?? pickGroupAnchorCompany(companies, selectedGroup);
    const id = anchor?.id != null ? Number(anchor.id) : Number.NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [needsAnchorSession, companies, selectedGroup, sessionCompanyId]);

  const [anchorSessionReady, setAnchorSessionReady] = useState(
    () => !isGroupOnlyFilterUi(selectedGroup, companyId),
  );

  const applyReadyFromRef = useCallback((group, id) => {
    const g = group ? String(group).trim().toUpperCase() : "";
    const aid = id != null ? Number(id) : Number.NaN;
    if (g && Number.isFinite(aid) && aid > 0 && ref.current.group === g && ref.current.companyId === aid) {
      setAnchorSessionReady(true);
      return true;
    }
    return false;
  }, []);

  // Group tab changed (e.g. IG → AP): force re-sync anchor session for the new group.
  useLayoutEffect(() => {
    const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
    if (ref.current.group && g && ref.current.group !== g) {
      ref.current = { group: null, companyId: null };
      setAnchorSessionReady(false);
    }
  }, [selectedGroup]);

  // Selecting a subsidiary changes PHP session — invalidate cached anchor sync.
  useLayoutEffect(() => {
    const prev = prevCompanyIdRef.current;
    const next = parsePositiveCompanyId(companyId);
    prevCompanyIdRef.current = next;

    if (next != null) {
      ref.current = { group: null, companyId: null };
      return;
    }

    if (prev != null && next == null && selectedGroup) {
      ref.current = { group: null, companyId: null };
      setAnchorSessionReady(false);
    }
  }, [companyId, selectedGroup]);

  useEffect(() => {
    if (!needsAnchorSession) {
      setAnchorSessionReady(true);
      return;
    }
    if (!anchorId) {
      setAnchorSessionReady((companies?.length ?? 0) === 0);
      return;
    }

    const g = String(selectedGroup).trim().toUpperCase();
    if (applyReadyFromRef(g, anchorId)) {
      return;
    }

    let cancelled = false;
    setAnchorSessionReady(false);
    (async () => {
      const json = await syncCompanySessionApi(anchorId, g);
      if (cancelled) {
        applyReadyFromRef(g, anchorId);
        return;
      }
      if (json?.success) {
        ref.current = { group: g, companyId: anchorId };
        const data = json.data ?? {};
        const row = (companies || []).find((c) => Number(c.id) === anchorId);
        notifyDashboardGroupFilterChanged(g, anchorId, {
          ignoreGroupOnly: true,
          companyCode: data.company_code ?? row?.company_id,
          hasGambling: data.has_gambling,
          hasBank: data.has_bank,
        });
        if (notifyOnSync) notifyCompanySessionUpdated(data);
      }
      setAnchorSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsAnchorSession, anchorId, selectedGroup, companies, applyReadyFromRef, notifyOnSync]);

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
