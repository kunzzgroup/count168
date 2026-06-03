/**
 * Group-only table drafts after Summary final Submit.
 * Scoped by dashboard GroupID (AP / IG) + process (salary / bonus).
 */
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import { isGroupOnlyProcessId, selectedProcessFromGroupOnlySession } from "./dataCaptureGroupOnlyProcesses.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";

export const GROUP_ONLY_TABLE_DRAFTS_KEY = "dc_group_only_table_drafts";

function normalizeGroupId(groupId) {
  const g = groupId != null ? String(groupId).trim().toUpperCase() : "";
  return g || null;
}

function normalizeProcessKey(processKey) {
  const p = processKey != null ? String(processKey).trim().toLowerCase() : "";
  return isGroupOnlyProcessId(p) ? p : null;
}

function readAllDrafts() {
  try {
    const raw = localStorage.getItem(GROUP_ONLY_TABLE_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllDrafts(map) {
  try {
    localStorage.setItem(GROUP_ONLY_TABLE_DRAFTS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** @returns {{ tableData: object, captureType: string, savedAt?: number }|null} */
export function readGroupOnlyTableDraft(groupId, processKey) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return null;
  const entry = readAllDrafts()[g]?.[p];
  if (!entry?.tableData) return null;
  return {
    tableData: entry.tableData,
    captureType: entry.captureType || "1.Text",
    savedAt: entry.savedAt,
  };
}

export function clearGroupOnlyTableDraft(groupId, processKey) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return;
  const map = readAllDrafts();
  if (!map[g]?.[p]) return;
  delete map[g][p];
  if (Object.keys(map[g]).length === 0) delete map[g];
  writeAllDrafts(map);
}

/**
 * @param {string|null|undefined} groupId
 * @param {string} processKey salary | bonus
 * @param {{ tableData?: object, captureType?: string }} payload
 */
export function saveGroupOnlyTableDraft(groupId, processKey, payload = {}) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p || !payload.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const map = readAllDrafts();
  if (!map[g]) map[g] = {};
  map[g][p] = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: Date.now(),
  };
  writeAllDrafts(map);
}

/** Persist draft from active capture session before Summary clears storage. */
export function saveGroupOnlyTableDraftFromCaptureSession(session) {
  if (!session?.processData?.groupOnlyCapture) return;
  const groupId = normalizeGroupId(session.processData.captureSelectedGroup);
  if (!groupId) return;

  const proc = selectedProcessFromGroupOnlySession(session.processData);
  const processKey = proc?.id ? normalizeProcessKey(proc.id) : null;
  if (!processKey) return;

  saveGroupOnlyTableDraft(groupId, processKey, {
    tableData: session.tableData,
    captureType: session.captureType,
  });
}

export function shouldApplyGroupOnlyTableDraft() {
  if (window.__DC_IS_RESTORING__) return false;
  try {
    if (new URLSearchParams(window.location.search).get("restore") === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** Restore grid from group+process draft, or clear grid when no draft. */
export async function restoreGroupOnlyTableDraft(groupId, processKey) {
  if (!shouldApplyGroupOnlyTableDraft()) return;

  const draft = readGroupOnlyTableDraft(groupId, processKey);
  if (!draft?.tableData) {
    window.__DC_CLEAR_CAPTURE_TABLE__?.();
    window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
    return;
  }

  const type = draft.captureType || "1.Text";
  if (typeof window.__DC_APPLY_CAPTURE_TYPE__ === "function") {
    window.__DC_APPLY_CAPTURE_TYPE__(type);
  } else if (typeof window.applyDataCaptureType === "function") {
    window.applyDataCaptureType(type);
  }

  const { rows, cols } = resolveDataCaptureGridDimensions(true);
  if (typeof window.__DC_ENSURE_GRID_READY__ === "function") {
    await window.__DC_ENSURE_GRID_READY__(rows, cols);
  }

  if (typeof window.__DC_RESTORE_CAPTURE_TABLE__ === "function") {
    await window.__DC_RESTORE_CAPTURE_TABLE__(draft.tableData, type);
  }

  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}
