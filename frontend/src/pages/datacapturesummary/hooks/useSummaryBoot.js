import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DATA_CAPTURE_HOME_PATH,
  resolveCompanyGamesAccess,
} from "../../datacapture/dataCaptureCompanyAccess.js";
import { fetchSummarySessionUser } from "../summaryApi.js";
import { summaryQueryKeys } from "../summaryQueryKeys.js";

/**
 * Session boot for Summary SPA — mirrors Data Capture access rules.
 */
export function useSummaryBoot() {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: summaryQueryKeys.session(),
    queryFn: fetchSummarySessionUser,
    staleTime: 60_000,
    retry: 1,
  });

  const me = query.data ?? null;
  const companyId =
    me?.company_id != null && Number.isFinite(Number(me.company_id)) ? Number(me.company_id) : null;

  useEffect(() => {
    if (query.isLoading) return;
    if (query.isError || !me) {
      navigate("/login", { replace: true });
    }
  }, [query.isLoading, query.isError, me, navigate]);

  useEffect(() => {
    if (!me || companyId == null) return;

    let cancelled = false;
    (async () => {
      const companyCode =
        me.company_code != null && String(me.company_code).trim() !== ""
          ? String(me.company_code).trim()
          : String(companyId);

      const allowed = await resolveCompanyGamesAccess({
        companyId,
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
  }, [me, companyId, navigate]);

  useLayoutEffect(() => {
    window.DATACAPTURESUMMARY_COMPANY_ID = companyId;
    return () => {
      window.DATACAPTURESUMMARY_COMPANY_ID = null;
    };
  }, [companyId]);

  return {
    me,
    companyId,
    bootLoading: query.isLoading,
    bootError: query.isError,
  };
}
