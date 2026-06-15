export function buildSummarySubmitPayload(processData, summaryRows) {
  if (!processData) return null;
  const groupPayrollCapture = processData.groupPayrollCapture === true;
  const groupLedger =
    processData.groupOnlyCapture === true && !groupPayrollCapture;
  return {
    captureDate: processData.date,
    processId: processData.process,
    processName: processData.processName,
    processCode: processData.processCode || processData.process_code || "",
    currencyId: processData.currency,
    currencyName: processData.currencyName,
    remark: processData.remark || "",
    groupPayrollUi: processData.groupPayrollUi === true || groupLedger || groupPayrollCapture,
    groupPayrollCapture,
    groupOnlyCapture: groupLedger,
    captureSelectedGroup: groupLedger || groupPayrollCapture
      ? String(processData.captureSelectedGroup || "").trim().toUpperCase()
      : undefined,
    captureScopeMode: groupLedger ? "group" : "company",
    scopeCompanyId:
      processData.scopeCompanyId != null && Number(processData.scopeCompanyId) > 0
        ? Number(processData.scopeCompanyId)
        : undefined,
    summaryRows: Array.isArray(summaryRows) ? summaryRows : [],
  };
}
