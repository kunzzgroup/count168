import { isCitibetCaptureType } from "./dataCaptureStorage.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";

export function validateDataCaptureForm({ selectedProcess, descriptions, currencyId, captureType, tableData }) {
  if (!selectedProcess?.id) {
    return { ok: false, message: "Please select a process" };
  }
  if (!descriptions?.length) {
    return { ok: false, message: "Please select at least one description" };
  }
  if (!currencyId) {
    return { ok: false, message: "Please select a currency" };
  }
  if (isCitibetCaptureType(captureType) && !tableSnapshotHasData(tableData)) {
    return { ok: false, message: "Please enter data in the table" };
  }
  return { ok: true };
}

export function isSubmitReady({ selectedProcess, descriptions, currencyId, captureType, tableData }) {
  return validateDataCaptureForm({ selectedProcess, descriptions, currencyId, captureType, tableData }).ok;
}
