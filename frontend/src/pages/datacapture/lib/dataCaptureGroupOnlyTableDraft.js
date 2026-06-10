/**
 * Group-only table drafts — shared via server (group_id + process_key).
 * localStorage is used as a local cache / offline fallback only.
 */
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import { isGroupOnlyProcessId, selectedProcessFromGroupOnlySession } from "./dataCaptureGroupOnlyProcesses.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";
import { applyBridgeCaptureType } from "./dataCaptureBridge.js";
import { callDataCaptureRuntime, getDataCaptureState } from "./dataCaptureRuntime.js";
import {
  clearGroupCaptureDraft,
  fetchGroupCaptureDraft,
  saveGroupCaptureDraft,
} from "./dataCaptureGroupDraftApi.js";

export const GROUP_ONLY_TABLE_DRAFTS_KEY = "dc_group_only_table_drafts";

const SERVER_SAVE_DEBOUNCE_MS = 1500;
const serverSaveTimers = new Map();
let restoreSeq = 0;

/** Drop in-flight debounced server writes (e.g. before process switch). */
export function cancelAllScheduledServerDraftSaves() {
  serverSaveTimers.forEach((timer) => clearTimeout(timer));
  serverSaveTimers.clear();
}

function normalizeGroupId(groupId) {
  const g = groupId != null ? String(groupId).trim().toUpperCase() : "";
  return g || null;
}

function normalizeProcessKey(processKey) {
  const p = processKey != null ? String(processKey).trim().toLowerCase() : "";
  return isGroupOnlyProcessId(p) ? p : null;
}

function draftTimerKey(groupId, processKey) {
  return `${groupId}:${processKey}`;
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

function writeLocalDraft(groupId, processKey, payload) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p || !payload?.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const map = readAllDrafts();
  if (!map[g]) map[g] = {};
  map[g][p] = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: payload.savedAt ?? Date.now(),
    processKey: p,
  };
  writeAllDrafts(map);
}

function clearLocalDraft(groupId, processKey) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return;
  const map = readAllDrafts();
  if (!map[g]?.[p]) return;
  delete map[g][p];
  if (Object.keys(map[g]).length === 0) delete map[g];
  writeAllDrafts(map);
}

function cancelScheduledServerSave(groupId, processKey) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return;
  const key = draftTimerKey(g, p);
  const timer = serverSaveTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    serverSaveTimers.delete(key);
  }
}

function scheduleServerDraftSave(groupId, processKey, payload, captureScope) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return;

  const key = draftTimerKey(g, p);
  cancelScheduledServerSave(g, p);
  serverSaveTimers.set(
    key,
    setTimeout(() => {
      serverSaveTimers.delete(key);
      void saveGroupCaptureDraft(captureScope, g, p, payload);
    }, SERVER_SAVE_DEBOUNCE_MS),
  );
}

/** Immediate server persist (e.g. process switch). */
export async function flushGroupOnlyTableDraftToServer(
  groupId,
  processKey,
  payload,
  captureScope = null,
) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return false;
  cancelScheduledServerSave(g, p);
  if (!payload?.tableData || !tableSnapshotHasData(payload.tableData)) {
    return clearGroupCaptureDraft(captureScope, g, p);
  }
  return saveGroupCaptureDraft(captureScope, g, p, payload);
}

function scopeFromGroupId(groupId) {
  const g = normalizeGroupId(groupId);
  if (!g) return null;
  return {
    mode: "group",
    groupId: g,
    viewGroup: g,
    scopeCompanyId: 0,
    resolveCompanyViaGroupId: true,
  };
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

export async function fetchGroupOnlyTableDraft(groupId, processKey, captureScope = null) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return null;

  const scope = captureScope || scopeFromGroupId(g);
  const serverDraft = scope ? await fetchGroupCaptureDraft(scope, g, p) : null;
  if (serverDraft?.tableData) {
    writeLocalDraft(g, p, serverDraft);
    return serverDraft;
  }

  // Server is source of truth — drop stale per-browser cache for this process.
  clearLocalDraft(g, p);
  return null;
}

export function clearGroupOnlyTableDraft(groupId, processKey, options = {}) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return;

  cancelScheduledServerSave(g, p);
  clearLocalDraft(g, p);

  const scope = options.captureScope || scopeFromGroupId(g);
  if (scope) {
    void clearGroupCaptureDraft(scope, g, p);
  }
}

/**
 * @param {string|null|undefined} groupId
 * @param {string} processKey salary | commission | bonus
 * @param {{ tableData?: object, captureType?: string, savedAt?: number }} payload
 * @param {{ captureScope?: object, flush?: boolean }} [options]
 */
export function saveGroupOnlyTableDraft(groupId, processKey, payload = {}, options = {}) {
  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p || !payload.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const entry = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: payload.savedAt ?? Date.now(),
    processKey: p,
  };

  writeLocalDraft(g, p, entry);

  const scope = options.captureScope || scopeFromGroupId(g);
  if (!scope) return;

  if (options.flush) {
    void flushGroupOnlyTableDraftToServer(g, p, entry, scope);
    return;
  }
  scheduleServerDraftSave(g, p, entry, scope);
}

/** Persist draft from active capture session before Summary clears storage. */
export function saveGroupOnlyTableDraftFromCaptureSession(session, options = {}) {
  if (!session?.processData?.groupOnlyCapture) return;
  const groupId = normalizeGroupId(session.processData.captureSelectedGroup);
  if (!groupId) return;

  const proc = selectedProcessFromGroupOnlySession(session.processData);
  const processKey = proc?.id ? normalizeProcessKey(proc.id) : null;
  if (!processKey) return;

  const captureScope = options.captureScope || scopeFromGroupId(groupId);
  saveGroupOnlyTableDraft(
    groupId,
    processKey,
    {
      tableData: session.tableData,
      captureType: session.captureType,
    },
    { captureScope, flush: true },
  );
}

export function shouldApplyGroupOnlyTableDraft() {
  if (getDataCaptureState().isRestoring) return false;
  try {
    if (new URLSearchParams(window.location.search).get("restore") === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** Restore grid from shared group+process draft, or clear grid when no draft. */
export async function restoreGroupOnlyTableDraft(groupId, processKey, options = {}) {
  if (!shouldApplyGroupOnlyTableDraft()) return;

  const g = normalizeGroupId(groupId);
  const p = normalizeProcessKey(processKey);
  if (!g || !p) return;

  const seq = ++restoreSeq;
  const state = getDataCaptureState();
  state.isRestoring = true;

  try {
    callDataCaptureRuntime("clearCaptureTable");

    const scope = options.captureScope || scopeFromGroupId(g);
    const draft = await fetchGroupOnlyTableDraft(g, p, scope);
    if (seq !== restoreSeq) return;

    if (!draft?.tableData) {
      callDataCaptureRuntime("clearCaptureTable");
      callDataCaptureRuntime("recomputeSubmitState");
      return;
    }

    const type = draft.captureType || "1.Text";
    applyBridgeCaptureType(type);

    const { rows, cols } = resolveDataCaptureGridDimensions(true);
    await callDataCaptureRuntime("ensureGridReady", rows, cols);
    if (seq !== restoreSeq) return;

    await callDataCaptureRuntime("restoreCaptureTable", draft.tableData, type);
    if (seq !== restoreSeq) return;

    callDataCaptureRuntime("recomputeSubmitState");
  } finally {
    if (seq === restoreSeq) {
      state.isRestoring = false;
    }
  }
}
