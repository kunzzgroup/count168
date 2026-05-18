import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildDateOptions,
  displayTextFromProcessRow,
  fetchAddProcessFormData,
  fetchProcessDetail,
  fetchProcessesByDay,
  getLocalDateString,
} from "./dataCaptureApi.js";

const PROCESS_PLACEHOLDER = "Select Process";

function applyProcessDetailToFields(data, setters, currenciesSnapshot) {
  const {
    setCurrencyId,
    setRemoveWord,
    setReplaceFrom,
    setReplaceTo,
    setRemark,
    setDescriptionDisplay,
  } = setters;

  const pd = data || {};

  if (pd.remove_word) setRemoveWord(String(pd.remove_word).toUpperCase());
  if (pd.replace_word_from) setReplaceFrom(String(pd.replace_word_from).toUpperCase());
  if (pd.replace_word_to) setReplaceTo(String(pd.replace_word_to).toUpperCase());
  if (pd.remarks) setRemark(String(pd.remarks).toUpperCase());

  if (pd.description_names) {
    const arr = Array.isArray(pd.description_names) ? pd.description_names : [pd.description_names];
    window.selectedDescriptions = [...arr];
    setDescriptionDisplay(arr.join(", "));
  }

  const currencyIdStr = pd.currency_id != null ? String(pd.currency_id) : "";
  const list = currenciesSnapshot || [];
  if (currencyIdStr && list.length) {
    const exists = list.some((c) => String(c.id) === currencyIdStr);
    if (exists) {
      setCurrencyId(currencyIdStr);
      return;
    }
  }
  if (pd.currency_warning && pd.currency_code && list.length) {
    const code = String(pd.currency_code).toUpperCase();
    const match = list.find((c) => String(c.code).toUpperCase() === code);
    if (match) setCurrencyId(String(match.id));
  }
}

