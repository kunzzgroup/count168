import { useMemo } from "react";
import { citibetCaptureTableHasData } from "../utils/captureTableDataDom.js";

/**
 * Submit gate computed from React state snapshot.
 */
export function useDataCaptureSubmitGate({
  selectedProcessId,
  selectedDescriptions,
  currencyId,
  dataCaptureType,
  tableDataSnapshot,
}) {
  return useMemo(() => {
    const descriptions = Array.isArray(selectedDescriptions) ? selectedDescriptions : [];
    const processOk = Boolean(selectedProcessId && String(selectedProcessId).trim() !== "");
    const currencyOk = Boolean(currencyId && String(currencyId).trim() !== "");
    const descriptionsOk = descriptions.length > 0;

    let tableOk = true;
    if (dataCaptureType === "CITIBET" || dataCaptureType === "CITIBET_MAJOR") {
      tableOk = citibetCaptureTableHasData(tableDataSnapshot);
    }

    const canSubmit = processOk && descriptionsOk && currencyOk && tableOk;

    let disabledTitle = "";
    if (!processOk) disabledTitle = "Please select a process";
    else if (!descriptionsOk) disabledTitle = "Please select at least one description";
    else if (!currencyOk) disabledTitle = "Please select a currency";
    else if (!tableOk) disabledTitle = "Please enter data in the table";

    return { canSubmit, disabledTitle };
  }, [selectedProcessId, selectedDescriptions, currencyId, dataCaptureType, tableDataSnapshot]);
}
