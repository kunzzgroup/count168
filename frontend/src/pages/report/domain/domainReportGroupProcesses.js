/** Group-scope Domain Report: SALARY / BONUS only (aligned with Data Capture group-only). */

export const DOMAIN_GROUP_PROCESS_CODES = ["SALARY", "BONUS"];

function normalizeProcessCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s*\(.*$/, "");
}

/**
 * Map API process rows to fixed SALARY / BONUS dropdown options (numeric ids for report filter).
 */
export function mapDomainGroupProcesses(apiList) {
  const rows = Array.isArray(apiList) ? apiList : [];
  return DOMAIN_GROUP_PROCESS_CODES.map((code) => {
    const row = rows.find((p) => {
      const fromProcess = normalizeProcessCode(p.process);
      const fromDisplay = normalizeProcessCode(p.display_text);
      return fromProcess === code || fromDisplay === code || fromDisplay.startsWith(`${code} `);
    });
    if (!row?.id) return null;
    return {
      id: row.id,
      process: code,
      display_text: code,
    };
  }).filter(Boolean);
}

export function isDomainGroupProcessSelection(processId, processes) {
  if (!processId) return true;
  return (processes || []).some((p) => String(p.id) === String(processId));
}
