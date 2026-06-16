/**
 * Account label for Summary UI — matches backend template display:
 * `CODE [Name]` when both exist (see resolveAccountDisplayInTemplates in summary_api.php).
 */
export function formatSummaryAccountDisplay(acc, fallbackId = "") {
  const existing = String(acc?.account_display || acc?.account || "").trim();
  if (existing) return existing;

  const code = String(acc?.account_id ?? acc?.code ?? "").trim();
  const name = String(acc?.name ?? "").trim();
  const id = String(acc?.id ?? fallbackId ?? "").trim();

  if (code && name) return `${code} [${name}]`;
  if (code) return code;
  if (name) return name;
  return id;
}
