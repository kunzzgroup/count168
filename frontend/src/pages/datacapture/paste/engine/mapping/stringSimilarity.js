/** Normalize header labels + Levenshtein / token overlap similarity. */

export function normalizeHeaderLabel(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[_./\\]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeHeader(raw) {
  const n = normalizeHeaderLabel(raw);
  return n ? n.split(" ").filter(Boolean) : [];
}

export function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

export function similarityScore(a, b) {
  const na = normalizeHeaderLabel(a);
  const nb = normalizeHeaderLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return Math.round(85 + ratio * 10);
  }
  const ta = new Set(tokenizeHeader(na));
  const tb = new Set(tokenizeHeader(nb));
  let overlap = 0;
  ta.forEach((tok) => {
    if (tb.has(tok)) overlap += 1;
  });
  const tokenScore = ta.size || tb.size ? (overlap / Math.max(ta.size, tb.size)) * 100 : 0;
  const maxLen = Math.max(na.length, nb.length);
  const lev = levenshtein(na, nb);
  const levScore = maxLen ? ((maxLen - lev) / maxLen) * 100 : 0;
  return Math.round(Math.max(tokenScore * 0.55 + levScore * 0.45, tokenScore, levScore * 0.9));
}
