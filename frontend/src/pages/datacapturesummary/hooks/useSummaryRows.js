import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { unsetWindowProperty } from "../../../utils/unsetWindowProperty.js";
import {
  buildInitialSummaryRows,
  insertSubRowInModel,
  readSummaryRowsFromDom,
} from "../summaryRowModel.js";

/**
 * React-owned summary row list. Legacy mutates cell content in place; new sub-rows go through
 * __SUMMARY_REACT_ADD_SUB_ROW__ so React and DOM stay aligned.
 */
export function useSummaryRows(tableData, enabled) {
  const initialRows = useMemo(() => buildInitialSummaryRows(tableData), [tableData]);
  const [rows, setRows] = useState([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useLayoutEffect(() => {
    if (enabled && initialRows.length) {
      setRows(initialRows);
    } else {
      setRows([]);
    }
  }, [enabled, initialRows]);

  const applyRowsFromDom = useCallback((prev) => {
    const synced = readSummaryRowsFromDom(prev);
    if (synced.length === 0 && prev.length > 0) return prev;
    const seen = new Set();
    return synced.filter((row) => {
      if (!row?.key || seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    });
  }, []);

  const syncFromDom = useCallback(() => {
    setRows((prev) => applyRowsFromDom(prev));
  }, [applyRowsFromDom]);

  const removeRowsByKeys = useCallback((keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const keySet = new Set(keys.filter(Boolean));
    if (keySet.size === 0) return;
    setRows((prev) => prev.filter((row) => !keySet.has(row.key)));
  }, []);

  const markMainRowsClearedByKeys = useCallback((keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const keySet = new Set(keys.filter(Boolean));
    if (keySet.size === 0) return;
    flushSync(() => {
      setRows((prev) =>
        prev.map((row) =>
          keySet.has(row.key) && row.productType === "main" ? { ...row, userCleared: true } : row
        )
      );
    });
  }, []);

  /** Reorder React row model to match legacy-computed DOM order (no tbody.appendChild). */
  const setRowOrderByKeys = useCallback((orderedKeys) => {
    if (!Array.isArray(orderedKeys) || orderedKeys.length === 0) return;
    setRows((prev) => {
      const byKey = new Map(prev.map((r) => [r.key, r]));
      const seen = new Set();
      const next = [];
      orderedKeys.forEach((key) => {
        if (!key || seen.has(key)) return;
        const row = byKey.get(key);
        if (row) {
          next.push(row);
          seen.add(key);
        }
      });
      prev.forEach((row) => {
        if (!seen.has(row.key)) {
          next.push(row);
          seen.add(row.key);
        }
      });
      return next.length ? next : prev;
    });
  }, []);

  const resetToInitialRows = useCallback(() => {
    flushSync(() => {
      setRows(initialRows);
    });
  }, [initialRows]);

  const addSubRow = useCallback((parentProcessValue, insertAfterRow, rowIndex) => {
    const insertAfterKey = insertAfterRow?.getAttribute?.("data-react-row-key") || null;
    let newKey = "";

    flushSync(() => {
      setRows((prev) => {
        const { rows: next, newKey: key } = insertSubRowInModel(
          prev,
          parentProcessValue,
          insertAfterKey,
          rowIndex,
          insertAfterRow
        );
        newKey = key;
        return next;
      });
    });

    if (!newKey) return null;
    return document.querySelector(`tr[data-react-row-key="${CSS.escape(newKey)}"]`);
  }, []);

  useLayoutEffect(() => {
    if (!enabled) {
      unsetWindowProperty("__SUMMARY_REACT_ADD_SUB_ROW__");
      unsetWindowProperty("__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__");
      unsetWindowProperty("__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__");
      unsetWindowProperty("__SUMMARY_REACT_MARK_MAIN_ROWS_CLEARED__");
      unsetWindowProperty("__SUMMARY_REACT_SET_ROW_ORDER__");
      return undefined;
    }

    window.__SUMMARY_REACT_ADD_SUB_ROW__ = addSubRow;
    window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__ = syncFromDom;
    window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__ = removeRowsByKeys;
    window.__SUMMARY_REACT_MARK_MAIN_ROWS_CLEARED__ = markMainRowsClearedByKeys;
    window.__SUMMARY_REACT_SET_ROW_ORDER__ = setRowOrderByKeys;

    return () => {
      unsetWindowProperty("__SUMMARY_REACT_ADD_SUB_ROW__", addSubRow);
      unsetWindowProperty("__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__", syncFromDom);
      unsetWindowProperty("__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__", removeRowsByKeys);
      unsetWindowProperty("__SUMMARY_REACT_MARK_MAIN_ROWS_CLEARED__", markMainRowsClearedByKeys);
      unsetWindowProperty("__SUMMARY_REACT_SET_ROW_ORDER__", setRowOrderByKeys);
    };
  }, [enabled, addSubRow, syncFromDom, removeRowsByKeys, markMainRowsClearedByKeys, setRowOrderByKeys]);

  return {
    rows,
    syncFromDom,
    resetToInitialRows,
    removeRowsByKeys,
    markMainRowsClearedByKeys,
    setRowOrderByKeys,
  };
}
