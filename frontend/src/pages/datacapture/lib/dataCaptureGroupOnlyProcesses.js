/** Fixed process choices when Group is selected without Company (Data Capture group-only mode). */

export const GROUP_ONLY_PROCESS_IDS = new Set(["salary", "bonus"]);

export function isGroupOnlyProcessId(id) {
  return GROUP_ONLY_PROCESS_IDS.has(String(id || "").toLowerCase());
}

/** @param {(key: string) => string} t */
export function getGroupOnlyProcessOptions(t) {
  return [
    { id: "salary", process_id: "SALARY", displayText: t("groupProcessSalary") },
    { id: "bonus", process_id: "BONUS", displayText: t("groupProcessBonus") },
  ];
}
