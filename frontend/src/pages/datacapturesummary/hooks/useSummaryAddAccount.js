import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { accountModalOverlayZIndex } from "../../../components/ProcessModalPortal.jsx";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import {
  DEFAULT_FORM,
  getOrderedRoles,
  normalizeAlertAmount,
  toUpper,
} from "../../account/accountLogic.js";
import { getAccountText, translateAccountApiMessage } from "../../../translateFile/pages/accountTranslate.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";

function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

/** Remove stale #addModal if present from an older page shell. */
function purgeLegacySummaryAddAccountModal() {
  const legacy = document.getElementById("addModal");
  if (legacy?.classList?.contains("account-modal")) {
    legacy.remove();
  } else if (legacy) {
    legacy.style.display = "none";
  }
}

/** Summary Add Account — same shared AccountModal as Account List / Bank Process. */
export function useSummaryAddAccount({ companyId, notify, onAccountCreated }) {
  const lang = useLoginLang();
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const apiMsg = useCallback(
    (json, fallbackKey) =>
      translateAccountApiMessage(lang, json?.message ?? json?.error, fallbackKey || ""),
    [lang],
  );

  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");

  const openingRef = useRef(false);
  const companyIdRef = useRef(companyId);
  const notifyRef = useRef(notify);
  companyIdRef.current = companyId;
  notifyRef.current = notify;

  const orderedRoles = useMemo(() => getOrderedRoles(roles), [roles]);
  const companyButtons = useMemo(
    () => companies.filter((c) => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c)),
    [companies]
  );

  useEffect(() => {
    if (!companyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchOwnerCompaniesAll();
        if (!cancelled && rows.length) {
          setCompanies(rows.map(normalizeCompanyRow));
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const loadSelectionMeta = useCallback(async (accountId) => {
    const cid = companyIdRef.current;
    const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
    if (accountId) currencyParams.set("account_id", String(accountId));
    if (cid) currencyParams.set("company_id", String(cid));
    const companyUrl = accountId
      ? `api/accounts/account_company_api.php?action=get_available_companies&account_id=${accountId}`
      : "api/accounts/account_company_api.php?action=get_available_companies";

    const [curRes, compRes] = await Promise.all([
      fetch(buildApiUrl(`api/accounts/account_currency_api.php?${currencyParams.toString()}`), {
        credentials: "include",
      }),
      fetch(buildApiUrl(companyUrl), { credentials: "include" }),
    ]);
    const curJ = await curRes.json();
    const compJ = await compRes.json();

    if (curJ.success && Array.isArray(curJ.data)) {
      setCurrencies(curJ.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
      setSelectedCurrencyIds([]);
    }
    if (compJ.success && Array.isArray(compJ.data)) {
      const linked = compJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
      setSelectedCompanyIds(linked.length ? linked : cid ? [Number(cid)] : []);
    }
  }, []);

  const resetToAdd = useCallback(() => {
    const cid = companyIdRef.current;
    setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]);
    setSelectedCompanyIds(cid ? [Number(cid)] : []);
    setCurrencyInput("");
  }, []);

  const closeAddAccount = useCallback(() => {
    purgeLegacySummaryAddAccountModal();
    setOpen(false);
    resetToAdd();
    openingRef.current = false;
  }, [resetToAdd]);

  const showAddAccount = useCallback(async () => {
    const cid = companyIdRef.current;
    const notifyFn = notifyRef.current;
    if (!cid) {
      notifyFn?.(t("pleaseSelectCompanyFirst"), "", "danger");
      return;
    }
    if (openingRef.current) return;
    openingRef.current = true;
    purgeLegacySummaryAddAccountModal();
    try {
      const editRes = await fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" });
      const editJson = await editRes.json();
      setRoles(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);
      resetToAdd();
      await loadSelectionMeta(null);
      setOpen(true);
    } catch {
      notifyFn?.(t("errorLoadingAccount"), "", "danger");
    } finally {
      openingRef.current = false;
    }
  }, [loadSelectionMeta, resetToAdd, t]);

  useLayoutEffect(() => {
    purgeLegacySummaryAddAccountModal();
  }, []);

  const createCurrency = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const code = toUpper(currencyInput).trim();
      if (!code) return;
      const targetCompany = selectedCompanyIds[0] || companyIdRef.current;
      if (!targetCompany) {
        notifyRef.current?.(t("pleaseSelectCompanyFirst"), "", "danger");
        return;
      }
      try {
        const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, company_id: targetCompany }),
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success || !json.data) {
          notifyRef.current?.(apiMsg(json, "createFailed"), "", "danger");
          return;
        }
        setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code, is_linked: false }]);
        setCurrencyInput("");
      } catch {
        notifyRef.current?.(t("createFailed"), "", "danger");
      }
    },
    [apiMsg, currencyInput, selectedCompanyIds, t]
  );

  const removeCurrency = useCallback(
    async (cid) => {
      try {
        const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: cid }),
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success) {
          notifyRef.current?.(apiMsg(json, "failedDeleteCurrency"), "", "danger");
          return;
        }
        setCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
        setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
      } catch {
        notifyRef.current?.(t("failedDeleteCurrency"), "", "danger");
      }
    },
    [apiMsg, t]
  );

  const submitAddAccount = useCallback(
    async (e) => {
      e.preventDefault();
      const alertAmount = normalizeAlertAmount(form.alert_amount);
      if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
        notifyRef.current?.(t("paymentAlertRequiredFields"), "", "danger");
        return;
      }

      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "alert_amount") fd.append(k, alertAmount);
        else fd.append(k, v ?? "");
      });
      if (form.payment_alert === "0") {
        fd.set("alert_type", "");
        fd.set("alert_start_date", "");
        fd.set("alert_amount", "");
      }
      if (selectedCompanyIds.length) fd.set("company_ids", JSON.stringify(selectedCompanyIds));
      if (companyIdRef.current) fd.set("company_id", String(companyIdRef.current));
      if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));

      try {
        const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success) {
          notifyRef.current?.(apiMsg(json, "saveFailed"), "", "danger");
          return;
        }

        const newAccountId = json?.data?.id;

        if (newAccountId && selectedCompanyIds.length) {
          await Promise.all(
            selectedCompanyIds.map((cid) =>
              fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: newAccountId, company_id: cid }),
                credentials: "include",
              })
            )
          );
        }
        if (newAccountId && selectedCurrencyIds.length) {
          await Promise.all(
            selectedCurrencyIds.map((cur) =>
              fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_id: newAccountId, currency_id: cur }),
                credentials: "include",
              })
            )
          );
        }

        closeAddAccount();
        notifyRef.current?.(t("accountSavedSuccessfully"), "", "success");

        if (typeof onAccountCreated === "function") {
          await onAccountCreated(newAccountId);
        }
      } catch {
        notifyRef.current?.(t("saveFailed"), "", "danger");
      }
    },
    [apiMsg, closeAddAccount, form, onAccountCreated, selectedCompanyIds, selectedCurrencyIds, t]
  );

  return {
    open,
    closeAddAccount,
    showAddAccount,
    accountModalProps: {
      open,
      title: t("addAccount"),
      isEditMode: false,
      form,
      setForm,
      orderedRoles,
      currencies,
      companies: companyButtons,
      selectedCurrencyIds,
      setSelectedCurrencyIds,
      selectedCompanyIds,
      setSelectedCompanyIds,
      currencyInput,
      setCurrencyInput,
      onCreateCurrency: createCurrency,
      onRemoveCurrency: removeCurrency,
      onSubmit: submitAddAccount,
      onClose: closeAddAccount,
      t,
      overlayZIndex: accountModalOverlayZIndex,
    },
  };
}
