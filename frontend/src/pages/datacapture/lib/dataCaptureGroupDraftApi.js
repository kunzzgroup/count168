import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { appendDataCaptureScopeParams } from "./dataCaptureApi.js";

const API_PATH = "api/datacapture/group_capture_draft_api.php";

function withScopeParams(baseParams, captureScope) {
  const params = new URLSearchParams(baseParams);
  if (captureScope) {
    appendDataCaptureScopeParams(params, captureScope);
  }
  return params;
}

async function parseJson(response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
  }
  return json;
}

/**
 * @param {object|null} captureScope
 * @param {string} groupId AP / IG
 * @param {string} processKey salary | commission | bonus
 */
export async function fetchGroupCaptureDraft(captureScope, groupId, processKey, signal) {
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  const pid = processKey ? String(processKey).trim().toLowerCase() : "";
  if (!gid || !pid) return null;

  const params = withScopeParams(
    {
      action: "get_group_capture_draft",
      group_id: gid,
      process_key: pid,
    },
    captureScope,
  );

  try {
    const response = await fetch(buildApiUrl(`${API_PATH}?${params.toString()}`), {
      credentials: "include",
      signal,
    });
    const json = await parseJson(response);
    if (json?.success !== true || !json.data || typeof json.data !== "object") {
      return null;
    }
    const { tableData, captureType, savedAt } = json.data;
    if (!tableData) return null;
    return {
      tableData,
      captureType: captureType || "1.Text",
      savedAt: savedAt != null ? Number(savedAt) : undefined,
      updatedAt: json.data.updatedAt ?? null,
      updatedBy: json.data.updatedBy ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveGroupCaptureDraft(captureScope, groupId, processKey, payload = {}) {
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  const pid = processKey ? String(processKey).trim().toLowerCase() : "";
  if (!gid || !pid) return false;

  const params = withScopeParams(
    {
      action: "save_group_capture_draft",
      group_id: gid,
      process_key: pid,
    },
    captureScope,
  );

  try {
    const response = await fetch(buildApiUrl(`${API_PATH}?${params.toString()}`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: gid,
        process_key: pid,
        tableData: payload.tableData ?? null,
        captureType: payload.captureType || "1.Text",
        savedAt: payload.savedAt ?? Date.now(),
      }),
    });
    const json = await parseJson(response);
    return json?.success === true;
  } catch {
    return false;
  }
}

export async function clearGroupCaptureDraft(captureScope, groupId, processKey) {
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  const pid = processKey ? String(processKey).trim().toLowerCase() : "";
  if (!gid || !pid) return false;

  const params = withScopeParams(
    {
      action: "clear_group_capture_draft",
      group_id: gid,
      process_key: pid,
    },
    captureScope,
  );

  try {
    const response = await fetch(buildApiUrl(`${API_PATH}?${params.toString()}`), {
      method: "POST",
      credentials: "include",
    });
    const json = await parseJson(response);
    return json?.success === true;
  } catch {
    return false;
  }
}
