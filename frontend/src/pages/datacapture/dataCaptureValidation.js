import { isCitibetCaptureType } from "./dataCaptureStorage.js";
import { getActiveDescriptions } from "./dataCaptureFormHelpers.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";

export function validateDataCaptureForm({
  selectedProcess,
  descriptions,
  descriptionDisplay,
  currencyId,
  captureType,
  tableData,
}) {
  const activeDescriptions = descriptions?.length
    ? descriptions
    : getActiveDescriptions(descriptionDisplay);

  if (!selectedProcess?.id) {
    return { ok: false, message: "Please select a process" };
  }
  if (!activeDescriptions.length) {
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

export function isSubmitReady(params) {
  return validateDataCaptureForm(params).ok;
}
