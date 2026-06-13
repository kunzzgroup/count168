import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildDateOptions,
  displayTextFromProcessRow,
  fetchAddProcessFormData,
  fetchGroupCaptureCurrencies,
  fetchProcessDetail,
  fetchProcessesByDay,
  getLocalDateString,
} from "../lib/dataCaptureApi.js";
import {
  readGroupOnlyProcessPrefs,
  saveGroupOnlyProcessPrefs,
  selectedProcessFromGroupOnlyPrefs,
} from "../lib/dataCaptureGroupOnlyProcessPersistence.js";
import { selectedProcessFromGroupOnlySession } from "../lib/dataCaptureGroupOnlyProcesses.js";
import { restoreGroupOnlyTableDraft, saveGroupOnlyTableDraft } from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { loadActiveCaptureSession } from "../lib/dataCaptureStorage.js";
import { captureTableDataFromDom } from "../lib/dataCaptureTableSnapshot.js";

const PROCESS_PLACEHOLDER = "Select Process";
/** Cap initial option nodes when list is huge (e.g. Monday with 200+ processes). */
const PROCESS_OPTIONS_RENDER_CAP = 80;

function readRestoredProcessData() {
  try {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") !== "1") return null;
    const session = loadActiveCaptureSession();
    if (session?.processData) return session.processData;
    const raw = localStorage.getItem("capturedProcessData");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readRestoredSelectedProcess(restoredProcessData, selectedGroup = null) {
  if (restoredProcessData?.groupOnlyCapture) {
    const groupKey =
      restoredProcessData.captureSelectedGroup ||
      selectedGroup ||
      null;
    return (
      selectedProcessFromGroupOnlySession(restoredProcessData) ||
      selectedProcessFromGroupOnlyPrefs(readGroupOnlyProcessPrefs(groupKey))
    );
  }
  if (!restoredProcessData?.process) return null;
  const pid = String(restoredProcessData.process);
  const pcode = String(restoredProcessData.processCode || restoredProcessData.process_code || "").trim();
  const pname = String(restoredProcessData.processName || restoredProcessData.process_name || "").trim();
  return {
    id: pid,
    displayText: pname || pcode || pid,
    process_id: pcode,
    description_name: null,
  };
}

function applyProcessDetailToFields(data, setters, currenciesSnapshot, applyCompanyOnlyFields = true) {
  const {
    setCurrencyId,
    setRemoveWord,
    setReplaceFrom,
    setReplaceTo,
    setRemark,
    setDescriptionDisplay,
  } = setters;

  const pd = data || {};

  if (applyCompanyOnlyFields) {
    if (pd.remove_word) setRemoveWord(String(pd.remove_word));
    if (pd.replace_word_from) setReplaceFrom(String(pd.replace_word_from));
    if (pd.replace_word_to) setReplaceTo(String(pd.replace_word_to));

    if (pd.description_names) {
      const arr = Array.isArray(pd.description_names) ? pd.description_names : [pd.description_names];
      window.selectedDescriptions = [...arr];
      setDescriptionDisplay(arr.join(", "));
    }
  }

  if (pd.remarks) setRemark(String(pd.remarks));

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

function readInitialGroupOnlyPrefs(selectedGroup, restoredProcessData) {
  if (restoredProcessData?.groupOnlyCapture) return null;
  if (restoredProcessData?.process) return null;
  return readGroupOnlyProcessPrefs(selectedGroup);
}

export function useDataCaptureFormEngine(
  captureScope,
  { applyCompanyOnlyFields = true, selectedGroup = null, scriptsReady = false } = {},
) {
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const defaultDate = useMemo(() => getLocalDateString(), []);
  const restoredProcessData = useMemo(() => readRestoredProcessData(), []);
  const initialGroupOnlyPrefs = useMemo(
    () =>
      !applyCompanyOnlyFields
        ? readInitialGroupOnlyPrefs(selectedGroup, restoredProcessData)
        : null,
    [applyCompanyOnlyFields, selectedGroup, restoredProcessData]
  );

  const [captureDate, setCaptureDate] = useState(() => {
    if (restoredProcessData?.date) return restoredProcessData.date;
    if (initialGroupOnlyPrefs?.date) return initialGroupOnlyPrefs.date;
    return defaultDate;
  });
  const [currencies, setCurrencies] = useState([]);
  const currenciesRef = useRef([]);
  currenciesRef.current = currencies;

  const [processRows, setProcessRows] = useState([]);
  const processRowsRef = useRef([]);
  processRowsRef.current = processRows;
  const [currencyId, setCurrencyId] = useState(() => {
    if (restoredProcessData?.currency) return String(restoredProcessData.currency);
    if (initialGroupOnlyPrefs?.currency) return String(initialGroupOnlyPrefs.currency);
    return "";
  });
  const [replaceFrom, setReplaceFrom] = useState(() =>
    restoredProcessData?.replaceWordFrom ? String(restoredProcessData.replaceWordFrom) : "",
  );
  const [replaceTo, setReplaceTo] = useState(() =>
    restoredProcessData?.replaceWordTo ? String(restoredProcessData.replaceWordTo) : "",
  );
  const [removeWord, setRemoveWord] = useState(() =>
    restoredProcessData?.removeWord ? String(restoredProcessData.removeWord) : "",
  );
  const [remark, setRemark] = useState(() =>
    restoredProcessData?.remark ? String(restoredProcessData.remark) : "",
  );
  const [descriptionDisplay, setDescriptionDisplay] = useState(() =>
    Array.isArray(restoredProcessData?.descriptions) ? restoredProcessData.descriptions.join(", ") : "",
  );

  const [processOpen, setProcessOpen] = useState(false);
  const [processFilter, setProcessFilter] = useState("");
  const [selectedProcess, setSelectedProcess] = useState(() =>
    readRestoredSelectedProcess(restoredProcessData, selectedGroup)
  );

  const selectedGroupRef = useRef(selectedGroup);
  selectedGroupRef.current = selectedGroup;
  const selectedProcessRef = useRef(selectedProcess);
  selectedProcessRef.current = selectedProcess;
  const companyId = captureScope?.scopeCompanyId ?? null;

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const captureScopeRef = useRef(captureScope);
  captureScopeRef.current = captureScope;

  const applyCompanyOnlyFieldsRef = useRef(applyCompanyOnlyFields);
  applyCompanyOnlyFieldsRef.current = applyCompanyOnlyFields;

  useLayoutEffect(() => {
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") {
      window.__DC_IS_RESTORING__ = true;
      if (Array.isArray(restoredProcessData?.descriptions)) {
        window.selectedDescriptions = [...restoredProcessData.descriptions];
      }
    }
  }, [restoredProcessData]);

  const reloadProcessesForDate = useCallback(async (dateStr, options = {}) => {
    const { preserveSelection = false } = options;
    if (!applyCompanyOnlyFieldsRef.current) return;
    const cid = companyIdRef.current;
    const scope = captureScopeRef.current;
    if (!cid || !scope) return;
    const result = await fetchProcessesByDay(dateStr, scope);
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
      if (applyCompanyOnlyFieldsRef.current) {
        setRemoveWord("");
        setReplaceFrom("");
        setReplaceTo("");
        window.selectedDescriptions = [];
        setDescriptionDisplay("");
      }
      setRemark("");
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const loadInitialForm = useCallback(async () => {
    if (!applyCompanyOnlyFieldsRef.current) return;
    const cid = companyIdRef.current;
    const scope = captureScopeRef.current;
    if (!cid || !scope) return;
    const result = await fetchAddProcessFormData(scope);
    if (!result.success) return;
    const list = Array.isArray(result.currencies) ? result.currencies : [];
    const norm = list.map((c) => ({
      id: String(c.id),
      code: String(c.code || "").trim().toUpperCase(),
    }));
    setCurrencies(norm);
  }, []);

  const loadGroupOnlyCurrencies = useCallback(async () => {
    if (applyCompanyOnlyFieldsRef.current) return;
    const viewGroup = selectedGroupRef.current
      ? String(selectedGroupRef.current).trim().toUpperCase()
      : "";
    if (!viewGroup) {
      setCurrencies([]);
      setCurrencyId("");
      return;
    }
    const list = await fetchGroupCaptureCurrencies(viewGroup);
    setCurrencies(list);
    setCurrencyId((prev) => {
      if (!prev) return "";
      return list.some((c) => String(c.id) === String(prev)) ? prev : "";
    });
  }, []);

  useEffect(() => {
    if (applyCompanyOnlyFields) {
      if (!companyId) {
        setCurrencies([]);
        return;
      }
      void loadInitialForm();
      return;
    }
    void loadGroupOnlyCurrencies();
  }, [
    companyId,
    applyCompanyOnlyFields,
    selectedGroup,
    loadInitialForm,
    loadGroupOnlyCurrencies,
  ]);

  useEffect(() => {
    if (!companyId || !applyCompanyOnlyFields) return;
    if (window.__DC_IS_RESTORING__) return;
    const url = new URLSearchParams(window.location.search);
    if (url.get("restore") === "1") return;
    void reloadProcessesForDate(captureDate, { preserveSelection: false });
  }, [companyId, applyCompanyOnlyFields, captureDate, reloadProcessesForDate]);

  const onDateChange = useCallback(
    (e) => {
      const v = e.target.value;
      setCaptureDate(v);
      // Defer fetch past the native <select> close + layout (avoids insertBefore issues on touch / async flush).
      const run = () => void reloadProcessesForDate(v, { preserveSelection: false });
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          queueMicrotask(run);
        });
      } else {
        queueMicrotask(run);
      }
    },
    [reloadProcessesForDate]
  );

  const persistGroupOnlyFormPrefs = useCallback(
    (processOverride = null) => {
      if (applyCompanyOnlyFieldsRef.current) return;
      const proc = processOverride || selectedProcess;
      if (!proc?.id) return;
      saveGroupOnlyProcessPrefs(selectedGroupRef.current, {
        process: proc.id,
        processCode: proc.process_id,
        processName: proc.displayText,
        currency: currencyId,
        date: captureDate,
      });
    },
    [selectedProcess, currencyId, captureDate]
  );

  const selectGroupOnlyProcess = useCallback((option) => {
    if (!option?.id) return;
    const next = {
      id: String(option.id),
      displayText: option.displayText || String(option.id),
      process_id: option.process_id || String(option.id).toUpperCase(),
      description_name: null,
    };
    const prev = selectedProcessRef.current;
    if (prev?.id && prev.id !== next.id) {
      const activeCaptureType =
        typeof window.__DC_GET_CAPTURE_TYPE__ === "function"
          ? window.__DC_GET_CAPTURE_TYPE__() || "1.Text"
          : "1.Text";
      saveGroupOnlyTableDraft(selectedGroupRef.current, prev.id, {
        tableData: captureTableDataFromDom(activeCaptureType),
        captureType: activeCaptureType,
      });
    }
    setSelectedProcess(next);
    saveGroupOnlyProcessPrefs(selectedGroupRef.current, {
      process: next.id,
      processCode: next.process_id,
      processName: next.displayText,
      currency: currencyId,
      date: captureDate,
    });
    setProcessOpen(false);
    setProcessFilter("");
    void restoreGroupOnlyTableDraft(selectedGroupRef.current, next.id);
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, [currencyId, captureDate]);

  const selectProcessRow = useCallback(async (row) => {
    if (!applyCompanyOnlyFieldsRef.current) return;
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
        currenciesRef.current,
        applyCompanyOnlyFieldsRef.current
      );
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const clearCompanyOnlyFields = useCallback(() => {
    setRemoveWord("");
    setReplaceFrom("");
    setReplaceTo("");
    window.selectedDescriptions = [];
    setDescriptionDisplay("");
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const applyGroupOnlyPrefsForGroup = useCallback((groupId) => {
    if (applyCompanyOnlyFieldsRef.current) return;
    const prefs = readGroupOnlyProcessPrefs(groupId);
    const proc = selectedProcessFromGroupOnlyPrefs(prefs);
    setSelectedProcess(proc);
    if (prefs?.currency) setCurrencyId(String(prefs.currency));
    if (prefs?.date) setCaptureDate(String(prefs.date));
    if (proc?.id) {
      void restoreGroupOnlyTableDraft(groupId, proc.id);
    }
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const clearProcessSelection = useCallback(() => {
    setSelectedProcess(null);
    setCurrencyId("");
    if (applyCompanyOnlyFieldsRef.current) {
      setRemoveWord("");
      setReplaceFrom("");
      setReplaceTo("");
      window.selectedDescriptions = [];
      setDescriptionDisplay("");
    }
    setRemark("");
    setTimeout(() => {
      if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
    }, 0);
  }, []);

  const applyReactFormDefaults = useCallback(() => {
    const today = getLocalDateString();
    setCaptureDate(today);
    if (applyCompanyOnlyFieldsRef.current) {
      clearProcessSelection();
      void reloadProcessesForDate(today, { preserveSelection: false });
      return;
    }
    clearProcessSelection();
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
      startTransition(() => {
        setProcessRows(Array.isArray(rows) ? rows : []);
      });
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
      if (processData.removeWord != null) setRemoveWord(String(processData.removeWord));
      if (processData.replaceWordFrom != null) setReplaceFrom(String(processData.replaceWordFrom));
      if (processData.replaceWordTo != null) setReplaceTo(String(processData.replaceWordTo));
      if (processData.remark != null) setRemark(String(processData.remark));
      if (processData.descriptions && Array.isArray(processData.descriptions)) {
        window.selectedDescriptions = [...processData.descriptions];
        setDescriptionDisplay(processData.descriptions.join(", "));
      }

      const pid = processData.process != null ? String(processData.process) : "";
      const pcode = String(processData.processCode || processData.process_code || "").trim();
      const pname = String(processData.processName || processData.process_name || "").trim();
      const rows = processRowsRef.current || [];

      if (!applyCompanyOnlyFieldsRef.current && processData.groupOnlyCapture) {
        const groupKey = processData.captureSelectedGroup || selectedGroupRef.current;
        const proc =
          selectedProcessFromGroupOnlySession(processData) ||
          selectedProcessFromGroupOnlyPrefs(readGroupOnlyProcessPrefs(groupKey));
        if (proc) setSelectedProcess(proc);
        if (proc?.id) {
          saveGroupOnlyProcessPrefs(groupKey, {
            process: proc.id,
            processCode: proc.process_id || pcode,
            processName: proc.displayText || pname,
            currency: processData.currency,
            date: processData.date,
          });
        }
      } else {
        let row = null;
        if (pid) row = rows.find((r) => String(r.id) === pid);
        if (!row && pcode) row = rows.find((r) => String(r.process_id || "").trim() === pcode);
        if (!row && pname) row = rows.find((r) => displayTextFromProcessRow(r) === pname);

        if (row) {
          setSelectedProcess({
            id: String(row.id),
            displayText: displayTextFromProcessRow(row),
            process_id: row.process_id,
            description_name: row.description_name || null,
          });
        } else if (pid || pcode || pname) {
          setSelectedProcess({
            id: pid || pcode,
            displayText: pname || pcode || pid,
            process_id: pcode,
            description_name: null,
          });
        }
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

  const processListTruncated = useMemo(
    () => !processFilter.trim() && processRows.length > PROCESS_OPTIONS_RENDER_CAP,
    [processFilter, processRows.length]
  );

  const visibleProcesses = useMemo(() => {
    if (!processListTruncated) return filteredProcesses;
    return filteredProcesses.slice(0, PROCESS_OPTIONS_RENDER_CAP);
  }, [filteredProcesses, processListTruncated]);

  const processSearchInputRef = useRef(null);
  useEffect(() => {
    if (processOpen && processSearchInputRef.current) {
      const t = setTimeout(() => processSearchInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [processOpen]);

  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !selectedProcess?.id) return;
    if (window.__DC_IS_RESTORING__) return;
    persistGroupOnlyFormPrefs();
  }, [applyCompanyOnlyFields, selectedGroup, selectedProcess?.id, currencyId, captureDate, persistGroupOnlyFormPrefs]);

  /** Restore saved group-only table draft when process is pre-selected or grid becomes ready. */
  useEffect(() => {
    if (applyCompanyOnlyFields || !selectedGroup || !selectedProcess?.id) return;
    if (!scriptsReady) return;
    if (typeof window.__DC_RESTORE_CAPTURE_TABLE__ !== "function") return;
    if (window.__DC_IS_RESTORING__) return;
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }
    void restoreGroupOnlyTableDraft(selectedGroup, selectedProcess.id);
  }, [
    applyCompanyOnlyFields,
    selectedGroup,
    selectedProcess?.id,
    scriptsReady,
  ]);

  const applyGroupOnlyPrefsForGroupRef = useRef(applyGroupOnlyPrefsForGroup);
  applyGroupOnlyPrefsForGroupRef.current = applyGroupOnlyPrefsForGroup;

  useLayoutEffect(() => {
    window.__DC_APPLY_GROUP_ONLY_PERSISTED_FORM__ = async () => {
      if (applyCompanyOnlyFieldsRef.current) return;
      const groupId = selectedGroupRef.current;
      if (groupId) applyGroupOnlyPrefsForGroupRef.current(groupId);
    };
    return () => {
      delete window.__DC_APPLY_GROUP_ONLY_PERSISTED_FORM__;
    };
  }, []);

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
    visibleProcesses,
    processListTruncated,
    processRowsCount: processRows.length,
    selectedProcess,
    selectProcessRow,
    selectGroupOnlyProcess,
    applyGroupOnlyPrefsForGroup,
    clearProcessSelection,
    displayTextFromProcessRow,
    clearCompanyOnlyFields,
  };
}
