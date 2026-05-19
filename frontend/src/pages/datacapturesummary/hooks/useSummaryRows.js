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

  const syncFromDom = useCallback(() => {
    setRows((prev) => {
      const synced = readSummaryRowsFromDom(prev);
      if (synced.length === 0 && prev.length > 0) return prev;
      return synced;
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
          rowIndex
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
      return undefined;
    }

    window.__SUMMARY_REACT_ADD_SUB_ROW__ = addSubRow;
    window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__ = syncFromDom;

    return () => {
      delete window.__SUMMARY_REACT_ADD_SUB_ROW__;
      delete window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__;
    };
  }, [enabled, addSubRow, syncFromDom]);

  return { rows, syncFromDom, resetToInitialRows };
}
