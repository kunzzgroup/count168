/**
 * Partnership / Audit 且 read_only 时禁止前端发起写操作（与 current_user_api.read_only 一致）。
 * @param {object|null|undefined} sessionMe current_user_api.data
 * @returns {boolean}
 */
export function isPartnershipAuditReadOnlyLocked(sessionMe) {
  if (!sessionMe || typeof sessionMe !== "object") return false
  const r = String(sessionMe.role || "").trim().toLowerCase()
  if (r !== "partnership" && r !== "audit") return false
  const ro = sessionMe.read_only
  return ro === 1 || ro === true || ro === "1"
}
