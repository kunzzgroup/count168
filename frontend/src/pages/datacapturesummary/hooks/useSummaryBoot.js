import { useEffect, useLayoutEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DATA_CAPTURE_HOME_PATH,
  resolveCompanyGamesAccess,
} from "../../datacapture/lib/dataCaptureCompanyAccess.js";
import {
  dataCaptureScopeIsReady,
  resolveDataCaptureScopeFromSessionMeta,
} from "../../datacapture/lib/dataCaptureScope.js";
import { loadActiveCaptureSession } from "../../datacapture/lib/dataCaptureStorage.js";
import { consumeSummaryFreshNavigation } from "../lib/summaryStorage.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { usePartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";

/**
 * Session boot for Summary SPA — reuses AuthenticatedLayout session (no duplicate API).
 */
export function useSummaryBoot() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();

  const mutationsBlocked = usePartnershipAuditReadOnlyLocked(me);

  const captureScope = useMemo(() => {
    const session = loadActiveCaptureSession();
    const processData = session?.processData ?? null;
    const groupOnly = processData?.groupOnlyCapture === true;
    const fromSession = resolveDataCaptureScopeFromSessionMeta(processData);
    if (fromSession) {
      if (Number(fromSession.scopeCompanyId) > 0) return fromSession;
      if (groupOnly && fromSession.mode === "group" && fromSession.groupId) {
        return fromSession;
      }
    }
    if (groupOnly) {
      return fromSession;
    }
    const sessionCompanyId =
      me?.company_id != null && Number.isFinite(Number(me.company_id)) ? Number(me.company_id) : null;
    if (sessionCompanyId) {
      return {
        mode: "company",
        scopeCompanyId: sessionCompanyId,
        uiCompanyId: sessionCompanyId,
        groupId: null,
        viewGroup: null,
      };
    }
    return fromSession;
  }, [me?.company_id, sessionReady]);

  const companyId =
    captureScope?.scopeCompanyId != null && Number(captureScope.scopeCompanyId) > 0
      ? Number(captureScope.scopeCompanyId)
      : null;

  useEffect(() => {
    if (!sessionReady || !me) return;

    const freshNav =
      consumeSummaryFreshNavigation() ||
      window.isNavigatingAwayByBackOrSubmit ||
      new URLSearchParams(window.location.search).get("success") === "1";

    if (freshNav) {
      window.isNavigatingAwayByBackOrSubmit = false;
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const scopeCid =
        captureScope?.scopeCompanyId != null && Number(captureScope.scopeCompanyId) > 0
          ? Number(captureScope.scopeCompanyId)
          : companyId;
      const companyCode =
        captureScope?.mode === "group" && captureScope?.groupId
          ? String(captureScope.groupId)
          : me.company_code != null && String(me.company_code).trim() !== ""
            ? String(me.company_code).trim()
            : scopeCid != null
              ? String(scopeCid)
              : "";

      const allowed = await resolveCompanyGamesAccess({
        companyId: scopeCid,
        companyCode,
        sessionUser: me,
      });
      if (!cancelled && !allowed) {
        navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, companyId, captureScope, sessionReady, navigate]);

  useLayoutEffect(() => {
    window.DATACAPTURESUMMARY_COMPANY_ID = companyId;
    window.DATACAPTURESUMMARY_CAPTURE_SCOPE = captureScope;
    return () => {
      window.DATACAPTURESUMMARY_COMPANY_ID = null;
      window.DATACAPTURESUMMARY_CAPTURE_SCOPE = null;
    };
  }, [companyId, captureScope]);

  const scopeReady = dataCaptureScopeIsReady(captureScope);

  return {
    me,
    companyId,
    captureScope,
    scopeReady,
    mutationsBlocked,
    bootLoading: !sessionReady,
    bootError: sessionReady && !me,
  };
}
