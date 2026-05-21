const STORAGE_KEY = "login_recent_entries";
const MAX_ENTRIES = 8;

function readEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function saveLoginEntry({ companyId, userId, role }) {
  const company = String(companyId || "").trim().toUpperCase();
  const user = String(userId || "").trim().toUpperCase();
  const loginRole = role === "member" ? "member" : "admin";
  if (!company || !user) return;

  const next = readEntries().filter(
    (e) => !(e.companyId === company && e.userId === user && e.role === loginRole),
  );
  next.unshift({ companyId: company, userId: user, role: loginRole });
  writeEntries(next);
}

export function getRecentCompanyIds(role) {
  const loginRole = role === "member" ? "member" : "admin";
  const seen = new Set();
  const ids = [];
  for (const e of readEntries()) {
    if (e.role !== loginRole || !e.companyId || seen.has(e.companyId)) continue;
    seen.add(e.companyId);
    ids.push(e.companyId);
  }
  return ids;
}

export function getRecentUserIds({ companyId, role }) {
  const company = String(companyId || "").trim().toUpperCase();
  const loginRole = role === "member" ? "member" : "admin";
  if (!company) return [];

  const seen = new Set();
  const ids = [];
  for (const e of readEntries()) {
    if (e.role !== loginRole || e.companyId !== company || !e.userId || seen.has(e.userId)) continue;
    seen.add(e.userId);
    ids.push(e.userId);
  }
  return ids;
}
