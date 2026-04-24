export const PAGE_SIZE = 20;

export const EMPTY_FORM = {
  id: "",
  process_name: "",
  description_name: "",
  description_id: "",
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
};

export function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
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
