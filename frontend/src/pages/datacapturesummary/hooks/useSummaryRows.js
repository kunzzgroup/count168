import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
    try {
      flushSync(() => {
        setRows((prev) => applyRowsFromDom(prev));
      });
    } catch (err) {
      console.warn("syncFromDom flushSync failed, falling back to async update:", err);
      setRows((prev) => applyRowsFromDom(prev));
    }
  }, [applyRowsFromDom]);

  const removeRowsByKeys = useCallback((keys) => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const keySet = new Set(keys.filter(Boolean));
    if (keySet.size === 0) return;
    const nextRows = (prev) => prev.filter((row) => !keySet.has(row.key));
    try {
      flushSync(() => {
        setRows(nextRows);
      });
    } catch (err) {
      console.warn("removeRowsByKeys flushSync failed, falling back to async update:", err);
      setRows(nextRows);
    }
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
      delete window.__SUMMARY_REACT_ADD_SUB_ROW__;
      delete window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__;
      delete window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__;
      return undefined;
    }

    window.__SUMMARY_REACT_ADD_SUB_ROW__ = addSubRow;
    window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__ = syncFromDom;
    window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__ = removeRowsByKeys;

    return () => {
      delete window.__SUMMARY_REACT_ADD_SUB_ROW__;
      delete window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__;
      delete window.__SUMMARY_REACT_REMOVE_ROWS_BY_KEYS__;
    };
  }, [enabled, addSubRow, syncFromDom, removeRowsByKeys]);

  return { rows, syncFromDom, resetToInitialRows, removeRowsByKeys };
}
