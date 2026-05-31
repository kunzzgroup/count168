/** Fixed process choices when Group is selected without Company (Data Capture group-only mode). */

export const GROUP_ONLY_PROCESS_IDS = new Set(["salary", "bonus"]);

export function isGroupOnlyProcessId(id) {
  return GROUP_ONLY_PROCESS_IDS.has(String(id || "").toLowerCase());
}

/** Group-only Process dropdown labels: uppercase codes only (no "1." / "2." prefix). */
export function getGroupOnlyProcessOptions() {
  return [
    { id: "salary", process_id: "SALARY", displayText: "SALARY" },
    { id: "bonus", process_id: "BONUS", displayText: "BONUS" },
  ];
}
