import { useCallback, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import {
  DEFAULT_FORM,
  getOrderedRoles,
  normalizeAlertAmount,
  toUpper,
} from "../../account/accountLogic.js";
import { getAccountText, translateAccountApiMessage } from "../../../translateFile/accountTranslate.js";

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

/**
 * Summary Add Account — same shared AccountModal as Account List / Bank Process.
 */
export function useSummaryAddAccount({ companyId, scriptsReady, notify }) {
  const [lang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);
  const apiMsg = useCallback(
    (json, fallbackKey) =>
      translateAccountApiMessage(
        lang,
        { message: json?.message ?? json?.error, errorCode: json?.data?.error },
        fallbackKey ? t(fallbackKey) : ""
      ),
    [lang, t]
  );

  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState({ ...DEFAULT_FORM, payment_alert: "0" });
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [opening, setOpening] = useState(false);

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
        const res = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
          credentials: "include",
        });
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setCompanies(json.data.map(normalizeCompanyRow));
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const loadSelectionMeta = useCallback(
    async (accountId) => {
      const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
      if (accountId) currencyParams.set("account_id", String(accountId));
      if (companyId) currencyParams.set("company_id", String(companyId));
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
        setSelectedCompanyIds(linked.length ? linked : companyId ? [Number(companyId)] : []);
      }
    },
    [companyId]
  );

  const resetToAdd = useCallback(() => {
    setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]);
    setSelectedCompanyIds(companyId ? [Number(companyId)] : []);
    setCurrencyInput("");
  }, [companyId]);

  const closeAddAccount = useCallback(() => {
    setOpen(false);
    resetToAdd();
  }, [resetToAdd]);

  const showAddAccount = useCallback(async () => {
    if (!companyId) {
      notify?.(t("pleaseSelectCompanyFirst"), "", "danger");
      return;
    }
    if (opening) return;
    setOpening(true);
    try {
      const editRes = await fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" });
      const editJson = await editRes.json();
      setRoles(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);
      resetToAdd();
      await loadSelectionMeta(null);
      setOpen(true);
    } catch {
      notify?.(t("errorLoadingAccount"), "", "danger");
    } finally {
      setOpening(false);
    }
  }, [companyId, loadSelectionMeta, notify, opening, resetToAdd, t]);

  const createCurrency = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      const code = toUpper(currencyInput).trim();
      if (!code) return;
      const targetCompany = selectedCompanyIds[0] || companyId;
      if (!targetCompany) {
        notify?.(t("pleaseSelectCompanyFirst"), "", "danger");
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
          notify?.(apiMsg(json, "createFailed"), "", "danger");
          return;
        }
        setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code, is_linked: false }]);
        setCurrencyInput("");
      } catch {
        notify?.(t("createFailed"), "", "danger");
      }
    },
    [apiMsg, companyId, currencyInput, notify, selectedCompanyIds, t]
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
          notify?.(apiMsg(json, "failedDeleteCurrency"), "", "danger");
          return;
        }
        setCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
        setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
      } catch {
        notify?.(t("failedDeleteCurrency"), "", "danger");
      }
    },
    [apiMsg, notify, t]
  );

  const submitAddAccount = useCallback(
    async (e) => {
      e.preventDefault();
      const alertAmount = normalizeAlertAmount(form.alert_amount);
      if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
        notify?.(t("paymentAlertRequiredFields"), "", "danger");
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
      if (companyId) fd.set("company_id", String(companyId));
      if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));

      try {
        const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success) {
          notify?.(apiMsg(json, "saveFailed"), "", "danger");
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
        notify?.(t("accountSavedSuccessfully"), "", "success");

        if (scriptsReady && typeof window.refreshAccountList === "function") {
          await window.refreshAccountList(newAccountId);
        }
      } catch {
        notify?.(t("saveFailed"), "", "danger");
      }
    },
    [
      apiMsg,
      closeAddAccount,
      companyId,
      form,
      notify,
      scriptsReady,
      selectedCompanyIds,
      selectedCurrencyIds,
      t,
    ]
  );

  useEffect(() => {
    window.__SUMMARY_REACT_SHOW_ADD_ACCOUNT__ = () => {
      void showAddAccount();
    };
    window.__SUMMARY_REACT_CLOSE_ADD_ACCOUNT__ = closeAddAccount;

    return () => {
      delete window.__SUMMARY_REACT_SHOW_ADD_ACCOUNT__;
      delete window.__SUMMARY_REACT_CLOSE_ADD_ACCOUNT__;
    };
  }, [showAddAccount, closeAddAccount]);

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
      overlayZIndex: 10001,
    },
  };
}