export function useDataCaptureFormEngine(companyId) {
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const defaultDate = useMemo(() => getLocalDateString(), []);

  const [captureDate, setCaptureDate] = useState(defaultDate);
  const [currencies, setCurrencies] = useState([]);
  const currenciesRef = useRef([]);
  currenciesRef.current = currencies;

  const [processRows, setProcessRows] = useState([]);
  const [currencyId, setCurrencyId] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [removeWord, setRemoveWord] = useState("");
  const [remark, setRemark] = useState("");
  const [descriptionDisplay, setDescriptionDisplay] = useState("");

  const [processOpen, setProcessOpen] = useState(false);
  const [processFilter, setProcessFilter] = useState("");
  const [selectedProcess, setSelectedProcess] = useState(null);

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  const reloadProcessesForDate = useCallback(async (dateStr, options = {}) => {
    const { preserveSelection = false } = options;
    const cid = companyIdRef.current;
    if (!cid) return;
    const result = await fetchProcessesByDay(dateStr, cid);
    if (!result.success) return;
    const rows = Array.isArray(result.data) ? result.data : [];
    setProcessRows(rows);
    if (typeof window.syncProcessDataMapFromApiData === "function") {
      window.syncProcessDataMapFromApiData(rows);
    }
    const restoring = window.__DC_IS_RESTORING__ === true;
    if (!preserveSelection && !restoring) {
      setSelectedProcess(null);
      setCurrencyId("");
      setRemoveWord("");
      setReplaceFrom("");
      setReplaceTo("");
      setRemark("");
      window.selectedDescriptions = [];
      setDescriptionDisplay("");
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const loadInitialForm = useCallback(async () => {
    const cid = companyIdRef.current;
    if (!cid) return;
    const result = await fetchAddProcessFormData(cid);
    if (!result.success) return;
    const list = Array.isArray(result.currencies) ? result.currencies : [];
    const norm = list.map((c) => ({ id: String(c.id), code: c.code }));
    setCurrencies(norm);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    void loadInitialForm();
  }, [companyId, loadInitialForm]);

  useEffect(() => {
    if (!companyId) return;
    void reloadProcessesForDate(captureDate, { preserveSelection: false });
  }, [companyId, captureDate, reloadProcessesForDate]);

  const onDateChange = useCallback(
    async (e) => {
      const v = e.target.value;
      setCaptureDate(v);
      await reloadProcessesForDate(v, { preserveSelection: false });
      if (typeof window.loadSubmittedProcesses === "function") {
        await window.loadSubmittedProcesses();
      }
    },
    [reloadProcessesForDate]
  );

  const selectProcessRow = useCallback(async (row) => {
    const displayText = displayTextFromProcessRow(row);
    setSelectedProcess({
      id: String(row.id),
      displayText,
      process_id: row.process_id,
      description_name: row.description_name || null,
    });
    setProcessOpen(false);
    setProcessFilter("");
    const cid = companyIdRef.current;
    const res = await fetchProcessDetail(row.id, cid);
    if (res.success && res.data) {
      applyProcessDetailToFields(
        res.data,
        {
          setCurrencyId,
          setRemoveWord,
          setReplaceFrom,
          setReplaceTo,
          setRemark,
          setDescriptionDisplay,
        },
        currenciesRef.current
      );
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const clearProcessSelection = useCallback(() => {
    setSelectedProcess(null);
    setCurrencyId("");
    setRemoveWord("");
    setReplaceFrom("");
    setReplaceTo("");
    setRemark("");
    window.selectedDescriptions = [];
    setDescriptionDisplay("");
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const applyReactFormDefaults = useCallback(() => {
    const today = getLocalDateString();
    setCaptureDate(today);
    clearProcessSelection();
    void reloadProcessesForDate(today, { preserveSelection: false });
    if (typeof window.loadSubmittedProcesses === "function") {
      void window.loadSubmittedProcesses();
    }
  }, [clearProcessSelection, reloadProcessesForDate]);

  const windowHooksRef = useRef({});
  windowHooksRef.current = {
    reloadProcessesForDate,
    applyReactFormDefaults,
  };

  useLayoutEffect(() => {
    if (!Array.isArray(window.selectedDescriptions)) {
      window.selectedDescriptions = [];
    }
    window.__DATA_CAPTURE_REACT_FORM__ = true;

    window.__DC_SET_PROCESS_LIST__ = (rows) => {
      setProcessRows(Array.isArray(rows) ? rows : []);
    };

    window.__DC_RELOAD_PROCESSES__ = async () => {
      const el = document.getElementById("capture_date");
      const d = el?.value || getLocalDateString();
      await windowHooksRef.current.reloadProcessesForDate(d, { preserveSelection: true });
    };

    window.__DC_REACT_FORM_RESET__ = () => {
      windowHooksRef.current.applyReactFormDefaults();
    };

    window.__DC_ON_DESCRIPTIONS_CONFIRMED__ = (descriptions) => {
      const arr = Array.isArray(descriptions) ? descriptions : [];
      setDescriptionDisplay(arr.join(", "));
    };

    window.__DC_POST_LEGACY_RESTORE_SYNC__ = async (processData) => {
      if (!processData) return;
      if (processData.date) setCaptureDate(processData.date);
      if (processData.currency) setCurrencyId(String(processData.currency));
      if (processData.removeWord != null) setRemoveWord(String(processData.removeWord).toUpperCase());
      if (processData.replaceWordFrom != null) setReplaceFrom(String(processData.replaceWordFrom).toUpperCase());
      if (processData.replaceWordTo != null) setReplaceTo(String(processData.replaceWordTo).toUpperCase());
      if (processData.remark != null) setRemark(String(processData.remark).toUpperCase());
      if (processData.descriptions && Array.isArray(processData.descriptions)) {
        window.selectedDescriptions = [...processData.descriptions];
        setDescriptionDisplay(processData.descriptions.join(", "));
      }
      const btn = document.getElementById("capture_process");
      const dataVal = btn?.getAttribute?.("data-value");
      const text = (btn?.textContent || "").trim();
      const pcode = btn?.getAttribute?.("data-process-code");
      const dname = btn?.getAttribute?.("data-description-name");
      const pid = processData.process;
      if (dataVal || pid) {
        setSelectedProcess({
          id: String(dataVal || pid),
          displayText: text && text !== PROCESS_PLACEHOLDER ? text : String(pid || ""),
          process_id: pcode || processData.processCode || "",
          description_name: dname || null,
        });
      }
      setTimeout(() => {
        if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
      }, 0);
    };

    return () => {
      delete window.__DATA_CAPTURE_REACT_FORM__;
      delete window.__DC_SET_PROCESS_LIST__;
      delete window.__DC_RELOAD_PROCESSES__;
      delete window.__DC_REACT_FORM_RESET__;
      delete window.__DC_ON_DESCRIPTIONS_CONFIRMED__;
      delete window.__DC_POST_LEGACY_RESTORE_SYNC__;
    };
  }, []);

  const filteredProcesses = useMemo(() => {
    const q = processFilter.trim().toLowerCase();
    if (!q) return processRows;
    return processRows.filter((r) => displayTextFromProcessRow(r).toLowerCase().includes(q));
  }, [processFilter, processRows]);

  const processSearchInputRef = useRef(null);
  useEffect(() => {
    if (processOpen && processSearchInputRef.current) {
      const t = setTimeout(() => processSearchInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [processOpen]);

  return {
    dateOptions,
    captureDate,
    onDateChange,
    currencies,
    currencyId,
    setCurrencyId,
    replaceFrom,
    setReplaceFrom,
    replaceTo,
    setReplaceTo,
    removeWord,
    setRemoveWord,
    remark,
    setRemark,
    descriptionDisplay,
    processOpen,
    setProcessOpen,
    processFilter,
    setProcessFilter,
    processSearchInputRef,
    filteredProcesses,
    selectedProcess,
    selectProcessRow,
    clearProcessSelection,
    displayTextFromProcessRow,
  };
}
