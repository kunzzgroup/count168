export const PAGE_SIZE = 20;

/** Matches js/processlist.js Games table grid (inline fallback; non-bank layout overridden in processCSS.css) */
export const GAMES_PROCESS_GRID_COLUMNS = "0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr 0.2fr";
/** Last column split: Action + 48px select (aligned with User List bulk-delete column) */
export const GAMES_PROCESS_GRID_COLUMNS_WITH_SELECT =
  "0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr minmax(0, 0.2fr) 48px";

export const EMPTY_FORM = {
  id: "",
  process_name: "",
  is_multi_process: false,
  selected_processes: [],
  show_multi_process_selection: true,
  selected_descriptions: [],
  copy_from: "",
  currency_id: "",
  day_use: [],
  remove_word: "",
  replace_word_from: "",
  replace_word_to: "",
  remark: "",
  status: "active",
  dts_modified: "",
  modified_by: "",
  dts_created: "",
  created_by: "",
  /** Edit UI only (legacy: hide DTS Modified when never changed) */
  dts_modified_display: "",
  dts_modified_user_display: "",
  currency_warning: null,
};

export function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

/** Same ordering as js/processlist.js after fetch (Games). */
export function sortProcessRows(rows) {
  const copy = [...rows];
  copy.sort((a, b) => {
    const aKey = String(a.process_name || "").toLowerCase();
    const bKey = String(b.process_name || "").toLowerCase();
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    const aDesc = String(a.description || a.description_name || "").toLowerCase();
    const bDesc = String(b.description || b.description_name || "").toLowerCase();
    if (aDesc < bDesc) return -1;
    if (aDesc > bDesc) return 1;
    return 0;
  });
  return copy;
}

/** Legacy editProcess remarks handling (JSON meta.user_remarks). */
export function parseRemarkForForm(remarks) {
  if (remarks == null || remarks === "") return "";
  try {
    const meta = JSON.parse(remarks);
    if (meta && meta.user_remarks != null && meta.user_remarks !== "") return String(meta.user_remarks);
  } catch {
    /* plain text */
  }
  return String(remarks);
}

export function buildEditDescriptionSelection(p, descriptionsList) {
  let names = [];
  if (Array.isArray(p.description_names) && p.description_names.length > 0) {
    names = p.description_names.map((x) => String(x).trim()).filter(Boolean);
  } else if (p.description_names && typeof p.description_names === "string") {
    names = p.description_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  } else if (p.description_name) {
    names = [String(p.description_name).trim()].filter(Boolean);
  }

  const selected = [];
  names.forEach((name, idx) => {
    const fromApi = descriptionsList.find((d) => String(d.name) === String(name));
    const id = idx === 0 && p.description_id ? p.description_id : fromApi?.id ?? `${name}_${idx}`;
    selected.push({ id, name });
  });
  return selected;
}

export function notifyTransactionDataChanged(sourceTag) {
  const ts = String(Date.now());
  try {
    localStorage.setItem("count168_tx_invalidate_ts", ts);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent("tx-data-changed", { detail: { ts, source: sourceTag || "processlist" } })
    );
  } catch {
    /* ignore */
  }
}
