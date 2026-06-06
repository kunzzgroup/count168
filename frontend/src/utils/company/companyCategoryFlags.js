function parseCompanyPermissions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((p) => String(p).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((p) => String(p).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Category flags from owner-companies row permissions (instant sidebar before session sync). */
export function resolveCompanyCategoryFlagsFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const perms = parseCompanyPermissions(row.permissions);
  if (!perms.length) return null;
  const hasGambling = perms.some((p) => p === "Games" || p === "Gambling");
  const hasBank = perms.some((p) => p === "Bank");
  return { hasGambling, hasBank };
}

export function permissionsIncludeGames(permissions) {
  const list = parseCompanyPermissions(permissions);
  return list.some((p) => p === "Games" || p === "Gambling");
}

export function permissionsIncludeBank(permissions) {
  const list = parseCompanyPermissions(permissions);
  return list.some((p) => p === "Bank");
}
